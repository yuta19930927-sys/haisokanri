/**
 * GET /api/ai-data  —  Claude（AI社員）用の、汎用・読み取り専用API
 *
 * ハコマネのほぼ全テーブルを、APIキーだけで読めるようにする。書き込みは一切できない。
 * 認証・テナントの考え方は /api/ai-daily-check と同じ:
 *   ヘッダー x-ai-api-key = 環境変数 AI_API_KEY（違えば 403）
 *   DB は SUPABASE_SERVICE_ROLE_KEY で読み、AI_TENANT_ID の会社のデータだけ返す
 *
 * 使い方:
 *   GET /api/ai-data                       → 読めるテーブルの一覧と説明
 *   GET /api/ai-data?table=drivers         → ドライバー全件
 *   GET /api/ai-data?tables=drivers,vehicles,customers   → 複数テーブルをまとめて
 *   GET /api/ai-data?table=orders&from=2026-11-01&to=2026-11-30   → 期間で絞る（各テーブルの既定の日付項目で）
 *   GET /api/ai-data?table=daily_records&from=2026-10-01&to=2026-10-31&f.driverId=D-001   → 項目の値で絞る（f.項目名=値）
 *   GET /api/ai-data?table=orders&dateField=date&from=...   → 絞り込みに使う日付項目を変える
 *   GET /api/ai-data?table=orders&limit=500&offset=500       → ページ送り（既定 limit=1000、最大 5000）
 *   &includeDeleted=1  → 削除済み（deleted: true）も含める（既定は除外）
 *
 * 守っていること:
 *   ・ログイン情報系のテーブル（driver_auth, profiles, login_history など）は読めない
 *   ・振込先の口座番号は末尾4桁以外を伏せる（毎日の確認業務には不要で、漏れたときの被害が大きいため）
 */
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";

const DEFAULT_SUPABASE_URL = "https://qccxztvroptltgaajetd.supabase.co";
const PAGE_SIZE = 1000;
const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 5000;

/**
 * 読めるテーブルの一覧。
 *   shape: "payload" … id / payload(jsonb) / tenant_id 形式（中身は payload 側）
 *          "columns" … 普通の列を持つテーブル
 *   date:  期間指定（from/to）のときに使う既定の日付項目
 */
const TABLES = {
  drivers: { shape: "payload", label: "ドライバー（免許・車検・保険・報酬設定・振込先など）" },
  vehicles: { shape: "payload", label: "会社の車両（車検・保険・リース・点検・オイル交換など）" },
  customers: { shape: "payload", label: "顧客（荷主・取引先）" },
  job_types: { shape: "payload", label: "案件の種類（チビ宅・デカ宅など）と単価" },
  orders: { shape: "payload", date: "deliveryDate", label: "受注（配送予定）" },
  daily_records: { shape: "payload", date: "date", label: "稼働実績（日報。個数・報酬の元データ）" },
  invoices: { shape: "payload", date: "issueDate", label: "請求書（顧客向け と type=driver_invoice のドライバー支払）" },
  payables: { shape: "payload", date: "dueDate", label: "支払予定（取引先への支払）" },
  events: { shape: "payload", date: "date", label: "予定・タスク（カレンダー）" },
  recurring_assignments: { shape: "payload", label: "定期便（曜日ごとの固定案件）" },
  recurring_confirmations: { shape: "payload", date: "date", label: "定期便の稼働あり／なし確認" },
  trouble_records: { shape: "payload", date: "occurredAt", label: "トラブル記録（事故・破損・誤配・クレームなど）" },
  shift_records: { shape: "payload", date: "date", label: "稼働開始・終了の記録（ハコログから）" },
  shift_reports: { shape: "payload", date: "date", label: "乗務前・乗務後日報（ハコログから）" },
  precheck_records: { shape: "payload", date: "date", label: "乗務前点検（アルコールチェック等。ハコログから）" },
  change_history: { shape: "payload", label: "変更履歴（監査ログ）" },
  company_info: { shape: "payload", label: "自社情報・各種設定" },
  chat_messages: { shape: "payload", label: "ドライバーとのチャット" },
  bank_transactions: { shape: "columns", date: "transaction_date", label: "口座の入出金明細" },
  driver_incidents: { shape: "columns", date: "incident_date", label: "ドライバーの事故・違反記録" },
  vehicle_incidents: { shape: "columns", date: "incident_date", label: "車両の事故記録" },
  vehicle_inspections: { shape: "columns", date: "inspection_date", label: "車両の点検記録" },
};

