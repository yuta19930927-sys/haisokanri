/**
 * /api/ai-data  —  Claude（AI社員）用の、汎用データAPI（読み取り＋書き込み）
 *
 * ハコマネのほぼ全テーブルを、APIキーだけで読み書きできるようにする。
 * 認証・テナントの考え方は /api/ai-daily-check と同じ:
 *   読み取り(GET)  : ヘッダー x-ai-api-key = AI_API_KEY または AI_WRITE_API_KEY
 *   書き込み(POST) : ヘッダー x-ai-api-key = AI_WRITE_API_KEY（読み取り用キーでは書けない）
 *   DB は SUPABASE_SERVICE_ROLE_KEY で読み書きし、AI_TENANT_ID の会社のデータだけを扱う
 *
 * ===== 読み取り（GET）=====
 *   GET /api/ai-data                       → 読めるテーブルの一覧と説明
 *   GET /api/ai-data?table=drivers         → ドライバー全件
 *   GET /api/ai-data?tables=drivers,vehicles,customers   → 複数テーブルをまとめて
 *   GET /api/ai-data?table=orders&from=2026-11-01&to=2026-11-30   → 期間で絞る（各テーブルの既定の日付項目で）
 *   GET /api/ai-data?table=daily_records&from=2026-10-01&to=2026-10-31&f.driverId=D-001   → 項目の値で絞る（f.項目名=値）
 *   GET /api/ai-data?table=orders&dateField=date&from=...   → 絞り込みに使う日付項目を変える
 *   GET /api/ai-data?table=orders&limit=500&offset=500       → ページ送り（既定 limit=1000、最大 5000）
 *   &includeDeleted=1  → 削除済み（deleted: true）も含める（既定は除外）
 *
 * ===== 書き込み（POST、JSON本文）=====
 *   { "ops": [ 操作, 操作, ... ], "dryRun": true }   ← dryRun: true なら「どう変わるか」だけ返して保存しない
 *   操作の形:
 *     { "op": "create",  "table": "orders", "data": { "id": "ORD-123", ... } }   新規作成（同じidがあればエラー）
 *     { "op": "update",  "table": "drivers", "id": "D-001", "data": { "phone": "090..." } }  指定した項目だけ書き換え
 *     { "op": "upsert",  "table": "customers", "id": "C-001", "data": {...} }   あれば項目を書き換え、無ければ作成
 *     { "op": "replace", "table": "orders", "id": "ORD-123", "data": {...} }    中身を丸ごと置き換え
 *     { "op": "delete",  "table": "orders", "id": "ORD-123" }                    削除（ハコマネ画面と同じく「削除済み」印を付ける）
 *     { "op": "delete",  "table": "orders", "id": "ORD-123", "hard": true }      DBから完全に消す（元に戻せない）
 *
 *   ・ハコマネ画面と同じ保存の仕組み（save_tenant_data_atomic）を使うため、1回のPOSTの中身は
 *     「全部保存される」か「何も保存されない」のどちらか。保存すると、画面を開いている人には
 *     「他で更新されました。再読み込みしてください」と出て、AIの変更を上書きしてしまうことを防ぐ。
 *   ・書き換え・削除の前の内容は、変更履歴（change_history）に必ず残す（画面の「変更履歴」から確認・復元できる）。
 *
 * 守っていること:
 *   ・ログイン情報系のテーブル（driver_auth, profiles, login_history など）は読み書きできない
 *   ・振込先の口座番号は末尾4桁以外を伏せて返す。伏せた値（***4567）のまま書き戻しても、元の番号は壊れない
 *   ・ハコログ専用の稼働記録（shift_records）と、変更履歴（change_history）そのものは書き換えできない
 */
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual, randomUUID } from "node:crypto";

const DEFAULT_SUPABASE_URL = "https://qccxztvroptltgaajetd.supabase.co";
const PAGE_SIZE = 1000;
const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 5000;
const MAX_OPS = 200;

