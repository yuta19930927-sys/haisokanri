/**
 * GET /api/ai-daily-check
 *
 * Claude のスケジュールタスク（毎朝の自動チェック）用の、読み取り専用API。
 * ブラウザログイン（Supabase Auth）を使わず、APIキーだけで
 *   ・ドライバーの期限（免許・健康診断・安全指導など）
 *   ・車両の期限（車検・自賠責・任意保険）
 *   ・ドライバーへの支払予定（未払いのドライバー請求書）
 *   ・翌日の案件（受注＋定期便）
 * をまとめて返す。
 *
 * 【認証】リクエストヘッダー x-ai-api-key が 環境変数 AI_API_KEY と一致しない場合は 403。
 * 【DB】環境変数 SUPABASE_SERVICE_ROLE_KEY（RLSを無視できる鍵）で読む。読み取りのみ。
 * 【テナント】ハコマネは複数社（tenant_id）のデータを同じテーブルに持つため、
 *   環境変数 AI_TENANT_ID の会社のデータだけを返す。未設定で、テナントが1社しか
 *   無い場合はその1社を自動で使う。複数社ある場合はエラーにして候補を返す。
 *
 * 任意のクエリ:
 *   ?days=60   期限・支払は「daysUntil が60日以内（期限切れ含む）」だけに絞る（既定: 絞らない）
 *   ?date=2026-11-20  翌日案件の対象日を指定する（既定: 日本時間の明日）
 */
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";

const DEFAULT_SUPABASE_URL = "https://qccxztvroptltgaajetd.supabase.co";
const PAGE_SIZE = 1000;
const DELIVERY_TYPE_LABEL = { route: "ルート配送", charter: "チャーター便", spot: "スポット" };
const INACTIVE_VEHICLE_STATUSES = new Set(["retired", "disposed", "sold", "廃車", "売却"]);

// ---------- 日付（すべて日本時間で扱う。Vercel のサーバーは UTC で動いているため） ----------
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const jstNow = () => new Date(Date.now() + JST_OFFSET_MS); // getUTC* で日本時間の値が取れる
const ymd = (d) => d.toISOString().slice(0, 10);
const todayJst = () => ymd(jstNow());
const addDaysStr = (dateStr, days) => {
  const t = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(t.getTime())) return null;
  t.setUTCDate(t.getUTCDate() + days);
  return ymd(t);
};
const asOfJst = () => {
  const n = jstNow();
  return `${n.toISOString().slice(0, 19)}+09:00`;
};
/** "2026/12/1" や "2026-12-01T..." も YYYY-MM-DD にそろえる。読めなければ null */
const normDate = (v) => {
  if (!v || typeof v !== "string") return null;
  const m = v.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!m) return null;
  const s = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return Number.isNaN(new Date(`${s}T00:00:00Z`).getTime()) ? null : s;
};
const daysBetween = (fromStr, toStr) =>
  Math.round((new Date(`${toStr}T00:00:00Z`) - new Date(`${fromStr}T00:00:00Z`)) / 86400000);
const ageOn = (birthStr, todayStr) => {
  const b = normDate(birthStr);
  if (!b) return null;
  const [by, bm, bd] = b.split("-").map(Number);
  const [ty, tm, td] = todayStr.split("-").map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
};