// ---------- 共通 ----------
const safeEqual = (a, b) => {
  const ba = Buffer.from(String(a || ""), "utf8");
  const bb = Buffer.from(String(b || ""), "utf8");
  if (ba.length === 0 || ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
};
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
const asOfJst = () => `${new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 19)}+09:00`;
const nextDay = (s) => {
  const t = new Date(`${s}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
};
const toList = (v) => (Array.isArray(v) ? v : [v]).flatMap((s) => String(s || "").split(",")).map((s) => s.trim()).filter(Boolean);

const maskAccount = (v) => {
  const s = String(v ?? "");
  if (!s) return v;
  return s.length <= 4 ? "****" : `${"*".repeat(s.length - 4)}${s.slice(-4)}`;
};
/** 口座番号らしき項目を、どの深さにあっても伏せる */
const maskSecrets = (obj) => {
  if (Array.isArray(obj)) return obj.map(maskSecrets);
  if (!obj || typeof obj !== "object") return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = /^(accountNumber|account_number|bankAccountNumber)$/i.test(k) ? maskAccount(v) : maskSecrets(v);
  }
  return out;
};

const resolveTenantId = async (sb) => {
  const fromEnv = (process.env.AI_TENANT_ID || "").trim();
  if (fromEnv) return fromEnv;
  const { data, error } = await sb.from("tenants").select("id, name, is_active");
  if (error) throw error;
  const active = (data || []).filter((t) => t.is_active !== false);
  if (active.length === 1) return active[0].id;
  const err = new Error("テナントが複数あります。Vercel の環境変数 AI_TENANT_ID を設定してください。");
  err.candidates = active.map((t) => ({ id: t.id, name: t.name }));
  throw err;
};

/** 1テーブル分を読む */
const readTable = async (sb, tenantId, table, q) => {
  const cfg = TABLES[table];
  const dateField = (q.dateField ? String(q.dateField) : cfg.date) || null;
  // 日付項目の無いテーブル（ドライバー・顧客など）は、期間指定を無視して全件返す
  // （例: tables=drivers,orders&from=... で「ドライバー全員＋今月の受注」をまとめて取れるように）
  const periodIgnored = !dateField && (isDate(q.from) || isDate(q.to));
  const from = !periodIgnored && isDate(q.from) ? q.from : null;
  const to = !periodIgnored && isDate(q.to) ? q.to : null;
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(q.limit) || DEFAULT_LIMIT));
  const offset = Math.max(0, Number(q.offset) || 0);
  const includeDeleted = q.includeDeleted === "1" || q.includeDeleted === "true";
  const col = (field) => (cfg.shape === "payload" ? `payload->>${field}` : field);

  // 項目の値での絞り込み（f.driverId=D-001 など）
  const filters = Object.entries(q)
    .filter(([k]) => k.startsWith("f."))
    .map(([k, v]) => [k.slice(2), Array.isArray(v) ? v[0] : v])
    .filter(([k]) => /^[A-Za-z0-9_]+$/.test(k));

  if (dateField && !/^[A-Za-z0-9_]+$/.test(dateField)) {
    const e = new Error("dateField の形が正しくありません。");
    e.status = 400;
    throw e;
  }

  const build = () => {
    let query = sb.from(table).select("*").eq("tenant_id", tenantId);
    if (from) query = query.gte(col(dateField), from);
    if (to) query = query.lt(col(dateField), nextDay(to)); // 「翌日より前」= 最終日の日時（2026-11-30T..）も含める
    for (const [k, v] of filters) query = query.eq(col(k), String(v));
    return query.order("id", { ascending: true });
  };

  // 削除済みを除くため、必要な件数がそろうまで1000件ずつ読む
  const rows = [];
  let skipped = 0;
  let exhausted = false;
  for (let start = 0; rows.length < limit; start += PAGE_SIZE) {
    const { data, error } = await build().range(start, start + PAGE_SIZE - 1);
    if (error) {
      const e = new Error(`${table}: ${error.message}`);
      e.status = 502;
      throw e;
    }
    for (const r of data || []) {
      const rec =
        cfg.shape === "payload" && r.payload && typeof r.payload === "object"
          ? { ...r.payload, _rowId: r.id, _updatedAt: r.updated_at }
          : (({ tenant_id, ...rest }) => rest)(r);
      if (!includeDeleted && rec.deleted) continue;
      if (skipped < offset) {
        skipped += 1;
        continue;
      }
      if (rows.length < limit) rows.push(rec);
    }
    if (!data || data.length < PAGE_SIZE) {
      exhausted = true;
      break;
    }
  }

  return {
    table,
    label: cfg.label,
    count: rows.length,
    nextOffset: exhausted && rows.length < limit ? null : offset + rows.length,
    filter: {
      from,
      to,
      dateField: from || to ? dateField : null,
      fields: Object.fromEntries(filters),
      ...(periodIgnored ? { note: "このテーブルには日付項目が無いため、期間指定は使わず全件を返しています。" } : {}),
    },
    rows: maskSecrets(rows),
  };
};

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  const expectedKey = process.env.AI_API_KEY;
  if (!expectedKey) return res.status(500).json({ error: "サーバーに AI_API_KEY が設定されていません。" });
  if (!safeEqual(req.headers["x-ai-api-key"], expectedKey)) return res.status(403).json({ error: "Forbidden" });
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return res.status(500).json({ error: "サーバーに SUPABASE_SERVICE_ROLE_KEY が設定されていません。" });

  const q = req.query || {};
  const requested = [...toList(q.table), ...toList(q.tables)];

  // テーブル指定なし → 使い方の案内
  if (requested.length === 0) {
    return res.status(200).json({
      asOf: asOfJst(),
      usage:
        "?table=名前 または ?tables=名前1,名前2。期間は from/to（YYYY-MM-DD）、項目の値は f.項目名=値、ページ送りは limit/offset。",
      tables: Object.entries(TABLES).map(([name, c]) => ({ name, label: c.label, defaultDateField: c.date || null })),
    });
  }

  const unknown = requested.filter((t) => !TABLES[t]);
  if (unknown.length) {
    return res.status(400).json({ error: `読めないテーブルです: ${unknown.join(", ")}`, tables: Object.keys(TABLES) });
  }
  if (requested.length > 10) return res.status(400).json({ error: "一度に読めるのは10テーブルまでです。" });

  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const tenantId = await resolveTenantId(sb);
    const results = await Promise.all([...new Set(requested)].map((t) => readTable(sb, tenantId, t, q)));
    return res.status(200).json({
      asOf: asOfJst(),
      ...(results.length === 1 ? results[0] : { results: Object.fromEntries(results.map((r) => [r.table, r])) }),
    });
  } catch (e) {
    console.error("[ai-data]", e);
    return res.status(e.status || 500).json({
      error: e.message || "Internal Server Error",
      ...(e.candidates ? { tenantCandidates: e.candidates } : {}),
    });
  }
}