/**
 * 読めるテーブルの一覧。
 *   shape: "payload" … id / payload(jsonb) / tenant_id 形式（中身は payload 側）
 *          "columns" … 普通の列を持つテーブル
 *   date:  期間指定（from/to）のときに使う既定の日付項目
 *   write: "sync"   … ハコマネ画面と同じ保存関数（save_tenant_data_atomic）で書く
 *          "direct" … 画面側も直接書いているテーブル。そのまま書く
 *          なし     … 書き込み不可
 */
const TABLES = {
  drivers: { shape: "payload", write: "sync", label: "ドライバー（免許・車検・保険・報酬設定・振込先など）" },
  vehicles: { shape: "payload", write: "sync", label: "会社の車両（車検・保険・リース・点検・オイル交換など）" },
  customers: { shape: "payload", write: "sync", label: "顧客（荷主・取引先）" },
  job_types: { shape: "payload", write: "sync", label: "案件の種類（チビ宅・デカ宅など）と単価" },
  orders: { shape: "payload", write: "sync", date: "deliveryDate", label: "受注（配送予定）" },
  daily_records: { shape: "payload", write: "sync", date: "date", label: "稼働実績（日報。個数・報酬の元データ）" },
  invoices: { shape: "payload", write: "sync", date: "issueDate", label: "請求書（顧客向け と type=driver_invoice のドライバー支払）" },
  payables: { shape: "payload", write: "sync", date: "dueDate", label: "支払予定（取引先への支払）" },
  events: { shape: "payload", write: "sync", date: "date", label: "予定・タスク（カレンダー）" },
  recurring_assignments: { shape: "payload", write: "sync", label: "定期便（曜日ごとの固定案件）" },
  recurring_confirmations: { shape: "payload", write: "sync", date: "date", label: "定期便の稼働あり／なし確認" },
  trouble_records: { shape: "payload", write: "sync", date: "occurredAt", label: "トラブル記録（事故・破損・誤配・クレームなど）" },
  shift_records: { shape: "payload", date: "date", label: "稼働開始・終了の記録（ハコログから）" },
  shift_reports: { shape: "payload", write: "sync", date: "date", label: "乗務前・乗務後日報（ハコログから）" },
  precheck_records: { shape: "payload", write: "sync", date: "date", label: "乗務前点検（アルコールチェック等。ハコログから）" },
  change_history: { shape: "payload", label: "変更履歴（監査ログ）" },
  company_info: { shape: "payload", write: "sync", label: "自社情報・各種設定" },
  chat_messages: { shape: "payload", write: "direct", label: "ドライバーとのチャット" },
  bank_transactions: { shape: "columns", write: "direct", date: "transaction_date", label: "口座の入出金明細" },
  driver_incidents: { shape: "columns", write: "direct", date: "incident_date", label: "ドライバーの事故・違反記録" },
  vehicle_incidents: { shape: "columns", write: "direct", date: "incident_date", label: "車両の事故記録" },
  vehicle_inspections: { shape: "columns", write: "direct", date: "inspection_date", label: "車両の点検記録" },
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

// =====================================================================
// 書き込み
// =====================================================================
const isMasked = (v) => typeof v === "string" && /^\*{2,}\d{0,4}$/.test(v);
/** AIが「伏せた口座番号（***4567）」のまま書き戻しても、元の番号が壊れないよう元の値に戻す */
const restoreMasked = (incoming, existing) => {
  if (Array.isArray(incoming)) return incoming.map((v, i) => restoreMasked(v, Array.isArray(existing) ? existing[i] : undefined));
  if (!incoming || typeof incoming !== "object") return incoming;
  const out = {};
  for (const [k, v] of Object.entries(incoming)) {
    const prev = existing && typeof existing === "object" ? existing[k] : undefined;
    out[k] = isMasked(v) && /^(accountNumber|account_number|bankAccountNumber)$/i.test(k) ? prev ?? null : restoreMasked(v, prev);
  }
  return out;
};
const httpError = (status, message) => Object.assign(new Error(message), { status });
const OPS = new Set(["create", "update", "upsert", "replace", "delete"]);

/** payload形式のテーブルから、業務上のid（payload.id）で1行探す */
const findPayloadRow = async (sb, tenantId, table, id) => {
  let query = sb.from(table).select("id,payload").eq("tenant_id", tenantId);
  query = id ? query.eq("payload->>id", String(id)) : query; // company_info は id 省略可（1行だけのため）
  const { data, error } = await query.limit(2);
  if (error) throw httpError(502, `${table}: ${error.message}`);
  if ((data || []).length > 1 && id) throw httpError(409, `${table} に id=${id} が複数あります。画面で確認してください。`);
  return data?.[0] || null;
};

const newBusinessId = (table) =>
  `${table.slice(0, 3).toUpperCase()}-AI-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

/** 1件の操作を「保存前後の内容」に変換する（まだ保存はしない） */
const planOp = async (sb, tenantId, raw, index) => {
  const op = String(raw?.op || "").toLowerCase();
  const table = String(raw?.table || "");
  const cfg = TABLES[table];
  const where = `ops[${index}]`;
  if (!OPS.has(op)) throw httpError(400, `${where}: op は create / update / upsert / replace / delete のどれかにしてください。`);
  if (!cfg) throw httpError(400, `${where}: 扱えないテーブルです: ${table}`);
  if (!cfg.write) throw httpError(400, `${where}: ${table}（${cfg.label}）は書き換えできないテーブルです。`);
  const data = raw.data && typeof raw.data === "object" && !Array.isArray(raw.data) ? raw.data : null;
  if (["create", "update", "upsert", "replace"].includes(op) && !data) throw httpError(400, `${where}: data（書き込む内容）がありません。`);

  // ---------- 普通の列のテーブル（入出金・事故・点検）、チャット ----------
  if (cfg.write === "direct") {
    const id = raw.id ?? data?.id ?? null;
    let before = null;
    if (id != null) {
      const { data: rows, error } = await sb.from(table).select("*").eq("tenant_id", tenantId).eq("id", id).limit(1);
      if (error) throw httpError(502, `${table}: ${error.message}`);
      before = rows?.[0] || null;
    }
    if (op === "create" && before) throw httpError(409, `${where}: ${table} に id=${id} はすでにあります。`);
    if (["update", "replace", "delete"].includes(op) && !before) throw httpError(404, `${where}: ${table} に id=${id} が見つかりません。`);
    const kind = op === "upsert" ? (before ? "update" : "create") : op;
    let row = null;
    if (kind !== "delete") {
      if (cfg.shape === "payload") {
        // chat_messages: { id(自動), tenant_id, driver_id, payload }
        const prevPayload = before?.payload || {};
        const payload = restoreMasked(kind === "update" ? { ...prevPayload, ...data } : data, prevPayload);
        row = { payload, driver_id: payload.driverId ?? before?.driver_id ?? null };
      } else {
        const { tenant_id, ...rest } = data;
        row = restoreMasked(kind === "update" ? { ...rest } : rest, before);
        if (kind === "update" || kind === "replace") delete row.id;
      }
    }
    return { index, op, kind, table, id, mode: "direct", before, after: kind === "delete" ? null : row };
  }

  // ---------- ハコマネ画面と同じ保存の仕組みで書くテーブル ----------
  const givenId = raw.id ?? data?.id ?? null;
  if (op !== "create" && givenId == null && table !== "company_info") throw httpError(400, `${where}: id を指定してください。`);
  const existing = givenId != null || table === "company_info" ? await findPayloadRow(sb, tenantId, table, givenId) : null;
  if (op === "create" && existing) throw httpError(409, `${where}: ${table} に id=${givenId} はすでにあります。`);
  if (["update", "replace", "delete"].includes(op) && !existing) throw httpError(404, `${where}: ${table} に id=${givenId} が見つかりません。`);

  const before = existing?.payload || null;
  const kind = op === "upsert" ? (existing ? "update" : "create") : op;
  const businessId = givenId ?? before?.id ?? newBusinessId(table);
  // DBの行のid: 既存行はそのまま。新規の請求書は画面と同じくランダムなuuid、それ以外は業務上のidと同じ
  const rowId = existing?.id ?? (table === "invoices" ? randomUUID() : String(businessId));
  const nowIso = new Date().toISOString();

  let after;
  if (kind === "delete" && raw.hard) after = null;
  else if (kind === "delete") after = { ...before, deleted: true, deletedAt: nowIso, deletedBy: "ai" };
  else if (kind === "update") after = restoreMasked({ ...before, ...data, id: before.id ?? businessId }, before);
  else after = restoreMasked({ ...data, id: businessId }, before); // create / replace

  return { index, op, kind, hard: !!(kind === "delete" && raw.hard), table, id: businessId, rowId, mode: "sync", before, after };
};

const historyEntry = (p, i) => ({
  id: `HIST-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
  entityType: p.table,
  entityId: p.id,
  entityLabel: p.before?.name || p.before?.title || p.before?.customerName || p.id,
  snapshot: p.before,
  changedAt: new Date().toISOString(),
  changedByRole: "ai",
  changedBy: "AI社員（/api/ai-data）",
  action: p.hard ? "hard_delete" : p.kind,
});