// ---------- 認証 ----------
const safeEqual = (a, b) => {
  const ba = Buffer.from(String(a || ""), "utf8");
  const bb = Buffer.from(String(b || ""), "utf8");
  if (ba.length === 0 || ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
};

// ---------- Supabase 読み込み ----------
/** 1000件を超えても全件取れるよう、ページ単位で読む */
const fetchAll = async (makeQuery) => {
  const out = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await makeQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return out;
};
const payloadsOf = (rows) =>
  rows
    .map((r) => (r?.payload && typeof r.payload === "object" ? r.payload : null))
    .filter((p) => p && !p.deleted);

const resolveTenantId = async (sb) => {
  const fromEnv = (process.env.AI_TENANT_ID || "").trim();
  if (fromEnv) return fromEnv;
  const { data, error } = await sb.from("tenants").select("id, name, is_active");
  if (error) throw error;
  const active = (data || []).filter((t) => t.is_active !== false);
  if (active.length === 1) return active[0].id;
  const err = new Error(
    "テナント（会社）が複数あるため、どの会社のデータを返すか決められません。Vercel の環境変数 AI_TENANT_ID に会社のIDを設定してください。"
  );
  err.status = 500;
  err.candidates = active.map((t) => ({ id: t.id, name: t.name }));
  throw err;
};

// ---------- 各セクションの組み立て ----------
const buildDriverDeadlines = (drivers, today) => {
  const out = [];
  const push = (d, item, dateStr) => {
    const expiryDate = normDate(dateStr);
    if (!expiryDate) return;
    out.push({ driverName: d.name || d.id || "", item, expiryDate, daysUntil: daysBetween(today, expiryDate) });
  };
  for (const d of drivers) {
    if (d.status === "retired") continue; // 退職済みは画面の通知と同じく対象外
    push(d, "運転免許", d.license_expiry || d.licenseExpiry);
    push(d, "契約満了", d.contractEnd);
    // 「前回実施日＋365日」を次回期限とみなす（ハコマネ画面の通知と同じ考え方）
    if (normDate(d.healthCheckDate)) push(d, "健康診断（前回から1年）", addDaysStr(normDate(d.healthCheckDate), 365));
    if (normDate(d.lastSafetyGuidanceDate))
      push(d, "年次安全指導（前回から1年）", addDaysStr(normDate(d.lastSafetyGuidanceDate), 365));
    const age = ageOn(d.birthdate, today);
    if (age != null && age >= 65 && normDate(d.lastElderlyDiagnosisDate))
      push(d, `高齢運転者適性診断（${age}歳）`, addDaysStr(normDate(d.lastElderlyDiagnosisDate), 365));
  }
  return out;
};

const buildVehicleDeadlines = (vehicles, drivers, today) => {
  const driverById = new Map(drivers.map((d) => [d.id, d]));
  const out = [];
  const push = (vehicleNumber, driverName, item, dateStr) => {
    const expiryDate = normDate(dateStr);
    if (!expiryDate) return;
    out.push({ vehicleNumber, driverName: driverName || null, item, expiryDate, daysUntil: daysBetween(today, expiryDate) });
  };
  // 会社の車両（車両管理）
  for (const v of vehicles) {
    if (INACTIVE_VEHICLE_STATUSES.has(v.status)) continue;
    const vehicleNumber = v.plate || v.id || "";
    const driver = driverById.get(v.assignedDriverId);
    const driverName = driver && !driver.deleted ? driver.name : null;
    push(vehicleNumber, driverName, "車検", v.nextInspection);
    push(vehicleNumber, driverName, "自賠責", v.liabilityExpiry);
    push(vehicleNumber, driverName, "任意保険", v.insuranceExpiry);
    push(vehicleNumber, driverName, "リース満了", v.leaseEnd);
  }
  // ドライバーの持込車両（ドライバー登録画面の「車検有効期限」「自賠責保険期限」）
  for (const d of drivers) {
    if (d.status === "retired") continue;
    const vehicleNumber = d.vehicleNumber || `${d.name || d.id}の持込車両`;
    push(vehicleNumber, d.name, "車検", d.vehicleInspectionExpiry);
    push(vehicleNumber, d.name, "自賠責", d.liabilityInsuranceExpiry);
  }
  return out;
};

const yen = (n) => `${Math.round(Number(n) || 0).toLocaleString("ja-JP")}円`;
const formatPeriod = (ym) => {
  const m = String(ym || "").match(/^(\d{4})-(\d{1,2})/);
  return m ? `${m[1]}年${Number(m[2])}月` : ym || "";
};

const buildUpcomingPayments = (invoices, today) => {
  const out = [];
  for (const i of invoices) {
    if (i.type !== "driver_invoice") continue;
    if (i.status === "paid" || i.status === "cancelled" || i.status === "void") continue;
    const paymentDate = normDate(i.dueDate);
    if (!paymentDate) continue;
    const amount = i.transferAmount != null ? Number(i.transferAmount) || 0 : Number(i.total) || 0;
    const lines = (Array.isArray(i.lineItems) ? i.lineItems : [])
      .filter(Boolean)
      .map((li) => `${li.name || "明細"} ${yen(li.subtotal ?? (Number(li.qty) || 0) * (Number(li.unitPrice) || 0))}`);
    const parts = [...lines];
    if (Number(i.tax) > 0) parts.push(`消費税 ${yen(i.tax)}`);
    if (Number(i.deductionTotal) > 0) parts.push(`控除 −${yen(i.deductionTotal)}`);
    out.push({
      driverName: i.driverName || i.driverId || "",
      targetPeriod: formatPeriod(i.payoutMonth),
      amount,
      paymentDate,
      daysUntil: daysBetween(today, paymentDate),
      breakdown: parts.join(" / ") || null,
    });
  }
  return out;
};

const slackIdOf = (d) => d?.slackId || d?.slackUserId || d?.slack_id || d?.slackMemberId || null;

const buildTomorrowJobs = ({ orders, recurring, confirmations, drivers, customers, jobTypes }, target) => {
  const driverById = new Map(drivers.map((d) => [d.id, d]));
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const jobTypeById = new Map(jobTypes.map((j) => [j.id, j]));
  const out = [];

  // ① 受注（配達日が対象日のもの）
  for (const o of orders) {
    if (normDate(o.deliveryDate) !== target) continue;
    if (o.status === "cancelled") continue;
    const d = driverById.get(o.driverId);
    const location = [o.from, o.to].filter(Boolean).join(" → ") || null;
    const notes = [o.cargo ? `荷物: ${o.cargo}` : "", o.notes || ""].filter(Boolean).join(" / ") || null;
    out.push({
      date: target,
      driverName: d?.name || null, // null = まだドライバー未割当
      driverSlackId: slackIdOf(d),
      jobType: jobTypeById.get(o.jobTypeId)?.name || DELIVERY_TYPE_LABEL[o.deliveryType] || "ルート配送",
      client: o.customerName || customerById.get(o.customerId)?.name || null,
      startTime: o.pickupTime || o.deliveryTime || null,
      location,
      notes,
      source: "order",
      orderId: o.id,
    });
  }

  // ② 定期便（曜日で決まっている固定の案件）
  const weekday = new Date(`${target}T00:00:00Z`).getUTCDay(); // 0=日曜（画面側と同じ）
  for (const r of recurring) {
    if (r.active === false || !Array.isArray(r.daysOfWeek)) continue;
    if (!r.daysOfWeek.map(Number).includes(weekday)) continue;
    if (r.createdAt && normDate(r.createdAt) && normDate(r.createdAt) > target) continue;
    // 「稼働なし」と確認済みの日は除外
    const skipped = confirmations.some(
      (c) => (c.recurringId || c.recurringAssignmentId || c.assignmentId) === r.id && normDate(c.date) === target &&
        (c.status === "none" || c.status === "no_work" || c.worked === false)
    );
    if (skipped) continue;
    const d = driverById.get(r.driverId);
    out.push({
      date: target,
      driverName: d?.name || null,
      driverSlackId: slackIdOf(d),
      jobType: jobTypeById.get(r.jobTypeId)?.name || "定期便",
      client: customerById.get(r.customerId)?.name || null,
      startTime: null,
      location: null,
      notes: ["定期便", r.note || ""].filter(Boolean).join(" / "),
      source: "recurring",
      recurringId: r.id,
    });
  }

  out.sort((a, b) => String(a.startTime || "99:99").localeCompare(String(b.startTime || "99:99")) ||
    String(a.driverName || "").localeCompare(String(b.driverName || ""), "ja"));
  return out;
};

// ---------- ハンドラ ----------
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
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;

  const today = todayJst();
  const qDate = normDate(String(req.query?.date || ""));
  const target = qDate || addDaysStr(today, 1);
  const daysLimit = req.query?.days != null && req.query.days !== "" ? Number(req.query.days) : null;
  const within = (x) => daysLimit == null || Number.isNaN(daysLimit) || x.daysUntil <= daysLimit;

  try {
    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const tenantId = await resolveTenantId(sb);
    const all = (table) =>
      fetchAll(() => sb.from(table).select("id,payload").eq("tenant_id", tenantId).order("id", { ascending: true }));

    const [drivers, vehicles, customers, jobTypes, recurring, confirmations, invoices, orders] = await Promise.all([
      all("drivers").then(payloadsOf),
      all("vehicles").then(payloadsOf),
      all("customers").then(payloadsOf),
      all("job_types").then(payloadsOf),
      all("recurring_assignments").then(payloadsOf),
      fetchAll(() =>
        sb.from("recurring_confirmations").select("id,payload").eq("tenant_id", tenantId)
          .eq("payload->>date", target).order("id", { ascending: true })
      ).then(payloadsOf),
      fetchAll(() =>
        sb.from("invoices").select("id,payload").eq("tenant_id", tenantId)
          .eq("payload->>type", "driver_invoice").order("id", { ascending: true })
      ).then(payloadsOf),
      fetchAll(() =>
        sb.from("orders").select("id,payload").eq("tenant_id", tenantId)
          .eq("payload->>deliveryDate", target).order("id", { ascending: true })
      ).then(payloadsOf),
    ]);

    const byDays = (a, b) => a.daysUntil - b.daysUntil;
    return res.status(200).json({
      asOf: asOfJst(),
      today,
      targetDate: target,
      driverDeadlines: buildDriverDeadlines(drivers, today).filter(within).sort(byDays),
      vehicleDeadlines: buildVehicleDeadlines(vehicles, drivers, today).filter(within).sort(byDays),
      upcomingPayments: buildUpcomingPayments(invoices, today).filter(within).sort(byDays),
      tomorrowJobs: buildTomorrowJobs({ orders, recurring, confirmations, drivers, customers, jobTypes }, target),
    });
  } catch (e) {
    console.error("[ai-daily-check]", e);
    return res.status(e.status || 500).json({
      error: e.message || "Internal Server Error",
      ...(e.candidates ? { tenantCandidates: e.candidates } : {}),
    });
  }
}