const runWrite = async (sb, tenantId, body) => {
  const rawOps = Array.isArray(body?.ops) ? body.ops : body?.op ? [body] : [];
  if (rawOps.length === 0) throw httpError(400, "ops（操作の一覧）がありません。");
  if (rawOps.length > MAX_OPS) throw httpError(400, `一度にできる操作は${MAX_OPS}件までです。`);
  const dryRun = body?.dryRun === true || body?.dryRun === "true" || body?.dryRun === 1;

  const plans = [];
  for (let i = 0; i < rawOps.length; i += 1) plans.push(await planOp(sb, tenantId, rawOps[i], i));

  // 同じ行への操作が2回以上あると、どちらが残るか分かりにくいので断る
  const seen = new Set();
  for (const p of plans) {
    const key = `${p.table}:${p.mode === "sync" ? p.rowId : p.id}`;
    if (p.id != null && seen.has(key)) throw httpError(400, `ops[${p.index}]: ${p.table} の id=${p.id} への操作が重複しています。1件にまとめてください。`);
    seen.add(key);
  }

  const summary = plans.map((p) => ({
    op: p.op,
    result: p.hard ? "hard_delete" : p.kind,
    table: p.table,
    id: p.id,
    before: maskSecrets(p.before),
    after: maskSecrets(p.after),
  }));
  if (dryRun) return { dryRun: true, saved: false, count: plans.length, results: summary };

  // ① ハコマネ画面と同じ保存関数で、まとめて1回で保存（全部成功か、全部取り消し）
  const syncPlans = plans.filter((p) => p.mode === "sync");
  if (syncPlans.length > 0) {
    const upsertMap = new Map();
    const deleteMap = new Map();
    const pushUpsert = (table, row) => {
      if (!upsertMap.has(table)) upsertMap.set(table, []);
      upsertMap.get(table).push(row);
    };
    syncPlans.forEach((p, i) => {
      if (p.hard) {
        if (!deleteMap.has(p.table)) deleteMap.set(p.table, []);
        deleteMap.get(p.table).push(p.rowId);
      } else {
        pushUpsert(p.table, { id: p.rowId, payload: p.after });
      }
      if (p.before) {
        const h = historyEntry(p, i);
        pushUpsert("change_history", { id: h.id, payload: h });
      }
    });
    const { error } = await sb.rpc("save_tenant_data_atomic", {
      p_tenant_id: tenantId,
      p_upserts: [...upsertMap].map(([table, rows]) => ({ table, rows })),
      p_deletes: [...deleteMap].map(([table, ids]) => ({ table, ids })),
      p_expected_updated_at: null,
    });
    if (error) throw httpError(502, `保存に失敗しました（何も保存されていません）: ${error.message}`);
  }

  // ② 普通の列のテーブルは1件ずつ（こちらは画面側も1件ずつ直接書いている）
  const directPlans = plans.filter((p) => p.mode === "direct");
  const directDone = [];
  for (const p of directPlans) {
    let error;
    if (p.kind === "delete") ({ error } = await sb.from(p.table).delete().eq("tenant_id", tenantId).eq("id", p.id));
    else if (p.kind === "create") {
      const { data: ins, error: e } = await sb.from(p.table).insert({ ...p.after, tenant_id: tenantId }).select("id").limit(1);
      error = e;
      if (!e && p.id == null) p.id = ins?.[0]?.id ?? null;
    } else ({ error } = await sb.from(p.table).update(p.after).eq("tenant_id", tenantId).eq("id", p.id));
    if (error) {
      throw httpError(
        502,
        `${p.table} id=${p.id} の保存に失敗しました: ${error.message}` +
          (syncPlans.length || directDone.length ? `（これより前の操作は保存済み: ${[...syncPlans, ...directDone].map((x) => `${x.table}:${x.id}`).join(", ")}）` : "")
      );
    }
    directDone.push(p);
  }

  return {
    dryRun: false,
    saved: true,
    count: plans.length,
    results: summary.map((s, i) => ({ ...s, id: plans[i].id })),
    note: syncPlans.length
      ? "ハコマネを開いている画面には「他で更新されました」と表示されるので、再読み込みすると反映されます。"
      : undefined,
  };
};

const readJsonBody = async (req) => {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
};

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  const readKey = process.env.AI_API_KEY;
  const writeKey = process.env.AI_WRITE_API_KEY;
  const given = req.headers["x-ai-api-key"];
  const canWrite = !!writeKey && safeEqual(given, writeKey);
  const canRead = canWrite || (!!readKey && safeEqual(given, readKey));
  if (!readKey && !writeKey) return res.status(500).json({ error: "サーバーに AI_API_KEY が設定されていません。" });
  if (!canRead) return res.status(403).json({ error: "Forbidden" });
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return res.status(500).json({ error: "サーバーに SUPABASE_SERVICE_ROLE_KEY が設定されていません。" });

  if (req.method === "POST") {
    if (!writeKey) return res.status(403).json({ error: "書き込みは無効です（サーバーに AI_WRITE_API_KEY が設定されていません）。" });
    if (!canWrite) return res.status(403).json({ error: "このキーは読み取り専用です。書き込みには AI_WRITE_API_KEY を使ってください。" });
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      return res.status(400).json({ error: "本文がJSONとして読めません。" });
    }
    try {
      const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
      const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const tenantId = await resolveTenantId(sb);
      const out = await runWrite(sb, tenantId, body);
      return res.status(200).json({ asOf: asOfJst(), ...out });
    } catch (e) {
      console.error("[ai-data:write]", e);
      return res.status(e.status || 500).json({ error: e.message || "Internal Server Error" });
    }
  }

  const q = req.query || {};
  const requested = [...toList(q.table), ...toList(q.tables)];

  // テーブル指定なし → 使い方の案内
  if (requested.length === 0) {
    return res.status(200).json({
      asOf: asOfJst(),
      usage:
        "?table=名前 または ?tables=名前1,名前2。期間は from/to（YYYY-MM-DD）、項目の値は f.項目名=値、ページ送りは limit/offset。",
      writeUsage: "POST で { ops: [{ op, table, id, data }] }。op は create / update / upsert / replace / delete。dryRun: true で保存せず確認だけ。書き込みには AI_WRITE_API_KEY が必要。",
      tables: Object.entries(TABLES).map(([name, c]) => ({
        name,
        label: c.label,
        defaultDateField: c.date || null,
        writable: !!c.write,
      })),
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
