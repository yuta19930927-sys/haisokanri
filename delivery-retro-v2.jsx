import { useState, useEffect, useRef, useMemo, useCallback, Component, Fragment } from "react";
import { supabase } from "./src/lib/supabase";

// ===== ハコマネ THEME =====
const UI = {
  accent: "#00a09a",
  accentDark: "#007a74",
  accentLight: "#e8f5f4",
  mainBg: "#f7f8f9",
  sidebarBg: "#f0f2f5",
  sidebarHeader: "#e6e9ed",
  sidebarBorder: "#d8dce0",
  white: "#ffffff",
  textDark: "#222",
  text: "#333",
  textMuted: "#888",
  textMuted2: "#999",
  border: "#e8e8e8",
  softBorder: "#d0d0d0",
};
const cardBorder = `1px solid ${UI.border}`;
const softShadow = "0 8px 24px rgba(23, 43, 77, 0.08)";
const inputBase = {
  border: `1px solid ${UI.softBorder}`,
  borderRadius: "4px",
  background: UI.white,
};
const interactive = { transition: "all .18s ease" };
// Legacy aliases for existing page layouts (visuals updated to new theme)
const raised = { border:`1px solid ${UI.sidebarBorder}`, borderRadius:"4px" };
const pressed = { border:`1px solid ${UI.sidebarBorder}`, borderRadius:"4px", boxShadow:"inset 0 2px 4px rgba(0,0,0,.12)" };
const inset3d = { border:`1px solid ${UI.border}`, borderRadius:"4px" };
const groove = { border:`1px solid ${UI.sidebarBorder}`, borderRadius:"6px" };
const winBg = UI.white;

// ===== MOCK DATA =====
// 以前は today / y / mo がモジュールのトップレベルで一度だけ評価される定数になっていたため、
// アプリを起動した瞬間の日付がそのまま固定され、タブを開いたまま日付をまたいでも
// 「今日」の判定が更新されないバグがあった（リロードしない限り、深夜0時を過ぎても
// 前日の日付のまま動作してしまう）。
// today は「呼び出し時点の現在時刻」を都度取得する関数に変更し、
// y / mo に依存していた fmt() も、引数の日付を基準にその月の年月をそのまま使うよう修正する。
const getNow = () => new Date();
/** 後方互換のため残しているグローバル変数。呼び出し時点の値ではなくモジュール読み込み時点の値である点に注意。
 *  新しいコードでは getNow() を使うこと。 */
const fmt = (d, baseDate) => {
  const base = baseDate || getNow();
  return `${base.getFullYear()}-${String(base.getMonth()+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
};
const PAYMENT_SITE_OPTIONS = [
  "当月末払い",
  "翌月末払い",
  "翌々月末払い",
  "翌月10日払い",
  "翌月15日払い",
  "翌月20日払い",
  "翌月25日払い",
];
const CLOSING_DAY_OPTIONS = [5, 10, 15, 20, 25, 31];
const MOBILE_BREAKPOINT = 768;

const useIsMobile = () => {
  const getValue = () =>
    typeof window !== "undefined" ? window.innerWidth <= MOBILE_BREAKPOINT : false;
  const [isMobile, setIsMobile] = useState(getValue);
  useEffect(() => {
    const onResize = () => setIsMobile(getValue());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isMobile;
};

const parseDate = (value) => {
  if (!value) return null;
  const [yy, mm, dd] = String(value).slice(0, 10).split("-").map(Number);
  if (!yy || !mm || !dd) return null;
  return new Date(yy, mm - 1, dd);
};

const formatDate = (date) => {
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
};

/**
 * 「今日」の日付文字列をローカル時刻基準で取得する。
 * new Date().toISOString().slice(0,10) はUTC基準になるため、
 * 日本時間の深夜0時〜9時の間は「前日」の日付になってしまうバグがあった。
 * 日付の境界が絡む処理（請求書の発行日・実績入力のデフォルト値など）では
 * 必ずこちらを使うこと。
 */
const getTodayLocalStr = () => formatDate(new Date());

/**
 * 消費税額を計算する共通関数。
 * 以前は Math.round(金額 * 0.1) という計算式が6箇所に分散していたため、
 * 将来消費税率が変わった場合に一部の箇所だけ更新し忘れるリスクがあった。
 * 税率変更が必要になったら、このTAX_RATE定数とこの関数だけを直せばよい。
 */
const TAX_RATE = 0.1;
const calcTax = (amount) => Math.round((Number(amount) || 0) * TAX_RATE);

const calcDueDateByTerms = (deliveredDate, closingDay = 31, paymentSite = "翌月末払い") => {
  const base = parseDate(deliveredDate) || new Date();
  const closeDayNum = Number(closingDay) || 31;

  // 締め日（月末=その月の最終日）
  const baseYear = base.getFullYear();
  const baseMonth = base.getMonth(); // 0始まり
  const baseDate = base.getDate();

  const actualCloseDay = closeDayNum === 31
    ? new Date(baseYear, baseMonth + 1, 0).getDate() // その月の末日
    : closeDayNum;

  // 当月締めか翌月締めか
  const closingMonthOffset = baseDate <= actualCloseDay ? 0 : 1;

  // 締め月（0始まり）
  let closingMonth = baseMonth + closingMonthOffset;
  let closingYear = baseYear;
  if (closingMonth > 11) {
    closingMonth -= 12;
    closingYear += 1;
  }

  // 支払月（0始まり）
  let targetMonth = closingMonth;
  let targetYear = closingYear;
  let targetDay = 31; // 末日フラグ

  if (paymentSite === "当月末払い") {
    // targetMonth はそのまま
  } else if (paymentSite === "翌月末払い") {
    targetMonth += 1;
  } else if (paymentSite === "翌々月末払い") {
    targetMonth += 2;
  } else if (paymentSite === "翌月10日払い") {
    targetMonth += 1;
    targetDay = 10;
  } else if (paymentSite === "翌月15日払い") {
    targetMonth += 1;
    targetDay = 15;
  } else if (paymentSite === "翌月20日払い") {
    targetMonth += 1;
    targetDay = 20;
  } else if (paymentSite === "翌月25日払い") {
    targetMonth += 1;
    targetDay = 25;
  }

  // 月のオーバーフロー処理
  while (targetMonth > 11) {
    targetMonth -= 12;
    targetYear += 1;
  }

  // 末日計算（new Date(year, month+1, 0) で確実に末日を取得）
  const lastDayOfMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const safeDay = targetDay === 31 ? lastDayOfMonth : Math.min(targetDay, lastDayOfMonth);

  return formatDate(new Date(targetYear, targetMonth, safeDay));
};

/**
 * 受注を「配送完了」にする処理（実績データ・請求書の自動生成を含む）。
 * OrdersPage（次へボタン）・DispatchPage（配送完了ボタン）の両方から
 * 同じ結果になるよう、ロジックを1箇所にまとめている。
 * ここを2箇所に別々に実装すると、片方だけ直し忘れて挙動がズレる
 * 事故につながるため、必ずこの関数を両方から呼び出す。
 *
 * @param {object} d 現在のdata全体
 * @param {string} orderId 完了させる受注のID
 * @returns {object} 更新後のdata全体（変更が無ければdをそのまま返す）
 */
const applyOrderDeliveredTransition = (d, orderId) => {
  const currentOrders = Array.isArray(d?.orders) ? d.orders : [];
  const targetOrder = currentOrders.find((x) => x?.id === orderId);
  if (!targetOrder) return d;

  const nextOrders = currentOrders.map((x) =>
    x?.id === orderId ? { ...x, status: "delivered" } : x
  );

  // 【重要】以前はここで受注1件ごとに個別の請求書を自動発行していたが、
  // 法人契約では「案件が終わるたびに毎回請求書を送る」ケースの方が少なく、
  // 顧客ごとに登録された締め日・支払いサイトに合わせて、まとめて
  // 月次で請求書を発行する運用が基本になる。そのため、配送完了時には
  // 実績データ（売上・報酬額）だけを記録し、請求書は
  // 「顧客請求書の一括発行」（InvoicesPage）で締め日ごとにまとめて作る。
  // 単発で今すぐ個別に発行したい場合は、受注詳細から手動で発行できる。
  const alreadyInSales = (Array.isArray(d?.dailyRecords) ? d.dailyRecords : [])
    .some((r) => r?.orderId === targetOrder?.id);
  const nextDailyRecords = alreadyInSales
    ? (Array.isArray(d?.dailyRecords) ? d.dailyRecords : [])
    : [
        ...(Array.isArray(d?.dailyRecords) ? d.dailyRecords : []),
        {
          id: `DR-${Date.now()}`,
          orderId: targetOrder?.id,
          date: targetOrder?.deliveryDate,
          driverId: targetOrder?.assignedDriverId || targetOrder?.driverId || "",
          customerId: targetOrder?.customerId || "",
          jobTypeId: targetOrder?.jobTypeId || "",
          count: 1,
          distance: targetOrder?.distance || "",
          hours: targetOrder?.hours || "",
          salesAmount: Number(targetOrder?.amount) || 0,
          driverAmount: Number(targetOrder?.driverPayAmount) || 0,
          note: targetOrder?.driverPayAmount == null
            ? `受注 ${targetOrder?.id} より自動連携（⚠️ドライバー報酬額が未設定のため0円で記録）`
            : `受注 ${targetOrder?.id} より自動連携`,
        },
      ];

  return {
    ...d,
    orders: nextOrders,
    dailyRecords: nextDailyRecords,
  };
};

/** 振込名義カナ入力: 半角カタカナ等を全角に寄せる（小書きはそのまま） */
const normalizePayerKana = (value) => {
  if (value == null || value === "") return "";
  try {
    return String(value).normalize("NFKC");
  } catch {
    return String(value);
  }
};

/**
 * 振込名義（カナ）が全銀フォーマットで使える文字だけかを検証する。
 *
 * 全銀の受取人名に使えるのは、カタカナ・英大文字・数字・スペースと
 * 一部の記号（()-.,「」/）のみ。ひらがな・漢字・小文字が入っていると
 * 銀行側で振込エラーになり、給料が振り込めないという最悪の事態になる。
 * 入力時点でブロックはせず（打ちづらくなるため）、警告として知らせる。
 *
 * @returns {string|null} 問題があれば警告メッセージ、なければ null
 */
const validateBankKana = (value) => {
  const v = String(value ?? "").trim();
  if (!v) return null;
  if (/[ぁ-ん]/.test(v)) return "ひらがなが含まれています。カタカナで入力してください。";
  if (/[一-龯]/.test(v)) return "漢字が含まれています。カタカナで入力してください。";
  if (/[a-z]/.test(v)) return "英小文字が含まれています。大文字で入力してください。";
  // 上記以外で、全銀で許可されていない文字が残っていないかを最終確認する
  const invalid = v.replace(/[ァ-ヴー\uFF66-\uFF9FA-Z0-9 　()\-./,「」]/g, "");
  if (invalid) return `振込に使えない文字が含まれています：${[...new Set(invalid)].join(" ")}`;
  return null;
};

/** 表示用の業務ID（INV-001 等）を生成する。
 * 単純な配列長+1では削除済みデータや同時実行で重複する恐れがあるため、
 * 既存IDの最大連番 + タイムスタンプ由来のサフィックスを組み合わせて衝突を避ける。
 * 実際のレコード主キー（_dbId）は別途 crypto.randomUUID() で発行すること。
 */
const generateUniqueBusinessId = (existingList, prefix, separator = "-") => {
  const list = Array.isArray(existingList) ? existingList : [];
  // 既存データには "C001"（ハイフンなし）のように prefix と番号の間に
  // 区切り文字がない形式のIDも使われているため、separator を指定できるようにする。
  const escapedSeparator = separator.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${prefix}${escapedSeparator}(\\d+)$`);
  const maxNum = list.reduce((max, item) => {
    const idValue = item?.id || item?.payload?.id || "";
    const match = String(idValue).match(pattern);
    return match ? Math.max(max, parseInt(match[1], 10)) : max;
  }, 0);
  const existingIds = new Set(list.map((item) => item?.id || item?.payload?.id || ""));
  let candidate = `${prefix}${separator}${String(maxNum + 1).padStart(3, "0")}`;
  let bump = maxNum + 1;
  while (existingIds.has(candidate)) {
    bump += 1;
    candidate = `${prefix}${separator}${String(bump).padStart(3, "0")}`;
  }
  return candidate;
};

/**
 * ===== 変更履歴（監査ログ）の記録 =====
 *
 * 受注・請求書・ドライバー情報・実績を編集する「直前」に、編集前の内容を
 * まるごとスナップショットとして記録する。これにより、後から
 * 「いつ・誰が・どう変えたか」を確認できるようにする。
 *
 * 【設計方針】
 * ・追記専用（このエントリ自体を後から編集・削除することはない）
 * ・保存する内容は「変更前」の状態。差分計算をせず丸ごと保存するのは、
 *   一部の項目だけを比較するロジックにすると、新しい項目を追加した時に
 *   そこだけ履歴に残らない、という事故につながりやすいため。
 * ・new作成時は履歴を残さない（「変更」ではなく「新規作成」のため）。
 */
const logHistoryEntry = (setData, { entityType, entityId, entityLabel, before, userRole }) => {
  if (!before) return; // 新規作成時は before が無いので記録しない
  const entry = {
    id: `HIST-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    entityType,
    entityId,
    entityLabel: entityLabel || entityId,
    snapshot: before,
    changedAt: new Date().toISOString(),
    changedByRole: userRole || "unknown",
  };
  setData((d) => ({
    ...d,
    changeHistory: [...(Array.isArray(d?.changeHistory) ? d.changeHistory : []), entry],
  }));
};

// 新規テナント（会社）が初めてこのアプリを開いたときに使われる初期データ。
// 以前はここに架空のサンプル顧客・受注・請求書（株式会社田中商事など）と
// 現在運用中の実会社情報（T-LINKの連絡先など）がハードコードされていたため、
// 新しい会社が導入した瞬間にテストデータと他社の会社情報が
// そのままその会社のSupabaseに書き込まれてしまう重大な問題があった。
// 新規テナントの初期状態は「空」にし、companyInfoも未設定（null）にして
// 各テナントが「会社情報設定」画面で自分の情報を入力するまでは何も保存しない。
const initialData = {
  customers: [],
  orders: [],
  drivers: [],
  vehicles: [],
  invoices: [],
  bankTransactions: [],
  events: [],
  payables: [],
  companyInfo: null,
  jobTypes: [
    { id:"JT-001", name:"ルート", calcPattern:"count", taxable:true, unitPrice:180, driverUnitPrice:150, note:"個数×単価" },
    { id:"JT-002", name:"チビ宅", calcPattern:"count", taxable:true, unitPrice:200, driverUnitPrice:160, note:"個数×単価" },
    { id:"JT-003", name:"デカ宅", calcPattern:"count", taxable:true, unitPrice:350, driverUnitPrice:280, note:"個数×単価" },
    { id:"JT-004", name:"チャーター", calcPattern:"fixed", taxable:true, unitPrice:14000, driverUnitPrice:11000, note:"固定料金" },
  ],
  dailyRecords: [],
  qualityRecords: [],
};

// ===== UI COMPONENTS =====
const Icon = ({ children, size = 18, style }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={style}
  >
    {children}
  </svg>
);

const RetroBtn = ({ children, onClick, color, wide, small, style:ext, disabled }) => {
  const [dn, setDn] = useState(false);
  const custom = color
    ? {
        background: color,
        borderColor: color,
        color: color === "#fff" || color === "#ffffff" ? UI.text : UI.white,
      }
    : {};
  return (
    <button
      disabled={disabled}
      onMouseDown={()=>setDn(true)} onMouseUp={()=>setDn(false)} onMouseLeave={()=>setDn(false)}
      onClick={disabled ? undefined : onClick}
      style={{
        background: UI.white,
        border: `1px solid ${UI.softBorder}`,
        borderRadius: "3px",
        fontFamily:"'Noto Sans JP', sans-serif",
        fontSize:small?"12px":"13px",
        fontWeight:600,
        color: UI.text,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        padding:small?"4px 10px":wide?"10px 16px":"7px 12px",
        display:"inline-flex",
        alignItems:"center",
        justifyContent:"center",
        gap:"6px",
        userSelect:"none",
        minHeight: small ? "30px" : "36px",
        boxShadow: dn ? "inset 0 2px 4px rgba(0,0,0,.12)" : "none",
        ...interactive,
        ...custom,
        ...ext
      }}>
      {children}
    </button>
  );
};
const RetroInput = (props) => (
  <input {...props} style={{ ...inputBase, fontFamily:"'Noto Sans JP', sans-serif", fontSize:"13px", padding:"9px 10px", color:UI.text, outline:"none", width:"100%", boxSizing:"border-box", ...props.style }} />
);
const RetroSelect = ({ children, ...props }) => (
  <select {...props} style={{ ...inputBase, fontFamily:"'Noto Sans JP', sans-serif", fontSize:"13px", padding:"9px 10px", color:UI.text, outline:"none", width:"100%", boxSizing:"border-box", ...props.style }}>
    {children}
  </select>
);
const RetroTextarea = (props) => (
  <textarea {...props} style={{ ...inputBase, fontFamily:"'Noto Sans JP', sans-serif", fontSize:"13px", padding:"9px 10px", color:UI.text, outline:"none", width:"100%", boxSizing:"border-box", resize:"vertical", minHeight:"80px", ...props.style }} />
);
const Fl = ({ label, children, style }) => (
  <div style={{ marginBottom:"8px", ...style }}>
    <div style={{ fontFamily:"'Noto Sans JP', sans-serif", fontSize:"11px", fontWeight:700, color:"#555", marginBottom:"4px" }}>{label}</div>
    {children}
  </div>
);

/**
 * ===== 変更履歴パネル（汎用）=====
 *
 * ドライバー・車両・受注・請求書・実績など、どの種別の履歴でも
 * 同じ見た目で表示できる共通部品。スナップショットの中身は種別ごとに
 * 形が違うため、フィールド名をそのまま列挙する簡易表示にしている
 * （項目名の日本語対応表 labelMap を渡せば、そこだけ和名で表示される）。
 */
const HistoryPanel = ({ data, entityType, entityId, labelMap = {}, hideKeys = [] }) => {
  const [openId, setOpenId] = useState(null);
  const entries = (Array.isArray(data?.changeHistory) ? data.changeHistory : [])
    .filter((h) => h?.entityType === entityType && h?.entityId === entityId)
    .sort((a, b) => String(b?.changedAt || "").localeCompare(String(a?.changedAt || "")));

  const roleLabel = { office: "事務", admin: "管理者", super_admin: "システム管理者", dispatcher: "配車担当" };
  const fmt = (v) => {
    if (v == null || v === "") return "（空欄）";
    if (typeof v === "object") {
      // 万が一、循環参照を含むオブジェクトが紛れ込んでいても
      // JSON.stringify が例外を投げて履歴パネル全体がクラッシュしないよう保険をかける。
      try {
        return JSON.stringify(v);
      } catch {
        return "（表示できない形式のデータ）";
      }
    }
    return String(v);
  };
  // 【重要】履歴は変更前のスナップショットを丸ごと保存しているため、
  // 呼び出し元が意図せず機微な項目（報酬額など）を渡した場合、
  // ここで一律に全項目を表示すると権限の抜け穴になる。
  // hideKeys で指定された項目は、呼び出し元の判断で確実に除外する。
  const skipKeys = new Set(["_dbId", "id", ...hideKeys]);

  if (entries.length === 0) {
    return (
      <div style={{ color: "#999", fontSize: "12px", padding: "16px 0", textAlign: "center" }}>
        変更履歴はまだありません
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <p style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>
        各項目は「変更される直前」の内容です。クリックすると詳細が開きます。
      </p>
      {entries.map((h) => (
        <div key={h.id} style={{ border: cardBorder, borderRadius: "6px", overflow: "hidden" }}>
          <button
            onClick={() => setOpenId((cur) => (cur === h.id ? null : h.id))}
            style={{
              width: "100%", textAlign: "left", background: openId === h.id ? "#f0f2f5" : "#fff",
              border: "none", padding: "8px 10px", cursor: "pointer", fontSize: "12px",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}
          >
            <span>
              <b>{String(h.changedAt || "").slice(0, 16).replace("T", " ")}</b>
              　{roleLabel[h.changedByRole] || h.changedByRole || "不明"}が変更
            </span>
            <span style={{ color: "#999" }}>{openId === h.id ? "閉じる ▲" : "詳細 ▼"}</span>
          </button>
          {openId === h.id && (
            <div style={{ padding: "8px 12px", background: "#fafbfc", borderTop: cardBorder, fontSize: "12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", rowGap: "4px" }}>
                {Object.entries(h.snapshot || {})
                  .filter(([k]) => !skipKeys.has(k))
                  .map(([k, v]) => (
                    <Fragment key={k}>
                      <div style={{ color: "#777", fontWeight: 700 }}>{labelMap[k] || k}</div>
                      <div style={{ color: "#333", wordBreak: "break-all" }}>{fmt(v)}</div>
                    </Fragment>
                  ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

/**
 * ===== 「過去のデータを読み込む」バナー =====
 *
 * 実績（daily_records）・変更履歴（change_history）は、起動時には
 * 直近15ヶ月分だけを読み込む（起動を速くするため）。
 * それより古いデータを見たい場合に、ここから明示的に読み込む。
 * 一度読み込めば、そのセッション中は再度読み込む必要はない。
 */
const LoadOlderDataBanner = ({ type, data, setData, tenantId }) => {
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  if (loaded) return null;

  const label = type === "dailyRecords" ? "実績" : "変更履歴";

  const handleLoad = async () => {
    setLoading(true);
    setError(false);
    try {
      const cutoff = defaultLoadCutoff();
      const older = type === "dailyRecords"
        ? await fetchOlderDailyRecords(tenantId, cutoff)
        : await fetchOlderChangeHistory(tenantId, cutoff);
      setData((d) => {
        const current = Array.isArray(d?.[type]) ? d[type] : [];
        const existingIds = new Set(current.map((r) => r?.id));
        const merged = [...current, ...older.filter((r) => r?.id && !existingIds.has(r.id))];
        return { ...d, [type]: merged };
      });
      setLoaded(true);
    } catch (e) {
      setError(true);
    }
    setLoading(false);
  };

  return (
    <div style={{
      background: "#f0fbfa", border: "1px solid #b2dfdb", borderRadius: "6px",
      padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center",
      gap: "8px", flexWrap: "wrap", fontSize: "12px", color: "#00695c",
    }}>
      <span>
        {error
          ? "読み込みに失敗しました。通信環境をご確認のうえ、もう一度お試しください。"
          : `直近15ヶ月分の${label}のみ表示しています。それより古いデータも確認したい場合はこちら。`}
      </span>
      <RetroBtn small onClick={handleLoad} disabled={loading} style={{ background: "#00a09a", borderColor: "#00a09a", color: "#fff" }}>
        {loading ? "読み込み中..." : "過去のデータも読み込む"}
      </RetroBtn>
    </div>
  );
};

const StatusPill = ({ s, context }) => {
  const map = {
    pending:["未配車","#fff3e0","#e65100","#ff9800"], scheduled:["配車済","#e3f2fd","#1565c0","#2196f3"],
    in_transit:["配送中","#00a09a","#fff","#00a09a"], delivered:["完了","#4caf50","#fff","#4caf50"],
    unpaid:["未払い","#e8e8e8","#555","#d0d0d0"], pending_confirmation:["確認待ち","#fff3e0","#e65100","#ff9800"],
    overdue:["延滞","#ffebee","#c62828","#e63946"], paid:["入金済","#e8f5e9","#2e7d32","#4caf50"],
    available:["待機中","#e8f5e9","#2e7d32","#4caf50"], on_duty:["稼働中","#e8f5f4","#007a74","#00a09a"], off:["休暇","#f1f3f5","#666","#d0d0d0"],
    retired:["退職済み","#ffebee","#c62828","#e63946"],
    in_use:["使用中","#e3f2fd","#1565c0","#2196f3"], maintenance:["整備中","#f3e5f5","#6a1b9a","#7b1fa2"],
    matched:["照合済","#e8f5e9","#2e7d32","#4caf50"], unmatched:["未照合","#ffebee","#c62828","#e63946"],
  };
  // 同じステータス値 "paid" でも、請求書（お金を受け取る側）なら「入金済」、
  // 支払予定（お金を払う側）なら「支払済」と意味が逆になる。
  // context="payable" のときだけラベルを上書きし、紛らわしい表示を防ぐ。
  if (context === "payable" && s === "paid") {
    return <span style={{ background:"#e8f5e9", color:"#2e7d32", fontSize:"11px", fontWeight:700, padding:"2px 8px", fontFamily:"'Noto Sans JP', sans-serif", border:"1px solid #4caf50", borderRadius:"999px", display:"inline-flex", alignItems:"center" }}>支払済</span>;
  }
  const [label,bg,fg,border] = map[s]||[s,"#e8e8e8","#555","#d0d0d0"];
  return <span style={{ background:bg, color:fg, fontSize:"11px", fontWeight:700, padding:"2px 8px", fontFamily:"'Noto Sans JP', sans-serif", border:`1px solid ${border}`, borderRadius:"999px", display:"inline-flex", alignItems:"center" }}>{label}</span>;
};
const RetroTable = ({ headers, rows, maxHeight = "280px" }) => (
  <div style={{ border:cardBorder, borderRadius:"6px", background:"#fff", overflow:"auto", maxHeight }}>
    {/* table自体に width:"100%" を指定すると、画面が狭い場合に列内のテキスト（長い会社名など）が
        無理に折り返されて縦長に崩れてしまう。minWidth で内容に応じた幅を確保し、
        画面より広い場合は親要素の overflow:auto で横スクロールできるようにする。 */}
    <table style={{ minWidth:"100%", width:"max-content", borderCollapse:"collapse", fontFamily:"'Noto Sans JP', sans-serif", fontSize:"12px" }}>
      <thead>
        <tr style={{ background:"#fafbfc", position:"sticky", top:0 }}>
          {headers.map((h,i)=><th key={i} style={{ color:"#666", fontSize:"11px", padding:"8px 10px", textAlign:"left", fontWeight:700, whiteSpace:"nowrap", borderBottom:cardBorder }}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row,ri)=>(
          <tr key={ri} style={{ background:"#fff", borderBottom:"1px solid #f0f0f0" }}
            onMouseEnter={e=>e.currentTarget.style.background="#f9fcfc"}
            onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
            {row.map((cell,ci)=><td key={ci} style={{ padding:"8px 10px", whiteSpace:"nowrap", color:UI.text }}>{cell}</td>)}
          </tr>
        ))}
        {rows.length===0&&<tr><td colSpan={headers.length} style={{ padding:"16px", textAlign:"center", color:"#999" }}>データなし</td></tr>}
      </tbody>
    </table>
  </div>
);
const TitleBar = ({ title, icon }) => (
  <div style={{ background:"#fff", borderBottom:cardBorder, height:"48px", padding:"0 12px", display:"flex", alignItems:"center", gap:"8px" }}>
    <span style={{ color:UI.accent }}>{icon}</span>
    <span style={{ color:UI.textDark, fontFamily:"'Noto Sans JP', sans-serif", fontSize:"13px", fontWeight:700, flex:1 }}>{title}</span>
  </div>
);
const Panel = ({ title, icon, children, style:ext }) => (
  <section style={{ background:UI.sidebarBg, border:`1px solid ${UI.sidebarBorder}`, borderRadius:"6px", overflow:"hidden", ...ext }}>
    {title && (
      <div style={{ background:UI.sidebarHeader, borderBottom:`1px solid ${UI.sidebarBorder}`, padding:"10px 12px", display:"flex", alignItems:"center", gap:"8px" }}>
        <div style={{ width:"3px", height:"16px", background:UI.accent, borderRadius:"2px" }} />
        {icon && <span style={{ color:"#555", display:"inline-flex" }}>{icon}</span>}
        <span style={{ fontFamily:"'Noto Sans JP', sans-serif", fontSize:"13px", fontWeight:700, color:UI.textDark }}>{title}</span>
      </div>
    )}
    <div className="panel-body" style={{ background:"#fff", padding:"10px" }}>{children}</div>
  </section>
);

// ===== MODAL =====
/**
 * 1つのページコンポーネント内で予期しない例外が発生した場合に、
 * アプリ全体が真っ白になって完全に操作不能になるのを防ぐためのError Boundary。
 * Reactの仕様上、Error Boundaryはクラスコンポーネントでしか実装できない。
 * 配送業務中にこれが起きると、現場で何もできなくなる重大な実害があるため、
 * 各ページの描画を必ずこれでラップし、クラッシュ時も他のページへの
 * 切り替えやリロードができる状態を保つ。
 */
class PageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("PageErrorBoundary caught an error:", error, info);
  }
  componentDidUpdate(prevProps) {
    // ページ（resetKeyで渡される値）が変わったらエラー状態をリセットし、
    // 別のページに切り替えれば復帱できるようにする。
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ border:"1px solid #e63946", borderRadius:"6px", background:"#fff5f5", padding:"24px", textAlign:"center" }}>
          <div style={{ fontSize:"14px", fontWeight:700, color:"#c62828", marginBottom:"8px" }}>
            このページの表示中にエラーが発生しました。
          </div>
          <div style={{ fontSize:"12px", color:"#888", marginBottom:"12px" }}>
            別のメニューに切り替えるか、画面を再読み込みしてください。データは保存されている可能性があります。
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{ border:"1px solid #c62828", background:"#fff", color:"#c62828", borderRadius:"4px", padding:"6px 14px", fontSize:"12px", fontWeight:700, cursor:"pointer" }}
          >
            画面を再読み込み
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const Modal = ({ title, icon, onClose, children, width=480 }) => {
  const dialogRef = useRef(null);
  // onClose は呼び出し側で毎回 `()=>setShowModal(false)` のような
  // インライン関数として渡されるため、親コンポーネントが再レンダリングされる
  // （例えばフォームに1文字入力するだけでも）たびに、新しい関数インスタンスに
  // なってしまう。もし下のuseEffectの依存配列に onClose を直接含めていると、
  // 「値が変わった」と誤検知されて毎回クリーンアップ→再実行が走り、
  // フォーカスが強制的に最初の要素へリセットされてしまう
  // （＝数値入力欄で1文字目しか入力できないという致命的な不具合の原因だった）。
  // onClose 自体は ref に保持し、常に最新の関数を呼べるようにしつつ、
  // useEffect の実行自体は「モーダルが開いたとき（マウント時）」の
  // 1回だけに限定する。
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    // モーダル表示中、背景のページ全体のスクロールを止める。
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // モーダルを開いた瞬間にフォーカスをモーダル内に移し、
    // Tabキーでの移動がモーダルの外（背景の検索ボックスなど）に
    // 漏れないようにフォーカストラップを行う。
    // これがないと、キーボード操作やスクリーンリーダー利用時に
    // 背景の要素が操作・読み取り可能なままになってしまう。
    const dialogEl = dialogRef.current;
    const previouslyFocused = document.activeElement;
    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    const focusFirst = () => {
      const focusable = dialogEl?.querySelectorAll(focusableSelector);
      if (focusable && focusable.length > 0) {
        focusable[0].focus();
      } else {
        dialogEl?.focus();
      }
    };
    focusFirst();

    const handleKeyDown = (e) => {
      if (e.key === "Escape" && typeof onCloseRef.current === "function") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !dialogEl) return;
      const focusable = Array.from(dialogEl.querySelectorAll(focusableSelector)).filter(
        (el) => !el.disabled && el.offsetParent !== null
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      // モーダルを閉じたら、開く前にフォーカスしていた要素に戻す。
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:"12px" }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined} tabIndex={-1} style={{ background:"#fff", width:`min(${typeof width === "number" ? `${width}px` : width}, 95vw)`, maxWidth:"95vw", maxHeight:"90vh", overflow:"auto", borderRadius:"6px", boxShadow:softShadow, border:cardBorder }}>
        <div style={{ background:"#fff", padding:"10px 12px", display:"flex", alignItems:"center", gap:"8px", borderBottom:cardBorder }}>
          <span style={{ color:UI.accent, display:"inline-flex" }}>{icon}</span>
          <span style={{ color:UI.textDark, fontFamily:"'Noto Sans JP', sans-serif", fontSize:"14px", fontWeight:700, flex:1 }}>{title}</span>
          <button onClick={onClose} style={{ border:"none", background:"transparent", color:"#666", cursor:"pointer", padding:"2px 6px", fontSize:"18px", lineHeight:1 }}>
            ×
          </button>
        </div>
        <div style={{ padding:"14px" }}>{children}</div>
      </div>
    </div>
  );
};

// ===== CALENDAR =====
const EVENT_TYPE_COLOR = {
  delivery:"#0000cc", payment_due:"#cc0000", payment_receive:"#006600",
  task:"#cc6600", sales:"#009999", bank_in:"#006600", bank_out:"#cc0000"
};
const EVENT_TYPE_LABEL = {
  delivery:"配送", payment_due:"支払期日", payment_receive:"入金予定",
  task:"タスク", sales:"営業", bank_in:"入金", bank_out:"支出"
};

/** 配送種別のラベル。route/charter に加えて、単発の依頼（スポット）を追加。 */
const DELIVERY_TYPE_LABEL = { route:"ルート配送", charter:"チャーター便", spot:"スポット" };

const CalendarPage = ({ data, setData, isMobile=false, tenantId, userRole, authEmail }) => {
  const [calYear, setCalYear] = useState(() => getNow().getFullYear());
  const [calMonth, setCalMonth] = useState(() => getNow().getMonth());
  const [calMode, setCalMode] = useState("delivery");
  // 【重要】切り替えボタンを隠すだけでなく、万が一何らかの経路で
  // calMode が "business" のままになっていた場合の保険として、
  // 配車担当のときは強制的に配送カレンダーへ戻す。
  useEffect(() => {
    if (userRole === "dispatcher" && calMode === "business") setCalMode("delivery");
  }, [userRole, calMode]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [addDate, setAddDate] = useState("");
  const [newEvent, setNewEvent] = useState({ title:"", type:"task", note:"" });
  const [newOrder, setNewOrder] = useState({ customerId:"", deliveryType:"route", deliveryDate:"", from:"", to:"", cargo:"", weight:"", amount:"", driverPayAmount:"", notes:"" });
  const [editingItem, setEditingItem] = useState(null);
  const [editEvent, setEditEvent] = useState({ id:"", date:"", type:"task", title:"", note:"" });
  const [editOrder, setEditOrder] = useState({ id:"", customerId:"", deliveryType:"route", deliveryDate:"", from:"", to:"", cargo:"", weight:"", amount:"", driverPayAmount:"", notes:"", status:"pending" });
  const [addFormError, setAddFormError] = useState("");

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  const todayStr = getTodayLocalStr();
  const allDrivers = (Array.isArray(data?.drivers) ? data.drivers : []).filter((d) => !d?.deleted);
  // ドライバーロールでログインしている場合、自分のメールアドレスに紐づく
  // ドライバーマスタのレコードを特定し、そのドライバーが担当する受注だけに絞り込む。
  // これがないと、ドライバーアカウントから全顧客の配送先・荷物内容や
  // 他のドライバーの担当業務、会社の支払期日まで見えてしまう。
  const isDriverView = userRole === "driver";
  const normalizedAuthEmail = (authEmail || "").trim().toLowerCase();
  // メールアドレスが未入力のドライバーが複数いる場合、空文字同士が「一致」と
  // 誤判定されて無関係な人の情報が表示されてしまう恐れがあるため、
  // authEmail自体が空のときは絶対にマッチさせない。
  const myDriverRecord = isDriverView && normalizedAuthEmail
    ? allDrivers.find((d) => (d?.email || "").trim().toLowerCase() === normalizedAuthEmail)
    : null;

  const allOrders = (Array.isArray(data?.orders) ? data.orders : []).filter((o) => !o?.deleted);
  const orders = isDriverView
    ? (myDriverRecord ? allOrders.filter((o) => o?.driverId === myDriverRecord.id) : [])
    : allOrders;
  const allEvents = Array.isArray(data?.events) ? data.events : [];
  const events = isDriverView
    ? allEvents.filter((ev) => orders.some((o) => o?.id === ev?.orderId))
    : allEvents;
  // 【重要】配車担当も、入金・支払に関するデータそのものを持たせない。
  // 「業務カレンダー」への切り替えボタンは既に隠しているが、
  // 変数自体を空にしておくことで、万が一表示経路が増えても
  // 中身が漏れないようにする（二重の防御）。
  const isFinanceRestrictedView = isDriverView || userRole === "dispatcher";
  const invoices = isFinanceRestrictedView ? [] : (Array.isArray(data?.invoices) ? data.invoices : []);
  const payables = isFinanceRestrictedView ? [] : (Array.isArray(data?.payables) ? data.payables : []);
  const drivers = isDriverView ? (myDriverRecord ? [myDriverRecord] : []) : allDrivers;
  const vehicles = isDriverView ? [] : (Array.isArray(data?.vehicles) ? data.vehicles : []).filter((v) => !v?.deleted);
  const customers = (Array.isArray(data?.customers) ? data.customers : []).filter((c) => !c?.deleted);

  const BUSINESS_OPTIONS = ["task", "sales", "payment_due", "payment_receive"];
  const BUSINESS_LEGEND = [
    { label:"支払期日", color:EVENT_TYPE_COLOR.payment_due },
    { label:"入金予定", color:EVENT_TYPE_COLOR.payment_receive },
    { label:"営業", color:EVENT_TYPE_COLOR.sales },
    { label:"タスク", color:EVENT_TYPE_COLOR.task },
    { label:"免許更新", color:"#9933cc" },
    { label:"車検", color:"#cc0099" },
    { label:"点検期限", color:"#e65100" },
    { label:"保険更新", color:"#9b27af" },
  ];

  const normalizeDateString = (value) => {
    if (!value) return "";
    return String(value).slice(0, 10);
  };
  const getDayStr = (d) => `${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  const buildDeliveryItems = (targetDate) =>
    orders
      .filter((order) => normalizeDateString(order?.deliveryDate) === targetDate)
      .map((order) => {
        const driver = drivers.find((d) => d?.id === order?.driverId);
        const isCharter = order?.deliveryType === "charter";
        return {
        id: `order-${order?.id || Math.random()}`,
        source: "order",
        sourceId: order?.id,
        date: targetDate,
        type: "delivery",
        title: `${isCharter ? "チャーター" : "ルート"}：${order?.customerName || "未設定"}`,
        subtitle: driver?.name || "未配車",
        deliveryType: order?.deliveryType || "route",
        color: isCharter ? "#008800" : "#0000cc",
        raw: order,
      };
    });

  const buildBusinessItems = (targetDate) => {
    const businessEvents = events
      .filter((event) => normalizeDateString(event?.date) === targetDate && event?.type !== "delivery")
      .map((event) => ({
        id: `event-${event?.id || Math.random()}`,
        source: "event",
        sourceId: event?.id,
        date: targetDate,
        type: event?.type || "task",
        title: event?.title || "",
        color: event?.color || EVENT_TYPE_COLOR[event?.type] || "#999",
        raw: event,
      }));
    const invoiceMap = {};
    invoices
      .filter((inv) => {
        const p = inv?.payload != null && typeof inv.payload === "object" ? inv.payload : inv;
        if (!p) return false;
        if (p.deleted || inv?.deleted) return false;
        return true;
      })
      .forEach((inv) => {
        const p = inv?.payload != null && typeof inv.payload === "object" ? inv.payload : inv;
        const dueNorm = normalizeDateString(p?.dueDate);
        const key = `${p?.customerId}_${dueNorm}`;
        if (!invoiceMap[key]) {
          invoiceMap[key] = {
            id: `inv-group-${key}`,
            date: dueNorm,
            type: "payment_receive",
            title: `入金期日：${p?.customerName || p?.customerId || ""}`,
            amount: 0,
            count: 0,
            firstInvId: p?.id || inv?.id,
            firstInv: inv,
          };
        }
        invoiceMap[key].amount += Number(p?.total || p?.amount || 0);
        invoiceMap[key].count += 1;
      });
    const invoiceItems = Object.values(invoiceMap)
      .filter((item) => normalizeDateString(item.date) === targetDate)
      .map((item) => {
        const namePart = item.title.replace(/^入金期日：/, "");
        const titleSuffix = item.count > 1 ? `（${item.count}件 合計¥${item.amount.toLocaleString()}）` : "";
        return {
          id: item.id,
          source: "invoice",
          sourceId: item.firstInvId,
          date: targetDate,
          type: "payment_receive",
          title: `入金期日：${namePart}${titleSuffix}`,
          color: EVENT_TYPE_COLOR.payment_receive,
          raw: item.firstInv,
        };
      });
    const payableItems = payables
      .filter((payable) => normalizeDateString(payable?.dueDate) === targetDate)
      .map((payable) => ({
        id: `payable-${payable?.id || Math.random()}`,
        source: "payable",
        sourceId: payable?.id,
        date: targetDate,
        type: "payment_due",
        title: `支払期日：${payable?.vendor || ""}`,
        color: EVENT_TYPE_COLOR.payment_due,
        raw: payable,
      }));
    const licenseItems = drivers
      .filter((driver) => normalizeDateString(driver?.license_expiry) === targetDate)
      .map((driver) => ({
        id: `driver-${driver?.id || Math.random()}`,
        source: "driver",
        sourceId: driver?.id,
        date: targetDate,
        type: "task",
        title: `免許更新：${driver?.name || ""}`,
        color: "#9933cc",
        raw: driver,
      }));
    const inspectionItems = vehicles
      .filter((vehicle) => normalizeDateString(vehicle?.nextInspection) === targetDate)
      .map((vehicle) => ({
        id: `vehicle-${vehicle?.id || Math.random()}`,
        source: "vehicle",
        sourceId: vehicle?.id,
        date: targetDate,
        type: "task",
        title: `【車検期限】${vehicle?.plate || ""}`,
        color: "#cc0099",
        raw: vehicle,
      }));
    const vehicleInsuranceItems = vehicles
      .filter((vehicle) => normalizeDateString(vehicle?.insuranceExpiry) === targetDate)
      .map((vehicle) => ({
        id: `vinsurance-${vehicle?.id || Math.random()}`,
        source: "vehicle", sourceId: vehicle?.id, date: targetDate, type: "task",
        title: `【任意保険更新】${vehicle?.plate || ""}`, color: "#9b27af", raw: vehicle,
      }));
    const vehicleLiabilityItems = vehicles
      .filter((vehicle) => normalizeDateString(vehicle?.liabilityExpiry) === targetDate)
      .map((vehicle) => ({
        id: `vliability-${vehicle?.id || Math.random()}`,
        source: "vehicle", sourceId: vehicle?.id, date: targetDate, type: "task",
        title: `【自賠責更新】${vehicle?.plate || ""}`, color: "#7b1fa2", raw: vehicle,
      }));
    const vehicleNextInspectionItems = vehicles
      .filter((vehicle) => {
        const history = vehicle?.inspectionHistory || [];
        const latest = [...history].sort((a,b)=>(b.date||"").localeCompare(a.date||""))[0];
        return latest && normalizeDateString(latest?.nextDate) === targetDate;
      })
      .map((vehicle) => ({
        id: `vnextinspection-${vehicle?.id || Math.random()}`,
        source: "vehicle", sourceId: vehicle?.id, date: targetDate, type: "task",
        title: `【点検期限】${vehicle?.plate || ""}`, color: "#e65100", raw: vehicle,
      }));
    return [...businessEvents, ...invoiceItems, ...payableItems, ...licenseItems, ...inspectionItems, ...vehicleInsuranceItems, ...vehicleLiabilityItems, ...vehicleNextInspectionItems];
  };

  const getItemsForDate = (ds, mode = calMode) => {
    const targetDate = normalizeDateString(ds);
    if (!targetDate) return [];
    return mode === "delivery" ? buildDeliveryItems(targetDate) : buildBusinessItems(targetDate);
  };

  const selectedItems = selectedDate ? getItemsForDate(selectedDate) : [];

  const generateNextOrderId = (orderList) => {
    const maxNum = orderList.reduce((max, order) => {
      const match = String(order?.id || "").match(/^ORD-(\d+)$/);
      return match ? Math.max(max, parseInt(match[1], 10)) : max;
    }, 0);
    return `ORD-${String(maxNum + 1).padStart(3, "0")}`;
  };

  const openAddModal = (dateStr) => {
    const targetDate = normalizeDateString(dateStr || todayStr);
    setAddDate(targetDate);
    setAddFormError("");
    if (calMode === "delivery") {
      setNewOrder({ customerId:"", deliveryType:"route", deliveryDate:targetDate, from:"", to:"", cargo:"", weight:"", amount:"", notes:"" });
    } else {
      setNewEvent({ title:"", type:"task", note:"" });
    }
    setShowAddModal(true);
  };

  const saveNewItem = () => {
    if (calMode === "delivery") {
      if (customers.length === 0) {
        setAddFormError("顧客が登録されていません。顧客管理から先に登録してください。");
        return;
      }
      if (!newOrder.customerId) {
        setAddFormError("顧客を選択してください。");
        return;
      }
      if (!newOrder.deliveryDate) {
        setAddFormError("配達日を入力してください。");
        return;
      }
      const customer = customers.find((c) => c?.id === newOrder.customerId);
      if (!customer) {
        setAddFormError("選択した顧客が見つかりません。");
        return;
      }
      const deliveryDate = normalizeDateString(newOrder.deliveryDate);
      const nextOrderId = generateNextOrderId(orders);
      const nextOrder = {
        id: nextOrderId,
        customerId: newOrder.customerId,
        customerName: customer.name || "",
        deliveryType: newOrder.deliveryType || "route",
        date: getTodayLocalStr(),
        deliveryDate,
        from: newOrder.from,
        to: newOrder.to,
        cargo: newOrder.cargo,
        weight: newOrder.weight,
        status: "pending",
        driverId: null,
        vehicleId: null,
        amount: parseInt(newOrder.amount, 10) || 0,
        // ドライバー（特に業務委託）へ支払う報酬額。ここが未設定のままだと、
        // 配送完了時に自動生成される実績データの報酬額がゼロのまま残り、
        // 「仕事は完了したのにいくら払うか分からない」という事故につながる。
        driverPayAmount: newOrder.driverPayAmount !== "" && newOrder.driverPayAmount != null ? (parseInt(newOrder.driverPayAmount, 10) || 0) : null,
        notes: newOrder.notes,
      };
      const deliveryEvent = {
        id: `EV-O${Date.now()}`,
        date: deliveryDate,
        type: "delivery",
        title: `${nextOrderId} 配達予定 ${customer.name || ""}`,
        color: "#0000cc",
        orderId: nextOrderId,
      };
      setData((d) => ({
        ...d,
        orders: [nextOrder, ...(Array.isArray(d?.orders) ? d.orders : [])],
        events: [...(Array.isArray(d?.events) ? d.events : []), deliveryEvent],
      }));
    } else {
      if (!addDate) {
        setAddFormError("日付を入力してください。");
        return;
      }
      if (!newEvent.title?.trim()) {
        setAddFormError("タイトルを入力してください。");
        return;
      }
      const safeEvents = Array.isArray(data?.events) ? data.events : [];
      const nextEvent = {
        // 以前は `EV-${safeEvents.length+1}` という配列長ベースのID生成だったため、
        // 削除済みデータの扱いが将来変わった場合などにIDが重複するリスクがあった。
        id: generateUniqueBusinessId(safeEvents, "EV"),
        date:normalizeDateString(addDate),
        type:newEvent.type,
        title:newEvent.title.trim(),
        color:EVENT_TYPE_COLOR[newEvent.type]||"#999",
        note:newEvent.note,
      };
      setData((d) => ({ ...d, events:[...(Array.isArray(d?.events) ? d.events : []), nextEvent] }));
    }
    setAddFormError("");
    setShowAddModal(false);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    if (item?.source === "order") {
      const order = item.raw || {};
      setEditOrder({
        id: order?.id || "",
        customerId: order?.customerId || "",
        deliveryType: order?.deliveryType || "route",
        deliveryDate: normalizeDateString(order?.deliveryDate),
        from: order?.from || "",
        to: order?.to || "",
        cargo: order?.cargo || "",
        weight: order?.weight || "",
        amount: String(order?.amount ?? ""),
        driverPayAmount: order?.driverPayAmount != null ? String(order.driverPayAmount) : "",
        notes: order?.notes || "",
        status: order?.status || "pending",
      });
    } else if (item?.source === "event") {
      const event = item.raw || {};
      setEditEvent({
        id: event?.id || "",
        date: normalizeDateString(event?.date),
        type: event?.type || "task",
        title: event?.title || "",
        note: event?.note || "",
      });
    }
    setShowEditModal(true);
  };

  const saveEditedItem = () => {
    if (editingItem?.source === "order") {
      const customer = customers.find((c) => c?.id === editOrder.customerId);
      const before = orders.find((o) => o?.id === editOrder.id);
      logHistoryEntry(setData, { entityType: "order", entityId: editOrder.id, entityLabel: editOrder.id, before, userRole });
      setData((d) => ({
        ...d,
        orders: (Array.isArray(d?.orders) ? d.orders : []).map((order) =>
          order?.id === editOrder.id
            ? {
                ...order,
                customerId: editOrder.customerId,
                customerName: customer?.name || "",
                deliveryType: editOrder.deliveryType || "route",
                deliveryDate: normalizeDateString(editOrder.deliveryDate),
                from: editOrder.from,
                to: editOrder.to,
                cargo: editOrder.cargo,
                weight: editOrder.weight,
                amount: parseInt(editOrder.amount, 10) || 0,
                driverPayAmount: editOrder.driverPayAmount !== "" && editOrder.driverPayAmount != null ? (parseInt(editOrder.driverPayAmount, 10) || 0) : null,
                notes: editOrder.notes,
                status: editOrder.status,
              }
            : order
        ),
        events: (Array.isArray(d?.events) ? d.events : []).map((ev) =>
          ev?.orderId === editOrder.id
            ? {
                ...ev,
                date: normalizeDateString(editOrder.deliveryDate),
                title: `配達予定：${customer?.name || ""}`,
                color: EVENT_TYPE_COLOR.delivery,
              }
            : ev
        ),
      }));
    } else if (editingItem?.source === "event") {
      const before = events.find((ev) => ev?.id === editEvent.id);
      logHistoryEntry(setData, { entityType: "event", entityId: editEvent.id, entityLabel: before?.title, before, userRole });
      setData((d) => ({
        ...d,
        events: (Array.isArray(d?.events) ? d.events : []).map((ev) =>
          ev?.id === editEvent.id
            ? {
                ...ev,
                date: normalizeDateString(editEvent.date),
                type: editEvent.type,
                title: editEvent.title,
                note: editEvent.note,
                color: EVENT_TYPE_COLOR[editEvent.type] || "#999",
              }
            : ev
        ),
      }));
    }
    setShowEditModal(false);
    setEditingItem(null);
  };

  const deleteEditingItem = () => {
    if (editingItem?.source === "order") {
      setData((d) => ({
        ...d,
        orders: (Array.isArray(d?.orders) ? d.orders : []).filter((order) => order?.id !== editOrder.id),
        events: (Array.isArray(d?.events) ? d.events : []).filter((ev) => ev?.orderId !== editOrder.id),
      }));
    } else if (editingItem?.source === "event") {
      setData((d) => ({
        ...d,
        events: (Array.isArray(d?.events) ? d.events : []).filter((ev) => ev?.id !== editEvent.id),
      }));
    }
    setShowEditModal(false);
    setEditingItem(null);
  };

  const prevMonth = () => { if(calMonth===0){setCalYear(y=>y-1);setCalMonth(11);}else setCalMonth(m=>m-1); };
  const nextMonth = () => { if(calMonth===11){setCalYear(y=>y+1);setCalMonth(0);}else setCalMonth(m=>m+1); };
  const calendarIcon = <Icon size={14}><rect x="3" y="4" width="18" height="18"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/></Icon>;
  const listIcon = <Icon size={14}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></Icon>;
  const editIcon = <Icon size={12}><path d="M12 20h9"/><path d="m16.5 3.5 4 4L7 21l-4 1 1-4Z"/></Icon>;
  const leftIcon = <Icon size={12}><polyline points="15,18 9,12 15,6"/></Icon>;
  const rightIcon = <Icon size={12}><polyline points="9,18 15,12 9,6"/></Icon>;
  const plusIcon = <Icon size={14}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></Icon>;
  const modalEditIcon = <Icon size={14}><path d="M12 20h9"/><path d="m16.5 3.5 4 4L7 21l-4 1 1-4Z"/></Icon>;

  return (
    <div style={{ display:"flex", flexDirection:isMobile?"column":"row", gap:"12px" }}>
      <div style={{ flex:"0 0 auto", width:isMobile?"100%":"440px" }}>
        <Panel title={`${calYear}年${calMonth+1}月`} icon={calendarIcon} style={{ marginBottom:"8px" }}>
          <div style={{ display:"flex", gap:"8px", marginBottom:"10px" }}>
            <button onClick={()=>setCalMode("delivery")} style={{ border:"1px solid #d0d0d0", borderRadius:"3px", padding:"7px 12px", background:calMode==="delivery"?"#00a09a":"#fff", color:calMode==="delivery"?"#fff":"#555", fontSize:"13px", fontWeight:600, cursor:"pointer" }}>配送カレンダー</button>
            {/* 【重要】業務カレンダーには、請求書の入金期日・合計金額や
                仕入先への支払期日など、経理・入金に関する実際の金額が
                表示される。配車担当には他人の報酬額・請求・入金を
                見せない既存の方針に合わせ、切り替えボタンごと隠す。 */}
            {userRole !== "dispatcher" && (
              <button onClick={()=>setCalMode("business")} style={{ border:"1px solid #d0d0d0", borderRadius:"3px", padding:"7px 12px", background:calMode==="business"?"#00a09a":"#fff", color:calMode==="business"?"#fff":"#555", fontSize:"13px", fontWeight:600, cursor:"pointer" }}>業務カレンダー</button>
            )}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"10px" }}>
            <RetroBtn small onClick={prevMonth} style={{ background:"#fff", borderColor:"#d0d0d0", color:"#666" }}>{leftIcon}</RetroBtn>
            <span style={{ fontSize:"16px", fontWeight:600, flex:1, textAlign:"center", color:"#222" }}>{calYear}年 {calMonth+1}月</span>
            <RetroBtn small onClick={nextMonth} style={{ background:"#fff", borderColor:"#d0d0d0", color:"#666" }}>{rightIcon}</RetroBtn>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:"1px", marginBottom:"2px", border:"1px solid #e8e8e8", borderRadius:"4px", overflow:"hidden" }}>
            {["日","月","火","水","木","金","土"].map((w,i)=>(
              <div key={w} style={{ textAlign:"center", fontSize:"12px", fontWeight:600, color:i===0?"#e63946":i===6?"#2196f3":"#666", padding:"6px 0", background:"#fafbfc" }}>{w}</div>
            ))}
            {Array.from({length:firstDay}).map((_,i)=><div key={`e${i}`} style={{ background:"#f6f6f6", minHeight:isMobile?"54px":"68px", borderTop:"1px solid #e8e8e8" }}/>)}
            {Array.from({length:daysInMonth}).map((_,i)=>{
              const d = i+1;
              const ds = getDayStr(d);
              const dayItems = getItemsForDate(ds);
              const isToday = ds===todayStr;
              const isSelected = ds===normalizeDateString(selectedDate);
              const dow = (firstDay+i)%7;
              return (
                <div key={d} onClick={()=>setSelectedDate(ds===selectedDate?null:ds)}
                  style={{ background:isSelected?"#cce0ff":isToday?"#e8f5f4":"#fff", borderTop:"1px solid #e8e8e8", borderLeft:"1px solid #e8e8e8",
                    minHeight:isMobile?"54px":"68px", cursor:"pointer", padding:"4px", overflow:"hidden", borderColor:isSelected?"#00a09a":"#e8e8e8" }}>
                  <div style={{ fontSize:"11px", fontWeight:isToday?700:500, color:dow===0?"#e63946":dow===6?"#2196f3":"#333", display:"flex", alignItems:"center", gap:"4px" }}>
                    {isToday&&<span style={{ background:"#00a09a", color:"#fff", fontSize:"9px", padding:"0 4px", borderRadius:"2px" }}>今日</span>}
                    {d}
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:"2px", marginTop:"2px" }}>
                    {(isMobile ? [{ id:`count-${ds}`, title:`${dayItems.length}件`, color:"#999", source:"count" }] : dayItems.slice(0,2)).map(item=>(
                      <div key={item.id} style={{ background:item.color, color:"#fff", fontSize:"9px", padding:"1px 4px", overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis", borderRadius:"2px" }}>
                        <div>{item.title}</div>
                        {item.source === "order" && !isMobile && <div style={{ fontSize:"8px", opacity:0.9 }}>{item.subtitle || "未配車"}</div>}
                      </div>
                    ))}
                    {!isMobile && dayItems.length>2&&<div style={{ fontSize:"9px", color:"#999" }}>+{dayItems.length-2}件</div>}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display:"flex", gap:"8px", marginTop:"8px", flexWrap:"wrap", border:"1px solid #e8e8e8", borderRadius:"4px", padding:"6px" }}>
            {(calMode === "delivery" ? [{ label:"ルート配送", color:"#0000cc" },{ label:"チャーター便", color:"#008800" }] : BUSINESS_LEGEND).map((item)=>(
              <div key={item.label} style={{ display:"flex", alignItems:"center", gap:"4px" }}>
                <div style={{ width:"8px", height:"8px", background:item.color, borderRadius:"50%" }}/>
                <span style={{ fontSize:"10px", color:"#666" }}>{item.label}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div style={{ flex:1 }}>
        {selectedDate ? (
          <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ fontSize:"15px", fontWeight:700, color:"#222", display:"flex", alignItems:"center", gap:"6px" }}>{calendarIcon}{selectedDate} の{calMode === "delivery" ? "配送予定" : "業務予定"}</div>
              {!isDriverView && <RetroBtn onClick={()=>openAddModal(selectedDate)} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>{plusIcon}この日に予定を追加</RetroBtn>}
            </div>

            {selectedItems.length>0&&(
              <Panel title={calMode === "delivery" ? "配送予定一覧" : "業務予定一覧"} icon={listIcon}>
                {selectedItems.map(item=>(
                  <div key={item.id} style={{ display:"flex", alignItems:"center", gap:"8px", padding:"8px 10px", border:"1px solid #e8e8e8", borderLeft:`4px solid ${item.color}`, borderRadius:"4px", background:"#fff", cursor: isDriverView ? "default" : "pointer", marginBottom:"6px" }} onClick={() => { if (!isDriverView) openEditModal(item); }}>
                    <div style={{ flex:1, fontSize:"12px" }}>
                      <span style={{ background:item.color, color:"#fff", padding:"2px 6px", fontSize:"10px", marginRight:"6px", borderRadius:"2px" }}>
                        {item.source === "order" ? (DELIVERY_TYPE_LABEL[item.deliveryType] || "ルート配送") : item.source === "driver" ? "免許更新" : item.source === "vehicle" ? "車検" : EVENT_TYPE_LABEL[item.type] || item.type}
                      </span>
                      {item.title}
                      {item.source === "order" && !isDriverView && <div style={{ marginTop:"2px", fontSize:"10px", color:"#666" }}>ドライバー：{item.subtitle || "未配車"}</div>}
                    </div>
                    {!isDriverView && (item.source === "order" || item.source === "event") && <span style={{ fontSize:"10px", color:"#00a09a", display:"inline-flex", alignItems:"center", gap:"3px" }}>{editIcon}編集</span>}
                  </div>
                ))}
              </Panel>
            )}

            {selectedItems.length===0&&(
              <div style={{ border:cardBorder, borderRadius:"6px", background:"#fff", padding:"24px", textAlign:"center", fontSize:"12px", color:"#999" }}>
                この日の予定・記録はありません<br/>
                {!isDriverView && <RetroBtn onClick={()=>openAddModal(selectedDate)} style={{ marginTop:"10px", background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>{plusIcon}予定を追加する</RetroBtn>}
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize:"12px", color:"#999", textAlign:"center", marginTop:"20px" }}>カレンダーの日付をクリックすると詳細が表示されます</div>
        )}
      </div>

      {/* Add event modal */}
      {showAddModal&&(
        <Modal title={calMode === "delivery" ? "配送予定追加" : "業務予定追加"} icon={calendarIcon} onClose={()=>setShowAddModal(false)} width={420}>
          {calMode === "delivery" ? (
            <>
              <Fl label="顧客">
                <RetroSelect value={newOrder.customerId} onChange={(e)=>setNewOrder((v)=>({...v, customerId:e.target.value}))}>
                  <option value="">選択</option>
                  {customers.map((c)=><option key={c?.id||`c-${Math.random()}`} value={c?.id||""}>{c?.name||""}</option>)}
                </RetroSelect>
              </Fl>
              <Fl label="配送種別">
                <RetroSelect value={newOrder.deliveryType} onChange={(e)=>setNewOrder((v)=>({...v, deliveryType:e.target.value}))}>
                  <option value="route">ルート配送</option>
                  <option value="charter">チャーター便</option>
                  <option value="spot">スポット</option>
                </RetroSelect>
              </Fl>
              <Fl label="配達日"><RetroInput type="date" value={newOrder.deliveryDate} onChange={(e)=>setNewOrder((v)=>({...v, deliveryDate:e.target.value}))}/></Fl>
              <Fl label="出発地"><RetroInput value={newOrder.from} onChange={(e)=>setNewOrder((v)=>({...v, from:e.target.value}))}/></Fl>
              <Fl label="配送先"><RetroInput value={newOrder.to} onChange={(e)=>setNewOrder((v)=>({...v, to:e.target.value}))}/></Fl>
              <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"6px 10px" }}>
                <Fl label="荷物"><RetroInput value={newOrder.cargo} onChange={(e)=>setNewOrder((v)=>({...v, cargo:e.target.value}))}/></Fl>
                <Fl label="重量"><RetroInput value={newOrder.weight} onChange={(e)=>setNewOrder((v)=>({...v, weight:e.target.value}))}/></Fl>
              </div>
              <Fl label="金額"><RetroInput type="number" min="0" value={newOrder.amount} onChange={(e)=>setNewOrder((v)=>({...v, amount:e.target.value}))}/></Fl>
              {/* 配車担当（dispatcher）には、他人（ドライバー）の報酬額を見せない
                  既存の方針と合わせる。事務・管理者のみ表示・入力できる。 */}
              {userRole !== "dispatcher" && (
                <Fl label="ドライバー報酬額（業務委託の支払額）">
                  <RetroInput type="number" min="0" value={newOrder.driverPayAmount} onChange={(e)=>setNewOrder((v)=>({...v, driverPayAmount:e.target.value}))} placeholder="未設定の場合、配送完了時に報酬額0円で記録されます"/>
                </Fl>
              )}
              <Fl label="備考"><RetroTextarea value={newOrder.notes} onChange={(e)=>setNewOrder((v)=>({...v, notes:e.target.value}))}/></Fl>
            </>
          ) : (
            <>
              <Fl label="日付"><RetroInput type="date" value={addDate} onChange={e=>setAddDate(e.target.value)}/></Fl>
              <Fl label="種別">
                <RetroSelect value={newEvent.type} onChange={e=>setNewEvent(v=>({...v,type:e.target.value}))}>
                  {BUSINESS_OPTIONS.map((type)=><option key={type} value={type}>{EVENT_TYPE_LABEL[type]}</option>)}
                </RetroSelect>
              </Fl>
              <Fl label="タイトル"><RetroInput value={newEvent.title} onChange={e=>setNewEvent(v=>({...v,title:e.target.value}))} placeholder="例：営業訪問、支払対応"/></Fl>
              <Fl label="メモ"><RetroTextarea value={newEvent.note} onChange={e=>setNewEvent(v=>({...v,note:e.target.value}))}/></Fl>
            </>
          )}
          {addFormError && (
            <div style={{ marginTop:"10px", padding:"8px 10px", background:"#ffebee", border:"1px solid #e63946", borderRadius:"4px", fontSize:"12px", color:"#c62828" }}>
              {addFormError}
            </div>
          )}
          <div style={{ display:"flex", justifyContent:"flex-end", gap:"6px", marginTop:"10px" }}>
            <RetroBtn onClick={()=>setShowAddModal(false)}>キャンセル</RetroBtn>
            <RetroBtn onClick={saveNewItem} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>追加する</RetroBtn>
          </div>
        </Modal>
      )}

      {showEditModal&&editingItem&&(
        <Modal title="予定編集" icon={modalEditIcon} onClose={()=>{setShowEditModal(false);setEditingItem(null);}} width={420}>
          {editingItem.source === "order" ? (
            <>
              <Fl label="顧客">
                <RetroSelect value={editOrder.customerId} onChange={(e)=>setEditOrder((v)=>({...v, customerId:e.target.value}))}>
                  <option value="">選択</option>
                  {customers.map((c)=><option key={c?.id||`c-edit-${Math.random()}`} value={c?.id||""}>{c?.name||""}</option>)}
                </RetroSelect>
              </Fl>
              <Fl label="配送種別">
                <RetroSelect value={editOrder.deliveryType} onChange={(e)=>setEditOrder((v)=>({...v, deliveryType:e.target.value}))}>
                  <option value="route">ルート配送</option>
                  <option value="charter">チャーター便</option>
                  <option value="spot">スポット</option>
                </RetroSelect>
              </Fl>
              <Fl label="配達日"><RetroInput type="date" value={editOrder.deliveryDate} onChange={(e)=>setEditOrder((v)=>({...v, deliveryDate:e.target.value}))}/></Fl>
              <Fl label="出発地"><RetroInput value={editOrder.from} onChange={(e)=>setEditOrder((v)=>({...v, from:e.target.value}))}/></Fl>
              <Fl label="配送先"><RetroInput value={editOrder.to} onChange={(e)=>setEditOrder((v)=>({...v, to:e.target.value}))}/></Fl>
              <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"6px 10px" }}>
                <Fl label="荷物"><RetroInput value={editOrder.cargo} onChange={(e)=>setEditOrder((v)=>({...v, cargo:e.target.value}))}/></Fl>
                <Fl label="重量"><RetroInput value={editOrder.weight} onChange={(e)=>setEditOrder((v)=>({...v, weight:e.target.value}))}/></Fl>
              </div>
              <Fl label="金額"><RetroInput type="number" min="0" value={editOrder.amount} onChange={(e)=>setEditOrder((v)=>({...v, amount:e.target.value}))}/></Fl>
              {userRole !== "dispatcher" && (
                <Fl label="ドライバー報酬額（業務委託の支払額）">
                  <RetroInput type="number" min="0" value={editOrder.driverPayAmount} onChange={(e)=>setEditOrder((v)=>({...v, driverPayAmount:e.target.value}))} placeholder="未設定の場合、配送完了時に報酬額0円で記録されます"/>
                </Fl>
              )}
              <Fl label="備考"><RetroTextarea value={editOrder.notes} onChange={(e)=>setEditOrder((v)=>({...v, notes:e.target.value}))}/></Fl>
            </>
          ) : editingItem.source === "event" ? (
            <>
              <Fl label="日付"><RetroInput type="date" value={editEvent.date} onChange={(e)=>setEditEvent((v)=>({...v, date:e.target.value}))}/></Fl>
              <Fl label="種別">
                <RetroSelect value={editEvent.type} onChange={(e)=>setEditEvent((v)=>({...v, type:e.target.value}))}>
                  {BUSINESS_OPTIONS.map((type)=><option key={type} value={type}>{EVENT_TYPE_LABEL[type]}</option>)}
                </RetroSelect>
              </Fl>
              <Fl label="タイトル"><RetroInput value={editEvent.title} onChange={(e)=>setEditEvent((v)=>({...v, title:e.target.value}))}/></Fl>
              <Fl label="メモ"><RetroTextarea value={editEvent.note} onChange={(e)=>setEditEvent((v)=>({...v, note:e.target.value}))}/></Fl>
            </>
          ) : (
            <div style={{ fontSize:"12px", color:"#666" }}>
              この予定は自動表示項目のため編集できません。
            </div>
          )}
          <div style={{ display:"flex", justifyContent:"space-between", gap:"6px", marginTop:"10px" }}>
            <RetroBtn onClick={deleteEditingItem} style={{ visibility:(editingItem.source==="order"||editingItem.source==="event")?"visible":"hidden", background:"#fff", color:"#e63946", borderColor:"#e63946" }}>
              削除
            </RetroBtn>
            <div style={{ display:"flex", gap:"6px" }}>
              <RetroBtn onClick={()=>{setShowEditModal(false);setEditingItem(null);}}>キャンセル</RetroBtn>
              <RetroBtn onClick={saveEditedItem} style={{ visibility:(editingItem.source==="order"||editingItem.source==="event")?"visible":"hidden", background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>
                 保存
              </RetroBtn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ===== BANK PAGE =====
const BankPage = ({ data, setData, tenantId, userRole, isMobile }) => {
  const [bankTransactions, setBankTransactions] = useState(Array.isArray(data?.bankTransactions) ? data.bankTransactions : []);
  const invoices = Array.isArray(data?.invoices) ? data.invoices : [];
  const customers = Array.isArray(data?.customers) ? data.customers : [];
  const getEntityPayload = (row) => {
    if (!row || typeof row !== "object") return {};
    if (row.payload != null && typeof row.payload === "object") return { ...row.payload };
    const rest = { ...row };
    delete rest._dbId;
    return rest;
  };
  /** Supabase invoices 行の主キー（uuid）。payload.id は請求書番号（INV-xxx） */
  const getInvoiceDbId = (inv) => {
    if (!inv || typeof inv !== "object") return undefined;
    if (inv._dbId != null && inv._dbId !== "") return inv._dbId;
    if (inv.payload != null && typeof inv.payload === "object" && inv.id != null && inv.id !== "")
      return inv.id;
    const p = getEntityPayload(inv);
    return p?.id ?? inv?.id;
  };
  const invoiceIsPaid = (inv) => {
    const s = String(getEntityPayload(inv)?.status || "");
    return ["paid", "入金済"].includes(s);
  };
  /** 入金額（CSVは deposit_amount、手動モックは amount のみの行あり） */
  const getBankDepositAmount = (tx) => {
    const dep = Number(tx?.deposit_amount) || 0;
    if (dep > 0) return dep;
    const wd = Number(tx?.withdrawal_amount) || 0;
    if (wd > 0) return 0;
    return Number(tx?.amount) || 0;
  };
  const payables = Array.isArray(data?.payables) ? data.payables : [];
  const events = Array.isArray(data?.events) ? data.events : [];
  const todayStr = getTodayLocalStr();
  const fileInputRef = useRef(null);
  const [addTx, setAddTx] = useState(false);
  const [form, setForm] = useState({ date:todayStr, amount:"", description:"", direction:"in" });
  const [addPayable, setAddPayable] = useState(false);
  const [editingPayableId, setEditingPayableId] = useState(null);
  const [payableForm, setPayableForm] = useState({ vendor:"", category:"", dueDate:"", amount:"" });
  const [uploadingCsv, setUploadingCsv] = useState(false);
  const [uploadToast, setUploadToast] = useState("");
  const [expandedTxId, setExpandedTxId] = useState(null);
  const [matchingTxId, setMatchingTxId] = useState(null);
  const [rematchVersion, setRematchVersion] = useState(0);

  const todayStr2 = getTodayLocalStr();
  const unmatchedBanks = bankTransactions.filter(b=>b?.status==="unmatched");
  const totalUnmatched = unmatchedBanks.reduce((s,b)=>s+(Number(b?.amount)||0),0);
  const overdueTotal = invoices
    .filter((i) => {
      const p = getEntityPayload(i);
      return p.status === "overdue" || (p.status === "unpaid" && (p.dueDate || "") < todayStr2);
    })
    .reduce((s, i) => {
      const p = getEntityPayload(i);
      return s + (Number(p.total_amount ?? p.total) || 0);
    }, 0);

  useEffect(() => {
    let alive = true;
    const loadBankTransactions = async () => {
      if (!tenantId) return;
      const { data: rows, error } = await supabase
        .from("bank_transactions")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("transaction_date", { ascending: false });
      if (error) {
        console.warn("Failed to load bank_transactions:", error);
        return;
      }
      if (!alive) return;
      const mapped = (rows || []).map((row) => ({
        id: row?.id,
        date: row?.transaction_date || "",
        transaction_date: row?.transaction_date || "",
        description: row?.description || "",
        counterparty: row?.counterparty || "",
        amount: Number(row?.deposit_amount) || Number(row?.withdrawal_amount) || 0,
        deposit_amount: Number(row?.deposit_amount) || 0,
        withdrawal_amount: Number(row?.withdrawal_amount) || 0,
        status: row?.match_status || "unmatched",
        match_status: row?.match_status || "unmatched",
        matchedInvoice: row?.matched_invoice_id || null,
        matched_invoice_id: row?.matched_invoice_id || null,
      }));
      setBankTransactions(mapped);
      // ダッシュボード（DashboardPage）は data?.bankTransactions を参照しているが、
      // 以前はこのページ内のローカル state（setBankTransactions）にしか反映していなかったため、
      // ダッシュボードの「本日の入金」「未照合入金」などの表示が常に空になっていたバグがあった。
      // 共通の data state にも同期することで、他のページからも参照できるようにする。
      setData((d) => ({ ...d, bankTransactions: mapped }));
    };
    loadBankTransactions();
    return () => {
      alive = false;
    };
  }, [tenantId]);

  const addTxn = async () => {
    // tenantId が確定していない場合、これまでは何も起きず処理が静かに終了していたため、
    // ボタンを押してもモーダルが閉じず、ユーザーには何が起きたのか全く分からなかった。
    // ページ読み込み直後の一瞬など、本番環境でも tenantId が未確定の状態でこの
    // ボタンが押される可能性があるため、その場合は理由をユーザーに伝える。
    if (!tenantId) {
      window.alert("テナント情報の読み込み中です。少し待ってから再度お試しください。");
      return;
    }
    // 以前はクライアント側の state にしか追加しておらず、
    // bankTransactions は TABLE_CONFIG（自動保存の対象テーブル一覧）に
    // 含まれていないため、ページをリロードすると手動追加した入出金が
    // 消えてしまうバグがあった。ここで明示的にSupabaseへ保存する。
    const amountValue = Math.max(0, parseInt(form.amount, 10) || 0);
    const newRow = {
      transaction_date: form.date,
      description: form.description,
      counterparty: form.description,
      deposit_amount: form.direction === "out" ? 0 : amountValue,
      withdrawal_amount: form.direction === "out" ? amountValue : 0,
      balance: null,
      bank_name: "手動入力",
      match_status: "unmatched",
      matched_invoice_id: null,
      matched_at: null,
      matched_by: null,
      note: null,
      tenant_id: tenantId,
    };
    try {
      const { data: inserted, error } = await supabase
        .from("bank_transactions")
        .insert([newRow])
        .select("*")
        .single();
      if (error) throw error;
      const mappedTx = {
        id: inserted?.id,
        date: inserted?.transaction_date || "",
        transaction_date: inserted?.transaction_date || "",
        description: inserted?.description || "",
        counterparty: inserted?.counterparty || "",
        amount: Number(inserted?.deposit_amount) || Number(inserted?.withdrawal_amount) || 0,
        deposit_amount: Number(inserted?.deposit_amount) || 0,
        withdrawal_amount: Number(inserted?.withdrawal_amount) || 0,
        status: inserted?.match_status || "unmatched",
        match_status: inserted?.match_status || "unmatched",
        matchedInvoice: inserted?.matched_invoice_id || null,
        matched_invoice_id: inserted?.matched_invoice_id || null,
      };
      setBankTransactions((prev) => [mappedTx, ...prev]);
      setData((d) => ({ ...d, bankTransactions: [mappedTx, ...(Array.isArray(d?.bankTransactions) ? d.bankTransactions : [])] }));
      setAddTx(false);
      setForm({ date:todayStr2, amount:"", description:"", direction:"in" });
    } catch (err) {
      window.alert("入出金の追加に失敗しました：" + (err?.message || String(err)));
    }
  };

  // 支払予定（payables）の新規追加・編集・削除。
  // 以前は読み込みと「支払済にする」操作しかなく、燃料費・高速代・協力会社費用などの
  // 支払予定そのものを登録する手段がどこにもなかった。
  const openAddPayable = () => {
    setEditingPayableId(null);
    setPayableForm({ vendor:"", category:"", dueDate:"", amount:"" });
    setAddPayable(true);
  };

  const openEditPayable = (p) => {
    setEditingPayableId(p?.id || null);
    setPayableForm({
      vendor: p?.vendor || "",
      category: p?.category || "",
      dueDate: p?.dueDate || "",
      amount: p?.amount != null ? String(p.amount) : "",
    });
    setAddPayable(true);
  };

  const savePayable = () => {
    if (!payableForm.vendor.trim()) {
      window.alert("支払先を入力してください。");
      return;
    }
    const amountValue = Math.max(0, parseInt(payableForm.amount, 10) || 0);
    if (editingPayableId) {
      const before = payables.find((p) => p?.id === editingPayableId);
      logHistoryEntry(setData, { entityType: "payable", entityId: editingPayableId, entityLabel: before?.vendor, before, userRole });
      setData((d) => ({
        ...d,
        payables: (Array.isArray(d?.payables) ? d.payables : []).map((p) =>
          p?.id === editingPayableId
            ? { ...p, vendor: payableForm.vendor, category: payableForm.category, dueDate: payableForm.dueDate, amount: amountValue }
            : p
        ),
      }));
    } else {
      const newPayable = {
        id: generateUniqueBusinessId(Array.isArray(data?.payables) ? data.payables : [], "PAY"),
        vendor: payableForm.vendor,
        category: payableForm.category,
        dueDate: payableForm.dueDate,
        amount: amountValue,
        status: "unpaid",
      };
      setData((d) => ({ ...d, payables: [...(Array.isArray(d?.payables) ? d.payables : []), newPayable] }));
    }
    setAddPayable(false);
    setEditingPayableId(null);
  };

  const deletePayable = (id) => {
    if (!window.confirm("この支払予定を削除しますか？（この操作は元に戻せません）")) return;
    setData((d) => ({ ...d, payables: (Array.isArray(d?.payables) ? d.payables : []).filter((p) => p?.id !== id) }));
  };

  const bankIcon = <Icon size={14}><rect x="3" y="6" width="18" height="12" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></Icon>;
  const warningIcon = <Icon size={14}><path d="M12 3 2.5 20h19L12 3z"/><line x1="12" y1="9" x2="12" y2="14"/><line x1="12" y1="17" x2="12" y2="17"/></Icon>;
  const invoiceIcon = <Icon size={14}><rect x="4" y="3" width="16" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="14" y2="12"/></Icon>;
  const payableIcon = <Icon size={14}><circle cx="12" cy="12" r="9"/><path d="M12 7v10"/><path d="M8 11h8"/></Icon>;
  const plusIcon = <Icon size={14}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></Icon>;
  const checkIcon = <Icon size={12}><polyline points="4,12 9,17 20,6"/></Icon>;
  const uploadIcon = <Icon size={14}><path d="M12 16V4"/><polyline points="7,9 12,4 17,9"/><rect x="4" y="16" width="16" height="4" rx="1"/></Icon>;

  const showUploadToast = (message) => {
    setUploadToast(message);
    setTimeout(() => setUploadToast(""), 3000);
  };

  const normalizeKanaForCompare = (value) => {
    const src = String(value || "");
    if (!src) return "";
    const normalized = src
      .normalize("NFKC")
      .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
      .replace(/\s+/g, "")
      .replace(/[()（）\[\]【】「」『』・･.,，。、\-ー_\/]/g, "")
      .toLowerCase();
    const corpWords = [
      "株式会社",
      "有限会社",
      "合同会社",
      "合資会社",
      "合名会社",
      "かぶしきがいしゃ",
      "ゆうげんがいしゃ",
      "ごうどうがいしゃ",
      "か",
      "かぶ",
      "ゆう",
      "ゆうげん",
    ];
    return corpWords.reduce((acc, word) => acc.replaceAll(word, ""), normalized);
  };

  const findInvoiceCandidates = (bankTx, invoiceRows, customerRows) => {
    try {
      const deposit = getBankDepositAmount(bankTx);
      const txStatus = bankTx?.match_status || bankTx?.status || "unmatched";
      if (!bankTx || deposit <= 0) return [];
      if (txStatus === "matched") return [];

      const candidates = [];
      const paidLike = ["paid", "入金済", "cancelled", "キャンセル"];

      (invoiceRows || []).forEach((inv) => {
        const invPayload = getEntityPayload(inv);
        const invAmount = Number(invPayload.total_amount ?? invPayload.totalAmount ?? invPayload.total ?? 0);
        const invStatus = String(invPayload.status || "");
        const invCustomerId = invPayload.customer_id || invPayload.customerId || "";

        if (paidLike.includes(invStatus)) return;
        if (invAmount <= 0) return;

        const customer = (customerRows || []).find((c) => {
          const cPayload = getEntityPayload(c);
          return c.id === invCustomerId || cPayload.id === invCustomerId;
        });
        const customerPayload = getEntityPayload(customer || {});
        const payerKana = customerPayload.payer_kana || "";

        const amountMatch = deposit === invAmount;
        const counterpartyRaw = bankTx.counterparty || bankTx.description || "";
        const normalizedCounterparty = normalizeKanaForCompare(counterpartyRaw);
        const normalizedPayerKana = normalizeKanaForCompare(payerKana);
        const kanaMatch =
          normalizedPayerKana.length > 0 &&
          (normalizedCounterparty.includes(normalizedPayerKana) ||
            normalizedPayerKana.includes(normalizedCounterparty));

        if (amountMatch && kanaMatch) {
          candidates.push({ invoice: inv, matchType: "exact", reason: "金額・名義一致" });
        } else if (amountMatch) {
          candidates.push({ invoice: inv, matchType: "partial_amount", reason: "金額一致" });
        } else if (kanaMatch) {
          candidates.push({ invoice: inv, matchType: "partial_kana", reason: "名義一致" });
        }
      });

      const order = { exact: 0, partial_amount: 1, partial_kana: 2 };
      return candidates.sort((a, b) => order[a.matchType] - order[b.matchType]);
    } catch (error) {
      console.warn("findInvoiceCandidates failed:", error);
      return [];
    }
  };

  const candidateMap = useMemo(() => {
    const txMap = new Map();
    (bankTransactions || []).forEach((tx) => {
      txMap.set(tx?.id, findInvoiceCandidates(tx, invoices, customers));
    });
    return txMap;
  }, [bankTransactions, invoices, customers, rematchVersion]);

  const getDisplayMatchStatus = (tx) => {
    const current = tx?.match_status || tx?.status || "unmatched";
    if (current === "matched") return "matched";
    const deposit = getBankDepositAmount(tx);
    if (deposit <= 0) return current;
    const candidates = candidateMap.get(tx?.id) || [];
    if (candidates.length > 0) return "candidate";
    return "unmatched";
  };

  const confirmMatch = async (bankTxId, invoiceOrId) => {
    if (!bankTxId) return;
    // 確定ボタンの連打により同じ銀行取引が二重に「入金済み」処理されるのを防ぐため、
    // 処理中はこの取引IDをロックし、完了するまで再実行をブロックする。
    if (matchingTxId === bankTxId) return;
    setMatchingTxId(bankTxId);
    try {
      const tx = bankTransactions.find((row) => row?.id === bankTxId);
      if (!tx) return;

      const nowIso = new Date().toISOString();
      const paidAmount = getBankDepositAmount(tx);

      const { data: invRows, error: lookupErr } = await supabase
        .from("invoices")
        .select("id, payload")
        .eq("tenant_id", tenantId)
        .limit(500);
      if (lookupErr) throw lookupErr;

      // invoiceOrId から業務ID（INV-005など）を取り出す（複数パターン対応）
      let businessId = "";
      if (typeof invoiceOrId === "string") {
        businessId = invoiceOrId;
      } else if (invoiceOrId && typeof invoiceOrId === "object") {
        // fetchDataFromSupabase で payload がフラット展開されているので invoice.id が直接業務ID
        businessId = invoiceOrId?.id || invoiceOrId?.payload?.id || "";
      }

      if (!businessId) {
        window.alert("請求書IDが取得できませんでした。画面を再読み込みして再度お試しください。");
        return;
      }

      const matched = (invRows || []).find((row) => {
        let pl = {};
        try {
          pl = row.payload
            ? (typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload)
            : {};
          if (pl.payload) pl = typeof pl.payload === "string" ? JSON.parse(pl.payload) : pl.payload;
        } catch(e) {}
        return pl.id === businessId;
      });

      if (!matched?.id) {
        window.alert("請求書が見つかりませんでした。業務ID: " + businessId);
        return;
      }

      const invoiceDbId = matched.id;

      const invPayloadNext = { ...getEntityPayload(matched) };
      invPayloadNext.status = "paid";
      invPayloadNext.paid_at = nowIso;
      invPayloadNext.paidDate = String(nowIso).slice(0, 10);
      invPayloadNext.paid_amount = paidAmount;
      invPayloadNext.paidAmount = paidAmount;
      delete invPayloadNext._dbId;

      const customerNameForEvent = invPayloadNext.customerName || invPayloadNext.customer_name || "";
      const invBusinessId = invPayloadNext.id;

      let userId = null;
      try {
        const { data: authData } = await supabase.auth.getUser();
        userId = authData?.user?.id || null;
      } catch (_e) {
        userId = null;
      }

      const { error: txErr } = await supabase
        .from("bank_transactions")
        .update({
          match_status: "matched",
          matched_invoice_id: invoiceDbId,
          matched_at: nowIso,
          matched_by: userId,
        })
        .eq("id", bankTxId)
        .eq("tenant_id", tenantId);
      if (txErr) throw txErr;

      const { error: invErr } = await supabase
        .from("invoices")
        .update({ payload: invPayloadNext })
        .eq("id", invoiceDbId)
        .eq("tenant_id", tenantId);
      if (invErr) throw invErr;

      setBankTransactions((prev) =>
        prev.map((row) =>
          row?.id === bankTxId
            ? { ...row, status: "matched", match_status: "matched", matched_invoice_id: invoiceDbId, matched_at: nowIso, matched_by: userId }
            : row
        )
      );

      // 【重要】ここまでの処理で、請求書のステータス（未払い→入金済み）は
      // 直接Supabaseには書き込めているが、画面が見ている data.invoices（ローカルの状態）
      // を更新していなかったため、消込を確定させても画面上は「未払い」のままに
      // 見えてしまっていた（実際に検証で見つかった不具合）。
      // bank_transactions だけでなく invoices 側もあわせて更新する。
      setData((d) => ({
        ...d,
        bankTransactions: (Array.isArray(d?.bankTransactions) ? d.bankTransactions : []).map((row) =>
          row?.id === bankTxId
            ? { ...row, status: "matched", match_status: "matched", matched_invoice_id: invoiceDbId, matched_at: nowIso, matched_by: userId }
            : row
        ),
        invoices: (Array.isArray(d?.invoices) ? d.invoices : []).map((inv) =>
          (inv?._dbId ?? inv?.id) === invoiceDbId || inv?.id === invBusinessId
            ? { ...inv, ...invPayloadNext, _dbId: invoiceDbId }
            : inv
        ),
      }));

      window.alert("照合確定しました（" + customerNameForEvent + " / " + invBusinessId + "）");
    } catch (err) {
      console.error("confirmMatch error:", err);
      window.alert("照合確定に失敗しました：" + (err?.message || String(err)));
    } finally {
      setMatchingTxId(null);
    }
  };

  const normalizeAmount = (value) => {
    const raw = String(value ?? "").replace(/,/g, "").trim();
    if (!raw || raw === "-") return 0;
    const num = Number(raw);
    return Number.isFinite(num) ? Math.abs(num) : 0;
  };

  const toIsoDate = (value) => {
    const m = String(value || "").trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (!m) return "";
    return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  };

  const parseCsvLine = (line) => {
    const out = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === "\"") {
        inQuote = !inQuote;
      } else if (ch === "," && !inQuote) {
        out.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };

  const parseSmbcCsvText = (text) => {
    const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length < 2) throw new Error("format");
    const header = parseCsvLine(lines[0]);
    const keys = ["お取引日", "摘要", "お取引内容", "お預り（入金）", "お引出し（出金）", "差引残高"];
    const idx = Object.fromEntries(keys.map((k) => [k, header.indexOf(k)]));
    if (keys.some((k) => idx[k] < 0)) throw new Error("format");

    return lines.slice(1).map((line) => {
      const cols = parseCsvLine(line);
      const transaction_date = toIsoDate(cols[idx["お取引日"]]);
      if (!transaction_date) return null;
      return {
        transaction_date,
        description: cols[idx["摘要"]] || "",
        counterparty: cols[idx["お取引内容"]] || "",
        deposit_amount: normalizeAmount(cols[idx["お預り（入金）"]]),
        withdrawal_amount: normalizeAmount(cols[idx["お引出し（出金）"]]),
        balance: normalizeAmount(cols[idx["差引残高"]]),
        bank_name: "SMBC",
        match_status: "unmatched",
        matched_invoice_id: null,
        matched_at: null,
        matched_by: null,
        note: null,
      };
    }).filter(Boolean);
  };

  const decodeCsvFile = async (file) => {
    const buffer = await file.arrayBuffer();
    for (const encoding of ["utf-8", "shift-jis"]) {
      try {
        const text = new TextDecoder(encoding).decode(buffer);
        const parsed = parseSmbcCsvText(text);
        if (parsed.length > 0) return parsed;
      } catch (_e) {
        // try next
      }
    }
    throw new Error("format");
  };

  const makeDedupeKey = (row) => {
    const date = String(row?.transaction_date || row?.date || "").trim();
    const counterparty = String(row?.counterparty || "").trim();
    const deposit = Number(row?.deposit_amount || 0);
    const withdrawal = Number(row?.withdrawal_amount || 0);
    return `${date}|${counterparty}|${deposit}|${withdrawal}`;
  };

  /**
   * 同一内容（同日・同取引先・同額）の取引が複数件存在するケースに対応するため、
   * 単純な Set での有無判定ではなく「キーごとの出現回数」で重複を判定する。
   * 既存データに同じキーが2件あれば、新規データの同じキーも2件目までは重複扱いとし、
   * 3件目以降だけを新規として取り込む。
   */
  const buildKeyCountMap = (rows) => {
    const map = new Map();
    rows.forEach((row) => {
      const key = makeDedupeKey(row);
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  };

  const filterTrulyNewRows = (parsedRows, existingRows) => {
    const existingCounts = buildKeyCountMap(existingRows);
    const usedCounts = new Map();
    const newRows = [];
    parsedRows.forEach((row) => {
      const key = makeDedupeKey(row);
      const already = existingCounts.get(key) || 0;
      const usedSoFar = usedCounts.get(key) || 0;
      if (usedSoFar < already) {
        // 既存データに同じ内容がまだ残っている分だけ重複扱いにする
        usedCounts.set(key, usedSoFar + 1);
        return;
      }
      usedCounts.set(key, usedSoFar + 1);
      newRows.push(row);
    });
    return newRows;
  };

  const onUploadCsv = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    // 処理中に再度ファイルを選択して二重にアップロード処理が走るのを防ぐ。
    if (uploadingCsv) return;
    setUploadingCsv(true);
    try {
      const parsedRows = await decodeCsvFile(file);
      const newRows = filterTrulyNewRows(parsedRows, bankTransactions);
      const skipped = parsedRows.length - newRows.length;

      if (newRows.length > 0) {
        // CSVから読み込んだ行データには tenant_id が含まれていないため、
        // ここで明示的に付与する。これがないと、Supabase側に
        // NOT NULL制約やデフォルト値の設定がない場合、tenant_id が null の
        // 「どのテナントにも属さない」データが生成されてしまう。
        const rowsWithTenant = newRows.map((row) => ({ ...row, tenant_id: tenantId }));
        const { data: inserted, error: saveErr } = await supabase
          .from("bank_transactions")
          .insert(rowsWithTenant)
          .select("*");
        if (saveErr) throw saveErr;
        const mapped = (inserted || []).map((row) => ({
          id: row?.id,
          date: row?.transaction_date || "",
          transaction_date: row?.transaction_date || "",
          description: row?.description || "",
          counterparty: row?.counterparty || "",
          amount: Number(row?.deposit_amount) || Number(row?.withdrawal_amount) || 0,
          deposit_amount: Number(row?.deposit_amount) || 0,
          withdrawal_amount: Number(row?.withdrawal_amount) || 0,
          status: row?.match_status || "unmatched",
          match_status: row?.match_status || "unmatched",
          matchedInvoice: row?.matched_invoice_id || null,
          matched_invoice_id: row?.matched_invoice_id || null,
        }));
        setBankTransactions((prev) => [...mapped, ...prev]);
        setData((d) => ({ ...d, bankTransactions: [...mapped, ...(Array.isArray(d?.bankTransactions) ? d.bankTransactions : [])] }));
      }

      showUploadToast(`${newRows.length}件取込、${skipped}件スキップ（重複）`);
      setRematchVersion((v) => v + 1);
    } catch (err) {
      if (err?.message === "format") {
        window.alert("CSVフォーマットが不正です");
      } else {
        window.alert(`保存に失敗しました：${err?.message || String(err)}`);
      }
    } finally {
      setUploadingCsv(false);
    }
  };

  const transactionRows = [...bankTransactions].sort(
    (a, b) => String(b?.transaction_date || b?.date || "").localeCompare(String(a?.transaction_date || a?.date || ""))
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:"8px" }}>
        <div style={{ fontSize:"12px", color:"#666" }}>SMBC銀行CSVから取引明細を取り込み</div>
        <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
          <RetroBtn onClick={() => { setRematchVersion((v) => v + 1); showUploadToast("再マッチングを実行しました"); }} style={{ background:"#fff", color:"#00a09a", borderColor:"#00a09a" }}>
            再マッチング
          </RetroBtn>
          {uploadingCsv && <span style={{ fontSize:"12px", color:"#666" }}>読み込み中...</span>}
          <RetroBtn onClick={() => { if (!uploadingCsv) fileInputRef.current?.click(); }} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff", opacity: uploadingCsv ? 0.6 : 1, cursor: uploadingCsv ? "not-allowed" : "pointer" }}>
            {uploadIcon}SMBC CSVアップロード
          </RetroBtn>
          <input ref={fileInputRef} type="file" accept=".csv" style={{ display:"none" }} onChange={onUploadCsv} />
        </div>
      </div>
      {uploadToast && (
        <div style={{ position:"fixed", top:"62px", right:"18px", zIndex:10000, background:"#00a09a", color:"#fff", padding:"8px 12px", borderRadius:"6px", boxShadow:softShadow, fontSize:"12px", fontWeight:600 }}>
          {uploadToast}
        </div>
      )}

      <Panel title="アップロード済み銀行取引明細" icon={bankIcon}>
        <RetroTable
          headers={["取引日","摘要","振込名義","入金額","出金額","ステータス"]}
          rows={transactionRows.map((tx) => {
            const status = getDisplayMatchStatus(tx);
            const badge = {
              unmatched: ["未照合", "#e8e8e8", "#555", "#d0d0d0"],
              candidate: ["候補あり", "#fff3e0", "#e65100", "#ff9800"],
              matched: ["照合済", "#e8f5e9", "#2e7d32", "#4caf50"],
            }[status] || ["未照合", "#e8e8e8", "#555", "#d0d0d0"];
            const [label, bg, fg, border] = badge;
            const dep = Number(tx?.deposit_amount) || 0;
            const wd = Number(tx?.withdrawal_amount) || 0;
            return [
              tx?.transaction_date || tx?.date || "",
              tx?.description || "",
              tx?.counterparty || "",
              dep > 0 ? `¥${dep.toLocaleString()}` : "-",
              wd > 0 ? `¥${wd.toLocaleString()}` : "-",
              <span style={{ background:bg, color:fg, border:`1px solid ${border}`, borderRadius:"999px", padding:"2px 8px", fontSize:"11px", fontWeight:700 }}>{label}</span>,
            ];
          })}
        />
      </Panel>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:"8px" }}>
        {[
          ["未照合入金", "¥"+totalUnmatched.toLocaleString(), "#ff9800"],
          ["未払い請求", "¥"+invoices.filter(i=>!invoiceIsPaid(i)).reduce((s,i)=>s+(Number(getEntityPayload(i).total_amount??getEntityPayload(i).total)||0),0).toLocaleString(), "#2196f3"],
          ["延滞金額", "¥"+overdueTotal.toLocaleString(), "#e63946"],
          ["入金済", "¥"+invoices.filter(i=>invoiceIsPaid(i)).reduce((s,i)=>s+(Number(getEntityPayload(i).total_amount??getEntityPayload(i).total)||0),0).toLocaleString(), "#4caf50"],
        ].map(([l,v,c])=>(
          <div key={l} style={{ background:"#fff", border:cardBorder, borderRadius:"6px", padding:"12px" }}>
            <div style={{ fontSize:"11px", color:"#888", marginBottom:"3px", fontWeight:700 }}>{l}</div>
            <div style={{ fontSize:"18px", fontWeight:700, color:c }}>{v}</div>
          </div>
        ))}
      </div>

      {unmatchedBanks.length>0&&(
        <Panel style={{ borderColor:"#ffcc80", background:"#fff3e0" }}>
          <div style={{ fontSize:"12px", fontWeight:700, color:"#e65100", marginBottom:"8px", display:"flex", alignItems:"center", gap:"6px" }}>
            {warningIcon}未照合の入金 {unmatchedBanks.length}件 — 請求書と照合してください
          </div>
          {unmatchedBanks.map(b=>(
            <div key={b.id} style={{ border:cardBorder, borderRadius:"6px", background:"#fff", padding:"8px 10px", marginBottom:"6px" }}>
              <div
                style={{ display:"flex", justifyContent:"space-between", marginBottom:"6px", cursor:getBankDepositAmount(b) > 0 ? "pointer" : "default" }}
                onClick={() => {
                  if (getBankDepositAmount(b) <= 0) return;
                  setExpandedTxId((prev) => (prev === b?.id ? null : b?.id));
                }}
              >
                <div>
                  <span style={{ fontSize:"12px", fontWeight:700 }}>{b.date}</span>
                  <span style={{ fontSize:"12px", marginLeft:"10px", color:"#007a74", fontWeight:700 }}>¥{(Number(b?.amount)||0).toLocaleString()} 入金</span>
                  <span style={{ fontSize:"11px", color:"#666", marginLeft:"10px" }}>{b.description}</span>
                  <span style={{ fontSize:"11px", color:"#888", marginLeft:"8px" }}>{b?.counterparty || ""}</span>
                </div>
                <span style={{ display:"inline-flex", alignItems:"center", gap:"8px" }}>
                  <StatusPill s={b.status}/>
                  {getBankDepositAmount(b) > 0 && <span style={{ fontSize:"11px", color:"#666" }}>{expandedTxId === b?.id ? "▲" : "▼"}</span>}
                </span>
              </div>
              <div style={{ display:"flex", gap:"6px", alignItems:"center" }}>
                <span style={{ fontSize:"11px", color:"#666" }}>照合：</span>
                <RetroSelect style={{ width:"250px" }} onChange={(e)=>confirmMatch(b?.id, e.target.value)}>
                  <option value="">請求書を選択...</option>
                  {invoices.filter(i=>!invoiceIsPaid(i)).map(i=>{
                    const p = getEntityPayload(i);
                    const rowId = getInvoiceDbId(i);
                    return (
                      <option key={rowId||`inv-${Math.random()}`} value={rowId||""}>{p?.id||"—"} {p?.customerName||""} ¥{(Number(p?.total_amount??p?.total)||0).toLocaleString()}</option>
                    );
                  })}
                </RetroSelect>
              </div>
              {getBankDepositAmount(b) > 0 && expandedTxId === b?.id && (
                <div style={{ marginTop:"8px", display:"flex", flexDirection:"column", gap:"6px" }}>
                  {(candidateMap.get(b?.id) || []).length === 0 ? (
                    <div style={{ border:"1px solid #d0d0d0", background:"#f5f5f5", color:"#555", borderRadius:"6px", padding:"8px 10px", fontSize:"12px" }}>
                      ❌ 候補なし（手動で請求書を選択してください）
                    </div>
                  ) : (
                    (candidateMap.get(b?.id) || []).map((candidate) => {
                      const inv = candidate?.invoice || {};
                      const ip = getEntityPayload(inv);
                      const invRowId = getInvoiceDbId(inv);
                      const isExact = candidate?.matchType === "exact";
                      const tone = isExact
                        ? { bg:"#e8f5e9", border:"#4caf50", title:"🟢 完全一致候補", color:"#2e7d32" }
                        : { bg:"#fff3e0", border:"#ff9800", title:"🟡 候補", color:"#e65100" };
                      return (
                        <div key={`${b?.id}-${invRowId}-${candidate?.matchType}`} style={{ border:`1px solid ${tone.border}`, background:tone.bg, borderRadius:"6px", padding:"8px 10px" }}>
                          <div style={{ fontSize:"12px", fontWeight:700, color:tone.color }}>{tone.title}</div>
                          <div style={{ fontSize:"12px", color:"#333", marginTop:"4px" }}>
                            顧客: {ip?.customerName || "—"} / 請求書: {ip?.id || "—"} / 金額: ¥{(Number(ip?.total_amount ?? ip?.total)||0).toLocaleString()} / 発行日: {ip?.issueDate || ip?.issue_date || "—"}
                          </div>
                          {!isExact && <div style={{ fontSize:"11px", color:"#666", marginTop:"2px" }}>理由: {candidate?.reason || "部分一致"}</div>}
                          <div style={{ marginTop:"6px" }}>
                            <RetroBtn
                              onClick={()=>confirmMatch(b?.id, candidate.invoice || inv)}
                              style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff", opacity: matchingTxId === b?.id ? 0.6 : 1, cursor: matchingTxId === b?.id ? "not-allowed" : "pointer" }}
                            >
                              {checkIcon}{matchingTxId === b?.id ? "処理中..." : "この候補で確定"}
                            </RetroBtn>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          ))}
        </Panel>
      )}

      <Panel title="口座入出金履歴" icon={bankIcon}>
        <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:"6px" }}>
          <RetroBtn onClick={()=>setAddTx(true)} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>{plusIcon}入出金を手動追加</RetroBtn>
        </div>
        <RetroTable
          headers={["日付","内容（振込名義等）","金額","照合状況","照合先"]}
          rows={bankTransactions.map((b) => {
            const matchedInv = invoices.find(
              (i) => getInvoiceDbId(i) === b.matchedInvoice || getEntityPayload(i).id === b.matchedInvoice
            );
            const matchedName = getEntityPayload(matchedInv || {}).customerName || "";
            return [
              b?.date||"",
              <span style={{ fontSize:"12px" }}>{b?.description||""}</span>,
              <span style={{ color:"#007a74", fontWeight:700 }}>¥{(Number(b?.amount)||0).toLocaleString()}</span>,
              <StatusPill s={b?.status}/>,
              b?.matchedInvoice ? (
                <span style={{ color:"#2e7d32", fontSize:"11px" }}>
                  {b.matchedInvoice} / {matchedName}
                </span>
              ) : "—",
            ];
          })}
        />
      </Panel>

      <Panel title="入金管理（請求書別）" icon={invoiceIcon}>
        <RetroTable
          headers={["請求書","顧客","発行日","期日","金額","状態","メモ"]}
          rows={invoices.map((inv) => {
            const p = getEntityPayload(inv);
            return [
              <span style={{ color:"#007a74", fontWeight:700 }}>{p?.id||getInvoiceDbId(inv)||"—"}</span>,
              p?.customerName||"", p?.issueDate||p?.issue_date||"", p?.dueDate||p?.due_date||"",
              <span style={{ fontWeight:700 }}>¥{(Number(p?.total_amount??p?.total)||0).toLocaleString()}</span>,
              <StatusPill s={p?.status}/>,
              <span style={{ fontSize:"11px", color:"#999" }}>{p?.note||"—"}</span>,
            ];
          })}
        />
      </Panel>

      <Panel title="支払管理（支払予定一覧）" icon={payableIcon}>
        <div style={{ marginBottom:"8px" }}>
          <RetroBtn small onClick={openAddPayable} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>{plusIcon}支払予定を追加</RetroBtn>
        </div>
        <RetroTable
          headers={["支払先","区分","期日","金額","状態","操作"]}
          rows={payables.map(p=>[
            p?.vendor||"", p?.category||"", p?.dueDate||"",
            "¥"+(Number(p?.amount)||0).toLocaleString(),
            <StatusPill s={p?.status} context="payable"/>,
            <div style={{ display:"flex", gap:"4px" }}>
              {p?.status==="unpaid"
                ? <RetroBtn small onClick={()=>setData(d=>({...d,payables:(Array.isArray(d?.payables) ? d.payables : []).map(x=>x?.id===p?.id?{...x,status:"paid"}:x)}))} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>{checkIcon}支払済</RetroBtn>
                : <span style={{ fontSize:"10px", color:"#999" }}>済</span>}
              <RetroBtn small onClick={()=>openEditPayable(p)} style={{ background:"#fff", color:"#00a09a", borderColor:"#00a09a" }}>編集</RetroBtn>
              <RetroBtn small onClick={()=>deletePayable(p?.id)} style={{ background:"#fff", color:"#e63946", borderColor:"#e63946" }}>削除</RetroBtn>
            </div>
          ])}
        />
      </Panel>

      {addPayable&&(
        <Modal title={editingPayableId ? "支払予定を編集" : "支払予定を追加"} icon={payableIcon} onClose={()=>{ setAddPayable(false); setEditingPayableId(null); }} width={420}>
          <Fl label="支払先"><RetroInput value={payableForm.vendor} onChange={e=>setPayableForm(f=>({...f,vendor:e.target.value}))} placeholder="例：〇〇燃料株式会社"/></Fl>
          <Fl label="区分"><RetroInput value={payableForm.category} onChange={e=>setPayableForm(f=>({...f,category:e.target.value}))} placeholder="例：燃料費、高速代、協力費など"/></Fl>
          <Fl label="支払期日"><RetroInput type="date" value={payableForm.dueDate} onChange={e=>setPayableForm(f=>({...f,dueDate:e.target.value}))}/></Fl>
          <Fl label="金額（円）"><RetroInput type="number" min="0" value={payableForm.amount} onChange={e=>setPayableForm(f=>({...f,amount:e.target.value}))} placeholder="50000"/></Fl>
          <div style={{ display:"flex", justifyContent:"flex-end", gap:"6px", marginTop:"10px" }}>
            <RetroBtn onClick={()=>{ setAddPayable(false); setEditingPayableId(null); }}>キャンセル</RetroBtn>
            <RetroBtn onClick={savePayable} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>{editingPayableId ? "更新する" : "登録する"}</RetroBtn>
          </div>
        </Modal>
      )}

      {addTx&&(
        <Modal title="入出金を手動追加" icon={bankIcon} onClose={()=>setAddTx(false)} width={400}>
          <Fl label="日付"><RetroInput type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/></Fl>
          <Fl label="金額（円）"><RetroInput type="number" min="0" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} placeholder="50000"/></Fl>
          <Fl label="摘要・振込名義"><RetroInput value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="タナカシヨウジ　カブ"/></Fl>
          <div style={{ display:"flex", justifyContent:"flex-end", gap:"6px", marginTop:"10px" }}>
            <RetroBtn onClick={()=>setAddTx(false)}>キャンセル</RetroBtn>
            <RetroBtn onClick={addTxn} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>追加する</RetroBtn>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ===== DASHBOARD =====
const DashboardPage = ({ data, setData, setPage, tenantId, userRole, isMobile }) => {
  const events = Array.isArray(data?.events) ? data.events : [];
  const bankTransactions = Array.isArray(data?.bankTransactions) ? data.bankTransactions : [];
  const invoices = (Array.isArray(data?.invoices) ? data.invoices : []).filter(i => !i?.deleted);
  const orders = (Array.isArray(data?.orders) ? data.orders : []).filter(o => !o?.deleted);
  const drivers = (Array.isArray(data?.drivers) ? data.drivers : []).filter(d => !d?.deleted);
  const payables = Array.isArray(data?.payables) ? data.payables : [];
  const vehicles = (Array.isArray(data?.vehicles) ? data.vehicles : []).filter(v => !v?.deleted);
  const companyInfo = data?.companyInfo || {};
  const todayStr = getTodayLocalStr();
  // 免許更新・車検・任意保険の期限は、これまで「当日になったらカレンダーに
  // 表示される」だけで、事前に気づく手段が一切なかった。
  // 会社情報設定で指定した日数（デフォルト30日）以内に期限を迎える項目を
  // 洗い出し、ダッシュボードで事前に警告できるようにする。
  const expiryAlertDays = Number(companyInfo?.expiryAlertDays) || 30;
  const todayDateObj = new Date(todayStr + "T00:00:00");
  const daysUntil = (dateStr) => {
    if (!dateStr) return null;
    const target = new Date(dateStr + "T00:00:00");
    if (isNaN(target.getTime())) return null;
    return Math.round((target - todayDateObj) / (1000 * 60 * 60 * 24));
  };
  const upcomingLicenseExpirations = drivers
    .map(d => ({ d, days: daysUntil(d?.license_expiry) }))
    .filter(x => x.days !== null && x.days >= 0 && x.days <= expiryAlertDays)
    .sort((a,b) => a.days - b.days);
  const upcomingInspections = vehicles
    .map(v => ({ v, days: daysUntil(v?.nextInspection) }))
    .filter(x => x.days !== null && x.days >= 0 && x.days <= expiryAlertDays)
    .sort((a,b) => a.days - b.days);
  const upcomingInsuranceExpirations = vehicles
    .map(v => ({ v, days: daysUntil(v?.insuranceExpiry) }))
    .filter(x => x.days !== null && x.days >= 0 && x.days <= expiryAlertDays)
    .sort((a,b) => a.days - b.days);
  // 期限接近が同時に多数発生した場合、アラートカードに全員分を詰め込むと
  // 1行が非常に長くなり読みにくくなる。上位5件だけを表示し、
  // それ以上は「他◯件」とまとめることで、件数が多くても見やすさを保つ。
  const summarizeExpiringList = (list, formatItem) => {
    const shown = list.slice(0, 5).map(formatItem).join("、");
    const remaining = list.length - 5;
    return remaining > 0 ? `${shown} 他${remaining}件` : shown;
  };
  const todayEvents = events.filter(e=>e?.date===todayStr);
  const todayBanks = bankTransactions.filter(b=>b?.date===todayStr);
  const unmatchedCount = bankTransactions.filter(b=>b?.status==="unmatched").length;
  const overdueCount = invoices.filter(i=>i?.status==="overdue"||(i?.status==="unpaid"&&(i?.dueDate||"")<todayStr)).length;
  const activeOrders = orders.filter(o=>["pending","scheduled","in_transit"].includes(o?.status)).length;
  const availableDrivers = drivers.filter(d=>d?.status==="available").length;
  const totalRevenue = invoices.filter(i=>i?.status==="paid").reduce((s,i)=>s+(Number(i?.total)||0),0);
  const unpaidTotal = invoices.filter(i=>i?.status!=="paid").reduce((s,i)=>s+(Number(i?.total)||0),0);
  // 支払予定（会社が取引先に支払う側のお金）も経営状況の把握に必要なため、
  // 入金側（売上・未回収）だけでなく支出側もダッシュボードに表示する。
  const unpaidPayables = payables.filter(p=>p?.status!=="paid");
  const payablesUnpaidTotal = unpaidPayables.reduce((s,p)=>s+(Number(p?.amount)||0),0);
  const payablesOverdueCount = unpaidPayables.filter(p=>(p?.dueDate||"")<todayStr).length;
  // 今月中に支払期日が来る未払いの支払予定だけを合計した「今月の支払予定額」。
  // 資金繰り（今月いくら出ていく予定があるか）を一目で把握できるようにする。
  const currentMonthKeyForDashboard = todayStr.slice(0,7);
  const payablesDueThisMonthTotal = unpaidPayables
    .filter(p=>(p?.dueDate||"").slice(0,7) === currentMonthKeyForDashboard)
    .reduce((s,p)=>s+(Number(p?.amount)||0),0);
  // キャッシュフローの見通し：今月の入金予定（未回収のうち今月期日）から
  // 今月の支払予定を引いた金額。マイナスなら資金繰りに注意が必要というサインになる。
  const invoicesDueThisMonthTotal = invoices
    .filter(i=>i?.status!=="paid" && (i?.dueDate||"").slice(0,7) === currentMonthKeyForDashboard)
    .reduce((s,i)=>s+(Number(i?.total)||0),0);
  const netCashFlowThisMonth = invoicesDueThisMonthTotal - payablesDueThisMonthTotal;
  // ドライバーロールは経理情報（売上・未回収額・口座照合）や
  // 他のドライバーの個人情報を見る必要がなく、見せるべきでもないため、
  // ダッシュボードの表示内容を「本日の予定」のみに絞った簡易版に切り替える。
  const isDriverView = userRole === "driver";

  const alertCard = (bg, color, title, body, onClick) => (
    <div style={{ background:bg, border:cardBorder, borderLeft:`4px solid ${color}`, borderRadius:"6px", padding:"10px 12px", flex:1, cursor:"pointer" }} onClick={onClick}>
      <div style={{ color, fontWeight:700, fontSize:"12px", marginBottom:"2px" }}>{title}</div>
      <div style={{ color:"#666", fontSize:"12px" }}>{body}</div>
    </div>
  );

  if (isDriverView) {
    return (
      <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>
        <Panel title={`本日の予定（${todayStr}）`} icon={<Icon size={14}><rect x="3" y="4" width="18" height="18"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/></Icon>}>
          {todayEvents.length===0&&<div style={{ fontSize:"12px", color:"#999", padding:"8px" }}>本日の予定はありません</div>}
          {todayEvents.map(ev=>(
            <div key={ev.id} style={{ display:"flex", alignItems:"center", gap:"8px", padding:"8px 4px", borderBottom:"1px solid #f0f0f0" }}>
              <div style={{ width:"8px", height:"8px", borderRadius:"50%", background:ev.color }}/>
              <span style={{ fontSize:"12px", flex:1 }}>{ev.title}</span>
              <span style={{ background:"#f5f7f8", color:"#666", fontSize:"10px", padding:"2px 6px", borderRadius:"999px" }}>{EVENT_TYPE_LABEL[ev.type]||ev.type}</span>
            </div>
          ))}
        </Panel>
      </div>
    );
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>
      <div style={{ display:"flex", gap:"10px", flexWrap:"wrap" }}>
        {unmatchedCount>0 && alertCard("#fff3e0", "#ff9800", "未照合入金があります", `${unmatchedCount}件の入金照合が未処理です`, ()=>setPage("bank"))}
        {overdueCount>0 && alertCard("#ffebee", "#e63946", "支払延滞があります", `${overdueCount}件の延滞が発生しています`, ()=>setPage("bank"))}
        {payablesOverdueCount>0 && alertCard("#fff3e0", "#e65100", "支払期日を過ぎた支払予定があります", `${payablesOverdueCount}件、未払いのまま期日を過ぎています`, ()=>setPage("bank"))}
        {upcomingLicenseExpirations.length>0 && alertCard("#f3e5f5", "#9933cc", "免許更新が近いドライバーがいます",
          summarizeExpiringList(upcomingLicenseExpirations, x => `${x.d?.name||""}（あと${x.days}日）`),
          ()=>setPage("drivers"))}
        {upcomingInspections.length>0 && alertCard("#fce4ec", "#cc0099", "車検期限が近い車両があります",
          summarizeExpiringList(upcomingInspections, x => `${x.v?.plate||""}（あと${x.days}日）`),
          ()=>setPage("vehicles"))}
        {upcomingInsuranceExpirations.length>0 && alertCard("#f3e5f5", "#9b27af", "任意保険期限が近い車両があります",
          summarizeExpiringList(upcomingInsuranceExpirations, x => `${x.v?.plate||""}（あと${x.days}日）`),
          ()=>setPage("vehicles"))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:"10px" }}>
        {[
          ["稼働中案件",activeOrders+"件","#00a09a"],
          ["待機ドライバー",availableDrivers+"名","#2196f3"],
          // 【重要】以下は経理情報（売上・未回収・支払予定・資金繰り）のため、
          // ドライバーだけでなく配車担当にも見せない。配車担当は日々の配車・
          // ルート管理が仕事であり、会社の収支状況を見る必要はない。
          ...(userRole === "dispatcher" ? [] : [
            ["入金済売上","¥"+totalRevenue.toLocaleString(),"#7b1fa2"],
            ["未回収","¥"+unpaidTotal.toLocaleString(),"#e63946"],
            ["今月の支払予定","¥"+payablesDueThisMonthTotal.toLocaleString(),"#e65100"],
            ["今月の資金繰り見通し", (netCashFlowThisMonth>=0?"+":"") + "¥"+netCashFlowThisMonth.toLocaleString(), netCashFlowThisMonth>=0 ? "#2e7d32" : "#e63946"],
          ]),
        ].map(([l,v,c])=>(
          <div key={l} style={{ background:"#fff", border:cardBorder, borderRadius:"6px", padding:"12px" }}>
            <div style={{ fontSize:"11px", color:"#888", marginBottom:"6px", fontWeight:700 }}>{l}</div>
            <div style={{ fontSize:"21px", fontWeight:700, color:c }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))", gap:"12px" }}>
        <Panel title={`本日の予定（${todayStr}）`} icon={<Icon size={14}><rect x="3" y="4" width="18" height="18"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/></Icon>}>
          {/* 【重要】配車担当には、入金・支払・資金繰りに関する情報を見せない
              既存方針に合わせ、経理系イベント（入金予定・支払期日・入出金）は
              一覧からも除外する。配送・タスクなど業務系の予定だけを見せる。 */}
          {(userRole === "dispatcher"
            ? todayEvents.filter(ev => !["payment_due","payment_receive","bank_in","bank_out"].includes(ev.type))
            : todayEvents
          ).length===0 && (userRole === "dispatcher" || (todayBanks.length===0&&unpaidPayables.filter(p=>p?.dueDate===todayStr).length===0)) && <div style={{ fontSize:"12px", color:"#999", padding:"8px" }}>本日の予定はありません</div>}
          {(userRole === "dispatcher"
            ? todayEvents.filter(ev => !["payment_due","payment_receive","bank_in","bank_out"].includes(ev.type))
            : todayEvents
          ).map(ev=>(
            <div key={ev.id} style={{ display:"flex", alignItems:"center", gap:"8px", padding:"8px 4px", borderBottom:"1px solid #f0f0f0" }}>
              <div style={{ width:"8px", height:"8px", borderRadius:"50%", background:ev.color }}/>
              <span style={{ fontSize:"12px", flex:1 }}>{ev.title}</span>
              <span style={{ background:"#f5f7f8", color:"#666", fontSize:"10px", padding:"2px 6px", borderRadius:"999px" }}>{EVENT_TYPE_LABEL[ev.type]||ev.type}</span>
            </div>
          ))}
          {userRole !== "dispatcher" && todayBanks.map(b=>(
            <div key={b.id} style={{ display:"flex", alignItems:"center", gap:"8px", padding:"8px 4px", borderBottom:"1px solid #f0f0f0" }}>
              <div style={{ width:"8px", height:"8px", borderRadius:"50%", background:"#00a09a" }}/>
              <span style={{ fontSize:"12px", flex:1 }}>入金 ¥{b.amount.toLocaleString()} {b.description}</span>
              <StatusPill s={b.status}/>
            </div>
          ))}
          {userRole !== "dispatcher" && unpaidPayables.filter(p=>p?.dueDate===todayStr).map(p=>(
            <div key={p.id} style={{ display:"flex", alignItems:"center", gap:"8px", padding:"8px 4px", borderBottom:"1px solid #f0f0f0" }}>
              <div style={{ width:"8px", height:"8px", borderRadius:"50%", background:"#e65100" }}/>
              <span style={{ fontSize:"12px", flex:1 }}>支払期日 ¥{(Number(p?.amount)||0).toLocaleString()} {p?.vendor||""}</span>
              <StatusPill s={p?.status} context="payable"/>
            </div>
          ))}
        </Panel>

        <Panel title="最近の案件" icon={<Icon size={14}><path d="M3 7h18"/><path d="M5 7v12h14V7"/><path d="M9 11h6"/></Icon>}>
          <RetroTable
            headers={["ID","顧客","配達日","状態"]}
            rows={[...orders].reverse().slice(0,5).map(o=>[
              <span style={{ color:"#007a74", fontWeight:700 }}>{o?.id||"—"}</span>,
              o?.customerName||"", o?.deliveryDate||"", <StatusPill s={o?.status}/>
            ])}
          />
        </Panel>

        <Panel title="ドライバー状況" icon={<Icon size={14}><circle cx="12" cy="8" r="4"/><path d="M4 20c1.8-3.5 5-5 8-5s6.2 1.5 8 5"/></Icon>}>
          <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
            {drivers.map((d)=>(
              <div key={d?.id || d?.name} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:"#fff", border:cardBorder, borderRadius:"6px", padding:"8px 10px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                  <div style={{ width:"28px", height:"28px", borderRadius:"50%", background:"#e8f5f4", color:"#00a09a", fontWeight:700, display:"grid", placeItems:"center", fontSize:"12px" }}>
                    {(d?.name || "?").slice(0,1)}
                  </div>
                  <div>
                    <div style={{ fontSize:"12px", fontWeight:600 }}>{d?.name||""}</div>
                    <div style={{ fontSize:"11px", color:"#888" }}>{d?.license||""}</div>
                  </div>
                </div>
                <StatusPill s={d?.status}/>
              </div>
            ))}
          </div>
        </Panel>

        {userRole !== "dispatcher" && (
          <Panel title="口座照合が必要な入金" icon={<Icon size={14}><rect x="3" y="5" width="18" height="14" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></Icon>}>
            <RetroTable
              headers={["日付","金額","摘要","状態"]}
              rows={bankTransactions.filter(b=>b?.status==="unmatched").map(b=>[
                b?.date||"",
                <span style={{ color:"#007a74", fontWeight:700 }}>¥{(Number(b?.amount)||0).toLocaleString()}</span>,
                <span style={{ fontSize:"12px" }}>{b?.description||""}</span>,
                <StatusPill s={b?.status}/>
              ])}
            />
        </Panel>
        )}
      </div>
    </div>
  );
};

// ===== OTHER PAGES (simplified) =====
const OrdersPage = ({ data, setData, tenantId, userRole, isMobile }) => {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ customerId:"", deliveryType:"route", deliveryDate:"", pickupTime:"", deliveryTime:"", from:"", to:"", cargo:"", weight:"", amount:"", driverPayAmount:"", notes:"" });
  const [search, setSearch] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [orderEditMode, setOrderEditMode] = useState(false);
  const [showOrderHistory, setShowOrderHistory] = useState(false);
  const [orderDraft, setOrderDraft] = useState(null);
  // 「登録する」ボタンの連打・ダブルクリックで同じ受注が複数件登録されてしまう
  // バグがあったため、登録処理中であることを示すフラグを追加し、
  // 処理が完了するまで再度の登録を受け付けないようにする。
  const isSubmittingRef = useRef(false);

  // 【重要】この useEffect は必ず、下の「if (!data) return」より前で呼ぶ必要がある。
  // React のルールとして、Hook（useEffect等）は毎回のレンダリングで必ず同じ順番・同じ回数
  // 呼ばれなければならない。以前は早期リターンの後にこの useEffect が置かれていたため、
  // データ読み込み中（data が未定義）の描画では useEffect が呼ばれず、データ読み込み後の
  // 描画では呼ばれる、という不整合が発生し、「このページの表示中にエラーが発生しました」
  // という画面クラッシュを引き起こす可能性があった。
  useEffect(() => {
    if (!Array.isArray(data?.orders)) return;
    const todayStr = getTodayLocalStr();
    const hasUpdate = data.orders.some(
      (o) => o?.deliveryDate && o.deliveryDate < todayStr &&
        o?.status !== "delivered" && o?.status !== "cancelled"
    );
    if (!hasUpdate) return;
    setData((d) => {
      const currentOrders = Array.isArray(d?.orders) ? d.orders : [];
      const currentInvoices = Array.isArray(d?.invoices) ? d.invoices : [];
      const currentCustomers = Array.isArray(d?.customers) ? d.customers : [];
      const currentDailyRecords = Array.isArray(d?.dailyRecords) ? d.dailyRecords : [];
      const currentEvents = Array.isArray(d?.events) ? d.events : [];

      // 配達日を過ぎても完了操作されていない受注を自動的に「完了」へ移す。
      // 以前はステータスだけ書き換えて dailyRecords を追加していたが、
      // goNextStatus（手動で「完了」にする操作）と異なり請求書を生成していなかったため、
      // 自動完了された受注は請求書が発行されないまま放置されるバグがあった。
      // ここでは goNextStatus と同じロジック（実績登録＋請求書発行）をまとめて適用する。
      const targetOrders = currentOrders.filter(
        (o) => o?.deliveryDate && o.deliveryDate < todayStr &&
          o?.status !== "delivered" && o?.status !== "cancelled"
      );

      const nextOrders = currentOrders.map((o) =>
        targetOrders.some((t) => t?.id === o?.id) ? { ...o, status: "delivered" } : o
      );

      let nextDailyRecords = currentDailyRecords;
      let nextInvoices = currentInvoices;
      let nextEvents = currentEvents;

      targetOrders.forEach((targetOrder) => {
        const alreadyInSales = nextDailyRecords.some((r) => r?.orderId === targetOrder?.id);
        if (!alreadyInSales) {
          nextDailyRecords = [
            ...nextDailyRecords,
            {
              id: `DR-${Date.now()}-${targetOrder.id}`,
              orderId: targetOrder?.id,
              date: targetOrder?.deliveryDate,
              driverId: targetOrder?.assignedDriverId || targetOrder?.driverId || "",
              customerId: targetOrder?.customerId || "",
              jobTypeId: targetOrder?.jobTypeId || "",
              count: 1,
              distance: targetOrder?.distance || "",
              hours: targetOrder?.hours || "",
              salesAmount: Number(targetOrder?.amount) || 0,
              driverAmount: 0,
              note: `受注 ${targetOrder?.id} より自動連携（配達日経過による自動完了）`,
            },
          ];
        }

        const alreadyHasInvoice = nextInvoices.some((inv) => inv?.orderId === targetOrder?.id && !inv?.deleted);
        if (alreadyHasInvoice) return;

        const customer = currentCustomers.find((c) => c?.id === targetOrder?.customerId);
        // 受注に金額が明示的に入力されている場合（0円も含む）はそれを優先する。
        // 以前は `Number(targetOrder?.amount) || Number(customer?.unitPrice) || 0` だったため、
        // 無償配送など意図的に0円にした受注が、顧客の標準単価で上書きされてしまうバグがあった。
        const baseAmount = targetOrder?.amount !== "" && targetOrder?.amount != null
          ? (Number(targetOrder.amount) || 0)
          : (Number(customer?.unitPrice) || 0);
        const tax = calcTax(baseAmount);
        const issueDate = targetOrder?.deliveryDate || formatDate(new Date());
        const dueDate = calcDueDateByTerms(
          issueDate,
          customer?.closingDay ?? 31,
          customer?.paymentSite || "翌月末払い"
        );
        const nextInvoice = {
          id: generateUniqueBusinessId(nextInvoices, "INV"),
          orderId: targetOrder?.id,
          customerId: targetOrder?.customerId,
          customerName: targetOrder?.customerName || customer?.name || "",
          issueDate,
          dueDate,
          amount: baseAmount,
          tax,
          total: baseAmount + tax,
          status: "unpaid",
          bankRef: "",
          paidDate: null,
          note: "",
        };
        nextInvoices = [nextInvoice, ...nextInvoices];

        const customerName = nextInvoice.customerName;
        const customerId = nextInvoice.customerId;
        const alreadyHasEvent = nextEvents.some((ev) =>
          ev?.type === "payment_due" &&
          ev?.date === dueDate &&
          (ev?.title?.includes(customerName) || ev?.customerId === customerId)
        );
        if (!alreadyHasEvent) {
          nextEvents = [
            ...nextEvents,
            {
              id: `EV-INV${Date.now()}-${targetOrder.id}`,
              date: dueDate,
              type: "payment_due",
              title: `入金期日：${nextInvoice.customerName}`,
              color: "#660099",
              invoiceId: nextInvoice.id,
              customerId,
            },
          ];
        }
      });

      return {
        ...d,
        orders: nextOrders,
        dailyRecords: nextDailyRecords,
        invoices: nextInvoices,
        events: nextEvents,
      };
    });
  }, [data?.orders, setData]);

  if (!data) {
    return (
      <div style={{ border:cardBorder, borderRadius:"6px", background:"#fff", padding:"24px", textAlign:"center", fontSize:"12px", color:"#999" }}>
        読み込み中...
      </div>
    );
  }
  const orders = (Array.isArray(data.orders) ? data.orders : []).filter(o => !o?.deleted);
  const customers = (Array.isArray(data.customers) ? data.customers : []).filter(c => !c?.deleted);
  const filtered = orders.filter((o) => {
    const customerName = o?.customerName || "";
    const id = o?.id || "";
    const cargo = o?.cargo || "";
    return customerName.includes(search) || id.includes(search) || cargo.includes(search);
  });
  const statusNext = { pending:"scheduled", scheduled:"in_transit", in_transit:"delivered" };
  const statusPrev = { delivered:"in_transit", in_transit:"scheduled", scheduled:"pending" };
  const selectedOrder = orders.find((o) => o?.id === selectedOrderId) || null;

  const openOrderDetail = (order) => {
    setSelectedOrderId(order?.id || null);
    setOrderEditMode(false);
    setOrderDraft(order ? { ...order } : null);
  };

  const closeOrderDetail = () => {
    setSelectedOrderId(null);
    setOrderEditMode(false);
    setOrderDraft(null);
    setShowOrderHistory(false);
  };

  const saveOrderDetail = () => {
    if (!orderDraft?.id) return;
    const before = orders.find((o) => o?.id === orderDraft.id);
    logHistoryEntry(setData, { entityType: "order", entityId: orderDraft.id, entityLabel: orderDraft.id, before, userRole });
    setData((d) => ({
      ...d,
      orders: (Array.isArray(d?.orders) ? d.orders : []).map((order) =>
        order?.id === orderDraft.id ? { ...order, ...orderDraft, amount: Number(orderDraft?.amount) || 0, driverPayAmount: orderDraft?.driverPayAmount !== "" && orderDraft?.driverPayAmount != null ? (Number(orderDraft.driverPayAmount) || 0) : null } : order
      ),
    }));
    setOrderEditMode(false);
  };

  const goNextStatus = (orderId, currentStatus) => {
    const next = statusNext[currentStatus];
    if (!next) return;
    if (next === "delivered") {
      const targetOrderForCheck = orders.find((x) => x?.id === orderId);
      // 【重要】配達日が既に締められた月に入っている場合、ここで配送完了に
      // すると、締めたはずの月に新しい実績データが追加されてしまい、
      // 既に確定・送付済みの報酬・請求と食い違ってしまう。
      if (targetOrderForCheck && isMonthClosed(data?.companyInfo, (targetOrderForCheck.deliveryDate || "").slice(0, 7))) {
        window.alert(`配達日（${targetOrderForCheck.deliveryDate}）の月は既に締められています。この状態のまま配送完了にはできません。管理者に月の締めを解除してもらうか、配達日を修正してください。`);
        return;
      }
      // 【重要】配送完了にすると実績データが自動生成され、その時点の
      // ドライバー報酬額がそのまま確定してしまう。未設定のまま進めると
      // 気づかないうちに報酬0円で記録されてしまうため、ここで一度確認する。
      if (targetOrderForCheck && targetOrderForCheck.driverPayAmount == null) {
        const proceed = window.confirm(
          "この受注には「ドライバー報酬額」が設定されていません。\n" +
          "このまま配送完了にすると、実績データに報酬額0円で記録されます。\n\n" +
          "このまま進めますか？（キャンセルして先に報酬額を設定することをおすすめします）"
        );
        if (!proceed) return;
      }
    }
    setData((d) => {
      if (next === "delivered") {
        // 配送完了時の実績・請求書自動生成は、DispatchPage の
        // 「配送完了にする」ボタンと全く同じ結果になるよう、
        // 共通関数 applyOrderDeliveredTransition にまとめている。
        return applyOrderDeliveredTransition(d, orderId);
      }
      const currentOrders = Array.isArray(d?.orders) ? d.orders : [];
      return { ...d, orders: currentOrders.map((x) => (x?.id === orderId ? { ...x, status: next } : x)) };
    });
  };

  const goPrevStatus = (orderId, currentStatus) => {
    const prev = statusPrev[currentStatus];
    if (!prev) return;
    // 【重要】「配送完了」から前の状態に戻しても、既に自動生成された実績データ
    // （売上・報酬額）は自動では削除されない。気づかないまま放置すると、
    // 「まだ完了していない受注」なのに、その分の売上・報酬が計算に
    // 含まれ続けてしまう不整合が起きるため、ここで気づけるようにする。
    if (currentStatus === "delivered") {
      const hasRelatedRecord = orders.find((x) => x?.id === orderId) &&
        (Array.isArray(data?.dailyRecords) ? data.dailyRecords : []).some((r) => r?.orderId === orderId);
      if (hasRelatedRecord) {
        const proceed = window.confirm(
          "この受注は既に「配送完了」時点で実績データ（売上・報酬額）が記録されています。\n" +
          "状態を戻しても、その実績データは自動的には削除されません。\n\n" +
          "本当に前の状態に戻しますか？（必要であれば、あとで売上管理から実績データを直接修正・削除してください）"
        );
        if (!proceed) return;
      }
    }
    setData((d) => ({
      ...d,
      orders: (Array.isArray(d?.orders) ? d.orders : []).map((x) =>
        x?.id === orderId ? { ...x, status: prev } : x
      ),
    }));
  };
  const handleAdd = () => {
    // 処理中に再度呼ばれた場合は何もしない（連打・ダブルクリック対策）。
    if (isSubmittingRef.current) return;
    // 顧客・配達日が未選択のまま登録できてしまうと、後から編集しないと
    // 誰の・いつの配送か分からない空のデータが残ってしまう。
    // 最低限、業務上必須となる項目だけは事前にチェックする。
    if (!form.customerId) {
      window.alert("顧客を選択してください。");
      return;
    }
    if (!form.deliveryDate) {
      window.alert("配達日を入力してください。");
      return;
    }
    isSubmittingRef.current = true;
    try {
      const c = customers.find(x=>x.id===form.customerId);
      const o = { id: generateUniqueBusinessId(orders, "ORD"), customerId:form.customerId, customerName:c?.name||"", deliveryType:form.deliveryType || "route", date:getTodayLocalStr(), deliveryDate:form.deliveryDate, pickupTime:form.pickupTime || "", deliveryTime:form.deliveryTime || "", from:form.from, to:form.to, cargo:form.cargo, weight:form.weight, status:"pending", driverId:null, vehicleId:null, amount:parseInt(form.amount)||0, driverPayAmount: form.driverPayAmount !== "" && form.driverPayAmount != null ? (parseInt(form.driverPayAmount, 10) || 0) : null, notes:form.notes };
      setData(d=>({ ...d, orders:[o,...(Array.isArray(d?.orders) ? d.orders : [])], events:[...(Array.isArray(d?.events) ? d.events : []),{id:`EV-O${Date.now()}`,date:form.deliveryDate,type:"delivery",title:`${o.id} 配達予定 ${c?.name||""}`,color:"#0000cc"}] }));
      setShowModal(false); setForm({ customerId:"", deliveryType:"route", deliveryDate:"", pickupTime:"", deliveryTime:"", from:"", to:"", cargo:"", weight:"", amount:"", driverPayAmount:"", notes:"" });
    } finally {
      // モーダルを閉じた後、次に開いたときは新規の登録操作として扱えるよう
      // フラグを必ず解除する。
      isSubmittingRef.current = false;
    }
  };
  const plusIcon = <Icon size={14}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></Icon>;
  const nextIcon = <Icon size={12}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12,5 19,12 12,19"/></Icon>;
  const prevIcon = <Icon size={12}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12,5 5,12 12,19"/></Icon>;
  const orderIcon = <Icon size={14}><rect x="4" y="3" width="16" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/></Icon>;
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
      <div style={{ display:"flex", gap:"10px", alignItems:"center", flexWrap:"wrap" }}>
        <RetroBtn onClick={()=>setShowModal(true)} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>{plusIcon}新規受注</RetroBtn>
        <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
          <span style={{ fontSize:"12px", color:"#666", fontWeight:600 }}>検索</span>
          <RetroInput value={search} onChange={e=>setSearch(e.target.value)} style={{ width:"240px", border:"1px solid #d0d0d0", borderRadius:"3px", background:"#fff" }}/>
        </div>
      </div>
      <div style={{ border:`1px solid ${UI.border}`, borderRadius:"6px", background:"#fff", overflow:"auto", maxHeight: isMobile ? "60vh" : "calc(100vh - 260px)" }}>
        <table style={{ minWidth:"100%", width:"max-content", borderCollapse:"collapse", fontFamily:"'Noto Sans JP', sans-serif", fontSize:"12px" }}>
          <thead>
            <tr style={{ background:"#fafbfc", position:"sticky", top:0 }}>
              {["ID","顧客","荷物","配達日","金額","状態","操作"].map((h)=><th key={h} style={{ color:"#666", fontSize:"11px", padding:"8px 10px", textAlign:"left", fontWeight:700, whiteSpace:"nowrap", borderBottom:cardBorder }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.map((o, index) => (
              <tr key={o?.id || `order-${index}`} onClick={() => openOrderDetail(o)} style={{ background:"#fff", borderBottom:"1px solid #f0f0f0", cursor:"pointer" }}
                onMouseEnter={e=>e.currentTarget.style.background="#f9fcfc"}
                onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
                <td style={{ padding:"8px 10px" }}><span style={{ color:"#007a74", fontWeight:700 }}>{o?.id||"—"}</span></td>
                <td style={{ padding:"8px 10px" }}>{o?.customerName||""}</td>
                <td style={{ padding:"8px 10px" }}>{o?.cargo||""}{o?.weight ? `（${o.weight}）` : ""}</td>
                <td style={{ padding:"8px 10px" }}>{o?.deliveryDate||""}</td>
                <td style={{ padding:"8px 10px" }}>¥{(Number(o?.amount)||0).toLocaleString()}</td>
                <td style={{ padding:"8px 10px" }}><StatusPill s={o?.status}/></td>
                <td style={{ padding:"8px 10px", whiteSpace:"nowrap" }}>
                  <div style={{ display:"flex", gap:"4px" }}>
                    {statusPrev[o?.status] && (
                      <RetroBtn small onClick={(e)=>{ e.stopPropagation(); goPrevStatus(o?.id, o?.status); }} style={{ background:"#fff", color:"#00a09a", borderColor:"#00a09a" }}>{prevIcon}戻る</RetroBtn>
                    )}
                    {statusNext[o?.status] && (
                      <RetroBtn small onClick={(e)=>{ e.stopPropagation(); goNextStatus(o?.id, o?.status); }} style={{ background:"#fff", color:"#00a09a", borderColor:"#00a09a" }}>次へ{nextIcon}</RetroBtn>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length===0&&<tr><td colSpan={7} style={{ padding:"16px", textAlign:"center", color:"#999" }}>データなし</td></tr>}
          </tbody>
        </table>
      </div>
      {showModal&&<Modal title="新規受注登録" icon={orderIcon} onClose={()=>setShowModal(false)}>
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap:"6px 12px" }}>
          <Fl label="顧客"><RetroSelect value={form.customerId} onChange={e=>{
            const selectedCustomer = customers.find((c) => c?.id === e.target.value);
            setForm(f=>({
              ...f,
              customerId:e.target.value,
              amount: selectedCustomer?.unitPrice != null ? String(selectedCustomer.unitPrice) : "0",
            }));
          }}><option value="">選択</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</RetroSelect></Fl>
          <Fl label="配達日"><RetroInput type="date" value={form.deliveryDate} onChange={e=>setForm(f=>({...f,deliveryDate:e.target.value}))}/></Fl>
          <Fl label="配送種別">
            <RetroSelect value={form.deliveryType} onChange={e=>setForm(f=>({...f,deliveryType:e.target.value}))}>
              <option value="route">ルート配送</option>
              <option value="charter">チャーター便</option>
              <option value="spot">スポット</option>
            </RetroSelect>
          </Fl>
        </div>
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"6px 12px" }}>
          <Fl label="集荷時間">
            <input
              type="time"
              value={form.pickupTime}
              onChange={e => setForm(f => ({ ...f, pickupTime: e.target.value }))}
              style={{ width:"100%", padding:"6px", border:"1px solid #ddd", borderRadius:"4px" }}
            />
          </Fl>
          <Fl label="配達時間">
            <input
              type="time"
              value={form.deliveryTime}
              onChange={e => setForm(f => ({ ...f, deliveryTime: e.target.value }))}
              style={{ width:"100%", padding:"6px", border:"1px solid #ddd", borderRadius:"4px" }}
            />
          </Fl>
        </div>
        <Fl label="出発地"><RetroInput value={form.from} onChange={e=>setForm(f=>({...f,from:e.target.value}))}/></Fl>
        <Fl label="配送先"><RetroInput value={form.to} onChange={e=>setForm(f=>({...f,to:e.target.value}))}/></Fl>
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap:"6px 12px" }}>
          <Fl label="荷物名"><RetroInput value={form.cargo} onChange={e=>setForm(f=>({...f,cargo:e.target.value}))}/></Fl>
          <Fl label="重量"><RetroInput value={form.weight} onChange={e=>setForm(f=>({...f,weight:e.target.value}))}/></Fl>
          <Fl label="金額（円）"><RetroInput type="number" min="0" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))}/></Fl>
        </div>
        {userRole !== "dispatcher" && (
          <Fl label="ドライバー報酬額（業務委託の支払額）">
            <RetroInput type="number" min="0" value={form.driverPayAmount} onChange={e=>setForm(f=>({...f,driverPayAmount:e.target.value}))} placeholder="未設定の場合、配送完了時に報酬額0円で記録されます"/>
          </Fl>
        )}
        <Fl label="備考"><RetroTextarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></Fl>
        <div style={{ display:"flex", justifyContent:"flex-end", gap:"6px", marginTop:"8px" }}>
          <RetroBtn onClick={()=>setShowModal(false)}>キャンセル</RetroBtn>
          <RetroBtn onClick={handleAdd} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>登録する</RetroBtn>
        </div>
      </Modal>}
      {selectedOrder && (
        <Modal title={`受注詳細 ${selectedOrder?.id || ""}`} icon={orderIcon} onClose={closeOrderDetail} width={520}>
          {orderEditMode ? (
            <>
              <Fl label="顧客">
                <RetroSelect value={orderDraft?.customerId || ""} onChange={(e)=>{
                  const customer = customers.find((c)=>c?.id===e.target.value);
                  setOrderDraft((prev)=>({ ...(prev||{}), customerId:e.target.value, customerName:customer?.name||"" }));
                }}>
                  <option value="">選択</option>
                  {customers.map((c)=><option key={c?.id||`customer-${Math.random()}`} value={c?.id||""}>{c?.name||""}</option>)}
                </RetroSelect>
              </Fl>
              <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"6px 12px" }}>
                <Fl label="配達日"><RetroInput type="date" value={orderDraft?.deliveryDate || ""} onChange={(e)=>setOrderDraft((prev)=>({ ...(prev||{}), deliveryDate:e.target.value }))}/></Fl>
                <Fl label="配送種別">
                  <RetroSelect value={orderDraft?.deliveryType || "route"} onChange={(e)=>setOrderDraft((prev)=>({ ...(prev||{}), deliveryType:e.target.value }))}>
                    <option value="route">ルート配送</option>
                    <option value="charter">チャーター便</option>
                    <option value="spot">スポット</option>
                  </RetroSelect>
                </Fl>
                <Fl label="状態">
                  <RetroSelect value={orderDraft?.status || "pending"} onChange={(e)=>setOrderDraft((prev)=>({ ...(prev||{}), status:e.target.value }))}>
                    <option value="pending">未配車</option>
                    <option value="scheduled">配車済</option>
                    <option value="in_transit">配送中</option>
                    <option value="delivered">完了</option>
                  </RetroSelect>
                </Fl>
              </div>
              <Fl label="出発地"><RetroInput value={orderDraft?.from || ""} onChange={(e)=>setOrderDraft((prev)=>({ ...(prev||{}), from:e.target.value }))}/></Fl>
              <Fl label="配送先"><RetroInput value={orderDraft?.to || ""} onChange={(e)=>setOrderDraft((prev)=>({ ...(prev||{}), to:e.target.value }))}/></Fl>
              <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap:"6px 12px" }}>
                <Fl label="荷物"><RetroInput value={orderDraft?.cargo || ""} onChange={(e)=>setOrderDraft((prev)=>({ ...(prev||{}), cargo:e.target.value }))}/></Fl>
                <Fl label="重量"><RetroInput value={orderDraft?.weight || ""} onChange={(e)=>setOrderDraft((prev)=>({ ...(prev||{}), weight:e.target.value }))}/></Fl>
                <Fl label="金額"><RetroInput type="number" min="0" value={orderDraft?.amount ?? ""} onChange={(e)=>setOrderDraft((prev)=>({ ...(prev||{}), amount:e.target.value }))}/></Fl>
                {userRole !== "dispatcher" && (
                  <Fl label="ドライバー報酬額（業務委託の支払額）">
                    <RetroInput type="number" min="0" value={orderDraft?.driverPayAmount ?? ""} onChange={(e)=>setOrderDraft((prev)=>({ ...(prev||{}), driverPayAmount:e.target.value }))} placeholder="未設定の場合、配送完了時に報酬額0円で記録されます"/>
                  </Fl>
                )}
              </div>
              <Fl label="備考"><RetroTextarea value={orderDraft?.notes || ""} onChange={(e)=>setOrderDraft((prev)=>({ ...(prev||{}), notes:e.target.value }))}/></Fl>
              <div style={{ display:"flex", justifyContent:"flex-end", gap:"6px", marginTop:"8px" }}>
                <RetroBtn onClick={()=>{ setOrderEditMode(false); setOrderDraft(selectedOrder ? { ...selectedOrder } : null); }}>キャンセル</RetroBtn>
                <RetroBtn onClick={saveOrderDetail} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>保存</RetroBtn>
              </div>
            </>
          ) : (
            <>
              <Panel>
                <div style={{ display:"grid", gridTemplateColumns:"120px 1fr", rowGap:"6px", columnGap:"8px", fontSize:"12px", color:"#333" }}>
                  <div>顧客</div><div>{selectedOrder?.customerName || ""}</div>
                  <div>配送種別</div><div>{DELIVERY_TYPE_LABEL[selectedOrder?.deliveryType] || "ルート配送"}</div>
                  <div>配達日</div><div>{selectedOrder?.deliveryDate || ""}</div>
                  <div>出発地</div><div>{selectedOrder?.from || ""}</div>
                  <div>配送先</div><div>{selectedOrder?.to || ""}</div>
                  <div>荷物</div><div>{selectedOrder?.cargo || ""}</div>
                  <div>重量</div><div>{selectedOrder?.weight || ""}</div>
                  <div>金額</div><div>¥{(Number(selectedOrder?.amount)||0).toLocaleString()}</div>
                  {userRole !== "dispatcher" && (
                    <Fragment>
                      <div>ドライバー報酬額</div>
                      <div>
                        {selectedOrder?.driverPayAmount != null
                          ? `¥${Number(selectedOrder.driverPayAmount).toLocaleString()}`
                          : <span style={{ color:"#e65100", fontWeight:700 }}>未設定（配送完了時に0円で記録されます）</span>}
                      </div>
                    </Fragment>
                  )}
                  <div>備考</div><div>{selectedOrder?.notes || "—"}</div>
                  <div>状態</div><div><StatusPill s={selectedOrder?.status}/></div>
                  <div>請求状況</div>
                  <div>
                    {selectedOrder?.invoicedInvoiceId
                      ? <span style={{ color:"#2e7d32", fontWeight:700 }}>請求書発行済み（{selectedOrder.invoicedInvoiceId}）</span>
                      : selectedOrder?.status === "delivered"
                        ? <span style={{ color:"#e65100" }}>未請求（月次一括発行、または下のボタンで個別発行できます）</span>
                        : <span style={{ color:"#999" }}>—（配送完了後に請求対象になります）</span>}
                  </div>
                </div>
              </Panel>
              {selectedOrder?.status === "delivered" && !selectedOrder?.invoicedInvoiceId && (
                <div style={{ marginTop:"8px" }}>
                  <RetroBtn small onClick={()=>{
                    // 通常は締め日にあわせた月次一括発行を使うが、
                    // 急ぎで今すぐ1件だけ発行したいという実務上のニーズもあるため、
                    // 個別発行の手段も残しておく。
                    if (!window.confirm(`${selectedOrder?.id} の請求書を今すぐ個別に発行しますか？（通常は月次一括発行をおすすめします）`)) return;
                    setData((d) => {
                      const currentInvoices = Array.isArray(d?.invoices) ? d.invoices : [];
                      const currentCustomers = Array.isArray(d?.customers) ? d.customers : [];
                      const targetOrder = (Array.isArray(d?.orders) ? d.orders : []).find((x) => x?.id === selectedOrder?.id);
                      if (!targetOrder) return d;
                      // 【重要】この画面を開いたまま時間が経つと、別の職員が別のタブで
                      // 月次一括発行を実行し、その間にこの受注が既に請求済みに
                      // なっている可能性がある。setData の中で最新の状態を必ず
                      // 確認し、既に請求済みなら二重発行せず知らせるだけにする。
                      if (targetOrder.invoicedInvoiceId) {
                        window.alert(`この受注は既に請求書（${targetOrder.invoicedInvoiceId}）が発行済みのため、重複して発行しませんでした。画面を更新してご確認ください。`);
                        return d;
                      }
                      const customer = currentCustomers.find((c) => c?.id === targetOrder?.customerId);
                      const baseAmount = Number(targetOrder?.amount) || 0;
                      const tax = calcTax(baseAmount);
                      const issueDate = targetOrder?.deliveryDate || formatDate(new Date());
                      const dueDate = calcDueDateByTerms(issueDate, customer?.closingDay ?? 31, customer?.paymentSite || "翌月末払い");
                      const invoiceId = generateUniqueBusinessId(currentInvoices, "INV");
                      const nextInvoice = {
                        id: invoiceId, orderId: targetOrder?.id, customerId: targetOrder?.customerId,
                        customerName: targetOrder?.customerName || customer?.name || "",
                        issueDate, dueDate, amount: baseAmount, tax, total: baseAmount + tax,
                        status: "unpaid", bankRef: "", paidDate: null, note: "個別発行",
                      };
                      return {
                        ...d,
                        invoices: [nextInvoice, ...currentInvoices],
                        orders: (Array.isArray(d?.orders) ? d.orders : []).map((o) => o?.id === targetOrder?.id ? { ...o, invoicedInvoiceId: invoiceId } : o),
                      };
                    });
                  }} style={{ background:"#fff", color:"#00a09a", borderColor:"#00a09a" }}>
                    この受注だけ個別に請求書発行する
                  </RetroBtn>
                </div>
              )}
              <div style={{ marginTop:"8px" }}>
                <button onClick={()=>setShowOrderHistory(v=>!v)} style={{
                  border:"none", background:"none", color:"#00a09a", fontSize:"12px", fontWeight:700, cursor:"pointer", padding:"4px 0",
                }}>
                  {showOrderHistory ? "▲ 変更履歴を閉じる" : "▼ 変更履歴を見る"}
                </button>
                {showOrderHistory && (
                  <HistoryPanel
                    data={data}
                    entityType="order"
                    entityId={selectedOrder?.id}
                    hideKeys={userRole === "dispatcher" ? ["driverPayAmount"] : []}
                    labelMap={{
                      customerName:"顧客", deliveryType:"配送種別", deliveryDate:"配達日",
                      from:"出発地", to:"配送先", cargo:"荷物", weight:"重量",
                      amount:"金額", notes:"備考", status:"状態", driverId:"担当ドライバー",
                    }}
                  />
                )}
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", gap:"6px", marginTop:"8px" }}>
                <RetroBtn onClick={()=>{
                  // 顧客・ドライバー・車両の削除と同様に、この受注に紐づく請求書が
                  // すでに発行されている場合は、削除前にユーザーへ伝える。
                  // 受注を削除しても発行済みの請求書はそのまま残る仕様（会計記録として
                  // 正しい）だが、それを知らずに削除すると「受注だけ消えて
                  // 請求書だけが取り残された」状態に気づきにくい。
                  //
                  // 【重要】月次一括発行の請求書は、個別のorderIdではなく
                  // lineItems（明細）で複数の受注をまとめて参照する形式のため、
                  // orderIdだけを見ていると一括請求済みの受注を検知できない。
                  // 受注自身が持つ invoicedInvoiceId も必ずあわせて確認する。
                  const relatedInvoices = (Array.isArray(data?.invoices) ? data.invoices : []).filter((inv) => {
                    const p = inv?.payload != null && typeof inv.payload === "object" ? inv.payload : inv;
                    if (p?.deleted || inv?.deleted) return false;
                    const invId = p?.id ?? inv?.id;
                    const matchesDirectOrderId = (p?.orderId ?? inv?.orderId) === selectedOrder?.id;
                    const matchesBatchInvoice = selectedOrder?.invoicedInvoiceId && invId === selectedOrder.invoicedInvoiceId;
                    return matchesDirectOrderId || matchesBatchInvoice;
                  });
                  const confirmMessage = relatedInvoices.length > 0
                    ? `この受注には既に発行済みの請求書（${relatedInvoices.map(i => (i?.payload||i)?.id || i?.id).join("、")}）があります。受注を削除しても請求書はそのまま残ります。本当に削除しますか？（後から復元できます）`
                    : "この受注を削除しますか？（後から復元できます）";
                  if(!window.confirm(confirmMessage)) return;
                  setData(d=>({...d, orders:(Array.isArray(d?.orders)?d.orders:[]).map(o=>o?.id===selectedOrder?.id?{...o,deleted:true}:o)})); closeOrderDetail();
                }} style={{ background:"#fff", color:"#e63946", borderColor:"#e63946" }}>削除</RetroBtn>
                {/* 「編集」は最も使う頻度が高い操作のため、すぐ隣に破壊的な「削除」が
                    あると押し間違えるリスクがある。「削除」を左側に独立させ、
                    「閉じる」「編集」は右側にまとめる。 */}
                <div style={{ display:"flex", gap:"6px" }}>
                  <RetroBtn onClick={closeOrderDetail}>閉じる</RetroBtn>
                  <RetroBtn onClick={()=>{ setOrderDraft(selectedOrder ? { ...selectedOrder } : null); setOrderEditMode(true); }} style={{ background:"#fff", color:"#00a09a", borderColor:"#00a09a" }}>編集</RetroBtn>
                </div>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
};

const DispatchPage = ({ data, setData, tenantId, userRole, isMobile }) => {
  const orders = (Array.isArray(data?.orders) ? data.orders : []).filter(o => !o?.deleted);
  const drivers = (Array.isArray(data?.drivers) ? data.drivers : []).filter(d => !d?.deleted);
  const vehicles = (Array.isArray(data?.vehicles) ? data.vehicles : []).filter(v => !v?.deleted);
  const [sel, setSel] = useState(null);
  const [aD, setAD] = useState(""); const [aV, setAV] = useState(""); const [aPay, setAPay] = useState("");
  // 配車済みの受注を選んで、ドライバー・車両を変更したり配車自体を取り消せるようにする。
  // 以前は配車を確定すると配車管理ページから二度と変更できなかったため、
  // 「担当ドライバーが急に休んだので別の人に変更したい」という
  // よくある現場のケースに対応できていなかった。
  const [reassignId, setReassignId] = useState(null);
  const [rD, setRD] = useState(""); const [rV, setRV] = useState(""); const [rPay, setRPay] = useState("");
  const pending = orders.filter(o=>o?.status==="pending");
  const scheduled = orders.filter(o=>o?.status==="scheduled");
  const doAssign = () => {
    if(!sel||!aD||!aV) return;
    setData(d=>({...d,orders:(Array.isArray(d?.orders) ? d.orders : []).map(o=>o?.id===sel?{...o,driverId:aD,vehicleId:aV,status:"scheduled",
      // 配車確定時にドライバー報酬額を入力していれば、ここで受注に反映する。
      // 未入力ならこの受注が元々持っていた値（未設定なら未設定のまま）を維持する。
      ...(aPay !== "" ? { driverPayAmount: parseInt(aPay, 10) || 0 } : {})
    }:o)}));
    setSel(null); setAD(""); setAV(""); setAPay("");
  };
  const openReassign = (order) => {
    setReassignId(order?.id === reassignId ? null : order?.id);
    setRD(order?.driverId || "");
    setRV(order?.vehicleId || "");
    setRPay(order?.driverPayAmount != null ? String(order.driverPayAmount) : "");
  };
  const doReassign = () => {
    if (!reassignId || !rD || !rV) return;
    setData(d=>({...d,orders:(Array.isArray(d?.orders) ? d.orders : []).map(o=>o?.id===reassignId?{...o,driverId:rD,vehicleId:rV,
      ...(rPay !== "" ? { driverPayAmount: parseInt(rPay, 10) || 0 } : {})
    }:o)}));
    setReassignId(null); setRD(""); setRV(""); setRPay("");
  };
  const cancelAssignment = () => {
    if (!reassignId) return;
    if (!window.confirm("この受注の配車を取り消して「未配車」に戻しますか？")) return;
    setData(d=>({...d,orders:(Array.isArray(d?.orders) ? d.orders : []).map(o=>o?.id===reassignId?{...o,driverId:null,vehicleId:null,status:"pending"}:o)}));
    setReassignId(null); setRD(""); setRV("");
  };
  // 配車確定した受注を、その場で「配送完了」にする。OrdersPage の「次へ」ボタンと
  // 全く同じ結果になるよう、共通関数 applyOrderDeliveredTransition を使う。
  const completeDelivery = (orderId) => {
    if (!orderId) return;
    const target = orders.find((x) => x?.id === orderId);
    if (!target) return;
    // OrdersPage の goNextStatus と同じ理由で、締め済みの月には
    // 新しい実績データを追加させない。
    if (isMonthClosed(data?.companyInfo, (target.deliveryDate || "").slice(0, 7))) {
      window.alert(`配達日（${target.deliveryDate}）の月は既に締められています。この状態のまま配送完了にはできません。管理者に月の締めを解除してもらうか、配達日を修正してください。`);
      return;
    }
    if (target.driverPayAmount == null) {
      const proceed = window.confirm(
        "この受注には「ドライバー報酬額」が設定されていません。\n" +
        "このまま配送完了にすると、実績データに報酬額0円で記録されます。\n\n" +
        "このまま進めますか？（キャンセルして先に報酬額を設定することをおすすめします）"
      );
      if (!proceed) return;
    }
    setData((d) => applyOrderDeliveredTransition(d, orderId));
    setReassignId(null); setRD(""); setRV(""); setRPay("");
  };
  const warnIcon = <Icon size={14}><path d="M12 3 2.5 20h19L12 3z"/><line x1="12" y1="9" x2="12" y2="14"/><line x1="12" y1="17" x2="12" y2="17"/></Icon>;
  const truckIcon = <Icon size={14}><rect x="2" y="8" width="15" height="8"/><path d="M17 10h3l2 3v3h-5"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></Icon>;
  const userIcon = <Icon size={12}><circle cx="12" cy="8" r="3"/><path d="M5 20c1.4-3 4-4.5 7-4.5s5.6 1.5 7 4.5"/></Icon>;
  const checkIcon = <Icon size={12}><polyline points="4,12 9,17 20,6"/></Icon>;
  return (
    <div style={{ display:"flex", gap:"12px", flexWrap:"wrap" }}>
      <div style={{ flex:1 }}>
        <Panel title={`未配車（${pending.length}件）`} icon={warnIcon}>
          {pending.map(o=>(
            <div key={o?.id||`pending-${Math.random()}`} onClick={()=>{ const nextSel = o?.id===sel?null:o?.id; setSel(nextSel); setAPay(nextSel ? (o?.driverPayAmount != null ? String(o.driverPayAmount) : "") : ""); }} style={{ border:cardBorder, background:sel===o?.id?"#e8f5f4":"#fff", padding:"8px 10px", marginBottom:"6px", cursor:"pointer", borderRadius:"6px" }}>
              <div style={{ fontSize:"12px", fontWeight:700, color:"#007a74" }}>{o?.id||"—"} — {o?.customerName||""}</div>
              <div style={{ fontSize:"12px", color:"#666" }}>{o?.cargo||""}{o?.weight ? `（${o.weight}）` : ""}配達日：{o?.deliveryDate||""}</div>
            </div>
          ))}
        </Panel>
        {sel&&<Panel title="配車アサイン" icon={truckIcon} style={{ marginTop:"10px" }}>
          <Fl label="ドライバー"><RetroSelect value={aD} onChange={e=>setAD(e.target.value)}><option value="">選択</option>{drivers.filter(d=>d?.status==="available").map(d=>{
            // 契約終了日を過ぎているドライバーは、これまで配車選択肢から
            // 区別なく選べてしまい、契約満了に気づかず誤って新しい配送を
            // 割り当ててしまうリスクがあった。選択肢のラベルに警告を付けて
            // 気づきやすくする（選択自体は禁止せず、現場の柔軟性は残す）。
            const isContractEnded = d?.contractEnd && d.contractEnd < getTodayLocalStr();
            return <option key={d?.id||`driver-${Math.random()}`} value={d?.id||""}>{isContractEnded ? "⚠契約終了済み " : ""}{d?.name||""}（{d?.license||""}）</option>;
          })}</RetroSelect></Fl>
          <Fl label="車両"><RetroSelect value={aV} onChange={e=>setAV(e.target.value)}><option value="">選択</option>{vehicles.filter(v=>v?.status==="available").map(v=>{
            // ドライバーの契約終了日と同様、車検・任意保険の期限が切れている車両も
            // これまで警告なく選択肢に表示されてしまっていた。車検切れの車両を
            // 公道で使用するのは法令違反でもあるため、特に重要な警告として表示する。
            const today = getTodayLocalStr();
            const isInspectionExpired = v?.nextInspection && v.nextInspection < today;
            const isInsuranceExpired = v?.insuranceExpiry && v.insuranceExpiry < today;
            const warning = isInspectionExpired ? "⚠車検切れ " : (isInsuranceExpired ? "⚠保険切れ " : "");
            return <option key={v?.id||`vehicle-${Math.random()}`} value={v?.id||""}>{warning}{v?.plate||""}</option>;
          })}</RetroSelect></Fl>
          {userRole !== "dispatcher" && (
            <Fl label="ドライバー報酬額（業務委託の支払額）">
              <RetroInput type="number" min="0" value={aPay} onChange={e=>setAPay(e.target.value)} placeholder="未設定の場合、配送完了時に報酬額0円で記録されます"/>
            </Fl>
          )}
          <RetroBtn onClick={doAssign} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>{truckIcon}配車確定</RetroBtn>
        </Panel>}
      </div>
      <div style={{ flex:1 }}>
        <Panel title={`配車済（${scheduled.length}件）`} icon={checkIcon}>
          {scheduled.map(o=>{
            const dr=drivers.find(d=>d?.id===o?.driverId); const vh=vehicles.find(v=>v?.id===o?.vehicleId);
            return (
              <div key={o?.id||`scheduled-${Math.random()}`}>
                <div onClick={()=>openReassign(o)} style={{ border:cardBorder, background:reassignId===o?.id?"#e8f5f4":"#fff", padding:"8px 10px", marginBottom:"6px", borderRadius:"6px", cursor:"pointer" }}>
                  <div style={{ fontSize:"12px", fontWeight:700, color:"#007a74" }}>{o?.id||"—"} — {o?.customerName||""}</div>
                  <div style={{ display:"flex", gap:"6px", marginTop:"3px" }}>
                    {dr&&<span style={{ background:"#e3f2fd", color:"#1565c0", fontSize:"10px", padding:"2px 8px", borderRadius:"999px", display:"inline-flex", alignItems:"center", gap:"4px" }}>{userIcon}{dr?.name||""}</span>}
                    {/* ドライバーIDは設定されているのに該当するドライバーが見つからない
                        （削除された）場合、表示自体が消えてしまうと「誰が担当する予定
                        だったか」が完全に分からなくなる。せめて「削除済み」と分かる
                        表示を出し、配車を見直す必要があることに気づけるようにする。 */}
                    {!dr && o?.driverId && <span style={{ background:"#fff3e0", color:"#e65100", fontSize:"10px", padding:"2px 8px", borderRadius:"999px", display:"inline-flex", alignItems:"center", gap:"4px" }}>{userIcon}担当ドライバー削除済み</span>}
                    {vh&&<span style={{ background:"#e8f5e9", color:"#2e7d32", fontSize:"10px", padding:"2px 8px", borderRadius:"999px", display:"inline-flex", alignItems:"center", gap:"4px" }}>{truckIcon}{vh?.plate||""}</span>}
                    {!vh && o?.vehicleId && <span style={{ background:"#fff3e0", color:"#e65100", fontSize:"10px", padding:"2px 8px", borderRadius:"999px", display:"inline-flex", alignItems:"center", gap:"4px" }}>{truckIcon}使用車両削除済み</span>}
                    {/* 報酬額が未設定のまま配送完了させると実績が0円で記録されてしまうため、
                        配車済み一覧の時点で気づけるよう、ここでも警告バッジを出す。 */}
                    {userRole !== "dispatcher" && o?.driverPayAmount == null && <span style={{ background:"#ffebee", color:"#c62828", fontSize:"10px", padding:"2px 8px", borderRadius:"999px", display:"inline-flex", alignItems:"center", gap:"4px" }}>{warnIcon}報酬額未設定</span>}
                  </div>
                </div>
                {reassignId===o?.id && (
                  <Panel title="配車変更" icon={truckIcon} style={{ marginBottom:"10px" }}>
                    <Fl label="ドライバー">
                      <RetroSelect value={rD} onChange={e=>setRD(e.target.value)}>
                        <option value="">選択</option>
                        {/* 現在アサイン中のドライバー自身も選べるよう、available限定にしない（他の受注の都合で待機中になっていない場合もあるため） */}
                        {drivers.filter(d=>d?.status==="available" || d?.id===o?.driverId).map(d=>{
                          const isContractEnded = d?.contractEnd && d.contractEnd < getTodayLocalStr();
                          return <option key={d?.id} value={d?.id}>{isContractEnded ? "⚠契約終了済み " : ""}{d?.name||""}（{d?.license||""}）</option>;
                        })}
                      </RetroSelect>
                    </Fl>
                    <Fl label="車両">
                      <RetroSelect value={rV} onChange={e=>setRV(e.target.value)}>
                        <option value="">選択</option>
                        {vehicles.filter(v=>v?.status==="available" || v?.id===o?.vehicleId).map(v=>{
                          const today = getTodayLocalStr();
                          const isInspectionExpired = v?.nextInspection && v.nextInspection < today;
                          const isInsuranceExpired = v?.insuranceExpiry && v.insuranceExpiry < today;
                          const warning = isInspectionExpired ? "⚠車検切れ " : (isInsuranceExpired ? "⚠保険切れ " : "");
                          return <option key={v?.id} value={v?.id}>{warning}{v?.plate||""}</option>;
                        })}
                      </RetroSelect>
                    </Fl>
                    {userRole !== "dispatcher" && (
                      <Fl label="ドライバー報酬額（業務委託の支払額）">
                        <RetroInput type="number" min="0" value={rPay} onChange={e=>setRPay(e.target.value)} placeholder="未設定の場合、配送完了時に報酬額0円で記録されます"/>
                      </Fl>
                    )}
                    <div style={{ display:"flex", gap:"6px", flexWrap:"wrap" }}>
                      <RetroBtn onClick={doReassign} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>{truckIcon}変更を保存</RetroBtn>
                      {/* 以前はここに完了操作が無く、配車したままの受注を完了にするには
                          わざわざ受注管理ページまで移動する必要があった。
                          配車を確認しているこの場で、そのまま完了にできるようにする。
                          （予定時間になっても自動では完了にならない。到着が予定より
                          早い・遅いはよくあるため、あくまで手動確定とする。） */}
                      <RetroBtn onClick={()=>completeDelivery(reassignId)} style={{ background:"#fff", color:"#00a09a", borderColor:"#00a09a" }}>{checkIcon}配送完了にする</RetroBtn>
                      <RetroBtn onClick={cancelAssignment} style={{ background:"#fff", color:"#e63946", borderColor:"#e63946" }}>配車を取り消す</RetroBtn>
                    </div>
                  </Panel>
                )}
              </div>
            );
          })}
        </Panel>
      </div>
    </div>
  );
};

const CustomersPage = ({ data, setData, tenantId, userRole, isMobile }) => {
  const customers = (Array.isArray(data?.customers) ? data.customers : []).filter(c => !c?.deleted);
  const orders = (Array.isArray(data?.orders) ? data.orders : []).filter(o => !o?.deleted);
  // 顧客数が増えると一覧から目的の会社を探すのが難しくなるため、
  // 受注管理ページと同じ仕組みで検索機能を追加する（以前は検索手段が一切なかった）。
  const [search, setSearch] = useState("");
  const filteredCustomers = customers.filter((c) => {
    const name = c?.name || "";
    const id = c?.id || "";
    const contact = c?.contact || "";
    const phone = c?.phone || "";
    return name.includes(search) || id.includes(search) || contact.includes(search) || phone.includes(search);
  });
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name:"", contact:"", phone:"", email:"", payer_kana:"", address:"", notes:"", unitPrice:"", closingDay:31, paymentSite:"翌月末払い" });
  const [isAddPayerKanaComposing, setIsAddPayerKanaComposing] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [customerEditMode, setCustomerEditMode] = useState(false);
  const [showCustomerHistory, setShowCustomerHistory] = useState(false);
  const [customerDraft, setCustomerDraft] = useState(null);
  const [isEditPayerKanaComposing, setIsEditPayerKanaComposing] = useState(false);
  const selectedCustomer = customers.find((c) => c?.id === selectedCustomerId) || null;
  const formatClosingDay = (closingDay) => {
    if (closingDay === 31 || Number(closingDay) === 31) return "月末";
    const dayNum = Number(closingDay);
    if (Number.isFinite(dayNum) && dayNum > 0) return `${dayNum}日`;
    return "未設定";
  };
  const formatPaymentSite = (paymentSite) => (paymentSite ? paymentSite : "未設定");

  const add = () => {
    // 会社名が空のまま登録できてしまうと、誰の顧客データか分からない
    // 空のレコードが作られてしまうため、最低限の必須チェックを行う。
    if (!form.name || !form.name.trim()) {
      window.alert("会社名を入力してください。");
      return;
    }
    setData(d=>{
      const currentCustomers = Array.isArray(d?.customers) ? d.customers : [];
      // 以前は `C${customers.length+1}` という配列長ベースのID生成だったため、
      // 削除済みデータの扱いが将来変わった場合などにIDが重複するリスクがあった。
      // 他のマスタ（受注・請求書等）と同じ generateUniqueBusinessId に統一する。
      return { ...d, customers: [...currentCustomers, { id: generateUniqueBusinessId(currentCustomers, "C", ""), ...form, unitPrice:Number(form.unitPrice)||0, closingDay:Number(form.closingDay)||31 }] };
    });
    setShowModal(false);
    setForm({name:"",contact:"",phone:"",email:"",payer_kana:"",address:"",notes:"",unitPrice:"",closingDay:31,paymentSite:"翌月末払い"});
  };

  const openCustomerDetail = (customer) => {
    setSelectedCustomerId(customer?.id || null);
    setCustomerEditMode(false);
    setCustomerDraft(customer ? { ...customer } : null);
  };

  const closeCustomerDetail = () => {
    setSelectedCustomerId(null);
    setCustomerEditMode(false);
    setCustomerDraft(null);
    setShowCustomerHistory(false);
  };

  const saveCustomer = () => {
    if (!customerDraft?.id) return;
    const before = customers.find((c) => c?.id === customerDraft.id);
    logHistoryEntry(setData, { entityType: "customer", entityId: customerDraft.id, entityLabel: before?.name, before, userRole });
    setData((d) => ({
      ...d,
      customers: (Array.isArray(d?.customers) ? d.customers : []).map((customer) =>
        customer?.id === customerDraft.id ? { ...customer, ...customerDraft } : customer
      ),
    }));
    setCustomerEditMode(false);
  };

  const deleteCustomer = (customerId) => {
    if (!customerId) return;
    // 未払い・延滞中の請求書が残っている顧客を削除すると、
    // 入金管理画面で顧客名の参照が崩れる可能性があるため、事前に警告する。
    const unpaidInvoices = (Array.isArray(data?.invoices) ? data.invoices : []).filter((inv) => {
      const p = inv?.payload != null && typeof inv.payload === "object" ? inv.payload : inv;
      if (p?.deleted || inv?.deleted) return false;
      return p?.customerId === customerId && p?.status !== "paid" && p?.status !== "入金済";
    });
    // 定期便のテンプレートがこの顧客を参照している場合も、あわせて伝える。
    const activeRecurring = (Array.isArray(data?.recurringAssignments) ? data.recurringAssignments : []).filter(
      (r) => !r?.deleted && r?.active !== false && r?.customerId === customerId
    );
    const warnings = [];
    if (unpaidInvoices.length > 0) warnings.push(`未払いの請求書 ${unpaidInvoices.length}件`);
    if (activeRecurring.length > 0) warnings.push(`稼働中の定期便 ${activeRecurring.length}件`);
    const confirmMessage =
      warnings.length > 0
        ? `この顧客には、${warnings.join("・")}があります。削除するとそれらの画面の表示に影響する可能性があります。本当に削除しますか？（後から復元できます）`
        : "この顧客を削除しますか？（後から復元できます）";
    if (!window.confirm(confirmMessage)) return;
    setData((d) => ({
      ...d,
      customers: (Array.isArray(d?.customers) ? d.customers : []).map((customer) =>
        customer?.id === customerId ? { ...customer, deleted: true } : customer
      ),
    }));
    closeCustomerDetail();
  };

  const customerIcon = <Icon size={14}><circle cx="9" cy="8" r="3"/><circle cx="16" cy="9" r="2.5"/><path d="M3 20c1.4-3 3.8-4.5 6-4.5"/><path d="M10 20c1.8-3 4.6-4.5 7-4.5"/></Icon>;
  const plusIcon = <Icon size={14}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></Icon>;
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
      <div style={{ display:"flex", gap:"10px", alignItems:"center", flexWrap:"wrap" }}>
        <RetroBtn onClick={()=>setShowModal(true)} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>{plusIcon}顧客追加</RetroBtn>
        <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
          <span style={{ fontSize:"12px", color:"#666", fontWeight:600 }}>検索</span>
          <RetroInput value={search} onChange={e=>setSearch(e.target.value)} placeholder="会社名・ID・担当者・電話で検索" style={{ width: isMobile ? "200px" : "260px", border:"1px solid #d0d0d0", borderRadius:"3px", background:"#fff" }}/>
        </div>
      </div>
      <div style={{ border:cardBorder, borderRadius:"6px", background:"#fff", overflow:"auto", maxHeight: isMobile ? "60vh" : "calc(100vh - 260px)" }}>
        <table style={{ minWidth:"100%", width:"max-content", borderCollapse:"collapse", fontFamily:"'Noto Sans JP', sans-serif", fontSize:"12px" }}>
          <thead>
            <tr style={{ background:"#fafbfc", position:"sticky", top:0 }}>
              {["ID","会社名","担当者","電話","単価","締め日/支払サイト","案件数","累計売上"].map((h)=><th key={h} style={{ color:"#666", fontSize:"11px", padding:"8px 10px", textAlign:"left", fontWeight:700, whiteSpace:"nowrap", borderBottom:cardBorder }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filteredCustomers.map((c, index) => {
              const ords = orders.filter((o)=>o?.customerId===c?.id);
              return (
                <tr key={c?.id || `customer-${index}`} onClick={()=>openCustomerDetail(c)} style={{ background:"#fff", borderBottom:"1px solid #f0f0f0", cursor:"pointer" }}
                  onMouseEnter={e=>e.currentTarget.style.background="#f9fcfc"}
                  onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
                  <td style={{ padding:"8px 10px" }}><span style={{color:"#007a74",fontWeight:700}}>{c?.id||"—"}</span></td>
                  <td style={{ padding:"8px 10px" }}>{c?.name||""}</td>
                  <td style={{ padding:"8px 10px" }}>{c?.contact||""}</td>
                  <td style={{ padding:"8px 10px" }}>{c?.phone||""}</td>
                  <td style={{ padding:"8px 10px" }}>¥{(Number(c?.unitPrice)||0).toLocaleString()}</td>
                  <td style={{ padding:"8px 10px" }}>{formatClosingDay(c?.closingDay)} / {formatPaymentSite(c?.paymentSite)}</td>
                  <td style={{ padding:"8px 10px" }}>{ords.length}件</td>
                  <td style={{ padding:"8px 10px" }}>¥{ords.reduce((s,o)=>s+(Number(o?.amount)||0),0).toLocaleString()}</td>
                </tr>
              );
            })}
            {customers.length===0&&<tr><td colSpan={8} style={{ padding:"16px", textAlign:"center", color:"#999" }}>データなし</td></tr>}
          </tbody>
        </table>
      </div>
      {showModal&&<Modal title="顧客追加" icon={customerIcon} onClose={()=>setShowModal(false)}>
        <Fl label="会社名"><RetroInput value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></Fl>
        <div style={{display:"grid",gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",gap:"6px 12px"}}>
          <Fl label="担当者"><RetroInput value={form.contact} onChange={e=>setForm(f=>({...f,contact:e.target.value}))}/></Fl>
          <Fl label="電話"><RetroInput value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/></Fl>
        </div>
        <Fl label="メール"><RetroInput value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></Fl>
        <Fl label="振込名義カナ"><RetroInput
          value={form.payer_kana}
          placeholder="例：カブシキガイシャタナカショウジ"
          onCompositionStart={()=>setIsAddPayerKanaComposing(true)}
          onCompositionEnd={(e)=>{
            setIsAddPayerKanaComposing(false);
            setForm((f)=>({ ...f, payer_kana:normalizePayerKana(e.target.value) }));
          }}
          onChange={(e)=>{
            if (isAddPayerKanaComposing) {
              setForm((f)=>({ ...f, payer_kana:e.target.value }));
              return;
            }
            setForm((f)=>({ ...f, payer_kana:normalizePayerKana(e.target.value) }));
          }}
        /></Fl>
        <Fl label="住所"><RetroInput value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))}/></Fl>
        <div style={{display:"grid",gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr",gap:"6px 12px"}}>
          <Fl label="単価（円）"><RetroInput type="number" min="0" value={form.unitPrice} onChange={e=>setForm(f=>({...f,unitPrice:e.target.value}))}/></Fl>
          <Fl label="締め日">
            <RetroSelect value={form.closingDay} onChange={e=>setForm(f=>({...f,closingDay:Number(e.target.value)}))}>
              {CLOSING_DAY_OPTIONS.map((day)=><option key={day} value={day}>{day===31?"月末(31)":`${day}日`}</option>)}
            </RetroSelect>
          </Fl>
          <Fl label="支払サイト">
            <RetroSelect value={form.paymentSite} onChange={e=>setForm(f=>({...f,paymentSite:e.target.value}))}>
              {PAYMENT_SITE_OPTIONS.map((site)=><option key={site} value={site}>{site}</option>)}
            </RetroSelect>
          </Fl>
        </div>
        <Fl label="メモ"><RetroTextarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></Fl>
        <div style={{display:"flex",justifyContent:"flex-end",gap:"6px",marginTop:"8px"}}>
          <RetroBtn onClick={()=>setShowModal(false)}>キャンセル</RetroBtn>
          <RetroBtn onClick={add} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>登録する</RetroBtn>
        </div>
      </Modal>}
      {selectedCustomer && (
        <Modal title={`顧客詳細 ${selectedCustomer?.id || ""}`} icon={customerIcon} onClose={closeCustomerDetail} width={520}>
          {customerEditMode ? (
            <>
              <Fl label="会社名"><RetroInput value={customerDraft?.name || ""} onChange={(e)=>setCustomerDraft((prev)=>({ ...(prev||{}), name:e.target.value }))}/></Fl>
              <div style={{display:"grid",gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",gap:"6px 12px"}}>
                <Fl label="担当者"><RetroInput value={customerDraft?.contact || ""} onChange={(e)=>setCustomerDraft((prev)=>({ ...(prev||{}), contact:e.target.value }))}/></Fl>
                <Fl label="電話"><RetroInput value={customerDraft?.phone || ""} onChange={(e)=>setCustomerDraft((prev)=>({ ...(prev||{}), phone:e.target.value }))}/></Fl>
              </div>
              <Fl label="メール"><RetroInput value={customerDraft?.email || ""} onChange={(e)=>setCustomerDraft((prev)=>({ ...(prev||{}), email:e.target.value }))}/></Fl>
              <Fl label="振込名義カナ"><RetroInput
                value={customerDraft?.payer_kana || ""}
                placeholder="例：カブシキガイシャタナカショウジ"
                onCompositionStart={()=>setIsEditPayerKanaComposing(true)}
                onCompositionEnd={(e)=>{
                  setIsEditPayerKanaComposing(false);
                  setCustomerDraft((prev)=>({ ...(prev||{}), payer_kana:normalizePayerKana(e.target.value) }));
                }}
                onChange={(e)=>{
                  if (isEditPayerKanaComposing) {
                    setCustomerDraft((prev)=>({ ...(prev||{}), payer_kana:e.target.value }));
                    return;
                  }
                  setCustomerDraft((prev)=>({ ...(prev||{}), payer_kana:normalizePayerKana(e.target.value) }));
                }}
              /></Fl>
              <Fl label="住所"><RetroInput value={customerDraft?.address || ""} onChange={(e)=>setCustomerDraft((prev)=>({ ...(prev||{}), address:e.target.value }))}/></Fl>
              <div style={{display:"grid",gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr",gap:"6px 12px"}}>
                <Fl label="単価（円）"><RetroInput type="number" min="0" value={customerDraft?.unitPrice ?? ""} onChange={(e)=>setCustomerDraft((prev)=>({ ...(prev||{}), unitPrice:Math.max(0, Number(e.target.value)||0) }))}/></Fl>
                <Fl label="締め日">
                  <RetroSelect value={customerDraft?.closingDay ?? ""} onChange={(e)=>setCustomerDraft((prev)=>({ ...(prev||{}), closingDay:e.target.value ? Number(e.target.value) : "" }))}>
                    <option value="">未設定（候補: 月末(31)）</option>
                    {CLOSING_DAY_OPTIONS.map((day)=><option key={day} value={day}>{day===31?"月末(31)":`${day}日`}</option>)}
                  </RetroSelect>
                </Fl>
                <Fl label="支払サイト">
                  <RetroSelect value={customerDraft?.paymentSite || ""} onChange={(e)=>setCustomerDraft((prev)=>({ ...(prev||{}), paymentSite:e.target.value }))}>
                    <option value="">未設定（候補: 翌月末払い）</option>
                    {PAYMENT_SITE_OPTIONS.map((site)=><option key={site} value={site}>{site}</option>)}
                  </RetroSelect>
                </Fl>
              </div>
              <Fl label="メモ"><RetroTextarea value={customerDraft?.notes || ""} onChange={(e)=>setCustomerDraft((prev)=>({ ...(prev||{}), notes:e.target.value }))}/></Fl>
              <div style={{display:"flex",justifyContent:"flex-end",gap:"6px",marginTop:"8px"}}>
                <RetroBtn onClick={()=>{ setCustomerEditMode(false); setCustomerDraft(selectedCustomer ? { ...selectedCustomer } : null); }}>キャンセル</RetroBtn>
                <RetroBtn onClick={saveCustomer} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>保存</RetroBtn>
              </div>
            </>
          ) : (
            <>
              <Panel>
                <div style={{ display:"grid", gridTemplateColumns:"120px 1fr", rowGap:"6px", columnGap:"8px", fontSize:"12px", color:"#333" }}>
                  <div>会社名</div><div>{selectedCustomer?.name || ""}</div>
                  <div>担当者</div><div>{selectedCustomer?.contact || ""}</div>
                  <div>電話</div><div>{selectedCustomer?.phone || ""}</div>
                  <div>メール</div><div>{selectedCustomer?.email || ""}</div>
                  <div>振込名義カナ</div><div>{selectedCustomer?.payer_kana || "—"}</div>
                  <div>住所</div><div>{selectedCustomer?.address || "—"}</div>
                  <div>単価</div><div>¥{(Number(selectedCustomer?.unitPrice)||0).toLocaleString()}</div>
                  <div>締め日</div><div>{formatClosingDay(selectedCustomer?.closingDay)}</div>
                  <div>支払サイト</div><div>{formatPaymentSite(selectedCustomer?.paymentSite)}</div>
                  <div>メモ</div><div>{selectedCustomer?.notes || "—"}</div>
                </div>
              </Panel>
              <div style={{ marginTop:"8px" }}>
                <button onClick={()=>setShowCustomerHistory(v=>!v)} style={{
                  border:"none", background:"none", color:"#00a09a", fontSize:"12px", fontWeight:700, cursor:"pointer", padding:"4px 0",
                }}>
                  {showCustomerHistory ? "▲ 変更履歴を閉じる" : "▼ 変更履歴を見る"}
                </button>
                {showCustomerHistory && (
                  <HistoryPanel
                    data={data}
                    entityType="customer"
                    entityId={selectedCustomer?.id}
                    labelMap={{
                      name:"会社名", contact:"担当者", phone:"電話", email:"メール",
                      payer_kana:"振込名義カナ", address:"住所", unitPrice:"単価",
                      closingDay:"締め日", paymentSite:"支払サイト", notes:"メモ",
                    }}
                  />
                )}
              </div>
              <div style={{display:"flex",justifyContent:"space-between",gap:"6px",marginTop:"8px"}}>
                <RetroBtn style={{ background:"#fff", color:"#e63946", borderColor:"#e63946" }} onClick={()=>deleteCustomer(selectedCustomer?.id)}>削除</RetroBtn>
                <div style={{ display:"flex", gap:"6px" }}>
                  <RetroBtn onClick={closeCustomerDetail}>閉じる</RetroBtn>
                  <RetroBtn onClick={()=>{ setCustomerDraft(selectedCustomer ? { ...selectedCustomer } : null); setCustomerEditMode(true); }} style={{ background:"#fff", color:"#00a09a", borderColor:"#00a09a" }}>編集</RetroBtn>
                </div>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
};

const QualityMgmtPage = ({ data, setData, tenantId, userRole, isMobile }) => {
  const drivers = (Array.isArray(data?.drivers) ? data.drivers : []).filter(d => !d?.deleted);
  const qualityRecords = Array.isArray(data?.qualityRecords) ? data.qualityRecords : [];
  const jobTypes = Array.isArray(data?.jobTypes) ? data.jobTypes : [];
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(() =>
    `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`
  );
  const [activeTab, setActiveTab] = useState("daily");
  const [selectedDriverId, setSelectedDriverId] = useState(null);
  const [selectedJobTypeId, setSelectedJobTypeId] = useState(null);
  const [editingCell, setEditingCell] = useState(null);
  const [editingField, setEditingField] = useState(null);
  const [cellValue, setCellValue] = useState("");
  const suppressBlurSaveRef = useRef(false);

  const dekaStyles = ["100以下","140","160","180","200","220","240","260"];
  const selectedDriver = drivers.find(d => d.id === selectedDriverId) || null;
  const selectedJobType = jobTypes.find(j => j.id === selectedJobTypeId) || null;

  const getDaysInMonth = (monthStr) => {
    const [y, m] = monthStr.split("-").map(Number);
    return new Date(y, m, 0).getDate();
  };

  const getRecord = (driverId, date, jobTypeId) =>
    qualityRecords.find(r => r.driverId === driverId && r.date === date && r.jobTypeId === jobTypeId) || null;

  const saveCell = (driverId, date, jobTypeId, field, value, customerId, salesAmount, driverAmount, opts) => {
    const existingBefore = qualityRecords.find(r => r.driverId === driverId && r.date === date && r.jobTypeId === jobTypeId);
    if (existingBefore) {
      logHistoryEntry(setData, {
        entityType: "quality_record",
        entityId: existingBefore.id,
        entityLabel: `${date} ${driverId}`,
        before: existingBefore,
        userRole,
      });
    }
    setData(d => {
      const current = Array.isArray(d?.qualityRecords) ? d.qualityRecords : [];
      const existing = current.find(r => r.driverId === driverId && r.date === date && r.jobTypeId === jobTypeId);
      if (existing) {
        return { ...d, qualityRecords: current.map(r =>
          r.driverId === driverId && r.date === date && r.jobTypeId === jobTypeId
            ? {
                ...r,
                [field]: value,
                ...(customerId !== undefined && customerId !== null ? { customerId } : {}),
                ...(salesAmount !== undefined && salesAmount !== null ? { salesAmount } : {}),
                ...(driverAmount !== undefined && driverAmount !== null ? { driverAmount } : {})
              }
            : r
        )};
      }
      return { ...d, qualityRecords: [...current, {
        id: `QR-${Date.now()}`,
        driverId,
        date,
        jobTypeId,
        [field]: value,
        customerId: customerId || null,
        salesAmount: salesAmount || null,
        driverAmount: driverAmount || null
      }]};
    });
    if (!opts?.skipClear) {
      setEditingCell(null);
      setEditingField(null);
      setCellValue("");
    }
  };

  const months = Array.from({ length: 4 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  });

  const daysInMonth = getDaysInMonth(selectedMonth);
  const [year, month] = selectedMonth.split("-").map(Number);

  const getDriverJobTypes = (driver) => {
    const routes = driver?.routes || [];
    return routes.map(r => jobTypes.find(j => j.id === r.jobTypeId)).filter(Boolean);
  };

  const monthlySummary = drivers.map(driver => {
    const recs = qualityRecords.filter(r => r.driverId === driver.id && r.date?.startsWith(selectedMonth));
    const salesTotal = recs.reduce((s, r) => {
      const jt = jobTypes.find(j => j.id === r.jobTypeId);
      const route = (driver.routes||[]).find(ro => ro.jobTypeId === r.jobTypeId);
      if (!jt || !route) return s;
      if (jt.name === "デカ宅") {
        const dekaRates = route.dekaRates || [];
        return s + dekaStyles.reduce((ss, size) => {
          const rate = dekaRates.find(dr => dr.size === size);
          const qty = Number(r[`deka_${size}`]||0);
          return ss + qty * (Number(rate?.unitPrice)||0);
        }, 0);
      }
      if (jt.name === "ルート" || jt.name === "チャーター") return s + (Number(r.salesAmount)||0);
      return s + (Number(r["配完個数"]||0)) * (Number(route.unitPrice)||0);
    }, 0);
    const driverTotal = recs.reduce((s, r) => {
      const jt = jobTypes.find(j => j.id === r.jobTypeId);
      const route = (driver.routes||[]).find(ro => ro.jobTypeId === r.jobTypeId);
      if (!jt || !route) return s;
      if (jt.name === "デカ宅") {
        const dekaRates = route.dekaRates || [];
        return s + dekaStyles.reduce((ss, size) => {
          const rate = dekaRates.find(dr => dr.size === size);
          const qty = Number(r[`deka_${size}`]||0);
          return ss + qty * (Number(rate?.driverUnitPrice)||0);
        }, 0);
      }
      if (jt.name === "ルート" || jt.name === "チャーター") return s + (Number(r.driverAmount)||0);
      return s + (Number(r["配完個数"]||0)) * (Number(route.driverUnitPrice)||0);
    }, 0);
    return { driver, salesTotal, driverTotal, count: recs.length };
  });

  const qualityIcon = <Icon size={14}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></Icon>;
  const backIcon = <Icon size={14}><polyline points="15,18 9,12 15,6"/></Icon>;

  const renderChibiTable = () => {
    const route = (selectedDriver?.routes||[]).find(r => r.jobTypeId === selectedJobTypeId);
    const unitPrice = Number(route?.unitPrice||0);
    const driverUnitPrice = Number(route?.driverUnitPrice||0);
    const fields = ["持出個数","配完個数","誤配","クレーム","時間帯不履行","備考"];
    const recs = qualityRecords.filter(r => r.driverId === selectedDriverId && r.jobTypeId === selectedJobTypeId && r.date?.startsWith(selectedMonth));
    const runChibiSave = (dateStr, f, val, skipClear) => {
      saveCell(
        selectedDriverId, dateStr, selectedJobTypeId, f, val,
        route?.customerId || null,
        f === "配完個数" ? (Number(val)||0) * Number(route?.unitPrice||0) : null,
        f === "配完個数" ? (Number(val)||0) * Number(route?.driverPrice||route?.driverUnitPrice||0) : null,
        skipClear ? { skipClear: true } : undefined
      );
    };
    const chibiCellNav = (e, day, f, rec) => {
      const dateStr = `${selectedMonth}-${String(day).padStart(2,"0")}`;
      const fi = fields.indexOf(f);
      if (fi < 0) return;
      if (e.key === "Enter") {
        suppressBlurSaveRef.current = true;
        runChibiSave(dateStr, f, cellValue, false);
        return;
      }
      if (e.key === "Escape") {
        suppressBlurSaveRef.current = true;
        setEditingCell(null);
        setEditingField(null);
        setCellValue("");
        return;
      }
      const wantPrev = (e.key === "Tab" && e.shiftKey) || e.key === "ArrowLeft";
      const wantNext = (e.key === "Tab" && !e.shiftKey) || e.key === "ArrowRight";
      const wantDown = e.key === "ArrowDown";
      const wantUp = e.key === "ArrowUp";
      if (!(wantPrev || wantNext || wantDown || wantUp)) return;
      e.preventDefault();
      let nextDay = day;
      let nextFi = fi;
      if (wantNext) {
        if (fi < fields.length - 1) nextFi = fi + 1;
        else if (day < daysInMonth) { nextDay = day + 1; nextFi = 0; }
        else return;
      } else if (wantPrev) {
        if (fi > 0) nextFi = fi - 1;
        else if (day > 1) { nextDay = day - 1; nextFi = fields.length - 1; }
        else return;
      } else if (wantDown) {
        if (day >= daysInMonth) return;
        nextDay = day + 1;
      } else if (wantUp) {
        if (day <= 1) return;
        nextDay = day - 1;
      }
      const nextDateStr = `${selectedMonth}-${String(nextDay).padStart(2,"0")}`;
      const nextField = fields[nextFi];
      const mergedThis = { ...(rec || {}), [f]: cellValue };
      const nextRec = nextDay === day
        ? mergedThis
        : (qualityRecords.find(r => r.driverId === selectedDriverId && r.date === nextDateStr && r.jobTypeId === selectedJobTypeId) || null);
      suppressBlurSaveRef.current = true;
      runChibiSave(dateStr, f, cellValue, true);
      setEditingCell(`${selectedDriverId}-${nextDateStr}-${selectedJobTypeId}`);
      setEditingField(nextField);
      const raw = nextRec?.[nextField];
      setCellValue(raw === null || raw === undefined ? "" : String(raw));
    };
    return (
      <div style={{ overflowX:"auto" }}>
        <table style={{ borderCollapse:"collapse", fontSize:"12px", fontFamily:"'Noto Sans JP', sans-serif", width:"100%" }}>
          <thead>
            <tr style={{ background:"#00a09a", color:"#fff" }}>
              <th style={{ padding:"8px 10px", textAlign:"left", minWidth:"80px", borderRight:"1px solid rgba(255,255,255,0.3)" }}>日付</th>
              {fields.map(f => <th key={f} style={{ padding:"8px 10px", textAlign:"center", whiteSpace:"nowrap", borderRight:"1px solid rgba(255,255,255,0.3)", minWidth:"70px" }}>{f}</th>)}
              <th style={{ padding:"8px 10px", textAlign:"center", minWidth:"90px" }}>売上</th>
              <th style={{ padding:"8px 10px", textAlign:"center", minWidth:"90px" }}>支払</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const dateStr = `${selectedMonth}-${String(day).padStart(2,"0")}`;
              const dow = new Date(year, month-1, day).getDay();
              const isWeekend = dow === 0 || dow === 6;
              const dowLabel = ["日","月","火","水","木","金","土"][dow];
              const rec = getRecord(selectedDriverId, dateStr, selectedJobTypeId);
              const daySales = (Number(rec?.["配完個数"]||0)) * unitPrice;
              const driverPay = (Number(rec?.["配完個数"]||0)) * driverUnitPrice;
              return (
                <tr key={dateStr} style={{ background: isWeekend?"#f0f7ff":"#fff", borderBottom:"1px solid #e8e8e8" }}>
                  <td style={{ padding:"6px 10px", fontWeight:700, color: dow===0?"#e63946":dow===6?"#2196f3":"#333", borderRight:"1px solid #e8e8e8", background: isWeekend?"#f0f7ff":"#fafbfc" }}>{month}/{day}({dowLabel})</td>
                  {fields.map(f => {
                    const isThisEditing = editingCell===`${selectedDriverId}-${dateStr}-${selectedJobTypeId}` && editingField===f;
                    return (
                      <td key={f} style={{ padding:"2px", textAlign:"center", borderRight:"1px solid #e8e8e8", cursor:"pointer" }}
                        onClick={() => { setEditingCell(`${selectedDriverId}-${dateStr}-${selectedJobTypeId}`); setEditingField(f); setCellValue(rec?.[f]??""); }}>
                        {isThisEditing ? (
                          <input value={cellValue} onChange={e=>setCellValue(e.target.value)}
                            onBlur={() => {
                              if (suppressBlurSaveRef.current) {
                                suppressBlurSaveRef.current = false;
                                return;
                              }
                              runChibiSave(dateStr, f, cellValue, false);
                            }}
                            onKeyDown={e=>chibiCellNav(e, day, f, rec)}
                            style={{ width:f==="備考"?"120px":"60px", fontSize:"12px", border:"1px solid #00a09a", borderRadius:"2px", padding:"4px 6px", textAlign:f==="備考"?"left":"center" }} autoFocus/>
                        ) : (
                          <span style={{ display:"block", padding:"4px 6px", color:(f==="誤配"||f==="クレーム")&&Number(rec?.[f])>0?"#e63946":f==="時間帯不履行"&&Number(rec?.[f])>0?"#ff9800":"#333" }}>{rec?.[f]??""}</span>
                        )}
                      </td>
                    );
                  })}
                  <td style={{ padding:"6px 4px", textAlign:"center", color:"#007a74", fontWeight:700 }}>{daySales>0?`¥${daySales.toLocaleString()}`:""}</td>
                  <td style={{ padding:"6px 4px", textAlign:"center", color:"#e65100", fontWeight:700 }}>{driverPay>0?`¥${driverPay.toLocaleString()}`:""}</td>
                </tr>
              );
            })}
            <tr style={{ background:"#e8f5f4", borderTop:"2px solid #00a09a" }}>
              <td style={{ padding:"8px 10px", fontWeight:700, color:"#007a74", borderRight:"1px solid #e8e8e8" }}>合計</td>
              {fields.map(f => (
                <td key={f} style={{ padding:"8px 10px", textAlign:"center", borderRight:"1px solid #e8e8e8", color:"#007a74", fontWeight:700 }}>
                  {f==="備考"?"": (recs.reduce((s,r)=>s+(Number(r[f])||0),0)||"")}
                </td>
              ))}
              <td style={{ padding:"8px 10px", textAlign:"center", color:"#007a74", fontWeight:700 }}>
                ¥{recs.reduce((s,r)=>s+(Number(r["配完個数"]||0))*unitPrice,0).toLocaleString()}
              </td>
              <td style={{ padding:"8px 10px", textAlign:"center", color:"#e65100", fontWeight:700 }}>
                ¥{recs.reduce((s,r)=>s+(Number(r["配完個数"]||0))*driverUnitPrice,0).toLocaleString()}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  const renderDekaTable = () => {
    const route = (selectedDriver?.routes||[]).find(r => r.jobTypeId === selectedJobTypeId);
    const dekaRates = route?.dekaRates || dekaStyles.map(s=>({size:s,unitPrice:"",driverUnitPrice:""}));
    const recs = qualityRecords.filter(r => r.driverId===selectedDriverId && r.jobTypeId===selectedJobTypeId && r.date?.startsWith(selectedMonth));
    const allFields = ["持出個数", ...dekaStyles.map(s=>`deka_${s}`), "誤配","クレーム","備考"];
    const dekaSaveExtras = (recRow, fKey, val) => {
      const totalSales = dekaStyles.reduce((s, size) => {
        const rate = dekaRates.find(dr => dr.size === size);
        const nextQty = fKey === `deka_${size}` ? Number(val||0) : Number(recRow?.[`deka_${size}`]||0);
        return s + nextQty * (Number(rate?.unitPrice)||0);
      }, 0);
      const totalDriver = dekaStyles.reduce((s, size) => {
        const rate = dekaRates.find(dr => dr.size === size);
        const nextQty = fKey === `deka_${size}` ? Number(val||0) : Number(recRow?.[`deka_${size}`]||0);
        return s + nextQty * (Number(rate?.driverPrice||rate?.driverUnitPrice||0));
      }, 0);
      return [route?.customerId || null, totalSales, totalDriver];
    };
    const runDekaSave = (dateStr, fKey, val, recRow, skipClear) => {
      const [cid, ts, td] = dekaSaveExtras(recRow, fKey, val);
      saveCell(selectedDriverId, dateStr, selectedJobTypeId, fKey, val, cid, ts, td, skipClear ? { skipClear: true } : undefined);
    };
    const dekaCellNav = (e, day, f, rec) => {
      const dateStr = `${selectedMonth}-${String(day).padStart(2,"0")}`;
      const fi = allFields.indexOf(f);
      if (fi < 0) return;
      if (e.key === "Enter") {
        suppressBlurSaveRef.current = true;
        runDekaSave(dateStr, f, cellValue, rec, false);
        return;
      }
      if (e.key === "Escape") {
        suppressBlurSaveRef.current = true;
        setEditingCell(null);
        setEditingField(null);
        setCellValue("");
        return;
      }
      const wantPrev = (e.key === "Tab" && e.shiftKey) || e.key === "ArrowLeft";
      const wantNext = (e.key === "Tab" && !e.shiftKey) || e.key === "ArrowRight";
      const wantDown = e.key === "ArrowDown";
      const wantUp = e.key === "ArrowUp";
      if (!(wantPrev || wantNext || wantDown || wantUp)) return;
      e.preventDefault();
      let nextDay = day;
      let nextFi = fi;
      if (wantNext) {
        if (fi < allFields.length - 1) nextFi = fi + 1;
        else if (day < daysInMonth) { nextDay = day + 1; nextFi = 0; }
        else return;
      } else if (wantPrev) {
        if (fi > 0) nextFi = fi - 1;
        else if (day > 1) { nextDay = day - 1; nextFi = allFields.length - 1; }
        else return;
      } else if (wantDown) {
        if (day >= daysInMonth) return;
        nextDay = day + 1;
      } else if (wantUp) {
        if (day <= 1) return;
        nextDay = day - 1;
      }
      const nextDateStr = `${selectedMonth}-${String(nextDay).padStart(2,"0")}`;
      const nextField = allFields[nextFi];
      const mergedThis = { ...(rec || {}), [f]: cellValue };
      const nextRec = nextDay === day
        ? mergedThis
        : (qualityRecords.find(r => r.driverId === selectedDriverId && r.date === nextDateStr && r.jobTypeId === selectedJobTypeId) || null);
      suppressBlurSaveRef.current = true;
      runDekaSave(dateStr, f, cellValue, rec, true);
      setEditingCell(`${selectedDriverId}-${nextDateStr}-${selectedJobTypeId}`);
      setEditingField(nextField);
      const raw = nextRec?.[nextField];
      setCellValue(raw === null || raw === undefined ? "" : String(raw));
    };
    return (
      <div style={{ overflowX:"auto" }}>
        <table style={{ borderCollapse:"collapse", fontSize:"11px", fontFamily:"'Noto Sans JP', sans-serif", minWidth:"900px" }}>
          <thead>
            <tr style={{ background:"#00a09a", color:"#fff" }}>
              <th style={{ padding:"8px 10px", textAlign:"left", minWidth:"80px", borderRight:"1px solid rgba(255,255,255,0.3)" }}>日付</th>
              <th style={{ padding:"8px 10px", textAlign:"center", borderRight:"1px solid rgba(255,255,255,0.3)", minWidth:"60px" }}>持出個数</th>
              {dekaStyles.map(s => <th key={s} style={{ padding:"8px 6px", textAlign:"center", borderRight:"1px solid rgba(255,255,255,0.3)", minWidth:"55px", fontSize:"10px" }}>{s}</th>)}
              <th style={{ padding:"8px 6px", textAlign:"center", borderRight:"1px solid rgba(255,255,255,0.3)", minWidth:"55px" }}>誤配</th>
              <th style={{ padding:"8px 6px", textAlign:"center", borderRight:"1px solid rgba(255,255,255,0.3)", minWidth:"55px" }}>クレーム</th>
              <th style={{ padding:"8px 6px", textAlign:"center", borderRight:"1px solid rgba(255,255,255,0.3)", minWidth:"80px" }}>備考</th>
              <th style={{ padding:"8px 6px", textAlign:"center", minWidth:"80px" }}>売上</th>
              <th style={{ padding:"8px 6px", textAlign:"center", minWidth:"80px" }}>支払</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const dateStr = `${selectedMonth}-${String(day).padStart(2,"0")}`;
              const dow = new Date(year, month-1, day).getDay();
              const isWeekend = dow === 0 || dow === 6;
              const dowLabel = ["日","月","火","水","木","金","土"][dow];
              const rec = getRecord(selectedDriverId, dateStr, selectedJobTypeId);
              const daySales = dekaStyles.reduce((s, size) => {
                const rate = dekaRates.find(dr=>dr.size===size);
                return s + (Number(rec?.[`deka_${size}`]||0)) * (Number(rate?.unitPrice)||0);
              }, 0);
              const dayDriver = dekaStyles.reduce((s, size) => {
                const rate = dekaRates.find(dr=>dr.size===size);
                return s + (Number(rec?.[`deka_${size}`]||0)) * (Number(rate?.driverUnitPrice)||0);
              }, 0);
              return (
                <tr key={dateStr} style={{ background: isWeekend?"#f0f7ff":"#fff", borderBottom:"1px solid #e8e8e8" }}>
                  <td style={{ padding:"6px 10px", fontWeight:700, color: dow===0?"#e63946":dow===6?"#2196f3":"#333", borderRight:"1px solid #e8e8e8", background: isWeekend?"#f0f7ff":"#fafbfc" }}>{month}/{day}({dowLabel})</td>
                  {allFields.map(f => {
                    const isThisEditing = editingCell===`${selectedDriverId}-${dateStr}-${selectedJobTypeId}` && editingField===f;
                    return (
                      <td key={f} style={{ padding:"2px", textAlign:"center", borderRight:"1px solid #e8e8e8", cursor:"pointer" }}
                        onClick={() => { setEditingCell(`${selectedDriverId}-${dateStr}-${selectedJobTypeId}`); setEditingField(f); setCellValue(rec?.[f]??""); }}>
                        {isThisEditing ? (
                          <input value={cellValue} onChange={e=>setCellValue(e.target.value)}
                            onBlur={() => {
                              if (suppressBlurSaveRef.current) {
                                suppressBlurSaveRef.current = false;
                                return;
                              }
                              runDekaSave(dateStr, f, cellValue, rec, false);
                            }}
                            onKeyDown={e=>dekaCellNav(e, day, f, rec)}
                            style={{ width:f==="備考"?"100px":"50px", fontSize:"11px", border:"1px solid #00a09a", borderRadius:"2px", padding:"2px 4px", textAlign:"center" }} autoFocus/>
                        ) : (
                          <span style={{ display:"block", padding:"3px 4px" }}>{rec?.[f]??""}</span>
                        )}
                      </td>
                    );
                  })}
                  <td style={{ padding:"6px 4px", textAlign:"center", color:"#007a74", fontWeight:700 }}>{daySales>0?`¥${daySales.toLocaleString()}`:""}</td>
                  <td style={{ padding:"6px 4px", textAlign:"center", color:"#e65100", fontWeight:700 }}>{dayDriver>0?`¥${dayDriver.toLocaleString()}`:""}</td>
                </tr>
              );
            })}
            <tr style={{ background:"#e8f5f4", borderTop:"2px solid #00a09a" }}>
              <td style={{ padding:"8px 10px", fontWeight:700, color:"#007a74", borderRight:"1px solid #e8e8e8" }}>合計</td>
              <td style={{ padding:"8px 4px", textAlign:"center", borderRight:"1px solid #e8e8e8", color:"#007a74", fontWeight:700 }}>{recs.reduce((s,r)=>s+(Number(r["持出個数"])||0),0)||""}</td>
              {dekaStyles.map(s => (
                <td key={s} style={{ padding:"8px 4px", textAlign:"center", borderRight:"1px solid #e8e8e8", color:"#007a74", fontWeight:700 }}>
                  {recs.reduce((ss,r)=>ss+(Number(r[`deka_${s}`])||0),0)||""}
                </td>
              ))}
              <td style={{ padding:"8px 4px", textAlign:"center", borderRight:"1px solid #e8e8e8", color:"#007a74", fontWeight:700 }}>{recs.reduce((s,r)=>s+(Number(r["誤配"])||0),0)||""}</td>
              <td style={{ padding:"8px 4px", textAlign:"center", borderRight:"1px solid #e8e8e8", color:"#007a74", fontWeight:700 }}>{recs.reduce((s,r)=>s+(Number(r["クレーム"])||0),0)||""}</td>
              <td style={{ padding:"8px 4px", borderRight:"1px solid #e8e8e8" }}></td>
              <td style={{ padding:"8px 4px", textAlign:"center", color:"#007a74", fontWeight:700 }}>
                ¥{recs.reduce((s,r)=>s+dekaStyles.reduce((ss,size)=>{
                  const rate=dekaRates.find(dr=>dr.size===size);
                  return ss+(Number(r[`deka_${size}`]||0))*(Number(rate?.unitPrice)||0);
                },0),0).toLocaleString()}
              </td>
              <td style={{ padding:"8px 4px", textAlign:"center", color:"#e65100", fontWeight:700 }}>
                ¥{recs.reduce((s,r)=>s+dekaStyles.reduce((ss,size)=>{
                  const rate=dekaRates.find(dr=>dr.size===size);
                  return ss+(Number(r[`deka_${size}`]||0))*(Number(rate?.driverUnitPrice)||0);
                },0),0).toLocaleString()}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  const renderRouteTable = () => {
    const fields = ["salesAmount","driverAmount","誤配","クレーム","備考"];
    const recs = qualityRecords.filter(r => r.driverId===selectedDriverId && r.jobTypeId===selectedJobTypeId && r.date?.startsWith(selectedMonth));
    const totalSales = recs.reduce((s,r)=>s+(Number(r.salesAmount)||0),0);
    const totalDriver = recs.reduce((s,r)=>s+(Number(r.driverAmount)||0),0);
    const runRouteSave = (dateStr, fKey, val, skipClear) => {
      saveCell(selectedDriverId, dateStr, selectedJobTypeId, fKey, val, undefined, undefined, undefined, skipClear ? { skipClear: true } : undefined);
    };
    const routeCellNav = (e, day, f, rec) => {
      const dateStr = `${selectedMonth}-${String(day).padStart(2,"0")}`;
      const fi = fields.indexOf(f);
      if (fi < 0) return;
      if (e.key === "Enter") {
        suppressBlurSaveRef.current = true;
        runRouteSave(dateStr, f, cellValue, false);
        return;
      }
      if (e.key === "Escape") {
        suppressBlurSaveRef.current = true;
        setEditingCell(null);
        setEditingField(null);
        setCellValue("");
        return;
      }
      const wantPrev = (e.key === "Tab" && e.shiftKey) || e.key === "ArrowLeft";
      const wantNext = (e.key === "Tab" && !e.shiftKey) || e.key === "ArrowRight";
      const wantDown = e.key === "ArrowDown";
      const wantUp = e.key === "ArrowUp";
      if (!(wantPrev || wantNext || wantDown || wantUp)) return;
      e.preventDefault();
      let nextDay = day;
      let nextFi = fi;
      if (wantNext) {
        if (fi < fields.length - 1) nextFi = fi + 1;
        else if (day < daysInMonth) { nextDay = day + 1; nextFi = 0; }
        else return;
      } else if (wantPrev) {
        if (fi > 0) nextFi = fi - 1;
        else if (day > 1) { nextDay = day - 1; nextFi = fields.length - 1; }
        else return;
      } else if (wantDown) {
        if (day >= daysInMonth) return;
        nextDay = day + 1;
      } else if (wantUp) {
        if (day <= 1) return;
        nextDay = day - 1;
      }
      const nextDateStr = `${selectedMonth}-${String(nextDay).padStart(2,"0")}`;
      const nextField = fields[nextFi];
      const mergedThis = { ...(rec || {}), [f]: cellValue };
      const nextRec = nextDay === day
        ? mergedThis
        : (qualityRecords.find(r => r.driverId === selectedDriverId && r.date === nextDateStr && r.jobTypeId === selectedJobTypeId) || null);
      suppressBlurSaveRef.current = true;
      runRouteSave(dateStr, f, cellValue, true);
      setEditingCell(`${selectedDriverId}-${nextDateStr}-${selectedJobTypeId}`);
      setEditingField(nextField);
      const raw = nextRec?.[nextField];
      setCellValue(raw === null || raw === undefined ? "" : String(raw));
    };
    return (
      <div style={{ overflowX:"auto" }}>
        <table style={{ borderCollapse:"collapse", fontSize:"12px", fontFamily:"'Noto Sans JP', sans-serif", width:"100%" }}>
          <thead>
            <tr style={{ background:"#00a09a", color:"#fff" }}>
              <th style={{ padding:"8px 10px", textAlign:"left", minWidth:"80px", borderRight:"1px solid rgba(255,255,255,0.3)" }}>日付</th>
              <th style={{ padding:"8px 10px", textAlign:"center", borderRight:"1px solid rgba(255,255,255,0.3)", minWidth:"100px" }}>売上金額</th>
              <th style={{ padding:"8px 10px", textAlign:"center", borderRight:"1px solid rgba(255,255,255,0.3)", minWidth:"100px" }}>支払金額</th>
              <th style={{ padding:"8px 10px", textAlign:"center", borderRight:"1px solid rgba(255,255,255,0.3)", minWidth:"60px" }}>誤配</th>
              <th style={{ padding:"8px 10px", textAlign:"center", borderRight:"1px solid rgba(255,255,255,0.3)", minWidth:"60px" }}>クレーム</th>
              <th style={{ padding:"8px 10px", textAlign:"center", minWidth:"100px" }}>備考</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const dateStr = `${selectedMonth}-${String(day).padStart(2,"0")}`;
              const dow = new Date(year, month-1, day).getDay();
              const isWeekend = dow === 0 || dow === 6;
              const dowLabel = ["日","月","火","水","木","金","土"][dow];
              const rec = getRecord(selectedDriverId, dateStr, selectedJobTypeId);
              return (
                <tr key={dateStr} style={{ background: isWeekend?"#f0f7ff":"#fff", borderBottom:"1px solid #e8e8e8" }}>
                  <td style={{ padding:"6px 10px", fontWeight:700, color: dow===0?"#e63946":dow===6?"#2196f3":"#333", borderRight:"1px solid #e8e8e8", background: isWeekend?"#f0f7ff":"#fafbfc" }}>{month}/{day}({dowLabel})</td>
                  {fields.map(f => {
                    const isThisEditing = editingCell===`${selectedDriverId}-${dateStr}-${selectedJobTypeId}` && editingField===f;
                    return (
                      <td key={f} style={{ padding:"2px", textAlign:"center", borderRight:"1px solid #e8e8e8", cursor:"pointer" }}
                        onClick={() => { setEditingCell(`${selectedDriverId}-${dateStr}-${selectedJobTypeId}`); setEditingField(f); setCellValue(rec?.[f]??""); }}>
                        {isThisEditing ? (
                          <input value={cellValue} onChange={e=>setCellValue(e.target.value)}
                            onBlur={() => {
                              if (suppressBlurSaveRef.current) {
                                suppressBlurSaveRef.current = false;
                                return;
                              }
                              runRouteSave(dateStr, f, cellValue, false);
                            }}
                            onKeyDown={e=>routeCellNav(e, day, f, rec)}
                            style={{ width:f==="備考"?"120px":"80px", fontSize:"12px", border:"1px solid #00a09a", borderRadius:"2px", padding:"4px 6px", textAlign:"center" }} autoFocus/>
                        ) : (
                          <span style={{ display:"block", padding:"4px 6px", color:(f==="salesAmount"||f==="driverAmount")&&rec?.[f]?"#007a74":"#333" }}>
                            {(f==="salesAmount"||f==="driverAmount")&&rec?.[f]?`¥${Number(rec[f]).toLocaleString()}`:rec?.[f]??""}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            <tr style={{ background:"#e8f5f4", borderTop:"2px solid #00a09a" }}>
              <td style={{ padding:"8px 10px", fontWeight:700, color:"#007a74", borderRight:"1px solid #e8e8e8" }}>合計</td>
              <td style={{ padding:"8px 10px", textAlign:"center", borderRight:"1px solid #e8e8e8", color:"#007a74", fontWeight:700 }}>¥{totalSales.toLocaleString()}</td>
              <td style={{ padding:"8px 10px", textAlign:"center", borderRight:"1px solid #e8e8e8", color:"#e65100", fontWeight:700 }}>¥{totalDriver.toLocaleString()}</td>
              <td style={{ padding:"8px 10px", textAlign:"center", borderRight:"1px solid #e8e8e8", color:"#007a74", fontWeight:700 }}>{recs.reduce((s,r)=>s+(Number(r["誤配"])||0),0)||""}</td>
              <td style={{ padding:"8px 10px", textAlign:"center", borderRight:"1px solid #e8e8e8", color:"#007a74", fontWeight:700 }}>{recs.reduce((s,r)=>s+(Number(r["クレーム"])||0),0)||""}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  const renderCharterTable = () => {
    const fields = ["count","salesAmount","driverAmount","備考"];
    const recs = qualityRecords.filter(r => r.driverId===selectedDriverId && r.jobTypeId===selectedJobTypeId && r.date?.startsWith(selectedMonth));
    const totalSales = recs.reduce((s,r)=>s+(Number(r.salesAmount)||0),0);
    const totalDriver = recs.reduce((s,r)=>s+(Number(r.driverAmount)||0),0);
    const totalCount = recs.reduce((s,r)=>s+(Number(r.count)||0),0);
    const runCharterSave = (dateStr, fKey, val, skipClear) => {
      saveCell(selectedDriverId, dateStr, selectedJobTypeId, fKey, val, undefined, undefined, undefined, skipClear ? { skipClear: true } : undefined);
    };
    const charterCellNav = (e, day, f, rec) => {
      const dateStr = `${selectedMonth}-${String(day).padStart(2,"0")}`;
      const fi = fields.indexOf(f);
      if (fi < 0) return;
      if (e.key === "Enter") {
        suppressBlurSaveRef.current = true;
        runCharterSave(dateStr, f, cellValue, false);
        return;
      }
      if (e.key === "Escape") {
        suppressBlurSaveRef.current = true;
        setEditingCell(null);
        setEditingField(null);
        setCellValue("");
        return;
      }
      const wantPrev = (e.key === "Tab" && e.shiftKey) || e.key === "ArrowLeft";
      const wantNext = (e.key === "Tab" && !e.shiftKey) || e.key === "ArrowRight";
      const wantDown = e.key === "ArrowDown";
      const wantUp = e.key === "ArrowUp";
      if (!(wantPrev || wantNext || wantDown || wantUp)) return;
      e.preventDefault();
      let nextDay = day;
      let nextFi = fi;
      if (wantNext) {
        if (fi < fields.length - 1) nextFi = fi + 1;
        else if (day < daysInMonth) { nextDay = day + 1; nextFi = 0; }
        else return;
      } else if (wantPrev) {
        if (fi > 0) nextFi = fi - 1;
        else if (day > 1) { nextDay = day - 1; nextFi = fields.length - 1; }
        else return;
      } else if (wantDown) {
        if (day >= daysInMonth) return;
        nextDay = day + 1;
      } else if (wantUp) {
        if (day <= 1) return;
        nextDay = day - 1;
      }
      const nextDateStr = `${selectedMonth}-${String(nextDay).padStart(2,"0")}`;
      const nextField = fields[nextFi];
      const mergedThis = { ...(rec || {}), [f]: cellValue };
      const nextRec = nextDay === day
        ? mergedThis
        : (qualityRecords.find(r => r.driverId === selectedDriverId && r.date === nextDateStr && r.jobTypeId === selectedJobTypeId) || null);
      suppressBlurSaveRef.current = true;
      runCharterSave(dateStr, f, cellValue, true);
      setEditingCell(`${selectedDriverId}-${nextDateStr}-${selectedJobTypeId}`);
      setEditingField(nextField);
      const raw = nextRec?.[nextField];
      setCellValue(raw === null || raw === undefined ? "" : String(raw));
    };
    return (
      <div style={{ overflowX:"auto" }}>
        <table style={{ borderCollapse:"collapse", fontSize:"12px", fontFamily:"'Noto Sans JP', sans-serif", width:"100%" }}>
          <thead>
            <tr style={{ background:"#00a09a", color:"#fff" }}>
              <th style={{ padding:"8px 10px", textAlign:"left", minWidth:"80px", borderRight:"1px solid rgba(255,255,255,0.3)" }}>日付</th>
              <th style={{ padding:"8px 10px", textAlign:"center", borderRight:"1px solid rgba(255,255,255,0.3)", minWidth:"60px" }}>件数</th>
              <th style={{ padding:"8px 10px", textAlign:"center", borderRight:"1px solid rgba(255,255,255,0.3)", minWidth:"100px" }}>売上金額</th>
              <th style={{ padding:"8px 10px", textAlign:"center", borderRight:"1px solid rgba(255,255,255,0.3)", minWidth:"100px" }}>支払金額</th>
              <th style={{ padding:"8px 10px", textAlign:"center", minWidth:"100px" }}>備考</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const dateStr = `${selectedMonth}-${String(day).padStart(2,"0")}`;
              const dow = new Date(year, month-1, day).getDay();
              const isWeekend = dow === 0 || dow === 6;
              const dowLabel = ["日","月","火","水","木","金","土"][dow];
              const rec = getRecord(selectedDriverId, dateStr, selectedJobTypeId);
              return (
                <tr key={dateStr} style={{ background: isWeekend?"#f0f7ff":"#fff", borderBottom:"1px solid #e8e8e8" }}>
                  <td style={{ padding:"6px 10px", fontWeight:700, color: dow===0?"#e63946":dow===6?"#2196f3":"#333", borderRight:"1px solid #e8e8e8", background: isWeekend?"#f0f7ff":"#fafbfc" }}>{month}/{day}({dowLabel})</td>
                  {fields.map(f => {
                    const isThisEditing = editingCell===`${selectedDriverId}-${dateStr}-${selectedJobTypeId}` && editingField===f;
                    return (
                      <td key={f} style={{ padding:"2px", textAlign:"center", borderRight:"1px solid #e8e8e8", cursor:"pointer" }}
                        onClick={() => { setEditingCell(`${selectedDriverId}-${dateStr}-${selectedJobTypeId}`); setEditingField(f); setCellValue(rec?.[f]??""); }}>
                        {isThisEditing ? (
                          <input value={cellValue} onChange={e=>setCellValue(e.target.value)}
                            onBlur={() => {
                              if (suppressBlurSaveRef.current) {
                                suppressBlurSaveRef.current = false;
                                return;
                              }
                              runCharterSave(dateStr, f, cellValue, false);
                            }}
                            onKeyDown={e=>charterCellNav(e, day, f, rec)}
                            style={{ width:f==="備考"?"120px":"80px", fontSize:"12px", border:"1px solid #00a09a", borderRadius:"2px", padding:"4px 6px", textAlign:"center" }} autoFocus/>
                        ) : (
                          <span style={{ display:"block", padding:"4px 6px", color:(f==="salesAmount"||f==="driverAmount")&&rec?.[f]?"#007a74":"#333" }}>
                            {(f==="salesAmount"||f==="driverAmount")&&rec?.[f]?`¥${Number(rec[f]).toLocaleString()}`:rec?.[f]??""}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            <tr style={{ background:"#e8f5f4", borderTop:"2px solid #00a09a" }}>
              <td style={{ padding:"8px 10px", fontWeight:700, color:"#007a74", borderRight:"1px solid #e8e8e8" }}>合計</td>
              <td style={{ padding:"8px 10px", textAlign:"center", borderRight:"1px solid #e8e8e8", color:"#007a74", fontWeight:700 }}>{totalCount||""}</td>
              <td style={{ padding:"8px 10px", textAlign:"center", borderRight:"1px solid #e8e8e8", color:"#007a74", fontWeight:700 }}>¥{totalSales.toLocaleString()}</td>
              <td style={{ padding:"8px 10px", textAlign:"center", borderRight:"1px solid #e8e8e8", color:"#e65100", fontWeight:700 }}>¥{totalDriver.toLocaleString()}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
      <div style={{ display:"flex", gap:"4px", flexWrap:"wrap", borderBottom:"2px solid #e8e8e8", paddingBottom:"8px" }}>
        {[{ id:"daily", label:"日次入力" },{ id:"summary", label:"月次集計" }].map(t => (
          <button key={t.id} onClick={() => { setActiveTab(t.id); setSelectedDriverId(null); setSelectedJobTypeId(null); }} style={{ border:"none", borderRadius:"4px 4px 0 0", padding:"8px 14px", fontSize:"12px", fontWeight:700, cursor:"pointer", background: activeTab===t.id ? "#00a09a" : "#f0f2f5", color: activeTab===t.id ? "#fff" : "#555" }}>{t.label}</button>
        ))}
      </div>

      <div style={{ display:"flex", alignItems:"center", gap:"8px", flexWrap:"wrap" }}>
        <span style={{ fontSize:"12px", color:"#666", fontWeight:700 }}>表示月：</span>
        {months.map(m => (
          <button key={m} onClick={()=>{ setSelectedMonth(m); setSelectedDriverId(null); setSelectedJobTypeId(null); }} style={{ border:"1px solid #d0d0d0", borderRadius:"4px", padding:"5px 12px", fontSize:"12px", fontWeight:600, cursor:"pointer", background: selectedMonth===m ? "#00a09a" : "#fff", color: selectedMonth===m ? "#fff" : "#555" }}>
            {m.replace("-","年")}月
          </button>
        ))}
      </div>

      {activeTab === "daily" && (
        <>
          {!selectedDriverId ? (
            <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
              <div style={{ fontSize:"13px", color:"#666" }}>ドライバーを選択してください</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(200px, 1fr))", gap:"8px" }}>
                {drivers.map(driver => {
                  const recs = qualityRecords.filter(r => r.driverId === driver.id && r.date?.startsWith(selectedMonth));
                  const salesTotal = monthlySummary.find(s=>s.driver.id===driver.id)?.salesTotal || 0;
                  return (
                    <div key={driver.id} onClick={() => setSelectedDriverId(driver.id)}
                      style={{ border:"1px solid #e8e8e8", borderRadius:"8px", padding:"14px", background:"#fff", cursor:"pointer", borderLeft:"4px solid #00a09a" }}
                      onMouseEnter={e=>e.currentTarget.style.background="#e8f5f4"}
                      onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
                      <div style={{ fontSize:"14px", fontWeight:700, color:"#007a74", marginBottom:"8px" }}>{driver.name}</div>
                      <div style={{ fontSize:"11px", color:"#888" }}>今月売上：<span style={{ color:"#007a74", fontWeight:700 }}>¥{salesTotal.toLocaleString()}</span></div>
                      <div style={{ fontSize:"11px", color:"#888", marginTop:"2px" }}>登録ルート：{(driver.routes||[]).length}件</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : !selectedJobTypeId ? (
            <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                <RetroBtn onClick={() => setSelectedDriverId(null)} style={{ background:"#fff", color:"#00a09a", borderColor:"#00a09a" }}>
                  {backIcon} ドライバー一覧
                </RetroBtn>
                <span style={{ fontSize:"16px", fontWeight:700, color:"#007a74" }}>{selectedDriver?.name} — 仕事種別を選択</span>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(160px, 1fr))", gap:"8px" }}>
                {getDriverJobTypes(selectedDriver).map(jt => {
                  const recs = qualityRecords.filter(r => r.driverId===selectedDriverId && r.jobTypeId===jt.id && r.date?.startsWith(selectedMonth));
                  return (
                    <div key={jt.id} onClick={() => setSelectedJobTypeId(jt.id)}
                      style={{ border:"1px solid #e8e8e8", borderRadius:"8px", padding:"14px", background:"#fff", cursor:"pointer", borderLeft:"4px solid #007a74" }}
                      onMouseEnter={e=>e.currentTarget.style.background="#e8f5f4"}
                      onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
                      <div style={{ fontSize:"14px", fontWeight:700, color:"#007a74", marginBottom:"4px" }}>{jt.name}</div>
                      <div style={{ fontSize:"11px", color:"#888" }}>今月：{recs.length}日分</div>
                    </div>
                  );
                })}
                {getDriverJobTypes(selectedDriver).length === 0 && (
                  <div style={{ fontSize:"12px", color:"#999", padding:"12px" }}>担当ルートが登録されていません。ドライバー管理から登録してください。</div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:"10px", flexWrap:"wrap" }}>
                <RetroBtn onClick={() => setSelectedJobTypeId(null)} style={{ background:"#fff", color:"#00a09a", borderColor:"#00a09a" }}>
                  {backIcon} 仕事種別選択
                </RetroBtn>
                <span style={{ fontSize:"16px", fontWeight:700, color:"#007a74" }}>{selectedDriver?.name} — {selectedJobType?.name} — {selectedMonth.replace("-","年")}月</span>
              </div>
              {selectedJobType?.name === "チビ宅" && renderChibiTable()}
              {selectedJobType?.name === "デカ宅" && renderDekaTable()}
              {selectedJobType?.name === "ルート" && renderRouteTable()}
              {selectedJobType?.name === "チャーター" && renderCharterTable()}
            </div>
          )}
        </>
      )}

      {activeTab === "summary" && (
        <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
          <Panel title={`${selectedMonth.replace("-","年")}月 ドライバー別売上集計`} icon={qualityIcon}>
            <RetroTable
              headers={["ドライバー","今月売上","今月支払額","粗利"]}
              rows={monthlySummary.filter(s=>s.count>0).map(s=>[
                <span style={{ fontWeight:700, color:"#007a74" }}>{s.driver.name}</span>,
                <span style={{ color:"#007a74", fontWeight:700 }}>¥{s.salesTotal.toLocaleString()}</span>,
                <span style={{ color:"#e65100", fontWeight:700 }}>¥{s.driverTotal.toLocaleString()}</span>,
                <span style={{ color:"#2e7d32", fontWeight:700 }}>¥{(s.salesTotal-s.driverTotal).toLocaleString()}</span>,
              ])}
            />
          </Panel>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:"8px" }}>
            {[
              ["総売上", "¥"+monthlySummary.reduce((s,r)=>s+r.salesTotal,0).toLocaleString(), "#00a09a"],
              ["総支払額", "¥"+monthlySummary.reduce((s,r)=>s+r.driverTotal,0).toLocaleString(), "#e65100"],
              ["総粗利", "¥"+(monthlySummary.reduce((s,r)=>s+r.salesTotal,0)-monthlySummary.reduce((s,r)=>s+r.driverTotal,0)).toLocaleString(), "#2e7d32"],
            ].map(([l,v,c])=>(
              <div key={l} style={{ background:"#fff", border:cardBorder, borderRadius:"6px", padding:"12px" }}>
                <div style={{ fontSize:"11px", color:"#888", fontWeight:700, marginBottom:"4px" }}>{l}</div>
                <div style={{ fontSize:"18px", fontWeight:700, color:c }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
/**
 * 配送実績（日次入力）フォームの初期値。
 * ドライバーフォームと同じ理由で、初期値は必ずこの1箇所にまとめる。
 * charter〜otherAllowance は第1弾で追加した項目（仕様書②配送実績管理）。
 */
const createEmptyRecordForm = () => ({
  date: getTodayLocalStr(),
  driverId:"", customerId:"", jobTypeId:"",
  count:"", distance:"", hours:"",
  unitPrice:"", driverUnitPrice:"",
  // チャーター（別建ての売上・支払）
  charterSales:"", charterDriver:"",
  // 実費（ドライバー立替）
  highwayFee:"", parkingFee:"",
  // 手当
  fuelAllowance:"", otherAllowance:"", otherAllowanceNote:"",
  salesAmount:0, driverAmount:0,
  note:"",
});

/**
 * ===== 実績の承認ステータス（現場運用の根幹）=====
 *
 * ドライバーの自己申告をそのまま支払・請求に反映すると、
 * ・チャーター料や高速代を水増しされても気づけない
 * ・個数の打ち間違いがそのまま顧客への誤請求になる
 * という事故が起きる。必ず会社が承認してから確定させる。
 *
 * 【状態】
 *   draft     : 下書き（ドライバーが入力中。会社には見えるが未申請）
 *   submitted : 申請中（ドライバーが提出。会社の承認待ち）
 *   approved  : 承認済み（★これだけが売上・報酬に計上される）
 *   rejected  : 差戻し（会社が却下。ドライバーが修正して再申請する）
 *
 * 【重要】approvalStatus が無い古いデータは "approved" とみなす。
 * ハコマネで事務員が直接入力した実績は「会社自身の入力」なので承認済みで正しい。
 * ここを undefined のまま未承認扱いにすると、既存の売上が全部消える。
 */

/**
 * ===== 定期便（車建て契約）管理ページ =====
 *
 * 「平日はずっと同じ内容で動いている案件」を、毎回受注として登録し直さなくて
 * 済むようにする仕組み。テンプレートを1回登録しておけば、あとは毎日
 * 「稼働確認」をワンクリックするだけで、その日の実績（売上・報酬）が
 * 自動的に記録される。
 */
const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

const RecurringPage = ({ data, setData, tenantId, userRole, isMobile }) => {
  const recurring = (Array.isArray(data?.recurringAssignments) ? data.recurringAssignments : []).filter(r => !r?.deleted);
  const confirmations = Array.isArray(data?.recurringConfirmations) ? data.recurringConfirmations : [];
  const drivers = (Array.isArray(data?.drivers) ? data.drivers : []).filter(d => !d?.deleted);
  const customers = (Array.isArray(data?.customers) ? data.customers : []).filter(c => !c?.deleted);
  const jobTypes = Array.isArray(data?.jobTypes) ? data.jobTypes : [];
  const dailyRecords = Array.isArray(data?.dailyRecords) ? data.dailyRecords : [];

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const emptyForm = { customerId:"", driverId:"", vehicleId:"", jobTypeId:"", salesAmount:"", driverPayAmount:"", daysOfWeek:[1,2,3,4,5], note:"", active:true };
  const [form, setForm] = useState(emptyForm);

  const today = getTodayLocalStr();
  const todayWeekday = new Date(`${today}T00:00:00`).getDay();

  const openNew = () => { setEditingId(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (r) => {
    setEditingId(r?.id || null);
    setForm({
      customerId: r?.customerId || "", driverId: r?.driverId || "", vehicleId: r?.vehicleId || "",
      jobTypeId: r?.jobTypeId || "", salesAmount: String(r?.salesAmount ?? ""), driverPayAmount: String(r?.driverPayAmount ?? ""),
      daysOfWeek: Array.isArray(r?.daysOfWeek) ? r.daysOfWeek : [1,2,3,4,5],
      note: r?.note || "", active: r?.active !== false,
    });
    setShowModal(true);
  };

  const toggleDay = (dow) => {
    setForm(f => ({ ...f, daysOfWeek: f.daysOfWeek.includes(dow) ? f.daysOfWeek.filter(d => d !== dow) : [...f.daysOfWeek, dow].sort() }));
  };

  const save = () => {
    if (!form.customerId || !form.driverId) { window.alert("顧客とドライバーは必須です。"); return; }
    if (editingId) {
      const before = recurring.find(r => r?.id === editingId);
      logHistoryEntry(setData, { entityType: "recurring_assignment", entityId: editingId, entityLabel: before?.customerId, before, userRole });
    }
    setData(d => {
      const current = Array.isArray(d?.recurringAssignments) ? d.recurringAssignments : [];
      const payload = {
        customerId: form.customerId, driverId: form.driverId, vehicleId: form.vehicleId || null,
        jobTypeId: form.jobTypeId || null,
        salesAmount: Number(form.salesAmount) || 0, driverPayAmount: Number(form.driverPayAmount) || 0,
        daysOfWeek: form.daysOfWeek, note: form.note, active: form.active,
      };
      if (editingId) return { ...d, recurringAssignments: current.map(r => r?.id === editingId ? { ...r, ...payload } : r) };
      // 【重要】作成日時（createdAt）を記録しておかないと、今日新しく作った
      // 定期便でも、「未確認の日」チェックが作成前の過去の曜日まで遡って
      // 誤って警告してしまう（実際に検証で見つかった不具合）。
      return { ...d, recurringAssignments: [...current, { id: generateUniqueBusinessId(current, "RC"), createdAt: getTodayLocalStr(), ...payload }] };
    });
    setShowModal(false);
  };

  const removeItem = (id) => {
    if (!window.confirm("この定期便を削除しますか？（過去に確認済みの実績は残ります）")) return;
    setData(d => ({ ...d, recurringAssignments: (Array.isArray(d?.recurringAssignments) ? d.recurringAssignments : []).map(r => r?.id === id ? { ...r, deleted: true } : r) }));
  };

  const driverName = (id) => drivers.find(d => d?.id === id)?.name || "（削除済み）";
  const customerName = (id) => customers.find(c => c?.id === id)?.name || "（削除済み）";

  // その定期便・その日付の確認状況（"worked" | "no_work" | null=未確認）を返す
  const getStatus = (recurringId, date) => {
    const c = confirmations.find(x => x?.recurringId === recurringId && x?.date === date);
    return c?.status || null;
  };

  /**
   * 【重要】以前は「稼働があった時だけボタンを押す」設計だったため、
   * 押し忘れなのか本当に稼働が無かったのかを、後から一切区別できなかった。
   * 「稼働あり」「稼働なし」のどちらかを必ず選んでもらう形に変え、
   * まだどちらも選ばれていない日を「未確認」として明確に警告する。
   */
  const setStatus = (r, date, status) => {
    // 【重要】既に締められた月の実績データを、後から気づかずに追加・変更
    // できてしまうと、その月の報酬計算を固定したはずの「月を締める」機能の
    // 意味が失われる。確認前に、対象の月が締め済みでないか確認する。
    if (isMonthClosed(data?.companyInfo, date.slice(0, 7))) {
      window.alert(`${date.slice(0, 7)} は既に締められた月のため、ここから新たに確認することはできません。どうしても必要な場合は、管理者に月の締めを解除してもらってから操作してください。`);
      return;
    }
    if (status === "worked") {
      // 【重要】この判定を setData の外（＝再描画前の古い可能性がある dailyRecords）で
      // 行うと、連打した際に両方のクリックが「まだ記録されていない」と
      // 誤判定し、実績が二重に作られてしまう危険がある（実際に検証で確認した）。
      // setData のコールバック内で、常に最新の d.dailyRecords を見て判定する。
      setData(d => {
        const currentDailyRecords = Array.isArray(d?.dailyRecords) ? d.dailyRecords : [];
        const alreadyRecorded = currentDailyRecords.some(dr => dr?.recurringId === r?.id && dr?.date === date);
        const currentConfirmations = Array.isArray(d?.recurringConfirmations) ? d.recurringConfirmations : [];
        const nextConfirmations = [
          ...currentConfirmations.filter(c => !(c?.recurringId === r?.id && c?.date === date)),
          { id: generateUniqueBusinessId(currentConfirmations, "RCF"), recurringId: r?.id, date, status: "worked" },
        ];
        if (alreadyRecorded) {
          // 実績は既にあるので、確認記録だけ更新する（二重記録は作らない）。
          return { ...d, recurringConfirmations: nextConfirmations };
        }
        return {
          ...d,
          recurringConfirmations: nextConfirmations,
          dailyRecords: [
            ...currentDailyRecords,
            {
              id: generateUniqueBusinessId(currentDailyRecords, "DR"),
              recurringId: r?.id,
              date,
              driverId: r?.driverId,
              customerId: r?.customerId,
              jobTypeId: r?.jobTypeId || "",
              count: 1,
              salesAmount: Number(r?.salesAmount) || 0,
              driverAmount: Number(r?.driverPayAmount) || 0,
              note: "定期便より自動記録",
            },
          ],
        };
      });
    } else {
      // 稼働なし：実績は作らず、「確認済み（稼働なし）」という記録だけ残す。
      setData(d => {
        const currentConfirmations = Array.isArray(d?.recurringConfirmations) ? d.recurringConfirmations : [];
        return {
          ...d,
          recurringConfirmations: [
            ...currentConfirmations.filter(c => !(c?.recurringId === r?.id && c?.date === date)),
            { id: generateUniqueBusinessId(currentConfirmations, "RCF"), recurringId: r?.id, date, status: "no_work" },
          ],
        };
      });
    }
  };

  const undoStatus = (r, date) => {
    // 締め済みの月は、実績データを勝手に削除できないようにする
    // （前述の setStatus と同じ理由）。
    if (isMonthClosed(data?.companyInfo, date.slice(0, 7))) {
      window.alert(`${date.slice(0, 7)} は既に締められた月のため、ここから取り消すことはできません。`);
      return;
    }
    if (!window.confirm(`${date} の確認を取り消しますか？（記録されていた実績があれば削除されます）`)) return;
    setData(d => ({
      ...d,
      recurringConfirmations: (Array.isArray(d?.recurringConfirmations) ? d.recurringConfirmations : []).filter(c => !(c?.recurringId === r?.id && c?.date === date)),
      dailyRecords: (Array.isArray(d?.dailyRecords) ? d.dailyRecords : []).filter(dr => !(dr?.recurringId === r?.id && dr?.date === date)),
    }));
  };

  // 本日、確認対象となる定期便（曜日が一致し、有効なもの）
  // 【重要】担当ドライバー・顧客が削除されている定期便は、確認対象から除外する。
  // 除外しないと、削除済みの相手にひもづく実績データが新たに作られてしまい、
  // 報酬計算（削除済みドライバーは計算対象に出てこない）とも整合しなくなる。
  const dueToday = recurring.filter(r =>
    r?.active !== false && Array.isArray(r?.daysOfWeek) && r.daysOfWeek.includes(todayWeekday) &&
    drivers.some(d => d?.id === r?.driverId) && customers.some(c => c?.id === r?.customerId)
  );

  // 直近7日分をさかのぼって、確認漏れ（未確認のまま）が無いか洗い出す。
  // 「今日の分だけ」チェックしていると、数日分まとめて忘れていることに
  // 気づけないため、少し過去まで振り返れるようにする。
  const missedDays = [];
  for (let i = 1; i <= 7; i++) {
    const d2 = new Date(`${today}T00:00:00`);
    d2.setDate(d2.getDate() - i);
    const dateStr = formatDate(d2);
    const wd = d2.getDay();
    recurring.forEach(r => {
      if (r?.active === false || !Array.isArray(r?.daysOfWeek) || !r.daysOfWeek.includes(wd)) return;
      // 定期便が作られる前の日付は、そもそも稼働確認のしようがないため対象外にする。
      // createdAt が無い古いデータ（この機能追加前）は、念のため今まで通りチェックする。
      if (r?.createdAt && dateStr < r.createdAt) return;
      // 担当ドライバー・顧客が削除されている定期便は、確認しようがないため対象外にする。
      if (!drivers.some(d => d?.id === r?.driverId) || !customers.some(c => c?.id === r?.customerId)) return;
      if (getStatus(r?.id, dateStr) != null) return;
      missedDays.push({ r, date: dateStr, weekday: wd });
    });
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"14px" }}>
      <div style={{ background:"#f0f2f5", border:"1px solid #dde1e6", borderRadius:"6px", padding:"8px 10px", color:"#666", fontSize:"12px" }}>
        平日はずっと同じ内容で動いている案件（車建て契約など）を、毎回受注登録しなくて済むようにする機能です。
        あらかじめテンプレートを登録しておけば、あとは毎日「稼働あり／稼働なし」を選ぶだけで、その日の売上・報酬が自動的に記録されます。
      </div>

      {missedDays.length > 0 && (
        <Panel title={`⚠️ 未確認の日があります（${missedDays.length}件）`} style={{ borderColor:"#e63946" }}>
          <p style={{ fontSize:"11px", color:"#c62828", marginBottom:"8px" }}>
            確認を忘れている可能性があります。稼働があったのに確認し忘れると、その分の売上・報酬が記録されません。
          </p>
          <div style={{ display:"flex", flexDirection:"column", gap:"6px" }}>
            {missedDays.map(({ r, date, weekday }) => (
              <div key={`${r?.id}-${date}`} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", border:"1px solid #ffcdd2", background:"#fff5f5", borderRadius:"6px", padding:"8px 12px" }}>
                <div style={{ fontSize:"12px" }}>
                  <b>{date}（{WEEKDAY_LABELS[weekday]}）</b>　{customerName(r?.customerId)} — {driverName(r?.driverId)}
                </div>
                <div style={{ display:"flex", gap:"6px" }}>
                  <RetroBtn small onClick={()=>setStatus(r, date, "worked")} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>稼働あり</RetroBtn>
                  <RetroBtn small onClick={()=>setStatus(r, date, "no_work")} style={{ background:"#fff", color:"#666", borderColor:"#ccc" }}>稼働なし</RetroBtn>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel title={`本日（${today} ${WEEKDAY_LABELS[todayWeekday]}曜）の稼働確認`}>
        {dueToday.length === 0 ? (
          <div style={{ color:"#999", fontSize:"12px", padding:"12px 0", textAlign:"center" }}>本日確認対象の定期便はありません</div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:"6px" }}>
            {dueToday.map(r => {
              const status = getStatus(r?.id, today);
              return (
                <div key={r?.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", border:cardBorder, borderRadius:"6px", padding:"8px 12px", background: status === "worked" ? "#e8f5e9" : status === "no_work" ? "#f5f5f5" : "#fff" }}>
                  <div>
                    <div style={{ fontSize:"12px", fontWeight:700, color:"#333" }}>{customerName(r?.customerId)} — {driverName(r?.driverId)}</div>
                    <div style={{ fontSize:"11px", color:"#888" }}>
                      売上 ¥{(Number(r?.salesAmount)||0).toLocaleString()}　報酬 ¥{(Number(r?.driverPayAmount)||0).toLocaleString()}
                    </div>
                  </div>
                  {status === "worked" ? (
                    <RetroBtn small onClick={()=>undoStatus(r, today)} style={{ background:"#fff", color:"#e63946", borderColor:"#e63946" }}>✓ 稼働あり（取消）</RetroBtn>
                  ) : status === "no_work" ? (
                    <RetroBtn small onClick={()=>undoStatus(r, today)} style={{ background:"#fff", color:"#999", borderColor:"#ccc" }}>✓ 稼働なし（取消）</RetroBtn>
                  ) : (
                    <div style={{ display:"flex", gap:"6px" }}>
                      <RetroBtn small onClick={()=>setStatus(r, today, "worked")} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>稼働あり</RetroBtn>
                      <RetroBtn small onClick={()=>setStatus(r, today, "no_work")} style={{ background:"#fff", color:"#666", borderColor:"#ccc" }}>稼働なし</RetroBtn>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title={`定期便テンプレート一覧（${recurring.length}件）`}>
        <div style={{ marginBottom:"10px" }}>
          <RetroBtn onClick={openNew} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>＋新しい定期便を登録</RetroBtn>
        </div>
        {recurring.length === 0 ? (
          <div style={{ color:"#999", fontSize:"12px", padding:"12px 0", textAlign:"center" }}>まだ登録されていません</div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:"6px" }}>
            {recurring.map(r => (
              <div key={r?.id} onClick={()=>openEdit(r)} style={{ cursor:"pointer", border:cardBorder, borderRadius:"6px", padding:"8px 12px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <div style={{ fontSize:"12px", fontWeight:700, color:"#333" }}>
                    {customerName(r?.customerId)} — {driverName(r?.driverId)}
                    {r?.active === false && <span style={{ marginLeft:"8px", fontSize:"10px", color:"#999" }}>（停止中）</span>}
                    {(!drivers.some(d => d?.id === r?.driverId) || !customers.some(c => c?.id === r?.customerId)) && (
                      <span style={{ marginLeft:"8px", fontSize:"10px", color:"#e63946", fontWeight:700 }}>⚠️担当者が削除されています（確認対象から外れています）</span>
                    )}
                  </div>
                  <div style={{ fontSize:"11px", color:"#888" }}>
                    {(r?.daysOfWeek || []).map(d => WEEKDAY_LABELS[d]).join("・")}曜　
                    売上¥{(Number(r?.salesAmount)||0).toLocaleString()}　報酬¥{(Number(r?.driverPayAmount)||0).toLocaleString()}
                  </div>
                </div>
                <RetroBtn small onClick={(e)=>{ e.stopPropagation(); removeItem(r?.id); }} style={{ background:"#fff", color:"#e63946", borderColor:"#e63946" }}>削除</RetroBtn>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {showModal && (
        <Modal title={editingId ? "定期便編集" : "定期便登録"} onClose={()=>setShowModal(false)} width={480}>
          <Fl label="顧客"><RetroSelect value={form.customerId} onChange={e=>setForm(f=>({...f,customerId:e.target.value}))}>
            <option value="">選択</option>{customers.map(c=><option key={c?.id} value={c?.id}>{c?.name}</option>)}
          </RetroSelect></Fl>
          <Fl label="ドライバー"><RetroSelect value={form.driverId} onChange={e=>setForm(f=>({...f,driverId:e.target.value}))}>
            <option value="">選択</option>{drivers.map(d=><option key={d?.id} value={d?.id}>{d?.name}</option>)}
          </RetroSelect></Fl>
          <Fl label="仕事種別（任意）"><RetroSelect value={form.jobTypeId} onChange={e=>setForm(f=>({...f,jobTypeId:e.target.value}))}>
            <option value="">未設定</option>{jobTypes.map(j=><option key={j?.id} value={j?.id}>{j?.name}</option>)}
          </RetroSelect></Fl>
          <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"6px 12px" }}>
            <Fl label="1日あたりの売上額"><RetroInput type="number" min="0" value={form.salesAmount} onChange={e=>setForm(f=>({...f,salesAmount:e.target.value}))}/></Fl>
            <Fl label="1日あたりのドライバー報酬額"><RetroInput type="number" min="0" value={form.driverPayAmount} onChange={e=>setForm(f=>({...f,driverPayAmount:e.target.value}))}/></Fl>
          </div>
          <Fl label="稼働する曜日">
            <div style={{ display:"flex", gap:"4px" }}>
              {WEEKDAY_LABELS.map((label, dow) => (
                <button key={dow} onClick={()=>toggleDay(dow)} style={{
                  flex:1, padding:"6px 0", borderRadius:"4px", border:"1px solid #ddd", cursor:"pointer",
                  background: form.daysOfWeek.includes(dow) ? "#00a09a" : "#fff",
                  color: form.daysOfWeek.includes(dow) ? "#fff" : "#666", fontSize:"12px", fontWeight:700,
                }}>{label}</button>
              ))}
            </div>
          </Fl>
          <Fl label="メモ"><RetroTextarea value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))}/></Fl>
          <Fl label="状態">
            <RetroSelect value={form.active ? "active" : "inactive"} onChange={e=>setForm(f=>({...f,active:e.target.value==="active"}))}>
              <option value="active">稼働中</option>
              <option value="inactive">停止中（契約終了・一時休止など）</option>
            </RetroSelect>
          </Fl>
          <div style={{ display:"flex", justifyContent:"flex-end", gap:"6px", marginTop:"10px" }}>
            <RetroBtn onClick={()=>setShowModal(false)}>キャンセル</RetroBtn>
            <RetroBtn onClick={save} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>保存</RetroBtn>
          </div>
        </Modal>
      )}
    </div>
  );
};

/**

/**
 * 【重要】approvalStatus が無い古いデータは "approved" とみなす。
 * ハコマネで事務員が直接入力した実績は「会社自身の入力」なので承認済みで正しい。
 * ここを undefined のまま未承認扱いにすると、既存の売上が全部消える。
 */
const APPROVAL = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  APPROVED: "approved",
  REJECTED: "rejected",
};

const APPROVAL_LABELS = {
  draft: "下書き",
  submitted: "承認待ち",
  approved: "承認済み",
  rejected: "差戻し",
};

/** 実績が売上・報酬に計上されるか。ステータス未設定の既存データは承認済み扱い。 */
const isApprovedRecord = (r) => {
  if (!r) return false;
  const s = r.approvalStatus;
  // 未設定 = ハコマネで会社が直接入力した実績 → 承認済みとして扱う
  if (s == null || s === "") return true;
  return s === APPROVAL.APPROVED;
};

/** まだ確定していない（会社の対応が必要な）実績か */
const isPendingRecord = (r) =>
  !!r && (r.approvalStatus === APPROVAL.SUBMITTED || r.approvalStatus === APPROVAL.DRAFT);

/**
 * ===== 月次ロック（締め処理）=====
 *
 * 報酬を振り込んだ後に過去の実績を書き換えられると、経理が成立しない。
 * 締めた月は、ドライバーも事務員も編集できないようにする。
 * companyInfo.closedMonths に "YYYY-MM" の配列で保持する。
 */
const isMonthClosed = (companyInfo, month) => {
  const list = Array.isArray(companyInfo?.closedMonths) ? companyInfo.closedMonths : [];
  return list.includes(month);
};

/**
 * ===== パスワードのハッシュ化（ハコログ側と完全に同じロジック）=====
 *
 * ハコログの認証で使う password_hash と一致させる必要があるため、
 * アルゴリズム・ソルトの作り方を1文字も変えず、そのまま複製している。
 * どちらか片方だけ変更すると、ドライバーが正しいパスワードを入れても
 * ログインできなくなるため、修正する場合は両方のファイルを同時に直すこと。
 */
async function hashPassword(driverId, password) {
  const salted = `hakolog:${String(driverId).toUpperCase().trim()}:${String(password).trim()}`;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salted));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * ===== 報酬計算エンジン（仕様書③報酬自動計算）=====
 *
 * ある月・あるドライバーの配送実績から、支給・控除・最終振込金額までを一括で算出する。
 *
 * 【設計方針】
 * 計算式をこの1箇所にまとめている。報酬明細PDF・振込一覧・分析画面はすべて
 * この関数の戻り値だけを使うこと。画面ごとに計算式を書くと、以前の消費税バグと
 * 同じように「画面によって金額が違う」という最悪の不具合が起きる。
 *
 * 【承認】
 * 承認済みの実績だけを計上する。未承認（申請中・下書き・差戻し）は金額に含めず、
 * 「承認待ちが何件あるか」だけを別途返す。承認前に振り込んでしまう事故を防ぐため。
 *
 * 【控除の考え方】
 * - ロイヤリティ: 売上に対する率、または固定金額。ドライバーごとに設定。
 * - 定額控除（リース・保険・制服・備品・その他）: 月に1回だけ引く。
 *   稼働が0日の月は控除しない（働いていない月に請求すると現場が混乱するため）。
 *
 * @param {object} driver ドライバー
 * @param {Array} records そのドライバー・その月の dailyRecords（未承認も含めてよい）
 * @param {string} month "YYYY-MM"
 * @returns {object} 明細の全内訳
 */
/**
 * @param {object} driver ドライバー
 * @param {Array} records そのドライバー・その月の dailyRecords（未承認も含めてよい）
 * @param {string} month "YYYY-MM"
 * @param {object|null} snapshot 月を締めた時点で固定されたドライバー設定
 *   （リース料・保険料・ロイヤリティ率など）。締め済みの月を計算する際は
 *   必ずこれを渡すこと。渡さなければ「今」の設定を使ってしまい、
 *   締めた後に会社がリース料等を変更すると、過去の確定金額まで
 *   静かに変わってしまう（実際に検証で見つかった不具合）。
 *   締めていない当月の計算では null のままでよい（最新設定を使うのが正しい）。
 */
const calcDriverPayout = (driver, records, month, snapshot = null) => {
  const n = (v) => Number(v) || 0;
  const all = (Array.isArray(records) ? records : []).filter(Boolean);
  // 締め済みの月なら固定された設定を、そうでなければ現在の設定を使う。
  const cfg = snapshot || driver || {};

  // ★承認済みだけを金額に計上する
  const list = all.filter(isApprovedRecord);
  const pending = all.filter(isPendingRecord);

  // --- 支給の内訳を実績から集計 ---
  let baseReward = 0;      // 基本報酬（個数×支払単価など）
  let charter = 0;         // チャーター
  let highway = 0;         // 高速代（立替）
  let parking = 0;         // 駐車場代（立替）
  let fuel = 0;            // 燃料補助
  let otherAllowance = 0;  // その他支給
  let sales = 0;           // このドライバーが生んだ売上（ロイヤリティ計算と利益分析に使う）

  list.forEach((r) => {
    sales += n(r?.salesAmount);
    charter += n(r?.charterDriver);
    highway += n(r?.highwayFee);
    parking += n(r?.parkingFee);
    fuel += n(r?.fuelAllowance);
    otherAllowance += n(r?.otherAllowance);
    // driverAmount は「基本報酬＋チャーター＋実費・手当」の合計として保存されている。
    // 基本報酬だけを取り出すため、加算項目を差し引く。
    const addOns = n(r?.charterDriver) + n(r?.highwayFee) + n(r?.parkingFee) + n(r?.fuelAllowance) + n(r?.otherAllowance);
    baseReward += n(r?.driverAmount) - addOns;
  });

  // 稼働日数（同じ日に複数件あっても1日と数える）
  const workDays = new Set(list.map((r) => r?.date).filter(Boolean)).size;
  // 配送個数の合計（ランキング・KPIで使う）
  const totalCount = list.reduce((sum, r) => sum + n(r?.count), 0);

  const grossPay = baseReward + charter + highway + parking + fuel + otherAllowance;

  // --- 控除 ---
  // ロイヤリティは売上に対して発生させる（率の場合）。
  let royalty = 0;
  if (cfg?.royaltyType === "fixed") {
    royalty = n(cfg?.royaltyFixed);
  } else if (cfg?.royaltyType === "none") {
    royalty = 0;
  } else {
    // 既定は率。未設定（空）の場合は 0 として扱う。
    royalty = Math.round(sales * (n(cfg?.royaltyRate) / 100));
  }

  // 定額控除は「その月に1日でも稼働していれば」引く。
  // 稼働ゼロの月にリース代等を請求すると現場の実務と合わないため。
  const hasWork = workDays > 0;
  const lease = hasWork ? n(cfg?.leaseMonthly) : 0;
  const insurance = hasWork ? n(cfg?.insuranceMonthly) : 0;
  const uniform = hasWork ? n(cfg?.uniformMonthly) : 0;
  const supplies = hasWork ? n(cfg?.suppliesMonthly) : 0;
  const otherDeduction = hasWork ? n(cfg?.otherDeductionMonthly) : 0;
  // 稼働があるのにロイヤリティだけ発生するのは不自然なので、こちらも稼働ゼロなら0にする。
  if (!hasWork) royalty = 0;

  const totalDeduction = royalty + lease + insurance + uniform + supplies + otherDeduction;

  // 最終振込額。控除が支給を上回った場合はマイナスになり得る。
  // マイナスを勝手に0に丸めると「引くべき金額が消える」ため、そのまま返して
  // 画面側で警告を出す（実務では翌月繰越や現金回収の判断が必要になる）。
  //
  // 【重要】必ず整数（円）にすること。
  // 距離制・時間制の実績では driverAmount に小数が入り得るため、合算すると
  // 振込額が「4,444.777円」のような小数になる。銀行に小数の振込データは出せず、
  // 全銀CSVが確実にエラーになるため、ここで円単位に丸める。
  const netPay = Math.round(grossPay - totalDeduction);

  return {
    driverId: driver?.id,
    driverName: driver?.name || "",
    month,
    // 実績サマリー
    workDays,
    totalCount,
    sales: Math.round(sales),
    // 支給（すべて円単位の整数に揃える）
    baseReward: Math.round(baseReward),
    charter: Math.round(charter),
    highway: Math.round(highway),
    parking: Math.round(parking),
    fuel: Math.round(fuel),
    otherAllowance: Math.round(otherAllowance),
    grossPay: Math.round(grossPay),
    // 控除
    royalty: Math.round(royalty),
    lease: Math.round(lease),
    insurance: Math.round(insurance),
    uniform: Math.round(uniform),
    supplies: Math.round(supplies),
    otherDeduction: Math.round(otherDeduction),
    totalDeduction: Math.round(totalDeduction),
    // 最終
    netPay,
    isNegative: netPay < 0,

    // ★承認待ち（金額には含まれていない）
    // これがあるまま振り込むと「働いたのに払われていない」となる。必ず画面で警告する。
    pendingCount: pending.length,
    pendingDriverAmount: Math.round(
      pending.reduce((s, r) => s + n(r?.driverAmount), 0)
    ),
    pendingSales: Math.round(
      pending.reduce((s, r) => s + n(r?.salesAmount), 0)
    ),
    hasPending: pending.length > 0,

    // 明細PDFで一覧表示するための元データ（承認済みのみ）
    records: list,
    // 未承認も含めた全件（承認画面で使う）
    allRecords: all,
  };
};

/** 指定月("YYYY-MM")の実績だけを取り出す */
const filterRecordsByMonth = (records, month) =>
  (Array.isArray(records) ? records : []).filter(
    (r) => typeof r?.date === "string" && r.date.slice(0, 7) === month
  );

/**
 * 報酬明細PDF（仕様書④）のHTMLを組み立てる。
 * 既存の請求書PDFと同じ方式（新しいタブでHTMLを開き、ブラウザの印刷機能でPDF保存）。
 * 外部ライブラリを使わないため、日本語の文字化けや追加の依存関係が発生しない。
 */
/**
 * ===== 報酬明細書：本文パーツ（1人分）=====
 *
 * 単体発行(buildPayoutStatementHtml)と一括発行(buildBulkPayoutStatementHtml)の
 * 両方から呼ばれる共通部品。行の組み立てロジック（支給・控除・稼働明細）は
 * ここに1箇所だけ存在し、単体版と一括版で計算結果が食い違うことがないようにする。
 */
const buildPayoutStatementBody = (payout, companyInfo, driver) => {
  // XSS対策。ドライバー名や備考にHTMLタグが含まれていても、そのまま文字として表示する。
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => (
    { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]
  ));
  const yen = (v) => `¥${(Number(v) || 0).toLocaleString()}`;
  const co = companyInfo || {};
  const [yy, mm] = String(payout.month || "").split("-");
  const periodLabel = yy && mm ? `${yy}年${Number(mm)}月分` : payout.month;

  // 支給・控除の行。0円の項目は印字しない（明細が無駄に長くなり、見る側が疲れるため）。
  const payRows = [
    ["基本報酬", payout.baseReward],
    ["チャーター", payout.charter],
    ["高速代（立替精算）", payout.highway],
    ["駐車場代（立替精算）", payout.parking],
    ["燃料補助", payout.fuel],
    ["その他支給", payout.otherAllowance],
  ].filter(([, v]) => Number(v) !== 0);

  const dedRows = [
    ["ロイヤリティ", payout.royalty],
    ["車両リース料", payout.lease],
    ["保険料", payout.insurance],
    ["制服代", payout.uniform],
    ["備品代", payout.supplies],
    [driver?.otherDeductionNote || "その他控除", payout.otherDeduction],
  ].filter(([, v]) => Number(v) !== 0);

  const toRows = (arr) => arr.length
    ? arr.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${yen(v)}</td></tr>`).join("")
    : `<tr><td colspan="2" class="empty">該当なし</td></tr>`;

  // 稼働明細（日別）。件数が多い場合に備え、日付順にそろえる。
  const recordRows = [...(payout.records || [])]
    .sort((a, b) => String(a?.date || "").localeCompare(String(b?.date || "")))
    .map((r) => {
      const addOns = (Number(r?.charterDriver)||0) + (Number(r?.highwayFee)||0) +
                     (Number(r?.parkingFee)||0) + (Number(r?.fuelAllowance)||0) + (Number(r?.otherAllowance)||0);
      const base = (Number(r?.driverAmount)||0) - addOns;
      return `<tr>
        <td>${esc(r?.date)}</td>
        <td class="num">${r?.count ? esc(r.count) : "—"}</td>
        <td class="num">${yen(base)}</td>
        <td class="num">${addOns ? yen(addOns) : "—"}</td>
        <td class="num strong">${yen(r?.driverAmount)}</td>
      </tr>`;
    }).join("");

  const bankLine = driver?.bankName
    ? `${esc(driver.bankName)} ${esc(driver.branchName || "")} ${esc(driver.accountType || "普通")} ${esc(driver.accountNumber || "")} ${esc(driver.accountHolderKana || "")}`
    : "口座情報が未登録です";

  return `<div class="container">
      <div class="topbar"></div>
      <div class="header">
        <div>
          <div class="company">${esc(co.name || "配送管理株式会社")}</div>
          <div class="company-sub">
            ${co.address ? esc(co.address) + "<br/>" : ""}
            ${co.phone ? "TEL: " + esc(co.phone) : ""}
          </div>
        </div>
        <div class="doc-title">
          <div class="label">報酬明細書</div>
          <div class="meta">対象期間: ${esc(periodLabel)}</div>
          <div class="meta">発行日: ${esc(getTodayLocalStr())}</div>
        </div>
      </div>
      <div class="line"></div>

      <div class="to"><span class="name">${esc(payout.driverName)}</span> 様</div>

      <div class="summary">
        <div>
          <div class="label">お振込金額（支給合計 − 控除合計）</div>
          ${payout.isNegative ? '<div class="warn">※控除が支給を上回っています。ご確認ください。</div>' : ""}
        </div>
        <div class="amount">${yen(payout.netPay)}</div>
      </div>

      <div class="stats">
        <div>稼働日数<b>${payout.workDays}日</b></div>
        <div>配送個数<b>${payout.totalCount.toLocaleString()}個</b></div>
      </div>

      <div class="cols">
        <div class="col">
          <h3>支給</h3>
          <table>${toRows(payRows)}</table>
          <div class="subtotal"><span>支給合計</span><span>${yen(payout.grossPay)}</span></div>
        </div>
        <div class="col">
          <h3>控除</h3>
          <table>${toRows(dedRows)}</table>
          <div class="subtotal"><span>控除合計</span><span>${yen(payout.totalDeduction)}</span></div>
        </div>
      </div>

      <div class="detail">
        <h3 style="border:none;margin-bottom:0">稼働明細</h3>
        <table>
          <thead><tr>
            <th>日付</th><th class="num">個数</th><th class="num">基本報酬</th><th class="num">実費・手当</th><th class="num">計</th>
          </tr></thead>
          <tbody>${recordRows || '<tr><td colspan="5" class="empty">この月の稼働記録はありません</td></tr>'}</tbody>
        </table>
      </div>

      <div class="bank">
        <div class="label">振込先</div>
        <div>${bankLine}</div>
      </div>

      <div class="footer">${esc(co.name || "配送管理株式会社")}</div>
    </div>`;
};

/**
 * 報酬明細書（1人分）のHTML全体を組み立てる。
 * 中身の計算は buildPayoutStatementBody に集約しているため、ここでは
 * ページ全体の骨組み（style・印刷ボタン）だけを担当する。
 */
const buildPayoutStatementHtml = (payout, companyInfo, driver) => {
  const co = companyInfo || {};
  const esc = (v) => String(v ?? "").replace(/[&<>\"']/g, (c) => (
    { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]
  ));
  const [yy, mm] = String(payout.month || "").split("-");
  const periodLabel = yy && mm ? `${yy}年${Number(mm)}月分` : payout.month;
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"/>
    <title>報酬明細 ${esc(payout.driverName)} ${esc(periodLabel)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">
    <style>
      *{box-sizing:border-box}
      body{font-family:'Noto Sans JP',sans-serif;color:#222;margin:0;padding:24px;background:#f5f5f5}
      .container{max-width:800px;margin:0 auto;background:#fff;padding:32px 36px}
      .print-bar{margin-bottom:12px;text-align:right}
      .print-bar button{padding:8px 18px;font-size:13px;font-weight:700;color:#fff;background:#00a09a;border:none;border-radius:4px;cursor:pointer;font-family:inherit}
      .topbar{height:5px;background:linear-gradient(90deg,#00c2ba,#00655f);margin:-32px -36px 20px}
      .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px}
      .company{font-size:17px;font-weight:700}
      .company-sub{font-size:11px;color:#777;margin-top:2px;line-height:1.6}
      .doc-title{text-align:right}
      .doc-title .label{font-size:22px;font-weight:700;letter-spacing:3px}
      .doc-title .meta{font-size:12px;color:#666;margin-top:4px}
      .line{height:2px;background:#222;margin:12px 0 18px}
      .to{font-size:15px;font-weight:700;margin-bottom:4px}
      .to .name{font-size:19px}
      .summary{display:flex;justify-content:space-between;align-items:center;background:#f0fbfa;border:1px solid #b2dfdb;border-radius:6px;padding:16px 20px;margin:16px 0}
      .summary .label{font-size:12px;color:#00695c;font-weight:700}
      .summary .amount{font-size:32px;font-weight:700;color:#00695c}
      .summary .warn{font-size:12px;color:#c62828;font-weight:700}
      .stats{display:flex;gap:24px;font-size:12px;color:#555;margin-bottom:16px}
      .stats b{font-size:15px;color:#222;margin-left:4px}
      .cols{display:flex;gap:20px}
      .col{flex:1}
      h3{font-size:13px;margin:0 0 6px;padding-bottom:4px;border-bottom:2px solid #222}
      table{width:100%;border-collapse:collapse}
      td,th{padding:6px 4px;font-size:12px;border-bottom:1px solid #e5e5e5}
      .num{text-align:right;font-variant-numeric:tabular-nums}
      .strong{font-weight:700}
      .empty{color:#999;text-align:center}
      .subtotal{display:flex;justify-content:space-between;padding:8px 4px;margin-top:4px;border-top:2px solid #222;font-weight:700;font-size:13px}
      .detail{margin-top:24px}
      .detail thead th{background:#fafafa;border-top:2px solid #222;border-bottom:2px solid #222;text-align:left;font-size:11px}
      .bank{margin-top:20px;background:#f8f8f8;border-left:4px solid #00a09a;padding:10px 14px;font-size:12px}
      .bank .label{font-size:11px;color:#777;font-weight:700;margin-bottom:2px}
      .footer{margin-top:24px;text-align:center;font-size:10px;color:#999}
      @page{ size: A4; margin: 12mm; }
      @media print{
        body{background:#fff;padding:0}
        /* コンテナ幅がA4の印刷可能幅（約21cm弱）を超えないよう、
           印刷時は画面表示用の固定幅(800px)をリセットする。
           これが無いと、環境によって右端が欠けたり、意図せず
           縮小されて見づらくなったりする。 */
        .container{padding:0; max-width:100%; width:100%}
        .print-bar{display:none}
        .detail{page-break-inside:auto}
        tr{page-break-inside:avoid}
      }
    </style></head><body>
    <div class="print-bar"><button onclick="window.print()">印刷 / PDF保存</button></div>
    ${buildPayoutStatementBody(payout, companyInfo, driver)}
    </body></html>`;
};

/**
 * ===== 報酬明細書の一括発行 =====
 *
 * ポップアップを人数分開くとブラウザのポップアップブロックに引っかかりやすく、
 * 何人分も開けば本人の作業も大変になるため、
 * 全員分を1つのHTML文書に連結し、ドライバーごとにページを区切って
 * 、印刷（または「PDFとして保存」）を一回行うだけで全員分が出力できるようにする。
 *
 * ページ区切りは page-break-after:always で実現し、
 * 最後の1人には付けない（余分な白ページが最後に一枚増えるのを防ぐため）。
 */
const buildBulkPayoutStatementHtml = (payouts, companyInfo, drivers) => {
  const co = companyInfo || {};
  const esc = (v) => String(v ?? "").replace(/[&<>\"']/g, (c) => (
    { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]
  ));
  const bodies = payouts.map((payout, i) => {
    const driver = drivers.find((d) => d?.id === payout.driverId);
    const body = buildPayoutStatementBody(payout, companyInfo, driver);
    // 最後の1人以外は、次のドライバー分を新しいページに送る。
    const pageBreak = i < payouts.length - 1 ? ' style="page-break-after:always"' : "";
    return body.replace('<div class="container">', `<div class="container"${pageBreak}>`);
  }).join("\n");
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"/>
    <title>報酬明細一括発行 — ${esc(payouts[0]?.month || "")}</title>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">
    <style>
      *{box-sizing:border-box}
      body{font-family:'Noto Sans JP',sans-serif;color:#222;margin:0;padding:24px;background:#f5f5f5}
      .container{max-width:800px;margin:0 auto;background:#fff;padding:32px 36px}
      .print-bar{margin-bottom:12px;text-align:right}
      .print-bar button{padding:8px 18px;font-size:13px;font-weight:700;color:#fff;background:#00a09a;border:none;border-radius:4px;cursor:pointer;font-family:inherit}
      .topbar{height:5px;background:linear-gradient(90deg,#00c2ba,#00655f);margin:-32px -36px 20px}
      .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px}
      .company{font-size:17px;font-weight:700}
      .company-sub{font-size:11px;color:#777;margin-top:2px;line-height:1.6}
      .doc-title{text-align:right}
      .doc-title .label{font-size:22px;font-weight:700;letter-spacing:3px}
      .doc-title .meta{font-size:12px;color:#666;margin-top:4px}
      .line{height:2px;background:#222;margin:12px 0 18px}
      .to{font-size:15px;font-weight:700;margin-bottom:4px}
      .to .name{font-size:19px}
      .summary{display:flex;justify-content:space-between;align-items:center;background:#f0fbfa;border:1px solid #b2dfdb;border-radius:6px;padding:16px 20px;margin:16px 0}
      .summary .label{font-size:12px;color:#00695c;font-weight:700}
      .summary .amount{font-size:32px;font-weight:700;color:#00695c}
      .summary .warn{font-size:12px;color:#c62828;font-weight:700}
      .stats{display:flex;gap:24px;font-size:12px;color:#555;margin-bottom:16px}
      .stats b{font-size:15px;color:#222;margin-left:4px}
      .cols{display:flex;gap:20px}
      .col{flex:1}
      h3{font-size:13px;margin:0 0 6px;padding-bottom:4px;border-bottom:2px solid #222}
      table{width:100%;border-collapse:collapse}
      td,th{padding:6px 4px;font-size:12px;border-bottom:1px solid #e5e5e5}
      .num{text-align:right;font-variant-numeric:tabular-nums}
      .strong{font-weight:700}
      .empty{color:#999;text-align:center}
      .subtotal{display:flex;justify-content:space-between;padding:8px 4px;margin-top:4px;border-top:2px solid #222;font-weight:700;font-size:13px}
      .detail{margin-top:24px}
      .detail thead th{background:#fafafa;border-top:2px solid #222;border-bottom:2px solid #222;text-align:left;font-size:11px}
      .bank{margin-top:20px;background:#f8f8f8;border-left:4px solid #00a09a;padding:10px 14px;font-size:12px}
      .bank .label{font-size:11px;color:#777;font-weight:700;margin-bottom:2px}
      .footer{margin-top:24px;text-align:center;font-size:10px;color:#999}
      @page{ size: A4; margin: 12mm; }
      @media print{
        body{background:#fff;padding:0}
        /* コンテナ幅がA4の印刷可能幅（約21cm弱）を超えないよう、
           印刷時は画面表示用の固定幅(800px)をリセットする。
           これが無いと、環境によって右端が欠けたり、意図せず
           縮小されて見づらくなったりする。 */
        .container{padding:0; max-width:100%; width:100%}
        .print-bar{display:none}
        .detail{page-break-inside:auto}
        tr{page-break-inside:avoid}
      }
    </style></head><body>
    <div class="print-bar"><button onclick="window.print()">全員分を印刷 / PDF保存（${payouts.length}人分）</button></div>
    ${bodies}
    </body></html>`;
};


/**
 * ===== 変更履歴（横断検索）ページ =====
 *
 * ドライバー・車両・受注・請求書・実績・案件単価・支払・会社設定など、
 * あらゆる種別の変更履歴を1箇所で横断的に確認できる画面。
 * 個別の詳細画面（ドライバー編集の「履歴」タブ等）に行かなくても、
 * 「最近、誰が何を変えたか」を素早く確認できるようにする。
 */
const ChangeHistoryPage = ({ data, setData, tenantId, userRole }) => {
  const [filterType, setFilterType] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [openId, setOpenId] = useState(null);

  const entityTypeLabel = {
    driver: "ドライバー", vehicle: "車両", order: "受注", invoice: "請求書",
    daily_record: "実績", event: "予定", customer: "顧客", job_type: "案件・単価",
    payable: "支払", quality_record: "品質管理", company_info: "会社設定",
    recurring_assignment: "定期便",
  };
  const roleLabel = { office: "事務", admin: "管理者", super_admin: "システム管理者", dispatcher: "配車担当" };

  const allHistory = Array.isArray(data?.changeHistory) ? data.changeHistory : [];

  const filtered = allHistory
    .filter((h) => filterType === "all" || h?.entityType === filterType)
    .filter((h) => {
      if (!searchText.trim()) return true;
      const needle = searchText.trim().toLowerCase();
      return String(h?.entityLabel || "").toLowerCase().includes(needle) || String(h?.entityId || "").toLowerCase().includes(needle);
    })
    .filter((h) => !dateFrom || String(h?.changedAt || "").slice(0, 10) >= dateFrom)
    .filter((h) => !dateTo || String(h?.changedAt || "").slice(0, 10) <= dateTo)
    .sort((a, b) => String(b?.changedAt || "").localeCompare(String(a?.changedAt || "")));

  const fmt = (v) => {
    if (v == null || v === "") return "（空欄）";
    if (typeof v === "object") {
      // 万が一、循環参照を含むオブジェクトが紛れ込んでいても
      // JSON.stringify が例外を投げて履歴パネル全体がクラッシュしないよう保険をかける。
      try {
        return JSON.stringify(v);
      } catch {
        return "（表示できない形式のデータ）";
      }
    }
    return String(v);
  };
  const skipKeys = new Set(["_dbId", "id"]);

  // 種別ごとの件数（フィルタのプルダウンに件数を添えて、どこに何件あるか把握しやすくする）
  const countByType = allHistory.reduce((acc, h) => {
    acc[h?.entityType] = (acc[h?.entityType] || 0) + 1;
    return acc;
  }, {});

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ background: "#f0f2f5", border: "1px solid #dde1e6", borderRadius: "6px", padding: "8px 10px", color: "#666", fontSize: "12px" }}>
        ドライバー・車両・受注・請求書・実績・案件単価・支払・会社設定など、編集されたデータの「変更前」の内容を記録しています。新規作成時は記録されません。
      </div>
      <LoadOlderDataBanner type="changeHistory" data={data} setData={setData} tenantId={tenantId} />

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "flex-end" }}>
        <Fl label="種別">
          <RetroSelect value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ width: "160px" }}>
            <option value="all">すべて（{allHistory.length}件）</option>
            {Object.entries(entityTypeLabel).map(([k, label]) => (
              <option key={k} value={k}>{label}（{countByType[k] || 0}件）</option>
            ))}
          </RetroSelect>
        </Fl>
        <Fl label="検索（対象の名前・IDなど）">
          <RetroInput value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="例：山田太郎、D001" style={{ width: "200px" }} />
        </Fl>
        <Fl label="期間（から）">
          <RetroInput type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </Fl>
        <Fl label="期間（まで）">
          <RetroInput type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </Fl>
        {(filterType !== "all" || searchText || dateFrom || dateTo) && (
          <RetroBtn small onClick={() => { setFilterType("all"); setSearchText(""); setDateFrom(""); setDateTo(""); }} style={{ marginBottom: "8px" }}>
            条件をクリア
          </RetroBtn>
        )}
      </div>

      <div style={{ fontSize: "12px", color: "#888" }}>{filtered.length}件 表示中</div>

      {filtered.length === 0 ? (
        <div style={{ color: "#999", fontSize: "12px", padding: "40px 0", textAlign: "center", border: cardBorder, borderRadius: "6px", background: "#fff" }}>
          {allHistory.length === 0 ? "変更履歴はまだありません" : "条件に一致する履歴がありません"}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {filtered.map((h) => (
            <div key={h.id} style={{ border: cardBorder, borderRadius: "6px", overflow: "hidden", background: "#fff" }}>
              <button
                onClick={() => setOpenId((cur) => (cur === h.id ? null : h.id))}
                style={{
                  width: "100%", textAlign: "left", background: openId === h.id ? "#f0f2f5" : "#fff",
                  border: "none", padding: "10px 12px", cursor: "pointer", fontSize: "12px",
                  display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap",
                }}
              >
                <span>
                  <span style={{
                    display: "inline-block", fontSize: "10px", fontWeight: 700, color: "#00a09a",
                    background: "#e8f5f4", borderRadius: "3px", padding: "2px 6px", marginRight: "8px",
                  }}>
                    {entityTypeLabel[h.entityType] || h.entityType}
                  </span>
                  <b>{h.entityLabel || h.entityId}</b>
                  <span style={{ color: "#999", marginLeft: "8px" }}>
                    {String(h.changedAt || "").slice(0, 16).replace("T", " ")}　{roleLabel[h.changedByRole] || h.changedByRole || "不明"}が変更
                  </span>
                </span>
                <span style={{ color: "#999" }}>{openId === h.id ? "閉じる ▲" : "詳細 ▼"}</span>
              </button>
              {openId === h.id && (
                <div style={{ padding: "10px 14px", background: "#fafbfc", borderTop: cardBorder, fontSize: "12px" }}>
                  <p style={{ color: "#888", marginBottom: "6px" }}>この内容は「変更される直前」の状態です。</p>
                  <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", rowGap: "4px" }}>
                    {Object.entries(h.snapshot || {})
                      .filter(([k]) => !skipKeys.has(k))
                      .map(([k, v]) => (
                        <Fragment key={k}>
                          <div style={{ color: "#777", fontWeight: 700 }}>{k}</div>
                          <div style={{ color: "#333", wordBreak: "break-all" }}>{fmt(v)}</div>
                        </Fragment>
                      ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};


/**
 * ===== 報酬・振込ページ（仕様書③④⑤）=====
 * 月を選ぶ → 全ドライバーの報酬が自動計算されて一覧表示 → 明細PDF / 振込CSV を出力。
 */
const PayoutPage = ({ data, setData, tenantId, userRole, isMobile, setPage }) => {
  const drivers = (Array.isArray(data?.drivers) ? data.drivers : []).filter(d => !d?.deleted);
  // 履歴一覧では、既に退職・削除済みのドライバーの過去の実績も
  // 振り返れるようにしたいため、削除済みも含めた一覧を別途用意する
  // （通常の報酬計算・一覧表示には引き続き使わない）。
  const allDriversForHistory = Array.isArray(data?.drivers) ? data.drivers : [];
  const dailyRecords = Array.isArray(data?.dailyRecords) ? data.dailyRecords : [];
  const companyInfo = data?.companyInfo || null;

  const [month, setMonth] = useState(() => getTodayLocalStr().slice(0, 7));
  const [detailDriverId, setDetailDriverId] = useState(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmReopen, setConfirmReopen] = useState(false);
  const [closeResultMsg, setCloseResultMsg] = useState("");
  // 過去の明細をPDFで1件ずつ開かなくても、月ごとの合計を一覧で見られるようにする。
  const [showHistory, setShowHistory] = useState(false);
  const [historyDriverId, setHistoryDriverId] = useState("");
  const [historyMonths, setHistoryMonths] = useState(12);

  const yen = (v) => `¥${(Number(v) || 0).toLocaleString()}`;

  // 月のレコードを1回だけ絞り込み、ドライバーごとに報酬を計算する。
  // useMemo を使うのは、ドライバー数が増えると毎回の再描画で重くなるため
  // （仕様書の「500名以上まで運用できる」要件に対応）。
  const payouts = useMemo(() => {
    const monthRecords = filterRecordsByMonth(dailyRecords, month);
    // ドライバーIDごとにレコードを振り分け（毎回 filter すると O(n×m) になり
    // ドライバー500名 × 実績1万件で重くなるため、1回の走査でグループ化する）
    const byDriver = new Map();
    monthRecords.forEach((r) => {
      const key = r?.driverId;
      if (!key) return;
      if (!byDriver.has(key)) byDriver.set(key, []);
      byDriver.get(key).push(r);
    });
    // 締め済みの月なら、締めた瞬間に固定した設定を使う（今の設定は使わない）。
    const monthSnapshot = companyInfo?.monthSnapshots?.[month] || null;
    return drivers.map((d) => calcDriverPayout(d, byDriver.get(d?.id) || [], month, monthSnapshot?.[d?.id] || null));
  }, [drivers, dailyRecords, month, companyInfo]);

  // 稼働があったドライバーだけを振込対象にする（稼働ゼロの人に0円振込は不要）
  const activePayouts = payouts.filter((p) => p.workDays > 0);

  /**
   * ===== 月ごとの履歴一覧 =====
   *
   * 過去の明細をPDFで1件ずつ開いて確認するのは手間がかかるため、
   * 直近数ヶ月分の「支給合計・控除合計・振込合計」を一覧で見られるようにする。
   * 12ヶ月 × 全ドライバー分を毎回フルスキャンすると重くなるため、
   * 実績データは「月＋ドライバー」単位で1回だけグループ化してから使い回す。
   */
  const monthlyHistory = useMemo(() => {
    const byMonthDriver = new Map();
    dailyRecords.forEach((r) => {
      const recMonth = String(r?.date || "").slice(0, 7);
      const key = `${recMonth}|${r?.driverId}`;
      if (!byMonthDriver.has(key)) byMonthDriver.set(key, []);
      byMonthDriver.get(key).push(r);
    });

    const months = [];
    const [baseY, baseM] = month.split("-").map(Number);
    for (let i = 0; i < historyMonths; i++) {
      const d = new Date(baseY, baseM - 1 - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }

    // 特定のドライバーを選んでいる場合は、その人だけに絞って集計する。
    const targetDrivers = historyDriverId ? allDriversForHistory.filter((d) => d?.id === historyDriverId) : drivers;

    return months.map((m) => {
      const monthSnapshot = companyInfo?.monthSnapshots?.[m] || null;
      const monthPayouts = targetDrivers.map((d) =>
        calcDriverPayout(d, byMonthDriver.get(`${m}|${d?.id}`) || [], m, monthSnapshot?.[d?.id] || null)
      );
      const activeCount = monthPayouts.filter((p) => p.workDays > 0).length;
      return {
        month: m,
        closed: isMonthClosed(companyInfo, m),
        driverCount: activeCount,
        // ドライバーを1人だけ選んでいる場合、稼働日数・件数もあわせて見せる。
        workDays: monthPayouts.reduce((s, p) => s + (p.workDays || 0), 0),
        totalCount: monthPayouts.reduce((s, p) => s + (p.totalCount || 0), 0),
        grossTotal: monthPayouts.reduce((s, p) => s + (p.grossPay || 0), 0),
        deductionTotal: monthPayouts.reduce((s, p) => s + (p.totalDeduction || 0), 0),
        netTotal: monthPayouts.reduce((s, p) => s + (p.netPay || 0), 0),
      };
    });
  }, [dailyRecords, drivers, allDriversForHistory, companyInfo, month, historyMonths, historyDriverId]);

  /**
   * ===== ドライバー請求書の自動生成 =====
   *
   * 月を締めた瞬間に、その月に稼働があった各ドライバー分の「請求書」を
   * 自動で作成する。個人事業主の委託ドライバーが、毎月自分で請求書を
   * 作って送る手間を無くすための機能。
   *
   * 【消費税・インボイス制度の扱い】
   * ドライバーが適格請求書発行事業者として登録済み（invoiceRegistered）なら、
   * 登録番号を明記した「適格請求書」として発行し、消費税額を明示する
   * （会社側が仕入税額控除を受けるために必要）。
   * 未登録の場合は、登録番号なしの請求書として発行する
   * （帳簿・支払記録として引き続き必要なため、請求書自体は発行する）。
   *
   * 顧客向けの自動請求（INV-AUTO-月-顧客ID）と同じ「1件ごとに税込計算してから
   * 合算する」方式に揃えている。ここが顧客請求と食い違うと、消費税額が
   * 1円単位でズレて、経理上の突合が取れなくなるため。
   */
  const generateDriverInvoicesForMonth = (targetMonth) => {
    const already = new Set(
      (Array.isArray(data?.invoices) ? data.invoices : [])
        .filter((inv) => inv?.type === "driver_invoice" && !inv?.deleted)
        .map((inv) => inv.id)
    );
    const monthPayouts = payouts.filter((p) => p.month === targetMonth && p.workDays > 0);
    const newInvoices = [];

    monthPayouts.forEach((p) => {
      const id = `DINV-AUTO-${targetMonth}-${p.driverId}`;
      if (already.has(id)) return; // 既に発行済みなら重複生成しない

      const driver = drivers.find((d) => d?.id === p.driverId);
      // 請求金額は「会社がドライバーに支払う総支給額（grossPay）」を基準にする。
      // 控除（ロイヤリティ・リース代等）は会社側が別途相殺する内部処理であり、
      // ドライバー本人が「稼いで請求する額」とは性質が異なるため、
      // 請求書の金額は控除前の支給合計とする。
      const subtotal = p.grossPay;
      if (!(subtotal > 0)) return;

      const registered = !!driver?.invoiceRegistered;
      const tax = registered ? calcTax(subtotal) : 0;
      const total = subtotal + tax;

      const [y, m] = targetMonth.split("-").map(Number);
      const issueDate = getTodayLocalStr();
      const dueDate = formatDate(new Date(y, m, 15)); // 翌月15日払いを既定に

      newInvoices.push({
        id,
        _dbId: crypto.randomUUID(),
        type: "driver_invoice",
        driverId: p.driverId,
        driverName: p.driverName || driver?.name || p.driverId,
        issueDate,
        dueDate,
        amount: subtotal,
        tax,
        total,
        status: "unpaid",
        registered,
        invoiceRegNo: registered ? (driver?.invoiceRegNo || "") : "",
        note: `${targetMonth} 分 稼働実績に基づく自動生成請求書`,
        payoutMonth: targetMonth,
        lineItems: [{
          id: `LI-${Date.now()}`,
          name: `${targetMonth} 配送業務委託料（稼働${p.workDays}日 / ${p.totalCount.toLocaleString()}個）`,
          qty: 1,
          unitPrice: subtotal,
          subtotal,
        }],
      });
    });

    if (newInvoices.length === 0) return 0;
    setData((d) => ({ ...d, invoices: [...(Array.isArray(d?.invoices) ? d.invoices : []), ...newInvoices] }));
    return newInvoices.length;
  };

  const totals = activePayouts.reduce((acc, p) => ({
    sales: acc.sales + p.sales,
    gross: acc.gross + p.grossPay,
    deduction: acc.deduction + p.totalDeduction,
    net: acc.net + p.netPay,
    royalty: acc.royalty + p.royalty,
  }), { sales: 0, gross: 0, deduction: 0, net: 0, royalty: 0 });

  // 承認待ちがあるまま振り込むと「働いたのに払われていない」となり、最も揉める。
  // 振込作業の前に必ず気づけるよう、最上部に警告を出す。
  const pendingPayouts = activePayouts.filter((p) => p.hasPending);
  const totalPendingCount = payouts.reduce((s, p) => s + p.pendingCount, 0);
  /**
   * 【重要】実績データは起動時に直近15ヶ月分しか読み込まれない
   * （アーカイブ方式によるもの）。もしこの読み込み範囲より古い月を
   * 「過去のデータも読み込む」をせずに締めてしまうと、実際には
   * 稼働していたのに「稼働ゼロ」として扱われ、誤った内容のまま
   * 月が固定されてしまう危険がある。締める前に必ずこれを確認する。
   */
  const isMonthOutsideLoadedRange = month < defaultLoadCutoff().slice(0, 7);
  const totalPendingAmount = payouts.reduce((s, p) => s + p.pendingDriverAmount, 0);

  // 口座未登録・マイナス振込は、振込作業前に必ず気づく必要がある重大な問題。
  const missingBank = activePayouts.filter((p) => {
    const d = drivers.find((x) => x?.id === p.driverId);
    return !d?.bankName || !d?.accountNumber || !d?.accountHolderKana;
  });
  const negativePayouts = activePayouts.filter((p) => p.isNegative);

  const openStatement = (payout) => {
    const driver = drivers.find((d) => d?.id === payout.driverId);
    const html = buildPayoutStatementHtml(payout, companyInfo, driver);
    const w = window.open("", "_blank");
    if (!w) {
      window.alert("ポップアップがブロックされました。ブラウザの設定でこのサイトのポップアップを許可してください。");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  /**
   * 明細書の一括発行。
   * 稼働があった（振込対象の）ドライバー全員分を1つのタブにまとめて開く。
   * ポップアップを何十枚も開くとブラウザにブロックされたり、
   * 本人が何枚出たか把握できなくなったりするため、1つの文書に統一する。
   */
  const openBulkStatement = () => {
    if (activePayouts.length === 0) {
      window.alert("この月は振込対象のドライバーがいません。");
      return;
    }
    // ドライバー数が多いと、日別明細まで含めた1つの文書は数百KB～1MB近くになり、
    // ブラウザでの表示・印刷が重くなることがある。実測で500人規模だと
    // 900KB超のHTMLになったため、多い場合は事前に一声かける。
    if (activePayouts.length > 100) {
      const ok = window.confirm(
        `対象ドライバーが ${activePayouts.length}名 と多いため、表示や印刷に時間がかかる場合があります。\nこのまま一括発行しますか？`
      );
      if (!ok) return;
    }
    const html = buildBulkPayoutStatementHtml(activePayouts, companyInfo, drivers);
    const w = window.open("", "_blank");
    if (!w) {
      window.alert("ポップアップがブロックされました。ブラウザの設定でこのサイトのポップアップを許可してください。");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  const downloadCsv = (rows, headers, label) => {
    const escape = (val) => {
      const s = String(val ?? "").replace(/"/g, '""');
      return s.includes(",") || s.includes("\n") || s.includes('"') ? `"${s}"` : s;
    };
    const csv = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
    // BOM付きにしないと Excel で開いたときに日本語が文字化けする。
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${label}_${month}.csv`;
    a.click();
    // click() 直後に revokeObjectURL すると、ブラウザによっては
    // ダウンロードそのものが失敗する既知の不具合があるため、少し遅らせる。
    // 振込データという実害の大きいファイルのため、確実性を優先する。
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /** 振込一覧CSV（仕様書⑤）。実務でそのまま確認・手入力に使える形式。 */
  const downloadTransferCsv = () => {
    if (activePayouts.length === 0) {
      window.alert("この月に稼働実績のあるドライバーがいません。");
      return;
    }
    const headers = ["氏名", "銀行名", "銀行コード", "支店名", "支店コード", "預金種目", "口座番号", "口座名義", "振込金額"];
    const rows = activePayouts.map((p) => {
      const d = drivers.find((x) => x?.id === p.driverId) || {};
      return [
        p.driverName, d.bankName || "", d.bankCode || "", d.branchName || "", d.branchCode || "",
        d.accountType || "", d.accountNumber || "", d.accountHolderKana || "", p.netPay,
      ];
    });
    downloadCsv(rows, headers, "振込一覧");
  };

  /**
   * 全銀フォーマット（総合振込）CSV。
   * 全銀データは本来は固定長テキストだが、多くの銀行のインターネットバンキングは
   * CSV取込に対応しているため、まずは各行の項目をCSVで出力する。
   * 将来、固定長テキストが必要になった場合も、この関数の出力部分だけを差し替えればよい
   * （項目の並びは全銀の「データレコード」に合わせてある）。
   */
  const downloadZenginCsv = () => {
    // 名義カナに漢字・ひらがな等が入っていると銀行で弾かれる。
    // 入力時の警告を無視して保存された場合の最後の砦として、出力直前にも必ず検証する。
    const kanaNg = activePayouts
      .map((p) => {
        const d = drivers.find((x) => x?.id === p.driverId) || {};
        const warn = validateBankKana(d.accountHolderKana);
        return warn ? { name: p.driverName, warn } : null;
      })
      .filter(Boolean);
    if (kanaNg.length > 0) {
      window.alert(
        "以下のドライバーの口座名義に、振込に使えない文字が含まれています。\n" +
        "このまま銀行に提出すると振込エラーになります。修正してください。\n\n" +
        kanaNg.map((k) => `・${k.name}：${k.warn}`).join("\n")
      );
      return;
    }

    const invalid = activePayouts.filter((p) => {
      const d = drivers.find((x) => x?.id === p.driverId) || {};
      return !d.bankCode || !d.branchCode || !d.accountNumber || !d.accountHolderKana || p.netPay <= 0;
    });
    if (invalid.length > 0) {
      const names = invalid.map((p) => p.driverName).join("、");
      const ok = window.confirm(
        `以下のドライバーは、銀行コード・支店コード・口座番号・名義のいずれかが未登録、または振込額が0円以下のため、全銀データから除外されます。\n\n${names}\n\nこのまま出力しますか？`
      );
      if (!ok) return;
    }
    const target = activePayouts.filter((p) => !invalid.includes(p));
    if (target.length === 0) {
      window.alert("出力できる振込データがありません。ドライバーの口座情報を登録してください。");
      return;
    }
    // 全銀のデータレコードに準じた項目順
    const headers = ["銀行コード", "支店コード", "預金種目", "口座番号", "受取人名（カナ）", "振込金額"];
    const typeCode = { "普通": "1", "当座": "2", "貯蓄": "4" };
    const rows = target.map((p) => {
      const d = drivers.find((x) => x?.id === p.driverId) || {};
      return [
        d.bankCode, d.branchCode, typeCode[d.accountType] || "1",
        d.accountNumber, d.accountHolderKana, p.netPay,
      ];
    });
    downloadCsv(rows, headers, "全銀振込データ");
  };

  const detailPayout = payouts.find((p) => p.driverId === detailDriverId) || null;
  const detailDriver = drivers.find((d) => d?.id === detailDriverId) || null;

  const yenIcon = <Icon size={14}><path d="M12 12v8M8 4l4 6 4-6M7 12h10M7 16h10"/></Icon>;
  const pdfIcon = <Icon size={12}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></Icon>;
  const csvIcon = <Icon size={12}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></Icon>;
  const historyIcon = <Icon size={12}><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l4 2"/></Icon>;

  const Stat = ({ label, value, color }) => (
    <div style={{ border:cardBorder, borderRadius:"6px", background:"#fff", padding:"10px 12px", flex:1, minWidth:"130px" }}>
      <div style={{ fontSize:"11px", color:"#888", marginBottom:"3px" }}>{label}</div>
      <div style={{ fontSize:"18px", fontWeight:700, color: color || "#222" }}>{value}</div>
    </div>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
      <LoadOlderDataBanner type="dailyRecords" data={data} setData={setData} tenantId={tenantId} />
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:"8px" }}>
        <div style={{ fontSize:"14px", fontWeight:700, color:"#222" }}>報酬・振込</div>
        <div style={{ display:"flex", gap:"6px", alignItems:"center", flexWrap:"wrap" }}>
          <RetroInput
            type="month"
            value={month}
            onChange={(e) => { setMonth(e.target.value); setDetailDriverId(null); }}
            style={{ width:"150px" }}
          />
          <RetroBtn onClick={()=>setShowHistory(v=>!v)} style={{ background: showHistory ? "#00a09a" : "#fff", borderColor:"#00a09a", color: showHistory ? "#fff" : "#00a09a" }}>
            {historyIcon}{showHistory ? "履歴を閉じる" : "履歴を一覧で見る"}
          </RetroBtn>
          <RetroBtn onClick={downloadTransferCsv} style={{ background:"#fff", borderColor:"#00a09a", color:"#00a09a" }}>{csvIcon}振込一覧CSV</RetroBtn>
          <RetroBtn onClick={downloadZenginCsv} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>{csvIcon}全銀データCSV</RetroBtn>
          <RetroBtn onClick={openBulkStatement} style={{ background:"#fff", borderColor:"#e65100", color:"#e65100" }}>{pdfIcon}明細一括発行（{activePayouts.length}名）</RetroBtn>
          {isMonthClosed(companyInfo, month) ? (
            <>
              <span style={{ fontSize:"12px", fontWeight:700, color:"#c62828", background:"#ffebee", padding:"6px 12px", borderRadius:"4px" }}>
                🔒 締め済み
              </span>
              {/* 誤って締めてしまった場合の救済措置。ただし取り消すと承認・締めの
                  「確定」という保証が崩れるため、より強い権限（admin以上）に限定する。 */}
              {(userRole === "admin" || userRole === "super_admin") && (
                <RetroBtn small onClick={() => setConfirmReopen(true)} style={{ background:"#fff", borderColor:"#999", color:"#999" }}>
                  締めを解除
                </RetroBtn>
              )}
            </>
          ) : (
            <RetroBtn onClick={() => setConfirmClose(true)} style={{ background:"#fff", borderColor:"#555", color:"#555" }}>
              この月を締める
            </RetroBtn>
          )}
        </div>
      </div>

      {showHistory && (
        <Panel title="支払明細の履歴（月ごとの合計）">
          <p style={{ fontSize:"11px", color:"#888", marginBottom:"8px" }}>
            月ごとの合計です。PDFを1件ずつ開かなくても、ここで概況を確認できます。「詳細を見る」で、その月の内訳・明細PDF発行に移動します。
          </p>
          <Fl label="ドライバーで絞り込む（未選択なら全員の合計）">
            <RetroSelect value={historyDriverId} onChange={(e)=>setHistoryDriverId(e.target.value)} style={{ width:"220px" }}>
              <option value="">全ドライバー合計</option>
              {/* 退職・削除済みのドライバーも、過去の実績を振り返れるよう
                  あえて選択肢に残す（削除済みだと分かるようラベルを付ける）。 */}
              {allDriversForHistory.map(d => <option key={d?.id} value={d?.id}>{d?.name}{d?.deleted ? "（削除済み）" : ""}</option>)}
            </RetroSelect>
          </Fl>
          <div style={{ overflow:"auto", marginTop:"8px" }}>
            <table style={{ minWidth:"100%", width:"max-content", borderCollapse:"collapse", fontSize:"12px" }}>
              <thead>
                <tr style={{ background:"#fafbfc" }}>
                  {(historyDriverId
                    ? ["月","状態","稼働日数","件数","支給合計","控除合計","振込合計","操作"]
                    : ["月","状態","対象人数","支給合計","控除合計","振込合計","操作"]
                  ).map(h => (
                    <th key={h} style={{ color:"#666", fontSize:"11px", padding:"8px 10px", textAlign: ["月","状態","操作"].includes(h) ? "left" : "right", fontWeight:700, whiteSpace:"nowrap", borderBottom:cardBorder }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthlyHistory.map((row) => (
                  <tr key={row.month} style={{ borderBottom:"1px solid #f0f0f0" }}>
                    <td style={{ padding:"8px 10px", fontWeight:700 }}>{row.month}</td>
                    <td style={{ padding:"8px 10px" }}>
                      {row.closed
                        ? <span style={{ fontSize:"11px", color:"#c62828" }}>🔒締め済み</span>
                        : <span style={{ fontSize:"11px", color:"#999" }}>未締め</span>}
                    </td>
                    {historyDriverId ? (
                      <>
                        <td style={{ padding:"8px 10px", textAlign:"right" }}>{row.workDays}日</td>
                        <td style={{ padding:"8px 10px", textAlign:"right" }}>{row.totalCount}件</td>
                      </>
                    ) : (
                      <td style={{ padding:"8px 10px", textAlign:"right" }}>{row.driverCount}名</td>
                    )}
                    <td style={{ padding:"8px 10px", textAlign:"right" }}>{yen(row.grossTotal)}</td>
                    <td style={{ padding:"8px 10px", textAlign:"right", color:"#e63946" }}>{yen(row.deductionTotal)}</td>
                    <td style={{ padding:"8px 10px", textAlign:"right", fontWeight:700, color:"#007a74" }}>{yen(row.netTotal)}</td>
                    <td style={{ padding:"8px 10px" }}>
                      <RetroBtn small onClick={()=>{
                        setMonth(row.month); setShowHistory(false);
                        // 【重要】詳細表示は現役ドライバーだけを対象にしているため、
                        // 退職・削除済みドライバーの履歴からは詳細画面に飛べない
                        // （飛ばしても中身が見つからず空白になってしまうため）。
                        // その場合は月を切り替えるだけにとどめる。
                        if (historyDriverId && drivers.some(d => d?.id === historyDriverId)) setDetailDriverId(historyDriverId);
                      }} style={{ background:"#fff", color:"#00a09a", borderColor:"#00a09a" }}>詳細を見る</RetroBtn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {historyMonths < 36 && (
            <div style={{ marginTop:"8px", textAlign:"center" }}>
              <RetroBtn small onClick={()=>setHistoryMonths(v=>v+12)} style={{ background:"#fff", color:"#666", borderColor:"#ccc" }}>さらに12ヶ月分読み込む</RetroBtn>
            </div>
          )}
        </Panel>
      )}

      {/* ★承認待ちがあるまま振り込むと「働いたのに払われていない」となる。最優先で警告する。 */}
      {totalPendingCount > 0 && (
        <div style={{ background:"#ffebee", border:"2px solid #c62828", borderRadius:"6px", padding:"12px 14px", fontSize:"12px", color:"#c62828" }}>
          <div style={{ fontWeight:700, fontSize:"13px", marginBottom:"4px" }}>
            ⚠ 未承認の実績が {totalPendingCount}件 あります（支払予定額 ¥{totalPendingAmount.toLocaleString()}）
          </div>
          <div style={{ lineHeight:1.6 }}>
            この金額は下の振込額に<b>含まれていません</b>。このまま振り込むと、支払漏れになります。
            {pendingPayouts.length > 0 && (
              <div style={{ marginTop:"4px" }}>
                対象：{pendingPayouts.map((p) => `${p.driverName}（${p.pendingCount}件）`).join("、")}
              </div>
            )}
          </div>
          <div style={{ marginTop:"8px" }}>
            <RetroBtn small onClick={() => setPage && setPage("approval")}
              style={{ background:"#c62828", borderColor:"#c62828", color:"#fff" }}>
              実績承認へ移動して承認する
            </RetroBtn>
          </div>
        </div>
      )}

      {/* 振込前に必ず気づくべき問題は、目立つ場所に警告として出す */}
      {missingBank.length > 0 && (
        <div style={{ background:"#fff4e5", border:"1px solid #ffb74d", borderRadius:"6px", padding:"10px 12px", fontSize:"12px", color:"#e65100" }}>
          <b>口座情報が未登録のドライバーがいます（{missingBank.length}名）：</b>
          {missingBank.map((p) => p.driverName).join("、")}
          <div style={{ marginTop:"4px" }}>ドライバー管理 → 該当ドライバー → 編集 →「⑧報酬・振込」タブから登録してください。</div>
        </div>
      )}
      {negativePayouts.length > 0 && (
        <div style={{ background:"#ffebee", border:"1px solid #e57373", borderRadius:"6px", padding:"10px 12px", fontSize:"12px", color:"#c62828" }}>
          <b>控除が支給を上回っているドライバーがいます（{negativePayouts.length}名）：</b>
          {negativePayouts.map((p) => `${p.driverName}（${yen(p.netPay)}）`).join("、")}
          <div style={{ marginTop:"4px" }}>振込額がマイナスになっています。翌月繰越・現金回収など、対応をご確認ください。</div>
        </div>
      )}

      <div style={{ display:"flex", gap:"8px", flexWrap:"wrap" }}>
        <Stat label="対象ドライバー" value={`${activePayouts.length}名`} />
        <Stat label="売上合計" value={yen(totals.sales)} color="#007a74" />
        <Stat label="支給合計" value={yen(totals.gross)} color="#e65100" />
        <Stat label="控除合計" value={yen(totals.deduction)} color="#7b1fa2" />
        <Stat label="ロイヤリティ収入" value={yen(totals.royalty)} color="#7b1fa2" />
        <Stat label="振込合計" value={yen(totals.net)} color="#c62828" />
      </div>

      <div style={{ border:cardBorder, borderRadius:"6px", background:"#fff", overflow:"auto" }}>
        <table style={{ minWidth:"100%", width:"max-content", borderCollapse:"collapse", fontFamily:"'Noto Sans JP', sans-serif", fontSize:"12px" }}>
          <thead>
            <tr style={{ background:"#fafbfc" }}>
              {["氏名","稼働","個数","売上","支給合計","ロイヤリティ","その他控除","振込金額","操作"].map((h) => (
                <th key={h} style={{ color:"#666", fontSize:"11px", padding:"8px 10px", textAlign: ["氏名","操作"].includes(h) ? "left" : "right", fontWeight:700, whiteSpace:"nowrap", borderBottom:cardBorder }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activePayouts.length === 0 && (
              <tr><td colSpan={9} style={{ padding:"24px", textAlign:"center", color:"#999" }}>
                この月に稼働実績のあるドライバーがいません。売上管理から実績を入力してください。
              </td></tr>
            )}
            {activePayouts.map((p) => (
              <tr key={p.driverId} style={{ borderBottom:"1px solid #f0f0f0" }}>
                <td style={{ padding:"8px 10px", fontWeight:700, whiteSpace:"nowrap" }}>{p.driverName}</td>
                <td style={{ padding:"8px 10px", textAlign:"right" }}>{p.workDays}日</td>
                <td style={{ padding:"8px 10px", textAlign:"right" }}>{p.totalCount.toLocaleString()}</td>
                <td style={{ padding:"8px 10px", textAlign:"right", color:"#007a74" }}>{yen(p.sales)}</td>
                <td style={{ padding:"8px 10px", textAlign:"right", color:"#e65100" }}>{yen(p.grossPay)}</td>
                <td style={{ padding:"8px 10px", textAlign:"right", color:"#7b1fa2" }}>{p.royalty ? `-${yen(p.royalty)}` : "—"}</td>
                <td style={{ padding:"8px 10px", textAlign:"right", color:"#7b1fa2" }}>
                  {p.totalDeduction - p.royalty ? `-${yen(p.totalDeduction - p.royalty)}` : "—"}
                </td>
                <td style={{ padding:"8px 10px", textAlign:"right", fontWeight:700, fontSize:"14px", color: p.isNegative ? "#c62828" : "#222" }}>
                  {yen(p.netPay)}
                </td>
                <td style={{ padding:"8px 10px", whiteSpace:"nowrap" }}>
                  <RetroBtn small onClick={() => setDetailDriverId(p.driverId)} style={{ marginRight:"4px" }}>内訳</RetroBtn>
                  <RetroBtn small onClick={() => openStatement(p)} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>{pdfIcon}明細PDF</RetroBtn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detailPayout && (
        <Modal title={`報酬内訳 — ${detailPayout.driverName}（${month}）`} icon={yenIcon} onClose={() => setDetailDriverId(null)} width={640}>
          <div style={{ display:"flex", gap:"20px", flexDirection: isMobile ? "column" : "row", fontSize:"12px" }}>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700, color:"#e65100", borderBottom:"2px solid #e65100", paddingBottom:"4px", marginBottom:"6px" }}>支給</div>
              {[
                ["基本報酬", detailPayout.baseReward],
                ["チャーター", detailPayout.charter],
                ["高速代（立替）", detailPayout.highway],
                ["駐車場代（立替）", detailPayout.parking],
                ["燃料補助", detailPayout.fuel],
                ["その他支給", detailPayout.otherAllowance],
              ].filter(([, v]) => Number(v) !== 0).map(([k, v]) => (
                <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"3px 0", color:"#555" }}>
                  <span>{k}</span><span>{yen(v)}</span>
                </div>
              ))}
              <div style={{ display:"flex", justifyContent:"space-between", borderTop:"2px solid #222", marginTop:"6px", paddingTop:"6px", fontWeight:700 }}>
                <span>支給合計</span><span>{yen(detailPayout.grossPay)}</span>
              </div>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700, color:"#7b1fa2", borderBottom:"2px solid #7b1fa2", paddingBottom:"4px", marginBottom:"6px" }}>控除</div>
              {[
                ["ロイヤリティ", detailPayout.royalty],
                ["車両リース料", detailPayout.lease],
                ["保険料", detailPayout.insurance],
                ["制服代", detailPayout.uniform],
                ["備品代", detailPayout.supplies],
                [detailDriver?.otherDeductionNote || "その他控除", detailPayout.otherDeduction],
              ].filter(([, v]) => Number(v) !== 0).map(([k, v]) => (
                <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"3px 0", color:"#555" }}>
                  <span>{k}</span><span>{yen(v)}</span>
                </div>
              ))}
              {detailPayout.totalDeduction === 0 && <div style={{ color:"#999", padding:"3px 0" }}>控除なし</div>}
              <div style={{ display:"flex", justifyContent:"space-between", borderTop:"2px solid #222", marginTop:"6px", paddingTop:"6px", fontWeight:700 }}>
                <span>控除合計</span><span>{yen(detailPayout.totalDeduction)}</span>
              </div>
            </div>
          </div>
          <div style={{ marginTop:"14px", padding:"12px 16px", background: detailPayout.isNegative ? "#ffebee" : "#f0fbfa", border:`1px solid ${detailPayout.isNegative ? "#e57373" : "#b2dfdb"}`, borderRadius:"6px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontWeight:700, color: detailPayout.isNegative ? "#c62828" : "#00695c" }}>振込金額</span>
            <span style={{ fontSize:"24px", fontWeight:700, color: detailPayout.isNegative ? "#c62828" : "#00695c" }}>{yen(detailPayout.netPay)}</span>
          </div>
          <div style={{ display:"flex", justifyContent:"flex-end", gap:"6px", marginTop:"12px" }}>
            <RetroBtn onClick={() => setDetailDriverId(null)}>閉じる</RetroBtn>
            <RetroBtn onClick={() => openStatement(detailPayout)} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>{pdfIcon}明細PDFを開く</RetroBtn>
          </div>
        </Modal>
      )}

      {/* 月次締め処理の確認モーダル。
          未承認の実績が残ったまま締めると、その分は永久に計上できなくなる
          （締め済み月は編集も承認もできなくなるため）。必ず先に承認させる。 */}
      {confirmClose && (
        totalPendingCount > 0 ? (
          <Modal title="この月はまだ締められません" onClose={() => setConfirmClose(false)} width={440}>
            <p style={{ fontSize:"13px", color:"#c62828", fontWeight:700, marginBottom:"8px" }}>
              未承認の実績が {totalPendingCount}件 残っています。
            </p>
            <p style={{ fontSize:"12px", color:"#666", lineHeight:1.7 }}>
              このまま締めると、未承認の実績は今後承認できなくなり、
              その分の売上・報酬が永久に反映されません。<br/>
              先に「実績承認」画面からすべて承認または差し戻してください。
            </p>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:"6px", marginTop:"14px" }}>
              <RetroBtn onClick={() => setConfirmClose(false)}>閉じる</RetroBtn>
              <RetroBtn onClick={() => { setConfirmClose(false); setPage && setPage("approval"); }}
                style={{ background:"#c62828", borderColor:"#c62828", color:"#fff" }}>
                実績承認へ移動する
              </RetroBtn>
            </div>
          </Modal>
        ) : isMonthOutsideLoadedRange ? (
          <Modal title="この月はまだ締められません" onClose={() => setConfirmClose(false)} width={460}>
            <p style={{ fontSize:"13px", color:"#c62828", fontWeight:700, marginBottom:"8px" }}>
              {month} は、直近15ヶ月分の読み込み範囲より古い月です。
            </p>
            <p style={{ fontSize:"12px", color:"#666", lineHeight:1.7 }}>
              このまま締めると、実際には稼働があったとしても
              「読み込まれていないため稼働ゼロ」として扱われ、
              誤った内容のまま月が固定されてしまう危険があります。<br/>
              画面上部の「過去のデータも読み込む」を先に実行してから、
              もう一度お試しください。
            </p>
            <div style={{ display:"flex", justifyContent:"flex-end", marginTop:"14px" }}>
              <RetroBtn onClick={() => setConfirmClose(false)} style={{ background:"#c62828", borderColor:"#c62828", color:"#fff" }}>
                閉じる
              </RetroBtn>
            </div>
          </Modal>
        ) : (
          <Modal title={`${month} を締めますか？`} onClose={() => setConfirmClose(false)} width={440}>
            <p style={{ fontSize:"13px", color:"#444", lineHeight:1.8 }}>
              締めると、この月の実績は<b>編集・削除・承認変更が一切できなくなります。</b><br/>
              振込作業が完了してから締めてください。（解除には管理者権限が必要です）
            </p>
            <p style={{ fontSize:"12px", color:"#007a74", background:"#f0fbfa", borderRadius:"6px", padding:"8px 10px", marginTop:"10px" }}>
              締めると同時に、稼働があった各ドライバー分の請求書が自動で発行されます。
            </p>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:"6px", marginTop:"14px" }}>
              <RetroBtn onClick={() => setConfirmClose(false)}>キャンセル</RetroBtn>
              <RetroBtn
                onClick={() => {
                  // 【重要】締めた瞬間の各ドライバーの設定（リース料・保険料・
                  // ロイヤリティ率など）を固定保存する。これをしないと、
                  // 締めた後に会社が設定を変更した際、過去の確定済み金額が
                  // 静かに変わってしまう（実際に検証で見つかった不具合）。
                  const snapshotForMonth = {};
                  activePayouts.forEach((p) => {
                    const d = drivers.find((x) => x?.id === p.driverId);
                    if (!d) return;
                    snapshotForMonth[p.driverId] = {
                      royaltyType: d.royaltyType, royaltyRate: d.royaltyRate, royaltyFixed: d.royaltyFixed,
                      leaseMonthly: d.leaseMonthly, insuranceMonthly: d.insuranceMonthly,
                      uniformMonthly: d.uniformMonthly, suppliesMonthly: d.suppliesMonthly,
                      otherDeductionMonthly: d.otherDeductionMonthly,
                    };
                  });
                  setData(d => ({
                    ...d,
                    companyInfo: {
                      ...(d?.companyInfo || {}),
                      closedMonths: [...new Set([...(d?.companyInfo?.closedMonths || []), month])],
                      monthSnapshots: { ...(d?.companyInfo?.monthSnapshots || {}), [month]: snapshotForMonth },
                    },
                  }));
                  const count = generateDriverInvoicesForMonth(month);
                  setCloseResultMsg(
                    count > 0
                      ? `${month} を締め、ドライバー請求書を ${count}件 自動発行しました。`
                      : `${month} を締めました。（対象ドライバーがいなかったため請求書は発行されていません）`
                  );
                  setConfirmClose(false);
                }}
                style={{ background:"#c62828", borderColor:"#c62828", color:"#fff" }}
              >
                締める
              </RetroBtn>
            </div>
          </Modal>
        )
      )}

      {/* 締め処理の結果（請求書が何件発行されたか）を必ず知らせる */}
      {closeResultMsg && (
        <Modal title="締め処理が完了しました" onClose={() => setCloseResultMsg("")} width={420}>
          <p style={{ fontSize:"13px", color:"#444", lineHeight:1.8 }}>{closeResultMsg}</p>
          <div style={{ display:"flex", justifyContent:"flex-end", marginTop:"14px" }}>
            <RetroBtn onClick={() => { setCloseResultMsg(""); setPage && setPage("invoices"); }}
              style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>
              請求書を確認する
            </RetroBtn>
          </div>
        </Modal>
      )}

      {/* 誤って締めてしまった場合の救済措置。
          ただし、既に発行済みの請求書は自動では取り消されない点を必ず伝える
          （ドライバーが既に確認・ダウンロードしている可能性があるため）。 */}
      {confirmReopen && (
        <Modal title={`${month} の締めを解除しますか？`} onClose={() => setConfirmReopen(false)} width={460}>
          <p style={{ fontSize:"13px", color:"#c62828", fontWeight:700, marginBottom:"8px" }}>
            この操作は管理者権限で行われます。
          </p>
          <p style={{ fontSize:"12px", color:"#666", lineHeight:1.8 }}>
            解除すると、この月の実績が再び編集・承認変更できるようになります。<br/>
            <b>既に自動発行された請求書は、解除しても自動的には取り消されません。</b><br/>
            内容を修正した場合は、請求書側も手動で確認・修正してください。
          </p>
          <div style={{ display:"flex", justifyContent:"flex-end", gap:"6px", marginTop:"14px" }}>
            <RetroBtn onClick={() => setConfirmReopen(false)}>キャンセル</RetroBtn>
            <RetroBtn
              onClick={() => {
                setData(d => ({
                  ...d,
                  companyInfo: {
                    ...(d?.companyInfo || {}),
                    closedMonths: (d?.companyInfo?.closedMonths || []).filter(m => m !== month),
                  },
                }));
                setConfirmReopen(false);
              }}
              style={{ background:"#c62828", borderColor:"#c62828", color:"#fff" }}
            >
              解除する
            </RetroBtn>
          </div>
        </Modal>
      )}
    </div>
  );
};

/**
 * ===== グラフ部品（仕様書⑥⑦⑧⑪）=====
 *
 * 【重要な設計判断】
 * recharts 等のグラフライブラリを import すると package.json への依存追加が必要になる。
 * このプロジェクトは GitHub のWeb画面から手動でファイルを貼り替えて運用しているため、
 * package.json の更新が漏れると Vercel のビルドが丸ごと失敗し、本番が落ちる。
 * そのリスクを避けるため、グラフは追加ライブラリなしの純粋なSVGで自作している。
 */

const CHART_COLORS = ["#00a09a", "#e65100", "#7b1fa2", "#0277bd", "#c62828", "#558b2f", "#f9a825", "#5d4037"];

/** 金額を「1.2万」「3.4億」のように短く表示する（軸ラベル用） */
const shortYen = (v) => {
  const n = Number(v) || 0;
  const abs = Math.abs(n);
  if (abs >= 100000000) return `${(n / 100000000).toFixed(1)}億`;
  if (abs >= 10000) return `${Math.round(n / 10000).toLocaleString()}万`;
  return n.toLocaleString();
};

/** 縦棒グラフ。data: [{ label, value }] */
const BarChart = ({ data = [], height = 200, color = "#00a09a", valueFormat = shortYen }) => {
  const [hover, setHover] = useState(null);
  if (data.length === 0) {
    return <div style={{ height, display:"flex", alignItems:"center", justifyContent:"center", color:"#bbb", fontSize:"12px" }}>データがありません</div>;
  }
  const max = Math.max(...data.map(d => Number(d.value) || 0), 1);
  const barW = 100 / data.length;
  const chartH = height - 34; // ラベル分の余白

  return (
    <div style={{ position:"relative", width:"100%" }}>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ width:"100%", height, display:"block", overflow:"visible" }}>
        {/* 目盛り線（4分割） */}
        {[0, 0.25, 0.5, 0.75, 1].map((r) => (
          <line key={r} x1="0" x2="100" y1={chartH * r} y2={chartH * r} stroke="#eee" strokeWidth="0.5" vectorEffect="non-scaling-stroke"/>
        ))}
        {data.map((d, i) => {
          const v = Number(d.value) || 0;
          // マイナス値もあり得る（利益がマイナスの月など）。その場合は0として描画し、
          // 値そのものはツールチップで見せる。
          const h = Math.max(0, (v / max) * chartH);
          const isHover = hover === i;
          return (
            <rect
              key={i}
              x={i * barW + barW * 0.18}
              y={chartH - h}
              width={barW * 0.64}
              height={h}
              fill={isHover ? "#007a74" : color}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor:"pointer", transition:"fill .12s" }}
            />
          );
        })}
      </svg>
      {/* ラベルはSVGの外にHTMLで置く（viewBoxの引き伸ばしで文字が歪むのを防ぐため） */}
      <div style={{ display:"flex", marginTop:"-28px" }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex:1, textAlign:"center", fontSize:"10px", color: hover === i ? "#007a74" : "#888", fontWeight: hover === i ? 700 : 400, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
            {d.label}
          </div>
        ))}
      </div>
      {hover !== null && (
        <div style={{ marginTop:"6px", textAlign:"center", fontSize:"13px", fontWeight:700, color:"#007a74" }}>
          {data[hover].label}：{valueFormat(data[hover].value)}
        </div>
      )}
    </div>
  );
};

/** 横棒グラフ（ランキング表示用）。data: [{ label, value, sub }] */
const RankBarChart = ({ data = [], color = "#00a09a", valueFormat = (v) => `¥${(Number(v)||0).toLocaleString()}` }) => {
  if (data.length === 0) {
    return <div style={{ padding:"24px", textAlign:"center", color:"#bbb", fontSize:"12px" }}>データがありません</div>;
  }
  const max = Math.max(...data.map(d => Number(d.value) || 0), 1);
  const medal = ["#f9a825", "#9e9e9e", "#a1662f"]; // 金・銀・銅

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"6px" }}>
      {data.map((d, i) => {
        const v = Number(d.value) || 0;
        const pct = Math.max(0, (v / max) * 100);
        return (
          <div key={i} style={{ display:"flex", alignItems:"center", gap:"8px", fontSize:"12px" }}>
            <div style={{
              width:"20px", height:"20px", borderRadius:"50%", flexShrink:0,
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:"10px", fontWeight:700,
              background: i < 3 ? medal[i] : "#e8e8e8",
              color: i < 3 ? "#fff" : "#888",
            }}>{i + 1}</div>
            <div style={{ width:"90px", flexShrink:0, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", fontWeight:600 }}>{d.label}</div>
            <div style={{ flex:1, background:"#f0f2f5", borderRadius:"3px", height:"18px", position:"relative", overflow:"hidden" }}>
              <div style={{ width:`${pct}%`, height:"100%", background:color, borderRadius:"3px", transition:"width .3s" }}/>
            </div>
            <div style={{ width:"100px", flexShrink:0, textAlign:"right", fontWeight:700, color:"#333" }}>
              {valueFormat(v)}
              {d.sub && <div style={{ fontSize:"10px", color:"#999", fontWeight:400 }}>{d.sub}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/** ドーナツグラフ（構成比）。data: [{ label, value }] */
const DonutChart = ({ data = [], size = 150 }) => {
  const total = data.reduce((s, d) => s + (Number(d.value) || 0), 0);
  if (total <= 0) {
    return <div style={{ height:size, display:"flex", alignItems:"center", justifyContent:"center", color:"#bbb", fontSize:"12px" }}>データがありません</div>;
  }
  const r = 40, cx = 50, cy = 50, stroke = 16;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div style={{ display:"flex", alignItems:"center", gap:"14px", flexWrap:"wrap" }}>
      <svg viewBox="0 0 100 100" style={{ width:size, height:size, flexShrink:0, transform:"rotate(-90deg)" }}>
        {data.map((d, i) => {
          const v = Number(d.value) || 0;
          const len = (v / total) * circumference;
          const el = (
            <circle
              key={i} cx={cx} cy={cy} r={r} fill="none"
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              strokeWidth={stroke}
              strokeDasharray={`${len} ${circumference - len}`}
              strokeDashoffset={-offset}
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div style={{ display:"flex", flexDirection:"column", gap:"3px", fontSize:"11px", minWidth:"140px" }}>
        {data.map((d, i) => {
          const v = Number(d.value) || 0;
          const pct = total > 0 ? ((v / total) * 100).toFixed(1) : "0.0";
          return (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:"6px" }}>
              <span style={{ width:"9px", height:"9px", borderRadius:"2px", background:CHART_COLORS[i % CHART_COLORS.length], flexShrink:0 }}/>
              <span style={{ flex:1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", color:"#555" }}>{d.label}</span>
              <span style={{ fontWeight:700, color:"#333" }}>{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * ===== 利益分析エンジン（仕様書⑦）=====
 *
 * 売上 → ドライバー報酬 → 経費 → 利益 の順に積み上げて計算する。
 * 報酬計算と同じく、計算式はこの1箇所に集約すること。
 *
 * 【利益の定義】
 *   粗利益 = 売上 − ドライバーへの支払（実費・手当を含む）
 *   営業利益 = 粗利益 + ロイヤリティ収入 − 経費（payables）
 *
 * ロイヤリティは「ドライバーから徴収する会社の収入」なので、利益にプラスされる。
 * （報酬計算側ではドライバーの控除としてマイナス、会社視点ではプラス。表裏の関係）
 */
const calcProfitAnalysis = (drivers, dailyRecords, payables, month, companyInfo = null) => {
  const n = (v) => Number(v) || 0;
  const allMonthRecords = filterRecordsByMonth(dailyRecords, month);

  // ★承認済みだけを売上・利益に計上する。
  // 報酬計算（calcDriverPayout）と同じ基準にしないと、
  // 「売上画面と報酬画面で数字が違う」という致命的な不整合が起きる。
  const monthRecords = allMonthRecords.filter(isApprovedRecord);
  const pendingRecords = allMonthRecords.filter(isPendingRecord);

  // --- 全体 ---
  const totalSales = monthRecords.reduce((s, r) => s + n(r?.salesAmount), 0);
  const totalDriverCost = monthRecords.reduce((s, r) => s + n(r?.driverAmount), 0);

  // ロイヤリティ収入は、ドライバーごとの報酬計算から取得する（計算式の重複を避ける）
  const byDriverRecords = new Map();
  monthRecords.forEach((r) => {
    if (!r?.driverId) return;
    if (!byDriverRecords.has(r.driverId)) byDriverRecords.set(r.driverId, []);
    byDriverRecords.get(r.driverId).push(r);
  });
  const payouts = (drivers || []).map((d) => {
    const monthSnapshot = companyInfo?.monthSnapshots?.[month] || null;
    return calcDriverPayout(d, byDriverRecords.get(d?.id) || [], month, monthSnapshot?.[d?.id] || null);
  });
  const royaltyIncome = payouts.reduce((s, p) => s + p.royalty, 0);

  // 経費（支払管理に登録された支出のうち、その月に支払期日が来るもの）
  const monthExpenses = (Array.isArray(payables) ? payables : [])
    .filter((p) => !p?.deleted && typeof p?.dueDate === "string" && p.dueDate.slice(0, 7) === month);
  const totalExpense = monthExpenses.reduce((s, p) => s + n(p?.amount), 0);

  const grossProfit = totalSales - totalDriverCost;
  const operatingProfit = grossProfit + royaltyIncome - totalExpense;
  const grossMargin = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;
  const operatingMargin = totalSales > 0 ? (operatingProfit / totalSales) * 100 : 0;

  // --- 顧客（案件）別 ---
  const byCustomer = new Map();
  monthRecords.forEach((r) => {
    const key = r?.customerId || "(未設定)";
    if (!byCustomer.has(key)) byCustomer.set(key, { customerId: key, sales: 0, driverCost: 0, count: 0 });
    const e = byCustomer.get(key);
    e.sales += n(r?.salesAmount);
    e.driverCost += n(r?.driverAmount);
    e.count += n(r?.count);
  });
  const customerProfit = [...byCustomer.values()].map((e) => {
    const profit = e.sales - e.driverCost;
    return {
      ...e,
      profit,
      // 売上0の案件で率を出すと Infinity や NaN になるため、0として扱う
      margin: e.sales > 0 ? (profit / e.sales) * 100 : 0,
    };
  });

  // --- ドライバー別 ---
  const driverProfit = payouts
    .filter((p) => p.workDays > 0)
    .map((p) => {
      // 会社から見た「そのドライバーの利益貢献」
      // = そのドライバーが生んだ売上 − 支払った報酬 + 徴収したロイヤリティ
      const contribution = p.sales - p.grossPay + p.royalty;
      return {
        driverId: p.driverId,
        driverName: p.driverName,
        sales: p.sales,
        driverCost: p.grossPay,
        royalty: p.royalty,
        contribution,
        margin: p.sales > 0 ? (contribution / p.sales) * 100 : 0,
        workDays: p.workDays,
        totalCount: p.totalCount,
      };
    });

  return {
    month,
    totalSales, totalDriverCost, royaltyIncome, totalExpense,
    grossProfit, operatingProfit, grossMargin, operatingMargin,
    customerProfit, driverProfit, payouts,
    activeDriverCount: payouts.filter((p) => p.workDays > 0).length,
    // ★承認待ち（この数字は売上・利益に含まれていない）
    pendingCount: pendingRecords.length,
    pendingSales: Math.round(pendingRecords.reduce((s, r) => s + n(r?.salesAmount), 0)),
  };
};

/** 直近 N ヶ月の "YYYY-MM" 配列を返す（古い順） */
const recentMonths = (baseMonth, count) => {
  const [y, m] = String(baseMonth).split("-").map(Number);
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
};

/**
 * ===== 経営分析ページ（仕様書⑥売上分析 ⑦利益分析 ⑧ランキング ⑪KPI）=====
 * 経営者が一目で状況を把握できることを最優先に、上から「KPI → グラフ → 明細」の順で並べる。
 */
const AnalyticsPage = ({ data, setData, tenantId, userRole, isMobile }) => {
  const drivers = (Array.isArray(data?.drivers) ? data.drivers : []).filter(d => !d?.deleted);
  const customers = (Array.isArray(data?.customers) ? data.customers : []).filter(c => !c?.deleted);
  const vehicles = (Array.isArray(data?.vehicles) ? data.vehicles : []).filter(v => !v?.deleted);
  const dailyRecords = Array.isArray(data?.dailyRecords) ? data.dailyRecords : [];
  const payables = Array.isArray(data?.payables) ? data.payables : [];
  const qualityRecords = Array.isArray(data?.qualityRecords) ? data.qualityRecords : [];

  const [month, setMonth] = useState(() => getTodayLocalStr().slice(0, 7));
  const [tab, setTab] = useState("kpi");
  const [rankMetric, setRankMetric] = useState("sales");

  const yen = (v) => `¥${(Number(v) || 0).toLocaleString()}`;
  const pct = (v) => `${(Number(v) || 0).toFixed(1)}%`;
  const customerName = (id) => customers.find(c => c?.id === id)?.name || "(未設定)";

  // 当月の分析
  const A = useMemo(
    () => calcProfitAnalysis(drivers, dailyRecords, payables, month, data?.companyInfo),
    [drivers, dailyRecords, payables, month, data?.companyInfo]
  );

  // 直近12ヶ月の推移（グラフ用）
  const trend = useMemo(() => {
    const months = recentMonths(month, 12);
    return months.map((m) => {
      const a = calcProfitAnalysis(drivers, dailyRecords, payables, m, data?.companyInfo);
      return { month: m, sales: a.totalSales, profit: a.operatingProfit, gross: a.grossProfit };
    });
  }, [drivers, dailyRecords, payables, month]);

  // 年間（直近12ヶ月）の合計
  const yearTotal = trend.reduce((acc, t) => ({
    sales: acc.sales + t.sales,
    profit: acc.profit + t.profit,
  }), { sales: 0, profit: 0 });

  // --- KPI（仕様書⑪）---
  const kpi = useMemo(() => {
    const activeDrivers = A.activeDriverCount;
    const avgSales = activeDrivers > 0 ? Math.round(A.totalSales / activeDrivers) : 0;
    const avgProfit = activeDrivers > 0 ? Math.round(A.operatingProfit / activeDrivers) : 0;
    // 案件数 = その月に稼働のあった顧客の数
    const projectCount = A.customerProfit.filter(c => c.sales > 0).length;

    // 車両稼働率 = ドライバーが割り当てられている車両 / 全車両
    const assignedVehicles = vehicles.filter(v => v?.assignedDriverId).length;
    const vehicleRate = vehicles.length > 0 ? (assignedVehicles / vehicles.length) * 100 : 0;

    // ドライバー定着率 = 契約終了日が未設定（＝在籍継続中）のドライバー / 全ドライバー
    // 「離職者数を記録する仕組み」が無いため、契約終了日の有無で近似する。
    const retained = drivers.filter(d => !d?.contractEnd).length;
    const retentionRate = drivers.length > 0 ? (retained / drivers.length) * 100 : 0;

    return { activeDrivers, avgSales, avgProfit, projectCount, vehicleRate, retentionRate };
  }, [A, drivers, vehicles]);

  // --- ランキング（仕様書⑧）---
  const ranking = useMemo(() => {
    const metricMap = {
      sales:        { key: "sales",        label: "売上",       fmt: yen,  color:"#00a09a" },
      count:        { key: "totalCount",   label: "配送個数",   fmt: (v) => `${(Number(v)||0).toLocaleString()}個`, color:"#0277bd" },
      contribution: { key: "contribution", label: "利益貢献",   fmt: yen,  color:"#7b1fa2" },
      workDays:     { key: "workDays",     label: "稼働日数",   fmt: (v) => `${v}日`, color:"#e65100" },
    };
    const m = metricMap[rankMetric] || metricMap.sales;
    const rows = [...A.driverProfit]
      .sort((a, b) => (Number(b[m.key]) || 0) - (Number(a[m.key]) || 0))
      .map((d) => ({
        label: d.driverName,
        value: d[m.key],
        sub: rankMetric === "sales" ? `${d.workDays}日稼働` : undefined,
      }));
    return { rows, meta: m };
  }, [A, rankMetric]);

  // 利益率ランキング（仕様書⑦）。売上0の案件は率が意味を成さないので除外する。
  const marginRanking = [...A.customerProfit]
    .filter(c => c.sales > 0)
    .sort((a, b) => b.margin - a.margin);

  const chartIcon = <Icon size={14}><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></Icon>;

  const Kpi = ({ label, value, sub, color, warn }) => (
    <div style={{ border: warn ? "1px solid #ffb74d" : cardBorder, borderRadius:"6px", background: warn ? "#fff8f0" : "#fff", padding:"12px 14px", flex:"1 1 150px", minWidth:"150px" }}>
      <div style={{ fontSize:"11px", color:"#888", marginBottom:"4px" }}>{label}</div>
      <div style={{ fontSize:"20px", fontWeight:700, color: color || "#222", lineHeight:1.2 }}>{value}</div>
      {sub && <div style={{ fontSize:"10px", color:"#999", marginTop:"3px" }}>{sub}</div>}
    </div>
  );

  const Panel2 = ({ title, children, right }) => (
    <div style={{ border:cardBorder, borderRadius:"6px", background:"#fff", padding:"14px 16px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"12px" }}>
        <div style={{ fontSize:"13px", fontWeight:700, color:"#333" }}>{title}</div>
        {right}
      </div>
      {children}
    </div>
  );

  const tabs = [
    { id:"kpi", label:"KPI" },
    { id:"sales", label:"売上分析" },
    { id:"profit", label:"利益分析" },
    { id:"ranking", label:"ドライバーランキング" },
  ];

  const monthLabel = (m) => `${Number(String(m).split("-")[1])}月`;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
      <LoadOlderDataBanner type="dailyRecords" data={data} setData={setData} tenantId={tenantId} />
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:"8px" }}>
        <div style={{ fontSize:"14px", fontWeight:700, color:"#222" }}>経営分析</div>
        <RetroInput type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width:"150px" }}/>
      </div>

      <div style={{ display:"flex", gap:"4px", flexWrap:"wrap", borderBottom:"2px solid #e8e8e8", paddingBottom:"8px" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            border:"none", borderRadius:"4px 4px 0 0", padding:"8px 14px", fontSize:"12px", fontWeight:700,
            cursor:"pointer", background: tab===t.id ? "#00a09a" : "#f0f2f5", color: tab===t.id ? "#fff" : "#555",
          }}>{t.label}</button>
        ))}
      </div>

      {/* ===== ⑪ KPIダッシュボード ===== */}
      {tab === "kpi" && (
        <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
          <div style={{ display:"flex", gap:"8px", flexWrap:"wrap" }}>
            <Kpi label="稼働ドライバー数" value={`${kpi.activeDrivers}名`} sub={`登録 ${drivers.length}名中`} color="#00a09a"/>
            <Kpi label="案件数（稼働顧客）" value={`${kpi.projectCount}件`} color="#0277bd"/>
            <Kpi label="ドライバー平均売上" value={yen(kpi.avgSales)} sub="月あたり"/>
            <Kpi label="ドライバー平均利益" value={yen(kpi.avgProfit)} sub="月あたり" color={kpi.avgProfit < 0 ? "#c62828" : "#222"}/>
          </div>
          <div style={{ display:"flex", gap:"8px", flexWrap:"wrap" }}>
            <Kpi label="粗利益率" value={pct(A.grossMargin)} sub={`粗利 ${yen(A.grossProfit)}`} color={A.grossMargin < 0 ? "#c62828" : "#00695c"}/>
            <Kpi label="営業利益率" value={pct(A.operatingMargin)} sub={`営業利益 ${yen(A.operatingProfit)}`} color={A.operatingProfit < 0 ? "#c62828" : "#00695c"}/>
            <Kpi label="車両稼働率" value={pct(kpi.vehicleRate)} sub={`${vehicles.length}台中`} warn={vehicles.length > 0 && kpi.vehicleRate < 50}/>
            <Kpi label="ドライバー定着率" value={pct(kpi.retentionRate)} sub="契約継続中の割合"/>
          </div>

          <Panel2 title={`月間サマリー（${month}）`}>
            <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"6px 24px", fontSize:"13px" }}>
              {[
                ["売上", A.totalSales, "#007a74"],
                ["ドライバー報酬", -A.totalDriverCost, "#e65100"],
                ["ロイヤリティ収入", A.royaltyIncome, "#7b1fa2"],
                ["経費", -A.totalExpense, "#c62828"],
              ].map(([k, v, c]) => (
                <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:"1px solid #f0f0f0" }}>
                  <span style={{ color:"#666" }}>{k}</span>
                  <span style={{ fontWeight:700, color: c }}>{v < 0 ? `-${yen(Math.abs(v))}` : yen(v)}</span>
                </div>
              ))}
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:"12px", padding:"12px 16px", background: A.operatingProfit < 0 ? "#ffebee" : "#f0fbfa", border:`1px solid ${A.operatingProfit < 0 ? "#e57373" : "#b2dfdb"}`, borderRadius:"6px" }}>
              <span style={{ fontWeight:700, color: A.operatingProfit < 0 ? "#c62828" : "#00695c" }}>営業利益</span>
              <span style={{ fontSize:"26px", fontWeight:700, color: A.operatingProfit < 0 ? "#c62828" : "#00695c" }}>{yen(A.operatingProfit)}</span>
            </div>
          </Panel2>

          <Panel2 title="年間（直近12ヶ月）">
            <div style={{ display:"flex", gap:"8px", flexWrap:"wrap" }}>
              <Kpi label="年間売上" value={yen(yearTotal.sales)} color="#007a74"/>
              <Kpi label="年間利益" value={yen(yearTotal.profit)} color={yearTotal.profit < 0 ? "#c62828" : "#00695c"}/>
              <Kpi label="年間利益率" value={pct(yearTotal.sales > 0 ? (yearTotal.profit / yearTotal.sales) * 100 : 0)}/>
            </div>
          </Panel2>
        </div>
      )}

      {/* ===== ⑥ 売上分析ダッシュボード ===== */}
      {tab === "sales" && (
        <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
          <Panel2 title="売上推移（直近12ヶ月）">
            <BarChart data={trend.map(t => ({ label: monthLabel(t.month), value: t.sales }))} height={200}/>
          </Panel2>

          <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"10px" }}>
            <Panel2 title="案件（顧客）別 売上構成">
              <DonutChart data={[...A.customerProfit].sort((a,b)=>b.sales-a.sales).slice(0, 8).map(c => ({ label: customerName(c.customerId), value: c.sales }))}/>
            </Panel2>
            <Panel2 title="ドライバー別 売上構成">
              <DonutChart data={[...A.driverProfit].sort((a,b)=>b.sales-a.sales).slice(0, 8).map(d => ({ label: d.driverName, value: d.sales }))}/>
            </Panel2>
          </div>

          <Panel2 title={`案件別 売上（${month}）`}>
            <RankBarChart
              data={[...A.customerProfit].sort((a,b)=>b.sales-a.sales).map(c => ({ label: customerName(c.customerId), value: c.sales, sub: `${c.count.toLocaleString()}個` }))}
              color="#00a09a"
            />
          </Panel2>
        </div>
      )}

      {/* ===== ⑦ 利益分析 ===== */}
      {tab === "profit" && (
        <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
          <Panel2 title="利益の内訳（当月）">
            {/* 「売上 → 報酬 → 経費 → 利益」の流れを、視覚的に落ちていく形で見せる */}
            {(() => {
              const steps = [
                { label:"売上", value: A.totalSales, color:"#00a09a" },
                { label:"− ドライバー報酬", value: A.totalDriverCost, color:"#e65100" },
                { label:"＋ ロイヤリティ収入", value: A.royaltyIncome, color:"#7b1fa2" },
                { label:"− 経費", value: A.totalExpense, color:"#c62828" },
              ];
              const max = Math.max(A.totalSales, 1);
              return (
                <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
                  {steps.map((s) => (
                    <div key={s.label} style={{ fontSize:"12px" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"3px" }}>
                        <span style={{ color:"#666" }}>{s.label}</span>
                        <span style={{ fontWeight:700, color:s.color }}>{yen(s.value)}</span>
                      </div>
                      <div style={{ background:"#f0f2f5", borderRadius:"3px", height:"14px", overflow:"hidden" }}>
                        <div style={{ width:`${Math.min(100, (s.value / max) * 100)}%`, height:"100%", background:s.color, borderRadius:"3px" }}/>
                      </div>
                    </div>
                  ))}
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:"6px", padding:"12px 16px", background: A.operatingProfit < 0 ? "#ffebee" : "#f0fbfa", border:`1px solid ${A.operatingProfit < 0 ? "#e57373" : "#b2dfdb"}`, borderRadius:"6px" }}>
                    <span style={{ fontWeight:700, color: A.operatingProfit < 0 ? "#c62828" : "#00695c" }}>＝ 営業利益</span>
                    <span style={{ fontSize:"24px", fontWeight:700, color: A.operatingProfit < 0 ? "#c62828" : "#00695c" }}>{yen(A.operatingProfit)}</span>
                  </div>
                </div>
              );
            })()}
          </Panel2>

          <Panel2 title="利益推移（直近12ヶ月）">
            <BarChart data={trend.map(t => ({ label: monthLabel(t.month), value: t.profit }))} height={200} color="#7b1fa2"/>
            {trend.some(t => t.profit < 0) && (
              <div style={{ marginTop:"8px", fontSize:"11px", color:"#c62828" }}>
                ※利益がマイナスの月はグラフ上では0として表示されます。棒をクリックすると実際の金額が表示されます。
              </div>
            )}
          </Panel2>

          <Panel2 title={`案件別 利益・利益率ランキング（${month}）`}>
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", minWidth:"520px", borderCollapse:"collapse", fontSize:"12px" }}>
                <thead>
                  <tr style={{ background:"#fafbfc" }}>
                    {["順位","案件（顧客）","売上","ドライバー報酬","利益","利益率"].map((h,i) => (
                      <th key={h} style={{ padding:"8px 10px", textAlign: i<=1 ? "left" : "right", fontSize:"11px", color:"#666", fontWeight:700, borderBottom:cardBorder, whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {marginRanking.length === 0 && (
                    <tr><td colSpan={6} style={{ padding:"24px", textAlign:"center", color:"#999" }}>この月の実績がありません</td></tr>
                  )}
                  {marginRanking.map((c, i) => (
                    <tr key={c.customerId} style={{ borderBottom:"1px solid #f0f0f0" }}>
                      <td style={{ padding:"8px 10px", fontWeight:700, color: i<3 ? "#f9a825" : "#999" }}>{i+1}</td>
                      <td style={{ padding:"8px 10px", fontWeight:600 }}>{customerName(c.customerId)}</td>
                      <td style={{ padding:"8px 10px", textAlign:"right", color:"#007a74" }}>{yen(c.sales)}</td>
                      <td style={{ padding:"8px 10px", textAlign:"right", color:"#e65100" }}>{yen(c.driverCost)}</td>
                      <td style={{ padding:"8px 10px", textAlign:"right", fontWeight:700, color: c.profit < 0 ? "#c62828" : "#222" }}>{yen(c.profit)}</td>
                      <td style={{ padding:"8px 10px", textAlign:"right", fontWeight:700, color: c.margin < 0 ? "#c62828" : c.margin < 10 ? "#e65100" : "#00695c" }}>{pct(c.margin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {marginRanking.some(c => c.margin < 0) && (
              <div style={{ marginTop:"10px", background:"#ffebee", border:"1px solid #e57373", borderRadius:"6px", padding:"8px 10px", fontSize:"12px", color:"#c62828" }}>
                <b>赤字の案件があります。</b>ドライバーへの支払が売上を上回っています。単価の見直しをご検討ください。
              </div>
            )}
          </Panel2>
        </div>
      )}

      {/* ===== ⑧ ドライバーランキング ===== */}
      {tab === "ranking" && (
        <Panel2
          title={`ドライバーランキング（${month}）`}
          right={
            <div style={{ display:"flex", gap:"4px", flexWrap:"wrap" }}>
              {[
                { id:"sales", label:"売上" },
                { id:"count", label:"配送個数" },
                { id:"contribution", label:"利益貢献" },
                { id:"workDays", label:"稼働日数" },
              ].map(m => (
                <button key={m.id} onClick={() => setRankMetric(m.id)} style={{
                  border:"1px solid #d0d0d0", borderRadius:"3px", padding:"5px 10px", fontSize:"11px", fontWeight:600, cursor:"pointer",
                  background: rankMetric===m.id ? "#00a09a" : "#fff", color: rankMetric===m.id ? "#fff" : "#555",
                }}>{m.label}</button>
              ))}
            </div>
          }
        >
          <RankBarChart data={ranking.rows} color={ranking.meta.color} valueFormat={ranking.meta.fmt}/>
          {ranking.rows.length > 0 && (
            <div style={{ marginTop:"12px", fontSize:"11px", color:"#999" }}>
              ※「利益貢献」＝ そのドライバーが生んだ売上 − 支払った報酬 ＋ 徴収したロイヤリティ
            </div>
          )}
        </Panel2>
      )}
    </div>
  );
};

/**
 * ===== 通知エンジン（仕様書⑫通知機能）=====
 *
 * 車検・保険・契約更新・インボイス期限・報酬確定漏れ・未入力実績 を一括で洗い出す。
 *
 * 【設計方針】
 * 通知を「データとして保存」せず、毎回その場で計算して出す方式にしている。
 * 保存方式にすると「期限を更新したのに古い通知が残る」「同じ通知が何度も増える」
 * といった不具合が起きやすく、実務では通知が信用されなくなるため。
 *
 * @returns {Array} [{ id, level, category, message, page }]
 *   level: "danger"（期限切れ・今すぐ対応）/ "warn"（接近中）/ "info"（確認推奨）
 */
const buildSystemAlerts = (data, alertDays = 30) => {
  const alerts = [];
  const todayStr = getTodayLocalStr();
  const today = new Date(todayStr + "T00:00:00");
  const n = (v) => Number(v) || 0;

  const daysUntil = (dateStr) => {
    if (!dateStr || typeof dateStr !== "string") return null;
    const t = new Date(dateStr + "T00:00:00");
    if (isNaN(t.getTime())) return null;
    return Math.round((t - today) / 86400000);
  };

  /** 基準日から指定日数後の日付文字列を返す（「前回実施日＋365日」＝次回期限日、の計算に使う） */
  const addDays = (dateStr, days) => {
    const t = new Date(dateStr + "T00:00:00");
    if (isNaN(t.getTime())) return null;
    t.setDate(t.getDate() + days);
    return formatDate(t);
  };

  // データの一部が壊れて配列に null が混ざっているケースが実際に起こり得る
  // （Supabaseの保存失敗、手動でのデータ操作など）。null が混ざったまま
  // d?.id のようにアクセスすると例外が発生し、画面全体がクラッシュしてしまう。
  // ここで確実に除去しておく。
  const drivers = (Array.isArray(data?.drivers) ? data.drivers : []).filter(d => d && !d.deleted);
  const vehicles = (Array.isArray(data?.vehicles) ? data.vehicles : []).filter(v => v && !v.deleted);
  const records = (Array.isArray(data?.dailyRecords) ? data.dailyRecords : []).filter(Boolean);
  const jobTypes = (Array.isArray(data?.jobTypes) ? data.jobTypes : []).filter(Boolean);

  /** 期限系の共通処理。期限切れは danger、接近中は warn。 */
  const pushExpiry = (dateStr, label, page, category) => {
    const d = daysUntil(dateStr);
    if (d === null) return;
    if (d < 0) {
      alerts.push({ id:`${category}-${label}-over`, level:"danger", category, page,
        message:`${label}が ${Math.abs(d)}日前に期限切れです（${dateStr}）。至急対応してください。` });
    } else if (d <= alertDays) {
      alerts.push({ id:`${category}-${label}-soon`, level:"warn", category, page,
        message:`${label}まであと ${d}日です（${dateStr}）。` });
    }
  };

  // --- 車検・自賠責・任意保険（仕様書⑨⑫）---
  vehicles.forEach((v) => {
    const name = v?.plate || v?.id || "車両";
    pushExpiry(v?.nextInspection,   `【車検】${name}`,       "vehicles", "車検期限");
    pushExpiry(v?.insuranceExpiry,  `【任意保険】${name}`,   "vehicles", "保険期限");
    pushExpiry(v?.liabilityExpiry,  `【自賠責】${name}`,     "vehicles", "保険期限");
    pushExpiry(v?.leaseEnd,         `【リース満了】${name}`, "vehicles", "契約更新");

    // オイル交換（走行距離ベース。日付ではないので個別に判定する）
    const interval = n(v?.oilChangeIntervalKm) || 5000;
    if (v?.oilChangeMileage && v?.mileage) {
      const nextKm = n(v.oilChangeMileage) + interval;
      const remain = nextKm - n(v.mileage);
      if (remain <= 0) {
        alerts.push({ id:`oil-${v.id}-over`, level:"danger", category:"整備", page:"vehicles",
          message:`【オイル交換】${name} が交換時期を ${Math.abs(remain).toLocaleString()}km 超過しています。` });
      } else if (remain <= 500) {
        alerts.push({ id:`oil-${v.id}-soon`, level:"warn", category:"整備", page:"vehicles",
          message:`【オイル交換】${name} はあと約 ${remain.toLocaleString()}km で交換時期です。` });
      }
    }
  });

  // --- 免許・契約更新（仕様書⑫）---
  // 退職済みのドライバーは、もう乗務しないため免許更新・契約満了を
  // 何年も延々と警告し続けても意味がない（むしろ本当に必要な警告が
  // 埋もれる原因になる）。退職済みは対象から除外する。
  drivers.filter((d) => d?.status !== "retired").forEach((d) => {
    const name = d?.name || d?.id || "ドライバー";
    pushExpiry(d?.license_expiry, `【免許更新】${name}`, "drivers", "免許期限");
    pushExpiry(d?.contractEnd,    `【契約満了】${name}`, "drivers", "契約更新");

    // インボイス登録番号の未登録（仕様書⑫「インボイス期限」）
    // 業務委託かつインボイス登録済にチェックがあるのに番号が未入力、という
    // 実務でよくある入力漏れを検出する。
    if (d?.contractType === "業務委託" && d?.invoiceRegistered && !d?.invoiceRegNo) {
      alerts.push({ id:`invoice-no-${d.id}`, level:"warn", category:"インボイス", page:"drivers",
        message:`【インボイス】${name} は登録済にチェックがありますが、登録番号が未入力です。` });
    }

    // 振込先未登録（報酬を払えない＝最も実害が大きいので danger）
    const hasRecords = records.some(r => r?.driverId === d?.id);
    if (hasRecords && (!d?.bankName || !d?.accountNumber || !d?.accountHolderKana)) {
      alerts.push({ id:`bank-${d.id}`, level:"danger", category:"報酬確定漏れ", page:"drivers",
        message:`【振込先未登録】${name} に稼働実績がありますが、振込先口座が未登録です。報酬を振り込めません。` });
    }

    // ===== 法定の安全教育・指導のリマインド =====
    // 【重要】以前は「前回実施日から365日経過した後」に初めて警告していたため、
    // 期限を過ぎてから気づく形になっており、車検・保険と同じように
    // 期限が近づいた時点で事前に知らせてほしいという指摘を受けて直した。
    // 「前回実施日＋365日」を期限日とみなし、既存の pushExpiry（車検・保険と
    // 同じ仕組み）で、期限が近づいたら warn、過ぎたら danger を出す。

    // ①年1回の安全指導（全ドライバー対象）
    if (d?.lastSafetyGuidanceDate) {
      const dueDate = addDays(d.lastSafetyGuidanceDate, 365);
      pushExpiry(dueDate, `【年次安全指導】${name}`, "drivers", "安全教育");
    } else {
      // 一度も実施記録が無い場合は、期限計算のしようがないため即座に警告する。
      alerts.push({
        id: `safety-guidance-${d.id}-none`, level: "warn", category: "安全教育", page: "drivers",
        message: `【年次安全指導】${name} の実施記録がありません。`,
      });
    }

    // ②65歳以上のドライバー向け、適性診断・指導
    // 生年月日から年齢を計算し、65歳以上のみを対象にする。
    const calcAge = (birthdateStr) => {
      if (!birthdateStr) return null;
      const b = new Date(birthdateStr + "T00:00:00");
      if (isNaN(b.getTime())) return null;
      let age = today.getFullYear() - b.getFullYear();
      const hasHadBirthdayThisYear = (today.getMonth() > b.getMonth()) || (today.getMonth() === b.getMonth() && today.getDate() >= b.getDate());
      if (!hasHadBirthdayThisYear) age -= 1;
      return age;
    };
    const age = calcAge(d?.birthdate);
    if (age != null && age >= 65) {
      if (d?.lastElderlyDiagnosisDate) {
        const dueDate = addDays(d.lastElderlyDiagnosisDate, 365);
        pushExpiry(dueDate, `【高齢運転者・${age}歳】${name}`, "drivers", "安全教育");
      } else {
        alerts.push({
          id: `elderly-diagnosis-${d.id}-none`, level: "warn", category: "安全教育", page: "drivers",
          message: `【高齢者適性診断】${name}（${age}歳）は65歳以上のため適性診断・指導が必要ですが、実施記録がありません。`,
        });
      }
    }

    // ③事故惹起者への特別指導
    // 「重大事故」の記録日より後に、特別指導が実施されているかを確認する。
    // こちらは「事前に近づく」性質の期限ではなく「事故発生後、速やかに実施すべき」
    // 指導のため、実施済みかどうかだけを判定する（従来通り）。
    const majorAccidents = (Array.isArray(d?.accidentLogs) ? d.accidentLogs : []).filter(a => a?.type === "重大事故" && a?.date);
    if (majorAccidents.length > 0) {
      const latestAccidentDate = majorAccidents.reduce((max, a) => (a.date > max ? a.date : max), majorAccidents[0].date);
      const guidanceDate = d?.lastSpecialGuidanceDate || "";
      if (!guidanceDate || guidanceDate < latestAccidentDate) {
        alerts.push({
          id: `special-guidance-${d.id}-${latestAccidentDate}`, level: "danger", category: "安全教育", page: "drivers",
          message: `【事故惹起者特別指導】${name} は ${latestAccidentDate} に重大事故を起こしていますが、その後の特別指導が記録されていません。`,
        });
      }
    }
  });

  // --- 未入力実績（仕様書⑫）---
  // 「配達日が過ぎた受注なのに、対応する実績（dailyRecords）が入っていない」を検出する。
  // 実績が入らないと売上も報酬も計上されないため、放置すると請求漏れ・支払漏れになる。
  const orders = (Array.isArray(data?.orders) ? data.orders : []).filter(o => o && !o.deleted);
  const recordedOrderIds = new Set(records.map(r => r?.orderId).filter(Boolean));
  const missingRecordOrders = orders.filter(o =>
    o?.deliveryDate && o.deliveryDate < todayStr &&
    o?.status !== "cancelled" && !recordedOrderIds.has(o?.id)
  );
  if (missingRecordOrders.length > 0) {
    alerts.push({
      id:"missing-records", level:"warn", category:"未入力実績", page:"sales_mgmt",
      message:`配達日を過ぎたのに実績が未入力の受注が ${missingRecordOrders.length}件 あります（例：${missingRecordOrders.slice(0,3).map(o=>o.id).join("、")}）。売上・報酬に反映されません。`,
    });
  }

  // --- 案件の単価未設定（ドライバー報酬額が常に0円になってしまう）---
  // 【重要】ハコログ側では、単価が未設定の案件について「ドライバーには
  // 見せない」方針で警告表示を撤去したが、その代わりに会社側（ここ）で
  // 検知できるようにしておかないと、誰も気づけないまま報酬0円が
  // 記録され続けてしまう。直近30日以内に実績があるのに、単価
  // （ドライバー報酬額）が0円のままの案件を検出する。
  const recentJobTypeIds = new Set(
    records.filter(r => r?.date && r.date >= addDays(todayStr, -30) && r?.jobTypeId).map(r => r.jobTypeId)
  );
  const unpricedJobTypes = jobTypes.filter(jt => recentJobTypeIds.has(jt?.id) && n(jt?.driverUnitPrice) === 0);
  if (unpricedJobTypes.length > 0) {
    alerts.push({
      id: "unpriced-jobtypes", level: "danger", category: "報酬確定漏れ", page: "sales_mgmt",
      message: `【単価未設定】直近30日以内に稼働実績がある案件「${unpricedJobTypes.map(j => j?.name).join("、")}」のドライバー報酬額が0円のままです。この案件で記録された実績は、報酬0円で計上され続けています。`,
    });
  }

  // --- 報酬確定漏れ（仕様書⑫）---
  // 先月の実績があるのに、控除設定（ロイヤリティ）が一度も設定されていないドライバー。
  // 設定漏れのまま振り込むと、あとから返金交渉が必要になり現場が非常に困る。
  const lastMonth = (() => {
    const d = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();
  const lastMonthDriverIds = new Set(
    records.filter(r => typeof r?.date === "string" && r.date.slice(0,7) === lastMonth)
           .map(r => r?.driverId).filter(Boolean)
  );
  const unsetRoyalty = drivers.filter(d =>
    lastMonthDriverIds.has(d?.id) &&
    d?.contractType === "業務委託" &&
    !d?.royaltyType // 一度も設定していない（"none"を明示的に選べば通知は出ない）
  );
  if (unsetRoyalty.length > 0) {
    alerts.push({
      id:"unset-royalty", level:"warn", category:"報酬確定漏れ", page:"drivers",
      message:`先月（${lastMonth}）稼働した業務委託ドライバーのうち ${unsetRoyalty.length}名 はロイヤリティ設定が未確認です（${unsetRoyalty.slice(0,3).map(d=>d.name).join("、")}）。控除なしでよければ「なし」を選択してください。`,
    });
  }

  // --- 承認待ちの実績（放置すると支払遅延・売上計上漏れになる）---
  const submitted = records.filter(r => r?.approvalStatus === APPROVAL.SUBMITTED);
  if (submitted.length > 0) {
    // 3日以上放置されているものは危険度を上げる
    const stale = submitted.filter(r => {
      const d = daysUntil(String(r?.submittedAt || r?.date || "").slice(0, 10));
      return d !== null && d <= -3;
    });
    alerts.push({
      id: "pending-approval", level: stale.length > 0 ? "danger" : "warn",
      category: "実績承認", page: "approval",
      message: stale.length > 0
        ? `【承認待ち】${submitted.length}件の実績が未承認です（うち ${stale.length}件 は3日以上放置）。承認するまで売上・報酬に計上されません。`
        : `【承認待ち】${submitted.length}件の実績が承認待ちです。承認するまで売上・報酬に計上されません。`,
    });
  }

  // 危険度の高い順に並べる（経営者・事務担当が上から順に処理できるように）
  const rank = { danger: 0, warn: 1, info: 2 };
  return alerts.sort((a, b) => (rank[a.level] ?? 3) - (rank[b.level] ?? 3));
};

/**
 * ===== 実績の危険信号を自動検出（承認画面で使う）=====
 *
 * 承認する人が1件ずつ目視で確認するのは現実的でない（月に数百件になる）。
 * 「これは要確認」というものを機械的に洗い出し、承認者の目を向けさせる。
 *
 * @returns {Array} [{ level, message }]  level: "danger"（要確認）/ "warn"（念のため）
 */
const detectRecordRisks = (record, context = {}) => {
  const n = (v) => Number(v) || 0;
  const risks = [];
  if (!record) return risks;

  const { allRecords = [], jobTypes = [], driver = null, byDriverJob = null, byDupKey = null } = context;
  const jt = jobTypes.find((j) => j?.id === record.jobTypeId);

  // --- 1) 実費・手当が高額 ---
  // 高速代や手当は「言い値」で入力できてしまう。領収書の確認が必要な金額なら知らせる。
  const allowance = n(record.highwayFee) + n(record.parkingFee) + n(record.fuelAllowance) + n(record.otherAllowance);
  if (allowance >= 10000) {
    risks.push({ level: "danger", message: `実費・手当が高額です（¥${allowance.toLocaleString()}）。領収書をご確認ください。` });
  } else if (allowance > 0 && allowance >= n(record.salesAmount) * 0.5) {
    risks.push({ level: "warn", message: `実費・手当が売上の半分を超えています（¥${allowance.toLocaleString()}）。` });
  }

  // --- 2) チャーターが売上を伴わない ---
  // 「自分への支払だけ」を入力すると、会社は売上ゼロで支払だけ発生する。
  if (n(record.charterDriver) > 0 && n(record.charterSales) === 0) {
    risks.push({ level: "danger", message: `チャーター支払（¥${n(record.charterDriver).toLocaleString()}）に対して、会社の売上が0円です。` });
  }
  // 支払が売上を上回る（赤字のチャーター）
  if (n(record.charterDriver) > n(record.charterSales) && n(record.charterSales) > 0) {
    risks.push({ level: "warn", message: `チャーターの支払が売上を上回っています（赤字）。` });
  }

  // --- 3) 支払が売上を上回る（この実績単体で赤字） ---
  if (n(record.driverAmount) > n(record.salesAmount)) {
    const diff = n(record.driverAmount) - n(record.salesAmount);
    risks.push({ level: "danger", message: `支払額が売上を ¥${diff.toLocaleString()} 上回っています（この案件は赤字）。` });
  }

  // --- 4) 単価が案件の設定と違う ---
  // ドライバーが単価を書き換えて水増しするケースを検出する。
  if (jt && record.unitPrice !== "" && record.unitPrice != null) {
    const std = n(jt.unitPrice);
    const used = n(record.unitPrice);
    if (std > 0 && used !== std) {
      const lv = used > std ? "danger" : "warn";
      risks.push({ level: lv, message: `単価が案件の設定（¥${std.toLocaleString()}）と異なります（入力値 ¥${used.toLocaleString()}）。` });
    }
  }

  // --- 5) 個数が普段と極端に違う ---
  // 打ち間違い（100 → 1000）を拾う。過去の同一案件の実績と比較する。
  //
  // 【性能】申請待ちが多い状態でこの検出を1件ずつ実行すると、
  // 「1件ごとに全実績（数万件になりうる）をfilterする」という O(件数²) の
  // 処理になり、実測で数百msの遅延が発生していた。
  // byDriverJob（事前に driverId+jobTypeId でグループ化したMap）が
  // 渡されていればそれを使い、全件走査を1回のグループ化にまとめる。
  const sameJobSource = byDriverJob
    ? (byDriverJob.get(`${record.driverId}|${record.jobTypeId}`) || [])
    : allRecords.filter((r) => r && r.driverId === record.driverId && r.jobTypeId === record.jobTypeId);
  const sameJob = sameJobSource.filter(
    (r) => r && r.id !== record.id && n(r.count) > 0 && isApprovedRecord(r)
  );
  if (sameJob.length >= 3 && n(record.count) > 0) {
    const avg = sameJob.reduce((s, r) => s + n(r.count), 0) / sameJob.length;
    if (avg > 0 && n(record.count) > avg * 3) {
      risks.push({ level: "danger", message: `配送個数が普段の3倍以上です（今回 ${n(record.count)}個 / 平均 ${Math.round(avg)}個）。打ち間違いの可能性。` });
    }
  }

  // --- 6) 同じ日・同じ案件で二重登録 ---
  // 事務員がハコマネで入力し、ドライバーもハコログで入力すると二重計上になる。
  // こちらも同様に、事前グループ化された byDupKey があればそれを使う。
  const dupSource = byDupKey
    ? (byDupKey.get(`${record.driverId}|${record.date}|${record.customerId}|${record.jobTypeId}`) || [])
    : allRecords.filter((r) => r && !r.deleted && r.driverId === record.driverId && r.date === record.date && r.customerId === record.customerId && r.jobTypeId === record.jobTypeId);
  const dup = dupSource.filter((r) => r && r.id !== record.id);
  if (dup.length > 0) {
    risks.push({ level: "danger", message: `同じ日・同じ案件の実績が他に ${dup.length}件 あります。二重計上の可能性があります。` });
  }

  // --- 7) 未来の日付 ---
  if (record.date && record.date > getTodayLocalStr()) {
    risks.push({ level: "danger", message: `配送日が未来の日付です（${record.date}）。` });
  }

  // --- 8) 何ヶ月も前の日付 ---
  // 確定済みの過去月に後から差し込まれるのを防ぐ。
  if (record.date) {
    const d = new Date(record.date + "T00:00:00");
    const today = new Date(getTodayLocalStr() + "T00:00:00");
    const daysAgo = Math.round((today - d) / 86400000);
    if (daysAgo > 60) {
      risks.push({ level: "warn", message: `${daysAgo}日前の実績です。締め済みの月に影響しないかご確認ください。` });
    }
  }

  return risks;
};

/** 危険信号のうち最も高い深刻度を返す（一覧の色分けに使う） */
const highestRiskLevel = (risks) => {
  if (!Array.isArray(risks) || risks.length === 0) return null;
  return risks.some((r) => r.level === "danger") ? "danger" : "warn";
};

/**
 * ===== 実績承認ページ =====
 *
 * ドライバーがハコログから申請した実績を、会社が確認して承認/差戻しする画面。
 * 承認するまで売上にも報酬にも計上されない。
 *
 * 【設計方針】
 * 月に数百件になるため、1件ずつ目視するのは非現実的。
 * detectRecordRisks で危険信号（水増し・二重計上・打ち間違い）を自動検出し、
 * 「問題なし」のものは一括承認、「要確認」だけを人が見る、という運用にする。
 */
const ApprovalPage = ({ data, setData, tenantId, userRole, isMobile, setPage }) => {
  const dailyRecords = (Array.isArray(data?.dailyRecords) ? data.dailyRecords : []).filter(r => r && !r.deleted);
  const drivers = (Array.isArray(data?.drivers) ? data.drivers : []).filter(d => d && !d.deleted);
  const customers = (Array.isArray(data?.customers) ? data.customers : []).filter(c => c && !c.deleted);
  const jobTypes = (Array.isArray(data?.jobTypes) ? data.jobTypes : []).filter(j => j && !j.deleted);
  const companyInfo = data?.companyInfo || null;

  const [filter, setFilter] = useState("submitted"); // submitted / risky / all
  const [selected, setSelected] = useState([]);      // 選択中の実績ID
  const [detailId, setDetailId] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [confirmBulk, setConfirmBulk] = useState(null);

  const yen = (v) => `¥${(Number(v) || 0).toLocaleString()}`;
  const driverName = (id) => drivers.find(d => d?.id === id)?.name || "(不明)";
  const customerName = (id) => customers.find(c => c?.id === id)?.name || "(未設定)";
  const jobName = (id) => jobTypes.find(j => j?.id === id)?.name || "配送";

  // 申請中のものに危険信号を付与する
  const pending = useMemo(() => {
    const subs = dailyRecords.filter(r => r.approvalStatus === APPROVAL.SUBMITTED);

    // 【性能】detectRecordRisks を申請件数ぶん繰り返す前に、
    // 比較に使う2種類のグループ化を1回だけ行っておく。
    // これをしないと「申請1件ごとに全実績を走査」になり、
    // 実績が数万件規模になると承認画面が数百ms単位で固まる。
    const byDriverJob = new Map();
    const byDupKey = new Map();
    dailyRecords.forEach((r) => {
      if (!r) return;
      const k1 = `${r.driverId}|${r.jobTypeId}`;
      if (!byDriverJob.has(k1)) byDriverJob.set(k1, []);
      byDriverJob.get(k1).push(r);
      if (!r.deleted) {
        const k2 = `${r.driverId}|${r.date}|${r.customerId}|${r.jobTypeId}`;
        if (!byDupKey.has(k2)) byDupKey.set(k2, []);
        byDupKey.get(k2).push(r);
      }
    });

    return subs
      .map(r => {
        const risks = detectRecordRisks(r, { allRecords: dailyRecords, jobTypes, driver: drivers.find(d => d?.id === r.driverId), byDriverJob, byDupKey });
        return { ...r, _risks: risks, _riskLevel: highestRiskLevel(risks) };
      })
      .sort((a, b) => {
        // 危険なものを上に。次に日付が古い順（古い申請を放置しないため）
        const rank = { danger: 0, warn: 1 };
        const ra = rank[a._riskLevel] ?? 2, rb = rank[b._riskLevel] ?? 2;
        if (ra !== rb) return ra - rb;
        return String(a.date).localeCompare(String(b.date));
      });
  }, [dailyRecords, jobTypes, drivers]);

  const risky = pending.filter(r => r._riskLevel);
  const clean = pending.filter(r => !r._riskLevel);
  const shown = filter === "risky" ? risky : filter === "clean" ? clean : pending;

  const totalPendingSales = pending.reduce((s, r) => s + (Number(r.salesAmount) || 0), 0);
  const totalPendingPay = pending.reduce((s, r) => s + (Number(r.driverAmount) || 0), 0);

  /** 承認・差戻しを実行する */
  const applyDecision = (ids, status, reason = "") => {
    const now = new Date().toISOString();
    setData(prev => ({
      ...prev,
      dailyRecords: (prev.dailyRecords || []).map(r => {
        if (!r || !ids.includes(r.id)) return r;
        // 締め済みの月は変更できない
        const month = String(r.date || "").slice(0, 7);
        if (isMonthClosed(prev.companyInfo, month)) return r;
        return {
          ...r,
          approvalStatus: status,
          approvedAt: status === APPROVAL.APPROVED ? now : r.approvedAt,
          approvedBy: status === APPROVAL.APPROVED ? (data?.__authEmail || "会社") : r.approvedBy,
          rejectedAt: status === APPROVAL.REJECTED ? now : null,
          rejectReason: status === APPROVAL.REJECTED ? reason : "",
        };
      }),
    }));
    setSelected(prev => prev.filter(id => !ids.includes(id)));
    setDetailId(null);
    setRejectTarget(null);
    setRejectReason("");
    setConfirmBulk(null);
  };

  const toggle = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAll = () => {
    const ids = shown.map(r => r.id);
    setSelected(prev => (ids.every(id => prev.includes(id)) ? prev.filter(id => !ids.includes(id)) : [...new Set([...prev, ...ids])]));
  };

  const detail = pending.find(r => r.id === detailId) || null;

  const Stat = ({ label, value, color, sub }) => (
    <div style={{ border: cardBorder, borderRadius: "6px", background: "#fff", padding: "10px 12px", flex: 1, minWidth: "130px" }}>
      <div style={{ fontSize: "11px", color: "#888", marginBottom: "3px" }}>{label}</div>
      <div style={{ fontSize: "18px", fontWeight: 700, color: color || "#222" }}>{value}</div>
      {sub && <div style={{ fontSize: "10px", color: "#999", marginTop: "2px" }}>{sub}</div>}
    </div>
  );

  const RiskTag = ({ level }) => {
    if (!level) return <span style={{ fontSize: "10px", fontWeight: 700, color: "#00695c", background: "#e0f2f1", padding: "2px 6px", borderRadius: "3px" }}>問題なし</span>;
    const c = level === "danger"
      ? { bg: "#ffebee", fg: "#c62828", t: "要確認" }
      : { bg: "#fff4e5", fg: "#e65100", t: "念のため" };
    return <span style={{ fontSize: "10px", fontWeight: 700, color: c.fg, background: c.bg, padding: "2px 6px", borderRadius: "3px" }}>{c.t}</span>;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ fontSize: "14px", fontWeight: 700, color: "#222" }}>実績承認</div>
        <div style={{ fontSize: "11px", color: "#888" }}>
          承認するまで、売上・報酬には計上されません
        </div>
      </div>

      {pending.length === 0 ? (
        <div style={{ border: cardBorder, borderRadius: "6px", background: "#fff", padding: "40px 20px", textAlign: "center" }}>
          <div style={{ fontSize: "32px", marginBottom: "8px" }}>✅</div>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#00695c" }}>承認待ちの実績はありません</div>
          <div style={{ fontSize: "12px", color: "#999", marginTop: "4px" }}>
            ドライバーがハコログから実績を申請すると、ここに表示されます。
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Stat label="承認待ち" value={`${pending.length}件`} color="#e65100" />
            <Stat label="うち要確認" value={`${risky.length}件`} color={risky.length > 0 ? "#c62828" : "#999"} sub="水増し・二重計上の疑い" />
            <Stat label="承認後に増える売上" value={yen(totalPendingSales)} color="#007a74" />
            <Stat label="承認後に発生する支払" value={yen(totalPendingPay)} color="#e65100" />
          </div>

          {risky.length > 0 && (
            <div style={{ background: "#ffebee", border: "1px solid #e57373", borderRadius: "6px", padding: "10px 12px", fontSize: "12px", color: "#c62828" }}>
              <b>要確認の申請が {risky.length}件 あります。</b>
              水増し・二重計上・打ち間違いの可能性があります。内容を確認してから承認してください。
            </div>
          )}

          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
            {[
              { id: "submitted", label: `すべて（${pending.length}）` },
              { id: "risky", label: `要確認（${risky.length}）` },
              { id: "clean", label: `問題なし（${clean.length}）` },
            ].map(f => (
              <button key={f.id} onClick={() => { setFilter(f.id); setSelected([]); }} style={{
                border: "1px solid #d0d0d0", borderRadius: "4px", padding: "6px 12px", fontSize: "12px", fontWeight: 600, cursor: "pointer",
                background: filter === f.id ? "#00a09a" : "#fff", color: filter === f.id ? "#fff" : "#555",
              }}>{f.label}</button>
            ))}
            <div style={{ flex: 1 }} />
            {selected.length > 0 && (
              <>
                <span style={{ fontSize: "12px", color: "#666", fontWeight: 700 }}>{selected.length}件選択中</span>
                <RetroBtn onClick={() => setConfirmBulk("approve")} style={{ background: "#00a09a", borderColor: "#00a09a", color: "#fff" }}>
                  選択したものを承認
                </RetroBtn>
              </>
            )}
          </div>

          <div style={{ border: cardBorder, borderRadius: "6px", background: "#fff", overflow: "auto" }}>
            <table style={{ minWidth: "100%", width: "max-content", borderCollapse: "collapse", fontFamily: "'Noto Sans JP', sans-serif", fontSize: "12px" }}>
              <thead>
                <tr style={{ background: "#fafbfc" }}>
                  <th style={{ padding: "8px 10px", borderBottom: cardBorder, width: "36px" }}>
                    <input
                      type="checkbox"
                      checked={shown.length > 0 && shown.every(r => selected.includes(r.id))}
                      onChange={toggleAll}
                      style={{ cursor: "pointer" }}
                    />
                  </th>
                  {["状態", "日付", "ドライバー", "案件", "個数", "売上", "支払", "操作"].map((h, i) => (
                    <th key={h} style={{
                      color: "#666", fontSize: "11px", padding: "8px 10px", fontWeight: 700, whiteSpace: "nowrap",
                      borderBottom: cardBorder, textAlign: ["個数", "売上", "支払"].includes(h) ? "right" : "left",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 && (
                  <tr><td colSpan={9} style={{ padding: "24px", textAlign: "center", color: "#999" }}>該当する申請はありません</td></tr>
                )}
                {shown.map(r => (
                  <tr key={r.id} style={{
                    borderBottom: "1px solid #f0f0f0",
                    background: r._riskLevel === "danger" ? "#fff8f8" : selected.includes(r.id) ? "#f0fbfa" : "#fff",
                  }}>
                    <td style={{ padding: "8px 10px" }}>
                      <input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggle(r.id)} style={{ cursor: "pointer" }} />
                    </td>
                    <td style={{ padding: "8px 10px" }}><RiskTag level={r._riskLevel} /></td>
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{r.date}</td>
                    <td style={{ padding: "8px 10px", fontWeight: 700, whiteSpace: "nowrap" }}>{driverName(r.driverId)}</td>
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                      {customerName(r.customerId)}
                      <div style={{ fontSize: "10px", color: "#999" }}>{jobName(r.jobTypeId)}</div>
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "right" }}>{(Number(r.count) || 0).toLocaleString()}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: "#007a74" }}>{yen(r.salesAmount)}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: "#e65100", fontWeight: 700 }}>{yen(r.driverAmount)}</td>
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                      <RetroBtn small onClick={() => setDetailId(r.id)} style={{ marginRight: "4px" }}>内容確認</RetroBtn>
                      {!r._riskLevel && (
                        <RetroBtn small onClick={() => applyDecision([r.id], APPROVAL.APPROVED)}
                          style={{ background: "#00a09a", borderColor: "#00a09a", color: "#fff" }}>承認</RetroBtn>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {clean.length > 0 && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <RetroBtn onClick={() => setConfirmBulk("approveClean")} style={{ background: "#00a09a", borderColor: "#00a09a", color: "#fff" }}>
                「問題なし」の {clean.length}件 をまとめて承認
              </RetroBtn>
            </div>
          )}
        </>
      )}

      {/* 内容確認モーダル */}
      {detail && (
        <Modal
          title={`実績の確認 — ${driverName(detail.driverId)}（${detail.date}）`}
          onClose={() => setDetailId(null)}
          width={620}
        >
          {detail._risks.length > 0 && (
            <div style={{ marginBottom: "12px" }}>
              {detail._risks.map((rk, i) => (
                <div key={i} style={{
                  background: rk.level === "danger" ? "#ffebee" : "#fff4e5",
                  border: `1px solid ${rk.level === "danger" ? "#e57373" : "#ffb74d"}`,
                  color: rk.level === "danger" ? "#c62828" : "#e65100",
                  borderRadius: "6px", padding: "8px 10px", fontSize: "12px", marginBottom: "6px", fontWeight: 600,
                }}>
                  {rk.level === "danger" ? "🔴" : "🟡"} {rk.message}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "16px", fontSize: "12px" }}>
            <div>
              <div style={{ fontWeight: 700, color: "#007a74", borderBottom: "2px solid #007a74", paddingBottom: "4px", marginBottom: "6px" }}>申請内容</div>
              {[
                ["日付", detail.date],
                ["案件", customerName(detail.customerId)],
                ["業務", jobName(detail.jobTypeId)],
                ["配送個数", `${(Number(detail.count) || 0).toLocaleString()}個`],
                ["単価", detail.unitPrice ? yen(detail.unitPrice) : "案件の既定単価"],
                ["メモ", detail.note || "—"],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #f5f5f5" }}>
                  <span style={{ color: "#888" }}>{k}</span><span style={{ fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontWeight: 700, color: "#e65100", borderBottom: "2px solid #e65100", paddingBottom: "4px", marginBottom: "6px" }}>金額</div>
              {[
                ["会社の売上", detail.salesAmount, "#007a74"],
                ["チャーター（売上）", detail.charterSales, "#007a74"],
                ["ドライバーへの支払", detail.driverAmount, "#e65100"],
                ["チャーター（支払）", detail.charterDriver, "#e65100"],
                ["高速代", detail.highwayFee, "#c62828"],
                ["駐車場代", detail.parkingFee, "#c62828"],
                ["燃料補助", detail.fuelAllowance, "#c62828"],
                ["その他支給", detail.otherAllowance, "#c62828"],
              ].filter(([, v]) => Number(v) !== 0).map(([k, v, c]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #f5f5f5" }}>
                  <span style={{ color: "#888" }}>{k}</span>
                  <span style={{ fontWeight: 700, color: c }}>{yen(v)}</span>
                </div>
              ))}
              <div style={{ marginTop: "8px", padding: "8px 10px", background: "#f8f8f8", borderRadius: "6px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                  <span>会社の利益</span>
                  <span style={{ color: (Number(detail.salesAmount) || 0) - (Number(detail.driverAmount) || 0) < 0 ? "#c62828" : "#00695c" }}>
                    {yen((Number(detail.salesAmount) || 0) - (Number(detail.driverAmount) || 0))}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "16px", gap: "6px", flexWrap: "wrap" }}>
            <RetroBtn onClick={() => { setRejectTarget(detail.id); setRejectReason(""); }}
              style={{ background: "#fff", color: "#c62828", borderColor: "#c62828" }}>
              差し戻す
            </RetroBtn>
            <div style={{ display: "flex", gap: "6px" }}>
              <RetroBtn onClick={() => setDetailId(null)}>閉じる</RetroBtn>
              <RetroBtn onClick={() => applyDecision([detail.id], APPROVAL.APPROVED)}
                style={{ background: "#00a09a", borderColor: "#00a09a", color: "#fff" }}>
                承認する
              </RetroBtn>
            </div>
          </div>
        </Modal>
      )}

      {/* 差戻し理由 */}
      {rejectTarget && (
        <Modal title="実績を差し戻す" onClose={() => setRejectTarget(null)} width={480}>
          <div style={{ fontSize: "12px", color: "#666", marginBottom: "10px" }}>
            差戻しの理由を入力してください。ドライバーのアプリに表示され、修正して再申請できます。
          </div>
          <textarea
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            placeholder="例：高速代の領収書を提出してください。&#10;例：配送個数が普段と違います。ご確認ください。"
            rows={4}
            style={{
              width: "100%", border: "1px solid #d0d0d0", borderRadius: "6px", padding: "10px",
              fontSize: "13px", fontFamily: "'Noto Sans JP', sans-serif", resize: "vertical",
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px", marginTop: "12px" }}>
            <RetroBtn onClick={() => setRejectTarget(null)}>キャンセル</RetroBtn>
            <RetroBtn
              onClick={() => applyDecision([rejectTarget], APPROVAL.REJECTED, rejectReason.trim())}
              disabled={!rejectReason.trim()}
              style={{
                background: rejectReason.trim() ? "#c62828" : "#ccc",
                borderColor: rejectReason.trim() ? "#c62828" : "#ccc", color: "#fff",
              }}
            >
              差し戻す
            </RetroBtn>
          </div>
        </Modal>
      )}

      {/* 一括承認の確認 */}
      {confirmBulk && (() => {
        const targets = confirmBulk === "approveClean" ? clean : pending.filter(r => selected.includes(r.id));
        const sales = targets.reduce((s, r) => s + (Number(r.salesAmount) || 0), 0);
        const pay = targets.reduce((s, r) => s + (Number(r.driverAmount) || 0), 0);
        const hasRisk = targets.some(r => r._riskLevel === "danger");
        return (
          <Modal title={`${targets.length}件をまとめて承認します`} onClose={() => setConfirmBulk(null)} width={460}>
            {hasRisk && (
              <div style={{ background: "#ffebee", border: "1px solid #e57373", borderRadius: "6px", padding: "10px", fontSize: "12px", color: "#c62828", marginBottom: "10px", fontWeight: 700 }}>
                ⚠ 「要確認」の申請が含まれています。本当に承認しますか？
              </div>
            )}
            <div style={{ fontSize: "13px", color: "#444", lineHeight: 1.8 }}>
              承認すると、以下が確定します。
            </div>
            <div style={{ background: "#f8f8f8", borderRadius: "6px", padding: "12px", margin: "10px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                <span style={{ color: "#666", fontSize: "12px" }}>売上に計上</span>
                <span style={{ fontWeight: 700, color: "#007a74" }}>{yen(sales)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                <span style={{ color: "#666", fontSize: "12px" }}>ドライバーへの支払が発生</span>
                <span style={{ fontWeight: 700, color: "#e65100" }}>{yen(pay)}</span>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px" }}>
              <RetroBtn onClick={() => setConfirmBulk(null)}>キャンセル</RetroBtn>
              <RetroBtn
                onClick={() => applyDecision(targets.map(r => r.id), APPROVAL.APPROVED)}
                style={{ background: "#00a09a", borderColor: "#00a09a", color: "#fff" }}
              >
                {targets.length}件を承認する
              </RetroBtn>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
};

/**
 * ===== お知らせ配信ページ =====
 *
 * 会社からドライバーへ一方的に伝える連絡（単価改定、研修案内、緊急連絡など）を配信する。
 * データは events テーブルに notice:true として保存するだけで、ハコログ側が
 * 自動的に「お知らせ」画面に表示してくれる（既存の仕組みに乗せているだけ）。
 *
 * 【宛先の考え方】
 * driverId を指定しなければ全員に配信、指定すれば本人だけに届く。
 * ハコログ側は「!e.driverId || e.driverId === myId」で絞り込むため、
 * ここで driverId を正しく入れるだけで安全に個別配信できる。
 */
const NOTICE_KINDS = {
  important: { label: "重要", color: "#c62828", bg: "#ffebee" },
  price:     { label: "単価変更", color: "#e65100", bg: "#fff4e5" },
  project:   { label: "案件変更", color: "#1565c0", bg: "#e3f2fd" },
  event:     { label: "イベント", color: "#6a1b9a", bg: "#f3e5f5" },
  info:      { label: "お知らせ", color: "#555", bg: "#f0f0f0" },
};

const NoticeBroadcastPage = ({ data, setData, tenantId, userRole, isMobile }) => {
  const drivers = (Array.isArray(data?.drivers) ? data.drivers : []).filter(d => d && !d.deleted);
  const events = (Array.isArray(data?.events) ? data.events : []).filter(e => e && !e.deleted);

  const [composing, setComposing] = useState(false);
  const [form, setForm] = useState({ title: "", note: "", kind: "info", target: "all", driverId: "" });
  const [confirmDelete, setConfirmDelete] = useState(null);

  const driverName = (id) => drivers.find(d => d?.id === id)?.name || "(不明)";

  // お知らせだけを一覧する（配達予定などの通常イベントは混ぜない）
  const notices = events
    .filter(e => e.notice)
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

  const canSend = form.title.trim() && (form.target === "all" || form.driverId);

  const send = () => {
    if (!canSend) return;
    const now = new Date();
    const item = {
      id: `NT-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      date: getTodayLocalStr(), // UTC変換すると日本時間の深夜0-9時台に「前日」になるバグがあるため、必ずこちらを使う
      notice: true,
      kind: form.kind,
      title: form.title.trim(),
      note: form.note.trim(),
      // target が "all" なら driverId を付けない → 全員に配信される
      driverId: form.target === "driver" ? form.driverId : null,
      createdAt: now.toISOString(),
    };
    setData(prev => ({ ...prev, events: [...(Array.isArray(prev.events) ? prev.events : []), item] }));
    setForm({ title: "", note: "", kind: "info", target: "all", driverId: "" });
    setComposing(false);
  };

  const remove = (id) => {
    setData(prev => ({
      ...prev,
      events: (prev.events || []).map(e => (e?.id === id ? { ...e, deleted: true } : e)),
    }));
    setConfirmDelete(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: "14px", fontWeight: 700, color: "#222" }}>お知らせ配信</div>
        <RetroBtn onClick={() => setComposing(true)} style={{ background: "#00a09a", borderColor: "#00a09a", color: "#fff" }}>
          ＋ 新規配信
        </RetroBtn>
      </div>
      <p style={{ fontSize: "11px", color: "#888" }}>
        ここで配信した内容は、ドライバーのハコログ「お知らせ」画面にそのまま届きます。
      </p>

      <div style={{ border: cardBorder, borderRadius: "6px", background: "#fff", overflow: "hidden" }}>
        {notices.length === 0 && (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "#999", fontSize: "12px" }}>
            まだ配信したお知らせはありません
          </div>
        )}
        {notices.map((n, i) => {
          const k = NOTICE_KINDS[n.kind] || NOTICE_KINDS.info;
          return (
            <div key={n.id} style={{ padding: "12px 14px", borderBottom: i < notices.length - 1 ? "1px solid #f0f0f0" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "10px", fontWeight: 700, color: k.color, background: k.bg, padding: "2px 8px", borderRadius: "10px" }}>
                  {k.label}
                </span>
                <span style={{ fontSize: "11px", color: "#999" }}>{n.date}</span>
                <span style={{ fontSize: "11px", color: "#999" }}>
                  宛先：{n.driverId ? driverName(n.driverId) : "全員"}
                </span>
                <div style={{ flex: 1 }} />
                <button onClick={() => setConfirmDelete(n.id)} style={{ background: "none", border: "none", color: "#c62828", fontSize: "11px", cursor: "pointer" }}>
                  削除
                </button>
              </div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#222", marginTop: "4px" }}>{n.title}</div>
              {n.note && <div style={{ fontSize: "12px", color: "#666", marginTop: "2px", whiteSpace: "pre-wrap" }}>{n.note}</div>}
            </div>
          );
        })}
      </div>

      {composing && (
        <Modal title="お知らせを配信" onClose={() => setComposing(false)} width={520}>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 700, color: "#555", display: "block", marginBottom: "4px" }}>種別</label>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {Object.entries(NOTICE_KINDS).map(([key, k]) => (
                  <button key={key} onClick={() => setForm(f => ({ ...f, kind: key }))} style={{
                    border: `1px solid ${form.kind === key ? k.color : "#ddd"}`, borderRadius: "4px", padding: "5px 10px",
                    fontSize: "11px", fontWeight: 700, cursor: "pointer",
                    background: form.kind === key ? k.bg : "#fff", color: form.kind === key ? k.color : "#888",
                  }}>{k.label}</button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ fontSize: "12px", fontWeight: 700, color: "#555", display: "block", marginBottom: "4px" }}>宛先</label>
              <div style={{ display: "flex", gap: "6px", marginBottom: "6px" }}>
                <button onClick={() => setForm(f => ({ ...f, target: "all", driverId: "" }))} style={{
                  border: `1px solid ${form.target === "all" ? "#00a09a" : "#ddd"}`, borderRadius: "4px", padding: "6px 14px",
                  fontSize: "12px", fontWeight: 700, cursor: "pointer",
                  background: form.target === "all" ? "#00a09a" : "#fff", color: form.target === "all" ? "#fff" : "#888",
                }}>全員</button>
                <button onClick={() => setForm(f => ({ ...f, target: "driver" }))} style={{
                  border: `1px solid ${form.target === "driver" ? "#00a09a" : "#ddd"}`, borderRadius: "4px", padding: "6px 14px",
                  fontSize: "12px", fontWeight: 700, cursor: "pointer",
                  background: form.target === "driver" ? "#00a09a" : "#fff", color: form.target === "driver" ? "#fff" : "#888",
                }}>特定のドライバー</button>
              </div>
              {form.target === "driver" && (
                <RetroSelect value={form.driverId} onChange={e => setForm(f => ({ ...f, driverId: e.target.value }))}>
                  <option value="">選択してください</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </RetroSelect>
              )}
            </div>

            <div>
              <label style={{ fontSize: "12px", fontWeight: 700, color: "#555", display: "block", marginBottom: "4px" }}>タイトル</label>
              <RetroInput value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="例：8月から単価改定のお知らせ" />
            </div>

            <div>
              <label style={{ fontSize: "12px", fontWeight: 700, color: "#555", display: "block", marginBottom: "4px" }}>本文</label>
              <textarea
                value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                rows={5} placeholder="ドライバーに伝えたい内容を入力してください"
                style={{ width: "100%", border: "1px solid #d0d0d0", borderRadius: "6px", padding: "10px", fontSize: "13px", fontFamily: "'Noto Sans JP', sans-serif", resize: "vertical" }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px" }}>
              <RetroBtn onClick={() => setComposing(false)}>キャンセル</RetroBtn>
              <RetroBtn onClick={send} disabled={!canSend} style={{
                background: canSend ? "#00a09a" : "#ccc", borderColor: canSend ? "#00a09a" : "#ccc", color: "#fff",
              }}>配信する</RetroBtn>
            </div>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <Modal title="このお知らせを削除しますか？" onClose={() => setConfirmDelete(null)} width={400}>
          <p style={{ fontSize: "13px", color: "#666" }}>削除すると、ドライバー側の画面からも消えます。</p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px", marginTop: "14px" }}>
            <RetroBtn onClick={() => setConfirmDelete(null)}>キャンセル</RetroBtn>
            <RetroBtn onClick={() => remove(confirmDelete)} style={{ background: "#c62828", borderColor: "#c62828", color: "#fff" }}>削除する</RetroBtn>
          </div>
        </Modal>
      )}
    </div>
  );
};

/**
 * ===== チャットページ（会社 ⇔ ドライバー）=====
 *
 * ハコログのチャットは chat_messages テーブルに { tenant_id, driver_id, payload } の形で
 * 保存される。TABLE_CONFIG の汎用同期（id/payload/tenant_id前提）には乗せず、
 * このページの中で直接 supabase を読み書きする。列構成が違うテーブルを無理に
 * 共通の仕組みに混ぜると、他のテーブルの同期まで壊しかねないため。
 *
 * メッセージの送信者は payload.senderId で判別する："company" なら会社、
 * それ以外（ドライバーの driverId）ならドライバー本人の発言。
 */
const ChatPage = ({ data, tenantId, userRole, isMobile, authEmail }) => {
  const drivers = (Array.isArray(data?.drivers) ? data.drivers : []).filter(d => d && !d.deleted);
  const [byDriver, setByDriver] = useState({});      // { driverId: [messages...] }
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const load = async () => {
    if (!tenantId) return;
    try {
      const { data: rows, error } = await supabase
        .from("chat_messages")
        .select("id,driver_id,payload")
        .eq("tenant_id", tenantId)
        .order("id", { ascending: true });
      if (error) throw error;
      const grouped = {};
      (rows || []).forEach(r => {
        const did = r.driver_id;
        if (!did) return;
        if (!grouped[did]) grouped[did] = [];
        grouped[did].push({ ...(r.payload || {}), _dbId: r.id });
      });
      setByDriver(grouped);
      setTableMissing(false);
    } catch {
      // テーブル未作成の環境でも画面自体は壊さない
      setTableMissing(true);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [tenantId]);
  useEffect(() => {
    // 開いている間は定期的に読み直す（ドライバーからの新着に気づけるように）
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [tenantId]);

  const driverName = (id) => drivers.find(d => d?.id === id)?.name || id;

  // ドライバーごとの未読数・最終メッセージ（一覧の並び順にも使う）
  const summaries = drivers.map(d => {
    const msgs = byDriver[d.id] || [];
    const last = msgs[msgs.length - 1];
    const unread = msgs.filter(m => m.senderId !== "company" && !m.readByCompany).length;
    return { driver: d, msgs, last, unread };
  }).filter(s => s.msgs.length > 0 || s.driver)
    .sort((a, b) => {
      if (a.unread !== b.unread) return b.unread - a.unread;
      return String(b.last?.createdAt || "").localeCompare(String(a.last?.createdAt || ""));
    });

  const selected = summaries.find(s => s.driver.id === selectedId) || null;

  // 開いたら、そのドライバーからの未読を「既読」にする
  const openThread = async (driverId) => {
    setSelectedId(driverId);
    const msgs = byDriver[driverId] || [];
    const unreadMsgs = msgs.filter(m => m.senderId !== "company" && !m.readByCompany && m._dbId);
    if (unreadMsgs.length === 0) return;
    setByDriver(prev => ({
      ...prev,
      [driverId]: (prev[driverId] || []).map(m => ({ ...m, readByCompany: true })),
    }));
    try {
      await Promise.all(unreadMsgs.map(m =>
        supabase.from("chat_messages").update({ payload: { ...m, readByCompany: true } }).eq("id", m._dbId)
      ));
    } catch { /* 既読の同期に失敗しても致命的ではないため無視する */ }
  };

  const send = async () => {
    if (!draft.trim() || !selected || sending) return;
    setSending(true);
    const payload = {
      id: `MSG-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      senderId: "company",
      senderName: "会社",
      text: draft.trim(),
      createdAt: new Date().toISOString(),
      readByCompany: true,
    };
    setByDriver(prev => ({ ...prev, [selected.driver.id]: [...(prev[selected.driver.id] || []), payload] }));
    setDraft("");
    try {
      await supabase.from("chat_messages").insert({ tenant_id: tenantId, driver_id: selected.driver.id, payload });
    } catch {
      alert("送信できませんでした。通信環境をご確認ください。");
    }
    setSending(false);
  };

  if (loading) return <div style={{ padding: "20px", color: "#999", fontSize: "12px" }}>読み込み中...</div>;

  if (tableMissing) {
    return (
      <div style={{ border: cardBorder, borderRadius: "6px", background: "#fff", padding: "30px 20px", textAlign: "center", color: "#999", fontSize: "12px" }}>
        チャット機能がまだ準備されていません。Supabase側に chat_messages テーブルの作成が必要です。
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: "10px", height: "calc(100vh - 140px)", minHeight: "400px" }}>
      {/* ドライバー一覧 */}
      <div style={{
        width: isMobile ? (selected ? "0" : "100%") : "260px", flexShrink: 0,
        border: cardBorder, borderRadius: "6px", background: "#fff", overflow: "auto",
        display: isMobile && selected ? "none" : "block",
      }}>
        <div style={{ padding: "10px 12px", borderBottom: cardBorder, fontSize: "13px", fontWeight: 700 }}>ドライバー</div>
        {summaries.length === 0 && <div style={{ padding: "20px", textAlign: "center", color: "#999", fontSize: "12px" }}>ドライバーが登録されていません</div>}
        {summaries.map(s => (
          <div key={s.driver.id} onClick={() => openThread(s.driver.id)} style={{
            padding: "10px 12px", borderBottom: "1px solid #f0f0f0", cursor: "pointer",
            background: selectedId === s.driver.id ? "#f0fbfa" : "#fff",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#222", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{s.driver.name}</span>
              {s.unread > 0 && (
                <span style={{ fontSize: "10px", fontWeight: 700, color: "#fff", background: "#c62828", borderRadius: "9px", padding: "1px 7px", flexShrink: 0 }}>
                  {s.unread}
                </span>
              )}
            </div>
            {s.last && (
              <div style={{ fontSize: "11px", color: "#999", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.last.senderId === "company" ? "会社：" : ""}{s.last.text}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* スレッド */}
      <div style={{
        flex: 1, border: cardBorder, borderRadius: "6px", background: "#fff",
        display: (isMobile && !selected) ? "none" : "flex", flexDirection: "column", minWidth: 0,
      }}>
        {!selected ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#999", fontSize: "12px" }}>
            ドライバーを選択してください
          </div>
        ) : (
          <>
            <div style={{ padding: "10px 14px", borderBottom: cardBorder, display: "flex", alignItems: "center", gap: "8px" }}>
              {isMobile && (
                <button onClick={() => setSelectedId(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "16px" }}>‹</button>
              )}
              <span style={{ fontSize: "13px", fontWeight: 700 }}>{selected.driver.name}</span>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: "8px" }}>
              {selected.msgs.map((m, i) => {
                const mine = m.senderId === "company";
                return (
                  <div key={m.id || i} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
                    <div style={{
                      maxWidth: "70%", padding: "8px 12px", borderRadius: "12px", fontSize: "13px", whiteSpace: "pre-wrap",
                      background: mine ? "#00a09a" : "#f0f0f0", color: mine ? "#fff" : "#222",
                    }}>
                      {m.text}
                      <div style={{ fontSize: "9px", opacity: 0.7, marginTop: "3px", textAlign: "right" }}>
                        {String(m.createdAt || "").slice(0, 16).replace("T", " ")}
                      </div>
                    </div>
                  </div>
                );
              })}
              {selected.msgs.length === 0 && (
                <div style={{ textAlign: "center", color: "#bbb", fontSize: "12px", marginTop: "20px" }}>まだメッセージはありません</div>
              )}
            </div>
            <div style={{ padding: "10px 12px", borderTop: cardBorder, display: "flex", gap: "6px" }}>
              <input
                value={draft} onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="メッセージを入力"
                style={{ flex: 1, border: "1px solid #d0d0d0", borderRadius: "20px", padding: "8px 14px", fontSize: "13px" }}
              />
              <RetroBtn onClick={send} disabled={!draft.trim() || sending} style={{
                background: draft.trim() ? "#00a09a" : "#ccc", borderColor: draft.trim() ? "#00a09a" : "#ccc", color: "#fff", borderRadius: "20px",
              }}>送信</RetroBtn>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const SalesMgmtPage = ({ data, setData, tenantId, userRole, isMobile }) => {
  const qualityRecords = Array.isArray(data?.qualityRecords) ? data.qualityRecords : [];
  const drivers = (Array.isArray(data?.drivers) ? data.drivers : []).filter(d => !d?.deleted);
  const customers = (Array.isArray(data?.customers) ? data.customers : []).filter(c => !c?.deleted);
  const jobTypes = Array.isArray(data?.jobTypes) ? data.jobTypes : [];
  const dailyRecords = Array.isArray(data?.dailyRecords) ? data.dailyRecords : [];
  const payables = Array.isArray(data?.payables) ? data.payables : [];
  const invoicesForPL = (Array.isArray(data?.invoices) ? data.invoices : []).filter(i => !i?.deleted);
  const [activeTab, setActiveTab] = useState("daily");
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  });
  const [showJobTypeModal, setShowJobTypeModal] = useState(false);
  const [editingJobType, setEditingJobType] = useState(null);
  const [showJobTypeHistory, setShowJobTypeHistory] = useState(false);
  const [jobTypeForm, setJobTypeForm] = useState({ name:"", calcPattern:"count", taxable:true, unitPrice:"", driverUnitPrice:"", note:"" });
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [recordForm, setRecordForm] = useState(createEmptyRecordForm);

  const driverRoutes = (() => {
    const driver = drivers.find(d => d?.id === recordForm.driverId);
    return driver?.routes || [];
  })();

  const calcPatternLabel = { count:"個数×単価", fixed:"固定料金", distance:"距離制", time:"時間制" };

  const calcAmounts = (form, jt) => {
    const pattern = jt?.calcPattern || form.calcPattern || "count";
    // form.unitPrice が空文字・未入力の場合のみ jobType のデフォルト単価にフォールバックする。
    // 以前は `Number(form.unitPrice) || Number(jt?.unitPrice) || 0` という書き方だったため、
    // ユーザーが単価を意図的に「0」に設定しても falsy 判定されてしまい、
    // jobType側のデフォルト単価に上書きされてしまうバグがあった。
    const up = form.unitPrice !== "" && form.unitPrice != null ? (Number(form.unitPrice) || 0) : (Number(jt?.unitPrice) || 0);
    const dup = form.driverUnitPrice !== "" && form.driverUnitPrice != null ? (Number(form.driverUnitPrice) || 0) : (Number(jt?.driverUnitPrice) || 0);
    let sales = 0, driver = 0;
    if (pattern === "count") { const c = Number(form.count)||0; sales = c * up; driver = c * dup; }
    else if (pattern === "fixed") { sales = up; driver = dup; }
    else if (pattern === "distance") { const d = Number(form.distance)||0; sales = d * up; driver = d * dup; }
    else if (pattern === "time") { const h = Number(form.hours)||0; sales = h * up; driver = h * dup; }

    // ===== 第1弾で追加：チャーター・実費・手当 =====
    // チャーター料は通常の配送とは別建ての売上なので、売上・支払の両方に加算する。
    const charterSales = Number(form.charterSales) || 0;
    const charterDriver = Number(form.charterDriver) || 0;

    // 高速代・駐車場代はドライバーが立て替えた「実費」、燃料補助・その他支給は「手当」。
    // いずれも会社の売上ではなく、ドライバーへの支払額に上乗せされるものなので
    // driverAmount にのみ加算する（salesAmount には入れない）。
    // ※もし顧客に高速代を請求する運用（実費請求）の場合は、売上単価側で調整すること。
    const allowanceTotal =
      (Number(form.highwayFee) || 0) +
      (Number(form.parkingFee) || 0) +
      (Number(form.fuelAllowance) || 0) +
      (Number(form.otherAllowance) || 0);

    // 距離制・時間制では距離や時間に小数を入力できるため、計算結果も小数になることがある。
    // 日本のビジネス慣習では金額は円単位（整数）で扱うため、ここで四捨五入する。
    return {
      salesAmount: Math.round(sales + charterSales),
      driverAmount: Math.round(driver + charterDriver + allowanceTotal),
    };
  };

  const updateRecordCalc = (newForm) => {
    const jt = jobTypes.find(j => j?.id === newForm.jobTypeId);
    const { salesAmount, driverAmount } = calcAmounts(newForm, jt);
    setRecordForm({ ...newForm, salesAmount, driverAmount });
  };

  const openAddRecord = () => {
    setEditingRecord(null);
    setRecordForm(createEmptyRecordForm());
    setShowRecordModal(true);
  };

  const openEditRecord = (rec) => {
    // 【重要】承認済みの実績を、この画面から無条件で書き換えられると、
    // 実績承認の仕組みそのものが意味をなさなくなる（承認後に金額をこっそり
    // 変えられてしまう）。締め済みの月は編集自体を完全にブロックし、
    // 承認済みの実績は「差し戻して修正してもらう」導線に誘導する。
    const month = String(rec?.date || "").slice(0, 7);
    if (isMonthClosed(data?.companyInfo, month)) {
      window.alert(`${month} は締め処理が済んでいるため、実績を編集できません。`);
      return;
    }
    if (isApprovedRecord(rec) && rec?.source === "hakolog") {
      window.alert(
        "この実績は承認済みです。内容に誤りがある場合は、\n" +
        "「実績承認」画面から一度差し戻し、ドライバーに修正・再申請してもらってください。\n" +
        "（承認後にここで金額を直接書き換えられると、承認の記録と実際の金額が食い違ってしまいます）"
      );
      return;
    }
    setEditingRecord(rec);
    // 既存レコードに新項目（高速代等）がまだ無い場合でも、初期値で埋めてから上書きする。
    // これをしないと undefined が input の value に渡り、React が制御/非制御の警告を出す。
    setRecordForm({ ...createEmptyRecordForm(), ...rec, count: rec.count||"", distance: rec.distance||"", hours: rec.hours||"" });
    setShowRecordModal(true);
  };

  const saveRecord = () => {
    if (!recordForm.date || !recordForm.driverId || !recordForm.customerId || !recordForm.jobTypeId) return;
    // 【重要】既存レコードの編集は openEditRecord の時点でブロックしているが、
    // 「新規実績追加」ボタンはそこを経由しないため、締め済みの月に
    // 気づかずに新しい実績を追加できてしまう抜け穴があった（実際に確認）。
    // 新規・編集どちらの場合も、保存の直前に必ずここで確認する。
    const targetMonth = String(recordForm.date || "").slice(0, 7);
    if (isMonthClosed(data?.companyInfo, targetMonth)) {
      window.alert(`${targetMonth} は既に締められた月のため、実績を追加・変更できません。`);
      return;
    }
    const jt = jobTypes.find(j => j?.id === recordForm.jobTypeId);

    /**
     * 【重要】編集のたびに無条件で金額を再計算すると、案件の単価を
     * 後から変更した際、過去の確定済み実績のメモを直しただけなのに
     * 金額まで最新単価で書き換わってしまう（実際に検証して確認した事故）。
     *
     * 金額の元になる項目（案件・数量・距離・時間・単価上書き・チャーター・
     * 実費手当）が実際に変わった場合だけ再計算し、それ以外の項目
     * （メモ・顧客・日付など）だけの編集では、確定済みの金額をそのまま保持する。
     * 新規作成の場合は当然、その場で計算する。
     */
    const amountAffectingKeys = [
      "jobTypeId", "count", "distance", "hours", "unitPrice", "driverUnitPrice",
      "charterSales", "charterDriver", "highwayFee", "parkingFee", "fuelAllowance", "otherAllowance",
    ];
    const amountInputsChanged = !editingRecord || amountAffectingKeys.some(
      (k) => String(recordForm[k] ?? "") !== String(editingRecord[k] ?? "")
    );

    const { salesAmount, driverAmount } = amountInputsChanged
      ? calcAmounts(recordForm, jt)
      : { salesAmount: editingRecord.salesAmount, driverAmount: editingRecord.driverAmount };

    const next = { ...recordForm, salesAmount, driverAmount };
    if (editingRecord) {
      logHistoryEntry(setData, { entityType: "daily_record", entityId: editingRecord.id, entityLabel: `${editingRecord.date} ${editingRecord.driverId}`, before: editingRecord, userRole });
    }
    setData(d => {
      const current = Array.isArray(d?.dailyRecords) ? d.dailyRecords : [];
      if (editingRecord) return { ...d, dailyRecords: current.map(r => r?.id === editingRecord.id ? { ...r, ...next } : r) };
      return { ...d, dailyRecords: [...current, { ...next, id: generateUniqueBusinessId(current, "DR") }] };
    });
    setShowRecordModal(false);
  };

  const deleteRecord = (id) => {
    const rec = dailyRecords.find(r => r?.id === id);
    const month = String(rec?.date || "").slice(0, 7);
    if (isMonthClosed(data?.companyInfo, month)) {
      window.alert(`${month} は締め処理が済んでいるため、削除できません。`);
      return;
    }
    if (isApprovedRecord(rec) && rec?.source === "hakolog") {
      window.alert("この実績は承認済みです。削除が必要な場合は「実績承認」画面から差し戻してください。");
      return;
    }
    if (!window.confirm("この記録を削除しますか？（この操作は元に戻せません。売上集計や請求書生成に影響する場合があります）")) return;
    setData(d => ({ ...d, dailyRecords: (Array.isArray(d?.dailyRecords) ? d.dailyRecords : []).filter(r => r?.id !== id) }));
  };

  const saveJobType = () => {
    if (!jobTypeForm.name) return;
    if (editingJobType) {
      const before = jobTypes.find((j) => j?.id === editingJobType.id);
      logHistoryEntry(setData, { entityType: "job_type", entityId: editingJobType.id, entityLabel: before?.name, before, userRole });
    }
    setData(d => {
      const current = Array.isArray(d?.jobTypes) ? d.jobTypes : [];
      if (editingJobType) return { ...d, jobTypes: current.map(j => j?.id === editingJobType.id ? { ...j, ...jobTypeForm, unitPrice: Number(jobTypeForm.unitPrice)||0, driverUnitPrice: Number(jobTypeForm.driverUnitPrice)||0 } : j) };
      // 以前は `JT-${current.length+1}` という配列長ベースのID生成だったため、
      // 仕事種別は完全削除（論理削除ではない）されるため、IDの重複リスクが特に高かった。
      return { ...d, jobTypes: [...current, { ...jobTypeForm, id: generateUniqueBusinessId(current, "JT"), unitPrice: Number(jobTypeForm.unitPrice)||0, driverUnitPrice: Number(jobTypeForm.driverUnitPrice)||0 }] };
    });
    setShowJobTypeModal(false);
  };

  const deleteJobType = (id) => {
    // 削除する仕事種別が、ドライバーの担当ルート・実績データで使われていないか確認する。
    // 使用中のまま削除すると、関連データの参照先が消えて表示が崩れたり、
    // 集計から漏れたりするため、利用中は削除をブロックする。
    const usedInRoutes = drivers.some((d) => (d?.routes || []).some((r) => r?.jobTypeId === id));
    const usedInQuality = qualityRecords.some((r) => r?.jobTypeId === id);
    const usedInDaily = dailyRecords.some((r) => r?.jobTypeId === id);
    // 定期便のテンプレートも仕事種別を参照できるため、あわせて確認する。
    const usedInRecurring = (Array.isArray(data?.recurringAssignments) ? data.recurringAssignments : [])
      .some((r) => !r?.deleted && r?.jobTypeId === id);
    if (usedInRoutes || usedInQuality || usedInDaily || usedInRecurring) {
      window.alert(
        `この仕事種別はドライバーの担当ルート・実績データ${usedInRecurring ? "・定期便" : ""}で使用中のため削除できません。先に該当する担当ルート・実績${usedInRecurring ? "・定期便" : ""}を変更してから削除してください。`
      );
      return;
    }
    if (!window.confirm("この仕事種別を削除しますか？（この操作は元に戻せません）")) return;
    setData(d => ({ ...d, jobTypes: (Array.isArray(d?.jobTypes) ? d.jobTypes : []).filter(j => j?.id !== id) }));
  };

  const monthRecords = dailyRecords.filter(r => r?.date?.startsWith(selectedMonth));

  const qualitySummary = qualityRecords
    .filter(r => r.salesAmount && r.customerId && r.date?.startsWith(selectedMonth))
    .reduce((acc, r) => {
      const key = `${r.driverId}_${r.customerId}_${r.jobTypeId}_${r.date}`;
      if (!acc[key]) {
        acc[key] = {
          id: `QR-${key}`,
          date: r.date,
          driverId: r.driverId,
          customerId: r.customerId,
          jobTypeId: r.jobTypeId,
          salesAmount: 0,
          driverAmount: 0,
          source: "quality",
        };
      }
      acc[key].salesAmount += Number(r.salesAmount || 0);
      acc[key].driverAmount += Number(r.driverAmount || 0);
      return acc;
    }, {});

  const qualityDailyRows = Object.values(qualitySummary);

  const totalSales = [...monthRecords, ...qualityDailyRows].reduce((s, r) => s + Number(r.salesAmount || 0), 0);
  const totalDriver = [...monthRecords, ...qualityDailyRows].reduce((s, r) => s + Number(r.driverAmount || 0), 0);

  // 簡易P/L（月次損益サマリー）。
  // 「今月の売上 − ドライバー支払 − その他経費（支払予定のうち選択月が期日のもの） = 今月の儲け（見込み）」
  // という、経理ソフトを開かなくても感覚を掴める1画面サマリーを作る。
  // 入金状況に関わらず「実績ベース」の売上・支払を使うことで、まだ請求書になっていない実績も含めて把握できる。
  const plExpensesThisMonth = payables.filter(p => (p?.dueDate || "").slice(0, 7) === selectedMonth);
  const plExpensesTotal = plExpensesThisMonth.reduce((s, p) => s + (Number(p?.amount) || 0), 0);
  const plGrossProfit = totalSales - totalDriver; // 粗利（売上 − ドライバー支払）
  const plNetProfit = plGrossProfit - plExpensesTotal; // 粗利からその他経費を引いた、月の儲け（見込み）
  // 参考情報として、その月が支払期日の請求書のうち実際に入金済みの金額も出す
  // （実績ベースの売上とは別に、実際にお金が入ってきたかどうかの確認用）。
  const plActualReceivedThisMonth = invoicesForPL
    .filter(i => i?.status === "paid" && (i?.paidDate || "").slice(0, 7) === selectedMonth)
    .reduce((s, i) => s + (Number(i?.total) || 0), 0);

  const driverSummary = drivers.map(driver => {
    const recs = monthRecords.filter(r => r?.driverId === driver?.id);
    const qrecs = qualityDailyRows.filter(r => r?.driverId === driver?.id);
    const allDates = [...recs.map(r => r?.date), ...qrecs.map(r => r?.date)];
    return {
      driver,
      count: recs.length + qrecs.length,
      workDays: new Set(allDates.filter(Boolean)).size,
      salesTotal: recs.reduce((s, r) => s + (Number(r?.salesAmount)||0), 0) + qrecs.reduce((s, r) => s + (Number(r?.salesAmount)||0), 0),
      driverTotal: recs.reduce((s, r) => s + (Number(r?.driverAmount)||0), 0) + qrecs.reduce((s, r) => s + (Number(r?.driverAmount)||0), 0),
    };
  }).filter(s => s.count > 0);

  const customerSummary = customers.map(customer => {
    const recs = monthRecords.filter(r => r?.customerId === customer?.id);
    const qrecs = qualityDailyRows.filter(r => r?.customerId === customer?.id);
    const combined = [...recs, ...qrecs];
    const subtotal = combined.reduce((s, r) => s + (Number(r?.salesAmount)||0), 0);
    // 消費税は「税抜の合計にまとめて10%をかける」方式ではなく、実際に発行される
    // 請求書（受注完了時の自動生成、および月次集計からの生成）と同じ
    // 「1件（1実績）ごとに税込み計算してから合算する」方式に統一する。
    // これが食い違っていると、この画面で見た「請求予定額」と、実際に発行される
    // 請求書の金額が1円単位でズレてしまう。
    const total = combined.reduce((s, r) => {
      const jt = jobTypes.find(j=>j?.id===r?.jobTypeId);
      const amount = Number(r?.salesAmount) || 0;
      const tax = jt?.taxable !== false ? calcTax(amount) : 0;
      return s + amount + tax;
    }, 0);
    const tax = total - subtotal;
    return { customer, count: combined.length, subtotal, tax, total };
  }).filter(s => s.count > 0);

  const salesIcon = <Icon size={14}><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></Icon>;
  const plusIcon = <Icon size={14}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></Icon>;
  const editIcon = <Icon size={12}><path d="M12 20h9"/><path d="m16.5 3.5 4 4L7 21l-4 1 1-4Z"/></Icon>;
  const trashIcon = <Icon size={12}><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></Icon>;

  const tabs = [
    { id:"daily", label:"日次入力" },
    { id:"summary", label:"月次集計" },
    { id:"jobtypes", label:"仕事種別マスタ" },
  ];

  const jt = jobTypes.find(j => j?.id === recordForm.jobTypeId);
  const pattern = jt?.calcPattern || "count";

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
      <div style={{ display:"flex", gap:"4px", flexWrap:"wrap", borderBottom:"2px solid #e8e8e8", paddingBottom:"8px" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ border:"none", borderRadius:"4px 4px 0 0", padding:"8px 14px", fontSize:"12px", fontWeight:700, cursor:"pointer", background: activeTab===t.id ? "#00a09a" : "#f0f2f5", color: activeTab===t.id ? "#fff" : "#555" }}>{t.label}</button>
        ))}
      </div>

      {activeTab === "daily" && (
        <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
          <LoadOlderDataBanner type="dailyRecords" data={data} setData={setData} tenantId={tenantId} />
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div style={{ fontSize:"14px", fontWeight:700, color:"#222" }}>日次配送実績入力</div>
            <RetroBtn onClick={openAddRecord} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>{plusIcon}実績を追加</RetroBtn>
          </div>
          <div style={{ background:"#fff3e0", border:"1px solid #ffcc80", borderRadius:"6px", padding:"8px 10px", fontSize:"11px", color:"#e65100" }}>
            ⚠ 同じ配送を「実績・品質管理」の日次入力欄にも入力すると、売上が二重に集計されます。どちらか一方の画面で入力してください。
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
            <span style={{ fontSize:"12px", color:"#666" }}>表示月：</span>
            <input type="month" value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)} style={{ border:"1px solid #d0d0d0", borderRadius:"4px", padding:"6px 10px", fontSize:"13px" }}/>
          </div>
          <div style={{ border:cardBorder, borderRadius:"6px", background:"#fff", overflow:"auto" }}>
            <table style={{ minWidth:"100%", width:"max-content", borderCollapse:"collapse", fontSize:"12px", fontFamily:"'Noto Sans JP', sans-serif" }}>
              <thead>
                <tr style={{ background:"#fafbfc" }}>
                  {["日付","ドライバー","顧客","仕事種別","個数","距離","時間","売上金額","支払額","備考","操作"].map(h => (
                    <th key={h} style={{ padding:"8px 10px", textAlign:"left", fontWeight:700, color:"#666", fontSize:"11px", borderBottom:cardBorder, whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthRecords.length === 0 && qualityDailyRows.length === 0 && <tr><td colSpan={11} style={{ padding:"16px", textAlign:"center", color:"#999" }}>この月の記録はありません</td></tr>}
                {[...monthRecords].sort((a,b)=>b.date?.localeCompare(a.date||"")).map(rec => {
                  const driver = drivers.find(d=>d?.id===rec?.driverId);
                  const customer = customers.find(c=>c?.id===rec?.customerId);
                  const jt = jobTypes.find(j=>j?.id===rec?.jobTypeId);
                  return (
                    <tr key={rec.id} style={{ borderBottom:"1px solid #f0f0f0" }} onMouseEnter={e=>e.currentTarget.style.background="#f9fcfc"} onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
                      <td style={{ padding:"8px 10px" }}>{rec.date}</td>
                      <td style={{ padding:"8px 10px" }}>
                        {driver?.name
                          ? driver.name
                          : (rec?.driverId
                              ? <span style={{ color:"#e65100" }}>削除済みドライバー</span>
                              : "—")}
                      </td>
                      <td style={{ padding:"8px 10px" }}>{customer?.name||"—"}</td>
                      <td style={{ padding:"8px 10px" }}>{jt?.name||"—"}</td>
                      <td style={{ padding:"8px 10px" }}>{rec.count||"—"}</td>
                      <td style={{ padding:"8px 10px" }}>{rec.distance||"—"}</td>
                      <td style={{ padding:"8px 10px" }}>{rec.hours||"—"}</td>
                      <td style={{ padding:"8px 10px", color:"#007a74", fontWeight:700 }}>¥{(Number(rec.salesAmount)||0).toLocaleString()}</td>
                      <td style={{ padding:"8px 10px", color:"#e65100", fontWeight:700 }}>¥{(Number(rec.driverAmount)||0).toLocaleString()}</td>
                      <td style={{ padding:"8px 10px", color:"#888", fontSize:"11px" }}>{rec.note||"—"}</td>
                      <td style={{ padding:"8px 10px" }}>
                        <div style={{ display:"flex", gap:"4px" }}>
                          <RetroBtn small onClick={()=>openEditRecord(rec)} style={{ background:"#fff", color:"#00a09a", borderColor:"#00a09a" }}>{editIcon}</RetroBtn>
                          <RetroBtn small onClick={()=>deleteRecord(rec.id)} style={{ background:"#fff", color:"#e63946", borderColor:"#e63946" }}>{trashIcon}</RetroBtn>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {[...qualityDailyRows].sort((a,b)=>b.date?.localeCompare(a.date||"")).map(row => {
                  const driver = drivers.find(d => d?.id === row.driverId);
                  const customer = customers.find(c => c?.id === row.customerId);
                  const jobType = jobTypes.find(j => j?.id === row.jobTypeId);
                  return (
                    <tr key={row.id} style={{ borderBottom:"1px solid #f0f0f0", background:"#f0fffe" }} onMouseEnter={e=>{ e.currentTarget.style.background="#e0faf7"; }} onMouseLeave={e=>{ e.currentTarget.style.background="#f0fffe"; }}>
                      <td style={{ padding:"8px 10px" }}>{row.date}</td>
                      <td style={{ padding:"8px 10px" }}>
                        {driver?.name
                          ? driver.name
                          : (row.driverId
                              ? <span style={{ color:"#e65100" }}>削除済みドライバー</span>
                              : "—")}
                      </td>
                      <td style={{ padding:"8px 10px" }}>{customer?.name||row.customerId||"—"}</td>
                      <td style={{ padding:"8px 10px" }}>{jobType?.name||row.jobTypeId||"—"}</td>
                      <td style={{ padding:"8px 10px" }}>—</td>
                      <td style={{ padding:"8px 10px" }}>—</td>
                      <td style={{ padding:"8px 10px" }}>—</td>
                      <td style={{ padding:"8px 10px", color:"#007a74", fontWeight:700 }}>¥{Number(row.salesAmount).toLocaleString()}</td>
                      <td style={{ padding:"8px 10px", color:"#e65100", fontWeight:700 }}>¥{Number(row.driverAmount).toLocaleString()}</td>
                      <td style={{ padding:"8px 10px", color:"#888", fontSize:"11px" }}>実績・品質連携</td>
                      <td style={{ padding:"8px 10px" }} />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:"8px" }}>
            {[
              ["月間売上合計", "¥"+totalSales.toLocaleString(), "#00a09a"],
              ["月間支払合計", "¥"+totalDriver.toLocaleString(), "#e65100"],
              ["件数", (monthRecords.length + qualityDailyRows.length)+"件", "#2196f3"],
              ["稼働ドライバー", new Set([...monthRecords.map(r=>r?.driverId), ...qualityDailyRows.map(r=>r?.driverId)].filter(Boolean)).size+"名", "#7b1fa2"],
            ].map(([l,v,c])=>(
              <div key={l} style={{ background:"#fff", border:cardBorder, borderRadius:"6px", padding:"12px" }}>
                <div style={{ fontSize:"11px", color:"#888", fontWeight:700, marginBottom:"4px" }}>{l}</div>
                <div style={{ fontSize:"18px", fontWeight:700, color:c }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "summary" && (
        <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
            <span style={{ fontSize:"12px", color:"#666" }}>集計月：</span>
            <input type="month" value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)} style={{ border:"1px solid #d0d0d0", borderRadius:"4px", padding:"6px 10px", fontSize:"13px" }}/>
          </div>
          <Panel title={`簡易P/L（${selectedMonth} の損益サマリー）`} icon={salesIcon}>
            <div style={{ fontSize:"11px", color:"#888", marginBottom:"10px" }}>
              実績ベース（配送が発生した時点）の集計です。請求書の入金状況とは別の見込み値です。
            </div>
            <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit,minmax(160px,1fr))", gap:"10px" }}>
              <div style={{ background:"#fff", border:"1px solid #e8e8e8", borderRadius:"6px", padding:"10px 12px" }}>
                <div style={{ fontSize:"11px", color:"#888", marginBottom:"4px" }}>売上</div>
                <div style={{ fontSize:"18px", fontWeight:700, color:"#007a74" }}>¥{totalSales.toLocaleString()}</div>
              </div>
              <div style={{ background:"#fff", border:"1px solid #e8e8e8", borderRadius:"6px", padding:"10px 12px" }}>
                <div style={{ fontSize:"11px", color:"#888", marginBottom:"4px" }}>ドライバー支払</div>
                <div style={{ fontSize:"18px", fontWeight:700, color:"#e65100" }}>¥{totalDriver.toLocaleString()}</div>
              </div>
              <div style={{ background:"#fff", border:"1px solid #e8e8e8", borderRadius:"6px", padding:"10px 12px" }}>
                <div style={{ fontSize:"11px", color:"#888", marginBottom:"4px" }}>粗利（売上−支払）</div>
                <div style={{ fontSize:"18px", fontWeight:700, color: plGrossProfit>=0 ? "#2e7d32" : "#e63946" }}>¥{plGrossProfit.toLocaleString()}</div>
              </div>
              <div style={{ background:"#fff", border:"1px solid #e8e8e8", borderRadius:"6px", padding:"10px 12px" }}>
                <div style={{ fontSize:"11px", color:"#888", marginBottom:"4px" }}>その他経費（今月期日の支払予定）</div>
                <div style={{ fontSize:"18px", fontWeight:700, color:"#e65100" }}>¥{plExpensesTotal.toLocaleString()}</div>
              </div>
              <div style={{ background: plNetProfit>=0 ? "#e8f5e9" : "#ffebee", border:`1px solid ${plNetProfit>=0?"#4caf50":"#e63946"}`, borderRadius:"6px", padding:"10px 12px" }}>
                <div style={{ fontSize:"11px", color:"#888", marginBottom:"4px" }}>今月の儲け（見込み）</div>
                <div style={{ fontSize:"20px", fontWeight:700, color: plNetProfit>=0 ? "#2e7d32" : "#e63946" }}>{plNetProfit>=0?"+":""}¥{plNetProfit.toLocaleString()}</div>
              </div>
              <div style={{ background:"#fff", border:"1px solid #e8e8e8", borderRadius:"6px", padding:"10px 12px" }}>
                <div style={{ fontSize:"11px", color:"#888", marginBottom:"4px" }}>参考：今月実際に入金された額</div>
                <div style={{ fontSize:"18px", fontWeight:700, color:"#7b1fa2" }}>¥{plActualReceivedThisMonth.toLocaleString()}</div>
              </div>
            </div>
          </Panel>
          <Panel title="ドライバー別月次集計" icon={salesIcon}>
            <RetroTable
              headers={["ドライバー","件数","稼働日数","月間売上","月間支払額","粗利"]}
              rows={driverSummary.length === 0 ? [[<span style={{color:"#999"}}>データなし</span>,"","","","",""]] : driverSummary.map(s => [
                <span style={{ fontWeight:700, color:"#007a74" }}>{s.driver?.name||"—"}</span>,
                s.count+"件",
                s.workDays+"日",
                <span style={{ color:"#007a74", fontWeight:700 }}>¥{s.salesTotal.toLocaleString()}</span>,
                <span style={{ color:"#e65100", fontWeight:700 }}>¥{s.driverTotal.toLocaleString()}</span>,
                <span style={{ color:"#2e7d32", fontWeight:700 }}>¥{(s.salesTotal-s.driverTotal).toLocaleString()}</span>,
              ])}
            />
          </Panel>
          <Panel title="顧客別月次集計（請求予定）" icon={salesIcon}>
            <RetroTable
              headers={["顧客","件数","小計","消費税","合計請求額"]}
              rows={customerSummary.length === 0 ? [[<span style={{color:"#999"}}>データなし</span>,"","","",""]] : customerSummary.map(s => [
                <span style={{ fontWeight:700, color:"#007a74" }}>{s.customer?.name||"—"}</span>,
                s.count+"件",
                <span style={{ fontWeight:700 }}>¥{s.subtotal.toLocaleString()}</span>,
                <span>¥{s.tax.toLocaleString()}</span>,
                <span style={{ color:"#007a74", fontWeight:700 }}>¥{s.total.toLocaleString()}</span>,
              ])}
            />
          </Panel>
          <Panel title="月次請求書生成" icon={salesIcon}>
            <div style={{ fontSize:"12px", color:"#666", marginBottom:"10px" }}>
              月次集計データから顧客別の請求書を生成します。生成した請求書は「請求管理」ページに追加されます。
            </div>
            {customerSummary.length === 0 ? (
              <div style={{ fontSize:"12px", color:"#999", padding:"12px", textAlign:"center" }}>この月の配送実績がありません</div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:"6px" }}>
                {customerSummary.map(s => {
                  // 月次集計請求書同士の重複チェック（salesMgmtMonthタグによる判定）に加えて、
                  // 受注完了時に自動生成された個別請求書との重複も防ぐ必要がある。
                  // 単純に「1件でも既存請求書があれば生成済」とすると、複数の受注のうち
                  // 一部だけが請求書化されている状態（例: 片方を削除した後）で、
                  // まだ請求書になっていない残りの実績が永久に請求できなくなってしまう。
                  // そのため、実績を1件ずつ確認し「まだ請求書になっていない受注の実績」だけを
                  // 抽出して、その分だけを対象に小計・税額・合計を再計算する。
                  const allInvoicesForDup = Array.isArray(data?.invoices) ? data.invoices : [];
                  const alreadyBilledOrderIds = new Set(
                    allInvoicesForDup
                      .filter(inv => {
                        const p = inv?.payload ? (typeof inv.payload === "string" ? JSON.parse(inv.payload) : inv.payload) : inv;
                        return !(p?.deleted || inv?.deleted);
                      })
                      .map(inv => {
                        const p = inv?.payload ? (typeof inv.payload === "string" ? JSON.parse(inv.payload) : inv.payload) : inv;
                        return p?.orderId ?? inv?.orderId;
                      })
                      .filter(Boolean)
                  );
                  const recsForThisCustomer = [...monthRecords, ...qualityDailyRows].filter(r => r?.customerId === s.customer?.id);
                  // orderId を持たない実績（手動入力など）は請求書との対応関係が分からないため、
                  // 安全側として常に「未請求」として扱う（除外しない）。
                  const unbilledRecs = recsForThisCustomer.filter(r => !r?.orderId || !alreadyBilledOrderIds.has(r.orderId));
                  const unbilledSubtotal = unbilledRecs.reduce((sum, r) => sum + (Number(r?.salesAmount) || 0), 0);
                  // 消費税は「税抜の合計にまとめて10%をかける」方式ではなく、
                  // 受注完了時に自動生成される個別請求書と同じ「1件（1実績）ごとに
                  // 税込み計算してから合算する」方式に統一する。
                  // 以前はこの2つの計算方式が異なっていたため、同じ月・同じ顧客の
                  // データにもかかわらず、請求書がどちらの経路で発行されたかによって
                  // 合計金額が1円単位でズレてしまう会計上の不整合があった。
                  const unbilledTotal = unbilledRecs.reduce((sum, r) => {
                    const jt = jobTypes.find(j => j?.id === r?.jobTypeId);
                    const amount = Number(r?.salesAmount) || 0;
                    const tax = jt?.taxable !== false ? calcTax(amount) : 0;
                    return sum + amount + tax;
                  }, 0);
                  const unbilledTax = unbilledTotal - unbilledSubtotal;
                  const alreadyExistsBySalesMgmtTag = allInvoicesForDup.some(inv => {
                    const p = inv?.payload ? (typeof inv.payload === "string" ? JSON.parse(inv.payload) : inv.payload) : inv;
                    return p?.salesMgmtMonth === selectedMonth
                      && p?.salesMgmtMonth != null
                      && (p?.customerId === s.customer?.id || inv?.customerId === s.customer?.id);
                  });
                  // 「未請求の実績が1件も残っていない」かつ「月次タグの請求書も無い」場合のみ、本当の生成済とする。
                  const alreadyExists = alreadyExistsBySalesMgmtTag || (recsForThisCustomer.length > 0 && unbilledRecs.length === 0);
                  return (
                    <div key={s.customer?.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 12px", border:"1px solid #e8e8e8", borderRadius:"6px", background:"#fff" }}>
                      <div>
                        <div style={{ fontSize:"12px", fontWeight:700, color:"#333" }}>{s.customer?.name}</div>
                        <div style={{ fontSize:"11px", color:"#888", marginTop:"2px" }}>
                          {unbilledRecs.length}件 / 小計¥{unbilledSubtotal.toLocaleString()} / 税¥{unbilledTax.toLocaleString()} / 合計¥{unbilledTotal.toLocaleString()}
                          {unbilledRecs.length < recsForThisCustomer.length && (
                            <span style={{ color:"#999" }}> （全{recsForThisCustomer.length}件中、請求済み{recsForThisCustomer.length - unbilledRecs.length}件は除外）</span>
                          )}
                        </div>
                      </div>
                      {alreadyExists ? (
                        <span style={{ fontSize:"11px", color:"#2e7d32", fontWeight:700, background:"#e8f5e9", border:"1px solid #4caf50", borderRadius:"999px", padding:"2px 10px" }}>生成済</span>
                      ) : (
                        <RetroBtn small onClick={() => {
                          // 既に請求書化されている受注の実績を含めないよう、
                          // unbilledRecs（まだ請求書になっていない実績）だけを対象にする。
                          const recs = unbilledRecs;
                          const lineItems = recs.map(r => {
                            const jt = jobTypes.find(j => j?.id === r?.jobTypeId);
                            const driver = drivers.find(d => d?.id === r?.driverId);
                            return {
                              id: `LI-${Date.now()}-${Math.random()}`,
                              name: `${r.date} ${driver?.name||""} ${jt?.name||""} ${r.count ? r.count+"個" : r.distance ? r.distance+"km" : r.hours ? r.hours+"h" : ""}`,
                              qty: 1,
                              unitPrice: Number(r.salesAmount)||0,
                              subtotal: Number(r.salesAmount)||0,
                            };
                          });
                          const customer = s.customer;
                          // selectedMonth（"2026-06"形式）の月末日を計算する。
                          // 以前は new Date(selectedMonth+"-01") を経由した複雑な三項演算子を
                          // 使っていたが、実質的に常に同じ結果になる分かりにくい書き方だったため、
                          // 年・月を直接パースしてシンプルに月末日を求める方式に変更した。
                          const [selYear, selMonthNum] = selectedMonth.split("-").map(Number);
                          const lastDayOfSelectedMonth = new Date(selYear, selMonthNum, 0).getDate();
                          const issueDate = `${selectedMonth}-${String(lastDayOfSelectedMonth).padStart(2,"0")}`;
                          const dueDate = calcDueDateByTerms(issueDate, customer?.closingDay ?? 31, customer?.paymentSite || "翌月末払い");
                          const currentInvoices = Array.isArray(data?.invoices) ? data.invoices : [];
                          const newInv = {
                            id: generateUniqueBusinessId(currentInvoices, "INV"),
                            customerId: customer?.id,
                            customerName: customer?.name || "",
                            issueDate,
                            dueDate,
                            // 未請求分だけの小計・税額・合計を使う（全実績ではない）。
                            amount: unbilledSubtotal,
                            tax: unbilledTax,
                            total: unbilledTotal,
                            status: "unpaid",
                            bankRef: "",
                            paidDate: null,
                            note: `${selectedMonth} 月次請求`,
                            lineItems,
                            sentAt: null,
                            sentTo: "",
                            salesMgmtMonth: selectedMonth,
                            _dbId: crypto.randomUUID(),
                          };
                          setData(d => {
                            const customerName = customer?.name || "";
                            const customerId = customer?.id || "";
                            const baseEv = Array.isArray(d?.events) ? d.events : [];
                            const alreadyHasEvent = baseEv.some((ev) =>
                              ev?.type === "payment_due" &&
                              ev?.date === dueDate &&
                              (ev?.title?.includes(customerName) || ev?.customerId === customerId)
                            );
                            return {
                              ...d,
                              invoices: [...(Array.isArray(d?.invoices) ? d.invoices : []), newInv],
                              events: alreadyHasEvent ? baseEv : [...baseEv, {
                                id: `EV-INV${Date.now()}`,
                                date: dueDate,
                                type: "payment_due",
                                title: `入金期日：${customer?.name||""}`,
                                color: "#660099",
                                customerId,
                              }],
                            };
                          });
                          window.alert(`${customer?.name} の請求書を生成しました！\n請求管理ページで確認できます。`);
                        }} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>
                          請求書を生成
                        </RetroBtn>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>
      )}

      {activeTab === "jobtypes" && (
        <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div style={{ fontSize:"14px", fontWeight:700, color:"#222" }}>仕事種別マスタ</div>
            <RetroBtn onClick={()=>{ setEditingJobType(null); setJobTypeForm({ name:"", calcPattern:"count", taxable:true, unitPrice:"", driverUnitPrice:"", note:"" }); setShowJobTypeModal(true); }} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>{plusIcon}種別を追加</RetroBtn>
          </div>
          <RetroTable
            headers={["ID","種別名","計算パターン","売上単価","支払単価","課税","メモ","操作"]}
            rows={jobTypes.map(jt => [
              <span style={{ color:"#007a74", fontWeight:700 }}>{jt?.id}</span>,
              <span style={{ fontWeight:700 }}>{jt?.name}</span>,
              calcPatternLabel[jt?.calcPattern]||jt?.calcPattern,
              <span style={{ color:"#007a74" }}>¥{(Number(jt?.unitPrice)||0).toLocaleString()}</span>,
              <span style={{ color:"#e65100" }}>¥{(Number(jt?.driverUnitPrice)||0).toLocaleString()}</span>,
              jt?.taxable ? <span style={{ color:"#2e7d32", fontWeight:700 }}>課税</span> : <span style={{ color:"#888" }}>非課税</span>,
              <span style={{ fontSize:"11px", color:"#888" }}>{jt?.note||"—"}</span>,
              <div style={{ display:"flex", gap:"4px" }}>
                <RetroBtn small onClick={()=>{ setEditingJobType(jt); setJobTypeForm({ ...jt, unitPrice: String(jt?.unitPrice||""), driverUnitPrice: String(jt?.driverUnitPrice||"") }); setShowJobTypeModal(true); }} style={{ background:"#fff", color:"#00a09a", borderColor:"#00a09a" }}>編集</RetroBtn>
                <RetroBtn small onClick={()=>deleteJobType(jt?.id)} style={{ background:"#fff", color:"#e63946", borderColor:"#e63946" }}>削除</RetroBtn>
              </div>
            ])}
          />
        </div>
      )}

      {showRecordModal && (
        <Modal title={editingRecord ? "実績編集" : "実績追加"} icon={salesIcon} onClose={()=>setShowRecordModal(false)} width={560}>
          <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"6px 12px" }}>
            <Fl label="日付"><RetroInput type="date" value={recordForm.date} onChange={e=>updateRecordCalc({...recordForm,date:e.target.value})}/></Fl>
            <Fl label="ドライバー">
              <RetroSelect value={recordForm.driverId} onChange={e=>updateRecordCalc({...recordForm,driverId:e.target.value})}>
                <option value="">選択</option>
                {drivers.map(d=>{
                  const isContractEnded = d?.contractEnd && d.contractEnd < getTodayLocalStr();
                  return <option key={d?.id} value={d?.id}>{isContractEnded ? "⚠契約終了済み " : ""}{d?.name}</option>;
                })}
              </RetroSelect>
            </Fl>
            {driverRoutes.length > 0 && (
              <div style={{ gridColumn:"1/-1" }}>
                <Fl label="登録済みルートから選択（自動入力）">
                  <RetroSelect onChange={e=>{
                    if (!e.target.value) return;
                    const route = driverRoutes[Number(e.target.value)];
                    if (!route) return;
                    const jt = jobTypes.find(j=>j?.id===route?.jobTypeId);
                    // route.unitPrice が明示的に設定されている場合（0円も含む）はそれを優先する。
                    // 以前は `route.unitPrice||jt?.unitPrice||""` だったため、
                    // 0円ルートを選んでも jobType側の単価に上書きされてしまうバグがあった。
                    const routeUnitPrice = route.unitPrice !== "" && route.unitPrice != null ? route.unitPrice : (jt?.unitPrice ?? "");
                    const routeDriverUnitPrice = route.driverUnitPrice !== "" && route.driverUnitPrice != null ? route.driverUnitPrice : (jt?.driverUnitPrice ?? "");
                    updateRecordCalc({
                      ...recordForm,
                      customerId: route.customerId||"",
                      jobTypeId: route.jobTypeId||"",
                      unitPrice: String(routeUnitPrice),
                      driverUnitPrice: String(routeDriverUnitPrice),
                    });
                    e.target.value = "";
                  }}>
                    <option value="">— ルートを選んで自動入力 —</option>
                    {driverRoutes.map((route, idx) => {
                      const customer = customers.find(c=>c?.id===route?.customerId);
                      const jt = jobTypes.find(j=>j?.id===route?.jobTypeId);
                      return <option key={idx} value={idx}>{customer?.name||"顧客未設定"} / {jt?.name||"種別未設定"} / ¥{Number(route?.unitPrice||0).toLocaleString()}</option>;
                    })}
                  </RetroSelect>
                </Fl>
              </div>
            )}
            <Fl label="顧客">
              <RetroSelect value={recordForm.customerId} onChange={e=>updateRecordCalc({...recordForm,customerId:e.target.value})}>
                <option value="">選択</option>
                {customers.map(c=><option key={c?.id} value={c?.id}>{c?.name}</option>)}
              </RetroSelect>
            </Fl>
            <Fl label="仕事種別">
              <RetroSelect value={recordForm.jobTypeId} onChange={e=>{ const jt=jobTypes.find(j=>j?.id===e.target.value); updateRecordCalc({...recordForm,jobTypeId:e.target.value,unitPrice:String(jt?.unitPrice||""),driverUnitPrice:String(jt?.driverUnitPrice||"")}); }}>
                <option value="">選択</option>
                {jobTypes.map(j=><option key={j?.id} value={j?.id}>{j?.name}</option>)}
              </RetroSelect>
            </Fl>
          </div>
          {jt && <div style={{ background:"#e8f5f4", border:"1px solid #00a09a", borderRadius:"6px", padding:"8px 10px", fontSize:"12px", color:"#007a74", marginBottom:"8px" }}>計算パターン：{calcPatternLabel[pattern]} / 売上単価：¥{Number(recordForm.unitPrice||jt?.unitPrice).toLocaleString()} / 支払単価：¥{Number(recordForm.driverUnitPrice||jt?.driverUnitPrice).toLocaleString()}</div>}
          <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap:"6px 12px" }}>
            {/* 固定制（fixed）は計算上「個数」を一切使わず常に単価そのものが売上・支払額になる。
                以前は固定制でも個数欄が表示され、入力しても計算に反映されないため
                ユーザーを誤解させる可能性があった（例：チャーター2件分のつもりで
                「2」と入れても、実際には1件分の金額のまま変わらない）。
                固定制のときは個数欄自体を表示しないようにする。 */}
            {(pattern==="count"||!pattern) && <Fl label="個数"><RetroInput type="number" min="0" value={recordForm.count} onChange={e=>updateRecordCalc({...recordForm,count:e.target.value})}/></Fl>}
            {pattern==="fixed" && <Fl label="件数（メモ用・金額には影響しません）"><RetroInput type="number" min="0" value={recordForm.count} onChange={e=>updateRecordCalc({...recordForm,count:e.target.value})}/></Fl>}
            {pattern==="distance" && <Fl label="距離(km)"><RetroInput type="number" min="0" value={recordForm.distance} onChange={e=>updateRecordCalc({...recordForm,distance:e.target.value})}/></Fl>}
            {pattern==="time" && <Fl label="稼働時間(h)"><RetroInput type="number" min="0" value={recordForm.hours} onChange={e=>updateRecordCalc({...recordForm,hours:e.target.value})}/></Fl>}
            <Fl label="売上単価"><RetroInput type="number" min="0" value={recordForm.unitPrice} onChange={e=>updateRecordCalc({...recordForm,unitPrice:e.target.value})}/></Fl>
            <Fl label="支払単価"><RetroInput type="number" min="0" value={recordForm.driverUnitPrice} onChange={e=>updateRecordCalc({...recordForm,driverUnitPrice:e.target.value})}/></Fl>
          </div>

          {/* ===== 第1弾で追加：チャーター・実費・手当（仕様書②配送実績管理）===== */}
          <div style={{ fontSize:"12px", fontWeight:700, color:"#007a74", margin:"10px 0 6px", paddingBottom:"4px", borderBottom:"1px solid #e8e8e8" }}>
            チャーター（別建て）
          </div>
          <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"6px 12px" }}>
            <Fl label="チャーター売上（顧客への請求）"><RetroInput type="number" min="0" value={recordForm.charterSales} onChange={e=>updateRecordCalc({...recordForm,charterSales:e.target.value})} placeholder="0"/></Fl>
            <Fl label="チャーター支払（ドライバーへ）"><RetroInput type="number" min="0" value={recordForm.charterDriver} onChange={e=>updateRecordCalc({...recordForm,charterDriver:e.target.value})} placeholder="0"/></Fl>
          </div>

          <div style={{ fontSize:"12px", fontWeight:700, color:"#e65100", margin:"10px 0 6px", paddingBottom:"4px", borderBottom:"1px solid #e8e8e8" }}>
            実費・手当（ドライバーへの支払に加算されます）
          </div>
          <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"6px 12px" }}>
            <Fl label="高速代（立替）"><RetroInput type="number" min="0" value={recordForm.highwayFee} onChange={e=>updateRecordCalc({...recordForm,highwayFee:e.target.value})} placeholder="0"/></Fl>
            <Fl label="駐車場代（立替）"><RetroInput type="number" min="0" value={recordForm.parkingFee} onChange={e=>updateRecordCalc({...recordForm,parkingFee:e.target.value})} placeholder="0"/></Fl>
            <Fl label="燃料補助"><RetroInput type="number" min="0" value={recordForm.fuelAllowance} onChange={e=>updateRecordCalc({...recordForm,fuelAllowance:e.target.value})} placeholder="0"/></Fl>
            <Fl label="その他支給"><RetroInput type="number" min="0" value={recordForm.otherAllowance} onChange={e=>updateRecordCalc({...recordForm,otherAllowance:e.target.value})} placeholder="0"/></Fl>
          </div>
          {Number(recordForm.otherAllowance) > 0 && (
            <Fl label="その他支給の内容"><RetroInput value={recordForm.otherAllowanceNote||""} onChange={e=>setRecordForm(v=>({...v,otherAllowanceNote:e.target.value}))} placeholder="例：待機手当"/></Fl>
          )}

          {/* 金額の内訳を明示する。合計だけだと「なぜこの金額になったのか」が
              現場で分からず、入力ミスの発見が遅れるため。 */}
          {(() => {
            const n = (v) => Number(v) || 0;
            const yen = (v) => `¥${n(v).toLocaleString()}`;
            const basePattern = pattern || "count";
            const upVal = recordForm.unitPrice !== "" && recordForm.unitPrice != null ? n(recordForm.unitPrice) : n(jt?.unitPrice);
            const dupVal = recordForm.driverUnitPrice !== "" && recordForm.driverUnitPrice != null ? n(recordForm.driverUnitPrice) : n(jt?.driverUnitPrice);
            const qty = basePattern === "count" ? n(recordForm.count)
              : basePattern === "distance" ? n(recordForm.distance)
              : basePattern === "time" ? n(recordForm.hours) : 1;
            const baseSales = basePattern === "fixed" ? upVal : Math.round(qty * upVal);
            const baseDriver = basePattern === "fixed" ? dupVal : Math.round(qty * dupVal);
            const allowance = n(recordForm.highwayFee) + n(recordForm.parkingFee) + n(recordForm.fuelAllowance) + n(recordForm.otherAllowance);
            const line = (label, val, color) => (
              <div style={{ display:"flex", justifyContent:"space-between", padding:"2px 0", color: color || "#666" }}>
                <span>{label}</span><span>{yen(val)}</span>
              </div>
            );
            return (
              <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"12px", background:"#f9fcfc", border:"1px solid #e8e8e8", borderRadius:"6px", padding:"10px", margin:"10px 0 8px", fontSize:"12px" }}>
                <div>
                  <div style={{ fontWeight:700, color:"#007a74", marginBottom:"4px" }}>売上（会社の取り分）</div>
                  {line("基本料金", baseSales)}
                  {n(recordForm.charterSales) > 0 && line("チャーター", recordForm.charterSales)}
                  <div style={{ display:"flex", justifyContent:"space-between", borderTop:"1px solid #d8e8e6", marginTop:"4px", paddingTop:"4px", fontSize:"17px", fontWeight:700, color:"#007a74" }}>
                    <span>合計</span><span>{yen(recordForm.salesAmount)}</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontWeight:700, color:"#e65100", marginBottom:"4px" }}>ドライバーへの支払</div>
                  {line("基本報酬", baseDriver)}
                  {n(recordForm.charterDriver) > 0 && line("チャーター", recordForm.charterDriver)}
                  {allowance > 0 && line("実費・手当", allowance)}
                  <div style={{ display:"flex", justifyContent:"space-between", borderTop:"1px solid #f0d8c0", marginTop:"4px", paddingTop:"4px", fontSize:"17px", fontWeight:700, color:"#e65100" }}>
                    <span>合計</span><span>{yen(recordForm.driverAmount)}</span>
                  </div>
                </div>
              </div>
            );
          })()}
          <Fl label="備考"><RetroInput value={recordForm.note} onChange={e=>setRecordForm(v=>({...v,note:e.target.value}))}/></Fl>
          <div style={{ display:"flex", justifyContent:"flex-end", gap:"6px", marginTop:"10px" }}>
            <RetroBtn onClick={()=>setShowRecordModal(false)}>キャンセル</RetroBtn>
            <RetroBtn onClick={saveRecord} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>保存する</RetroBtn>
          </div>
        </Modal>
      )}

      {showJobTypeModal && (
        <Modal title={editingJobType ? "仕事種別編集" : "仕事種別追加"} icon={salesIcon} onClose={()=>{ setShowJobTypeModal(false); setShowJobTypeHistory(false); }} width={480}>
          <Fl label="種別名"><RetroInput value={jobTypeForm.name} onChange={e=>setJobTypeForm(v=>({...v,name:e.target.value}))} placeholder="例：ルート、チビ宅"/></Fl>
          <Fl label="計算パターン">
            <RetroSelect value={jobTypeForm.calcPattern} onChange={e=>setJobTypeForm(v=>({...v,calcPattern:e.target.value}))}>
              <option value="count">個数×単価</option>
              <option value="fixed">固定料金</option>
              <option value="distance">距離制（km×単価）</option>
              <option value="time">時間制（時間×単価）</option>
            </RetroSelect>
          </Fl>
          <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"6px 12px" }}>
            <Fl label="売上単価（円）"><RetroInput type="number" min="0" value={jobTypeForm.unitPrice} onChange={e=>setJobTypeForm(v=>({...v,unitPrice:e.target.value}))} placeholder="例：180"/></Fl>
            <Fl label="ドライバー支払単価（円）"><RetroInput type="number" min="0" value={jobTypeForm.driverUnitPrice} onChange={e=>setJobTypeForm(v=>({...v,driverUnitPrice:e.target.value}))} placeholder="例：150"/></Fl>
          </div>
          <Fl label="課税区分">
            <label style={{ display:"inline-flex", alignItems:"center", gap:"6px", fontSize:"12px", cursor:"pointer" }}>
              <input type="checkbox" checked={!!jobTypeForm.taxable} onChange={e=>setJobTypeForm(v=>({...v,taxable:e.target.checked}))}/>
              課税（消費税10%）
            </label>
          </Fl>
          <Fl label="メモ"><RetroInput value={jobTypeForm.note} onChange={e=>setJobTypeForm(v=>({...v,note:e.target.value}))}/></Fl>
          {editingJobType && (
            <div style={{ marginTop:"4px" }}>
              <button onClick={()=>setShowJobTypeHistory(v=>!v)} style={{
                border:"none", background:"none", color:"#00a09a", fontSize:"12px", fontWeight:700, cursor:"pointer", padding:"4px 0",
              }}>
                {showJobTypeHistory ? "▲ 変更履歴を閉じる" : "▼ 変更履歴を見る"}
              </button>
              {showJobTypeHistory && (
                <HistoryPanel
                  data={data}
                  entityType="job_type"
                  entityId={editingJobType.id}
                  labelMap={{
                    name:"種別名", calcPattern:"計算パターン", unitPrice:"売上単価",
                    driverUnitPrice:"ドライバー支払単価", taxable:"課税区分", note:"メモ",
                  }}
                />
              )}
            </div>
          )}
          <div style={{ display:"flex", justifyContent:"flex-end", gap:"6px", marginTop:"10px" }}>
            <RetroBtn onClick={()=>{ setShowJobTypeModal(false); setShowJobTypeHistory(false); }}>キャンセル</RetroBtn>
            <RetroBtn onClick={saveJobType} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>保存する</RetroBtn>
          </div>
        </Modal>
      )}
    </div>
  );
};

const InvoicesPage = ({ data, setData, tenantId, userRole, isMobile }) => {
  const orders = (Array.isArray(data?.orders) ? data.orders : []).filter(o => !o?.deleted);
  const drivers = (Array.isArray(data?.drivers) ? data.drivers : []).filter(d => !d?.deleted);
  const allInvoices = (Array.isArray(data?.invoices) ? data.invoices : []).filter(i => !i?.deleted);
  // 【重要】顧客への請求書（お金が入ってくる）と、ドライバーからの請求書
  // （お金が出ていく）は、お金の流れが逆で経理上まったく別物のため、
  // 同じ一覧に混在させない。type: "driver_invoice" が無いものは
  // 従来通り顧客請求書として扱う（既存データを壊さないため）。
  const [invoiceTab, setInvoiceTab] = useState("customer"); // "customer" | "driver"
  const invoices = allInvoices.filter((inv) => inv?.type !== "driver_invoice");
  const driverInvoicesAll = allInvoices.filter((inv) => inv?.type === "driver_invoice");
  const events = Array.isArray(data?.events) ? data.events : [];
  const customers = Array.isArray(data?.customers) ? data.customers : [];
  const companyInfo = data?.companyInfo || {};
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);
  const [showInvoiceHistory, setShowInvoiceHistory] = useState(false);
  const [selectedDriverInvoiceId, setSelectedDriverInvoiceId] = useState(null);
  const [batchMonth, setBatchMonth] = useState(() => getTodayLocalStr().slice(0, 7));
  const [batchResultMsg, setBatchResultMsg] = useState("");
  // 取引先ごとの請求履歴を一覧で見られるようにする。
  const [showCustomerHistory, setShowCustomerHistory] = useState(false);
  const [historyCustomerId, setHistoryCustomerId] = useState("");
  const [customerHistoryMonths, setCustomerHistoryMonths] = useState(12);
  const [isGeneratingBatch, setIsGeneratingBatch] = useState(false);

  /**
   * ===== 顧客請求書の一括発行 =====
   *
   * 【背景】以前は受注を「配送完了」にするたびに、1件ずつ個別の請求書を
   * 自動発行していた。しかし法人契約では、案件が終わるたびに毎回請求書を
   * 送るケースは少なく、顧客ごとに決めた締め日・支払いサイトに合わせて、
   * その期間の実績をまとめて1通の請求書にするのが基本的な運用となる。
   *
   * 【やること】対象月に配送完了した受注を顧客ごとに集計し、
   * まだどの請求書にも含まれていない（二重請求にならない）ものだけを
   * まとめて1顧客につき1通の請求書にする。
   */
  const generateCustomerInvoicesForMonth = (targetMonth) => {
    const targetOrders = orders.filter((o) =>
      o?.status === "delivered" &&
      (o?.deliveryDate || "").slice(0, 7) === targetMonth &&
      !o?.invoicedInvoiceId // 既に何らかの請求書（個別・一括問わず）に含まれていないもの
    );
    if (targetOrders.length === 0) return 0;

    const byCustomer = new Map();
    targetOrders.forEach((o) => {
      const key = o?.customerId || "unknown";
      if (!byCustomer.has(key)) byCustomer.set(key, []);
      byCustomer.get(key).push(o);
    });

    const newInvoices = [];
    const newEvents = [];
    const orderIdToInvoiceId = new Map();

    byCustomer.forEach((customerOrders, customerId) => {
      const customer = customers.find((c) => c?.id === customerId);
      const baseAmount = customerOrders.reduce((s, o) => s + (Number(o?.amount) || 0), 0);
      if (baseAmount <= 0) return;
      const tax = calcTax(baseAmount);
      // 締め日を「対象月の締め日」として発行日にする（締め日が31等で
      // その月に存在しない日付になる場合は、月末に自動的に丸められる）。
      const [y, m] = targetMonth.split("-").map(Number);
      const closingDay = customer?.closingDay ?? 31;
      const lastDay = new Date(y, m, 0).getDate();
      const issueDay = closingDay === 31 ? lastDay : Math.min(closingDay, lastDay);
      const issueDate = formatDate(new Date(y, m - 1, issueDay));
      const dueDate = calcDueDateByTerms(issueDate, customer?.closingDay ?? 31, customer?.paymentSite || "翌月末払い");

      const invoiceId = generateUniqueBusinessId([...invoices, ...newInvoices], "INV");
      const customerName = customerOrders[0]?.customerName || customer?.name || "";
      newInvoices.push({
        id: invoiceId,
        customerId,
        customerName,
        issueDate,
        dueDate,
        amount: baseAmount,
        tax,
        total: baseAmount + tax,
        status: "unpaid",
        bankRef: "",
        paidDate: null,
        note: `${targetMonth}分 配送実績（${customerOrders.length}件）をまとめて発行`,
        lineItems: customerOrders.map((o) => ({
          id: `LI-${o?.id}`,
          name: `${o?.deliveryDate || ""} ${o?.cargo || "配送"}（${o?.id}）`,
          qty: 1,
          unitPrice: Number(o?.amount) || 0,
          subtotal: Number(o?.amount) || 0,
        })),
      });
      customerOrders.forEach((o) => orderIdToInvoiceId.set(o.id, invoiceId));

      const alreadyHasEvent = events.some((ev) =>
        ev?.type === "payment_due" && ev?.date === dueDate && ev?.customerId === customerId
      );
      if (!alreadyHasEvent) {
        newEvents.push({
          id: `EV-INV${Date.now()}-${customerId}`,
          date: dueDate,
          type: "payment_due",
          title: `入金期日：${customerName}`,
          color: "#660099",
          invoiceId,
          customerId,
        });
      }
    });

    if (newInvoices.length === 0) return 0;

    setData((d) => ({
      ...d,
      invoices: [...newInvoices, ...(Array.isArray(d?.invoices) ? d.invoices : [])],
      events: [...(Array.isArray(d?.events) ? d.events : []), ...newEvents],
      orders: (Array.isArray(d?.orders) ? d.orders : []).map((o) =>
        orderIdToInvoiceId.has(o?.id) ? { ...o, invoicedInvoiceId: orderIdToInvoiceId.get(o.id) } : o
      ),
    }));
    return newInvoices.length;
  };

  /**
   * ===== 取引先ごとの請求履歴 =====
   * 請求書一覧を1件ずつ探さなくても、月ごと・取引先ごとの請求合計・入金状況を
   * 一覧で確認できるようにする。ドライバー報酬の履歴一覧と同じ考え方。
   */
  const customerMonthlyHistory = useMemo(() => {
    const byMonthCustomer = new Map();
    invoices.forEach((inv) => {
      const invMonth = String(inv?.issueDate || "").slice(0, 7);
      const key = `${invMonth}|${inv?.customerId}`;
      if (!byMonthCustomer.has(key)) byMonthCustomer.set(key, []);
      byMonthCustomer.get(key).push(inv);
    });

    const baseMonth = getTodayLocalStr().slice(0, 7);
    const [baseY, baseM] = baseMonth.split("-").map(Number);
    const months = [];
    for (let i = 0; i < customerHistoryMonths; i++) {
      const d = new Date(baseY, baseM - 1 - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }

    const targetCustomers = historyCustomerId ? customers.filter((c) => c?.id === historyCustomerId) : customers;

    return months.map((m) => {
      let billedTotal = 0, unpaidTotal = 0, invoiceCount = 0;
      targetCustomers.forEach((c) => {
        const monthInvoices = byMonthCustomer.get(`${m}|${c?.id}`) || [];
        invoiceCount += monthInvoices.length;
        monthInvoices.forEach((inv) => {
          billedTotal += Number(inv?.total) || 0;
          if (inv?.status !== "paid") unpaidTotal += Number(inv?.total) || 0;
        });
      });
      return { month: m, invoiceCount, billedTotal, unpaidTotal };
    });
  }, [invoices, customers, historyCustomerId, customerHistoryMonths]);

  // 請求書数が増えると目的の請求書を探すのが難しくなるため、
  // 他のページと同じ仕組みで検索機能を追加する（以前は検索手段が一切なかった）。
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const filteredInvoices = invoices.filter((inv) => {
    const id = inv?.id || "";
    const customerName = inv?.customerName || "";
    const note = inv?.note || "";
    return id.includes(invoiceSearch) || customerName.includes(invoiceSearch) || note.includes(invoiceSearch);
  });
  const filteredDriverInvoices = driverInvoicesAll.filter((inv) => {
    const id = inv?.id || "";
    const driverName = inv?.driverName || "";
    return id.includes(invoiceSearch) || driverName.includes(invoiceSearch);
  }).sort((a, b) => String(b.payoutMonth || "").localeCompare(String(a.payoutMonth || "")));
  const selectedDriverInvoice = driverInvoicesAll.find((inv) => inv?.id === selectedDriverInvoiceId) || null;
  const [invoiceDraft, setInvoiceDraft] = useState(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showMailModal, setShowMailModal] = useState(false);
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [showCompanyHistory, setShowCompanyHistory] = useState(false);
  const [companyDraft, setCompanyDraft] = useState({
    id: companyInfo?.id || "COMPANY-001",
    name: companyInfo?.name || "",
    address: companyInfo?.address || "",
    phone: companyInfo?.phone || "",
    email: companyInfo?.email || "",
    bankInfo: companyInfo?.bankInfo || "",
    stampImage: companyInfo?.stampImage || "",
    // 免許更新・車検・任意保険の期限が近づいたとき、何日前から
    // ダッシュボードに警告を出すかをユーザーが設定できるようにする。
    // 以前は「期限が過ぎてから」しか分からず、事前に気づく手段がなかった。
    expiryAlertDays: companyInfo?.expiryAlertDays ?? 30,
  });
  const [mailDraft, setMailDraft] = useState({ to: "", subject: "", body: "" });

  const selectedInvoice = invoices.find((inv) => inv?.id === selectedInvoiceId) || null;
  const formatJapaneseDate = (dateStr) => {
    const d = parseDate(dateStr);
    if (!d) return "未設定";
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  };
  const deliveredNoInv = orders.filter(o=>o?.status==="delivered"&&!invoices.find(i=>i?.orderId===o?.id));
  const createInv = (o) => {
    const tax=calcTax(o?.amount);
    const customer = customers.find((c) => c?.id === o?.customerId);
    const issueDate = o?.deliveryDate || getTodayLocalStr();
    const dueDate = calcDueDateByTerms(
      issueDate,
      customer?.closingDay ?? 31,
      customer?.paymentSite || "翌月末払い"
    );
    const baseAmount = Number(o?.amount)||0;
    const inv={
      id: generateUniqueBusinessId(invoices, "INV"),
      orderId:o?.id,
      customerId:o?.customerId,
      customerName:o?.customerName||"",
      issueDate,
      dueDate,
      amount:baseAmount,
      tax,
      total:baseAmount+tax,
      status:"unpaid",
      bankRef:"",
      paidDate:null,
      note:"",
      lineItems:[
        { id:`LI-${Date.now()}`, name:o?.cargo || "配送費", qty:1, unitPrice:baseAmount, subtotal:baseAmount },
      ],
      sentAt:null,
      sentTo:"",
    };
    setData((d) => {
      const customerName = o?.customerName || "";
      const customerId = o?.customerId || "";
      const baseEv = Array.isArray(d?.events) ? d.events : [];
      const alreadyHasEvent = baseEv.some((ev) =>
        ev?.type === "payment_due" &&
        ev?.date === dueDate &&
        (ev?.title?.includes(customerName) || ev?.customerId === customerId)
      );
      return {
        ...d,
        invoices: [inv, ...(Array.isArray(d?.invoices) ? d.invoices : [])],
        events: alreadyHasEvent ? baseEv : [...baseEv, {
          id: `EV-INV${Date.now()}`,
          date: dueDate,
          type: "payment_due",
          title: `${inv.id} 入金期日：${o?.customerName||""}`,
          color: "#660099",
          customerId,
        }],
      };
    });
  };

  const openInvoiceModal = (inv) => {
    const draft = {
      ...inv,
      lineItems: Array.isArray(inv?.lineItems) && inv.lineItems.length > 0
        ? inv.lineItems
        : [{ id:`LI-${Date.now()}`, name:"配送費", qty:1, unitPrice:Number(inv?.amount)||0, subtotal:Number(inv?.amount)||0 }],
    };
    setSelectedInvoiceId(inv?.id || null);
    setInvoiceDraft(draft);
    setShowInvoiceModal(true);
  };

  const saveInvoice = () => {
    if (!invoiceDraft?.id) return;
    // 「明細追加」ボタンを押した直後の空行（品目名未入力・単価0円のまま）が
    // 入力し忘れで残ったまま保存されると、PDFやメール送付の請求書に
    // 内容のない行がそのまま印字されてしまう。
    // 品目名が空かつ単価・数量が共に実質0円の行だけを自動的に除外する
    // （品目名がなくても金額が入っている行は、意図的な調整費等の可能性があるため残す）。
    const meaningfulItems = (invoiceDraft.lineItems || []).filter((item) => {
      const hasName = String(item?.name || "").trim() !== "";
      const hasAmount = (Number(item?.unitPrice) || 0) !== 0;
      return hasName || hasAmount;
    });
    const normalizedItems = meaningfulItems.map((item) => {
      const qty = Number(item?.qty) || 0;
      const unitPrice = Number(item?.unitPrice) || 0;
      return { ...item, qty, unitPrice, subtotal: qty * unitPrice };
    });
    // previewAmount と同様、円単位（整数）に丸めて保存する。
    const amount = Math.round(normalizedItems.reduce((s, item) => s + (Number(item?.subtotal) || 0), 0));
    // 消費税・合計は必ず明細の合計から再計算する。
    // 以前は invoiceDraft.tax / invoiceDraft.total を手入力でそのまま保存していたため、
    // 明細を編集しても税額・合計が古い値のまま残り、請求書が不整合になる恐れがあった。
    const tax = calcTax(amount);
    const total = amount + tax;
    // 値引き等のマイナス単価を許可したことで、合計が0円未満になる
    // （値引きが本体価格を超えてしまった）ケースが起こり得る。
    // 請求書としては不自然な状態のため、保存前に気づけるよう警告する。
    if (total < 0) {
      if (!window.confirm(`合計金額がマイナス（¥${total.toLocaleString()}）になっています。値引きが本体価格を超えていないかご確認ください。このまま保存しますか？`)) {
        return;
      }
    }
    const before = allInvoices.find((inv) => inv?.id === invoiceDraft.id);
    logHistoryEntry(setData, { entityType: "invoice", entityId: invoiceDraft.id, entityLabel: invoiceDraft.id, before, userRole });
    setData((d) => ({
      ...d,
      invoices: (Array.isArray(d?.invoices) ? d.invoices : []).map((inv) =>
        inv?.id === invoiceDraft.id
          ? {
              ...inv,
              ...invoiceDraft,
              amount,
              tax,
              total,
              lineItems: normalizedItems,
            }
          : inv
      ),
    }));
    setShowInvoiceModal(false);
  };

  const addLineItem = () => {
    // 単価の初期値を数値の 0 にしていたため、新しく追加した行にそのまま
    // 数字を入力すると「02580」のように先頭にゼロが残った見た目になり、
    // ユーザーが桁を間違えたのではと不安に感じる原因になっていた。
    // 空文字列を初期値にすることで、最初の入力で自然に置き換わるようにする。
    setInvoiceDraft((prev) => ({
      ...(prev || {}),
      lineItems: [...(prev?.lineItems || []), { id:`LI-${Date.now()}`, name:"", qty:1, unitPrice:"", subtotal:0 }],
    }));
  };

  const removeLineItem = (itemId) => {
    setInvoiceDraft((prev) => ({
      ...(prev || {}),
      lineItems: (prev?.lineItems || []).filter((item) => item?.id !== itemId),
    }));
  };

  const updateLineItem = (itemId, key, value) => {
    setInvoiceDraft((prev) => ({
      ...(prev || {}),
      lineItems: (prev?.lineItems || []).map((item) => {
        if (item?.id !== itemId) return item;
        const nextItem = { ...item, [key]: value };
        const qty = Number(nextItem?.qty) || 0;
        const unitPrice = Number(nextItem?.unitPrice) || 0;
        return { ...nextItem, subtotal: qty * unitPrice };
      }),
    }));
  };

  const buildInvoiceHtml = (inv) => {
    const customer = customers.find((c) => c?.id === inv?.customerId);
    // 会社情報が未設定の場合のフォールバック値。
    // 以前はここに運用中のT-LINKの実際の会社名・電話番号・銀行口座が
    // ハードコードされていたため、他のテナントが会社情報を設定する前に
    // 請求書を発行すると、T-LINKの情報が誤ってその会社の請求書に印字され、
    // 顧客に送られてしまう重大なリスクがあった。
    // 未設定の場合は「未設定」であることが分かるプレースホルダーにし、
    // 誤送信時にも他社の実情報が漏れないようにする。
    const fallbackCompany = {
      name: "（会社名未設定）",
      tagline: "",
      address: "（住所未設定）",
      phone: "（電話番号未設定）",
      email: "（メール未設定）",
      bankInfo: {
        bankName: "未設定",
        branch: "未設定",
        accountType: "未設定",
        accountNumber: "未設定",
        accountName: "未設定",
      },
      stampImage: "",
    };
    const mergedCompany = {
      ...fallbackCompany,
      ...companyInfo,
      tagline: companyInfo?.tagline || fallbackCompany.tagline,
    };
    const parsedBankInfo = (() => {
      if (companyInfo?.bankInfo && typeof companyInfo.bankInfo === "object") {
        return { ...fallbackCompany.bankInfo, ...companyInfo.bankInfo };
      }
      if (typeof companyInfo?.bankInfo === "string" && companyInfo.bankInfo.trim()) {
        const text = companyInfo.bankInfo.trim();
        const parts = text.split(/\s+/);
        return {
          bankName: parts[0] || fallbackCompany.bankInfo.bankName,
          branch: parts[1] || fallbackCompany.bankInfo.branch,
          accountType: parts[2] || fallbackCompany.bankInfo.accountType,
          accountNumber: parts[3] || fallbackCompany.bankInfo.accountNumber,
          accountName: parts.slice(4).join(" ") || fallbackCompany.bankInfo.accountName,
        };
      }
      return fallbackCompany.bankInfo;
    })();
    // 「明細追加」ボタンを押した直後の空行（品目名未入力・単価0円のまま）が
    // 入力し忘れで残っていても、PDF・メール送付用の請求書には印字しない。
    // 品目名がなくても金額が入っている行（調整費等）は表示対象として残す。
    const meaningfulLineItems = (Array.isArray(inv?.lineItems) ? inv.lineItems : []).filter((item) => {
      const hasName = String(item?.name || "").trim() !== "";
      const hasAmount = (Number(item?.unitPrice) || 0) !== 0;
      return hasName || hasAmount;
    });
    const lineItems = meaningfulLineItems.length > 0
      ? meaningfulLineItems
      : [{ name: "配送料", qty: 1, unitPrice: Number(inv?.amount) || 0, subtotal: Number(inv?.amount) || 0 }];
    const rowsHtml = lineItems
      .map(
        (item) => `
          <tr>
            <td>${item?.name || "配送料"}</td>
            <td style="text-align:right;">${Number(item?.qty)||0}</td>
            <td style="text-align:right;">¥${(Number(item?.unitPrice)||0).toLocaleString()}</td>
            <td style="text-align:right;">¥${(Number(item?.subtotal)||0).toLocaleString()}</td>
          </tr>`
      )
      .join("");
    return `<!doctype html><html><head><meta charset="utf-8"/><title>${inv?.id || "請求書"}</title><style>
      @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;700&family=Noto+Serif+JP:wght@500;700&display=swap');
      body{font-family:'Noto Sans JP',sans-serif;background:#fff;color:#111;padding:20px;line-height:1.6}
      .container{max-width:920px;margin:0 auto}
      .topbar{height:8px;background:linear-gradient(90deg,#111,#c8a96e,#111);margin-bottom:18px}
      .header{display:flex;justify-content:space-between;align-items:flex-start;gap:20px}
      .company{font-family:'Noto Serif JP',serif;font-size:34px;letter-spacing:2px}
      .tagline{font-size:11px;color:#666;letter-spacing:2px}
      .inv-title{text-align:right}
      .inv-title .label{font-family:'Noto Serif JP',serif;font-size:30px;letter-spacing:4px}
      .inv-title .meta{font-size:12px;color:#444}
      .line{height:3px;background:linear-gradient(90deg,#111,#c8a96e);margin:14px 0 18px}
      .info{display:flex;justify-content:space-between;gap:24px}
      .box{flex:1}
      .label{font-size:11px;color:#c8a96e;letter-spacing:1px;margin-bottom:4px}
      .name{font-size:18px;font-weight:700}
      .amount-box{margin:16px 0;padding:12px;border:1px solid #ddd;background:#fff;display:inline-block;min-width:280px}
      .amount-box .num{font-family:'Noto Serif JP',serif;font-size:30px}
      table{width:100%;border-collapse:collapse;margin-top:14px}
      thead th{border-top:2px solid #111;border-bottom:2px solid #111;padding:8px 6px;text-align:left;font-size:12px}
      tbody td{border-bottom:1px solid #ddd;padding:8px 6px;font-size:12px}
      .totals{width:340px;margin-left:auto;margin-top:14px}
      .totals-row{display:flex;justify-content:space-between;padding:4px 0;font-size:13px}
      .grand{display:flex;justify-content:space-between;align-items:center;border-top:2px solid #111;margin-top:6px;padding-top:8px}
      .grand .value{font-family:'Noto Serif JP',serif;font-size:28px}
      .bank{margin-top:18px;background:#f8f6f2;border-left:4px solid #c8a96e;padding:12px}
      .bank-grid{display:grid;grid-template-columns:120px 1fr;gap:2px 12px;font-size:12px}
      .note{margin-top:16px;padding-top:10px;border-top:1px dashed #bbb;background:#fafafa;padding-left:8px}
      .footer{margin-top:20px;text-align:center;font-size:11px;color:#666}
      .print-bar{margin-bottom:12px;text-align:right}
      /* 明細が多い請求書は印刷時に複数ページにまたがることがあるが、
         2ページ目以降には請求書番号や請求先名の情報がなく、
         「これが何の請求書か」が分からなくなってしまう問題があった。
         印刷時のみ、すべてのページの下部に請求書番号・請求先を
         固定表示するフッターを追加することで、ページがバラバラになっても
         どの請求書のものか分かるようにする。 */
      .print-page-footer{display:none}
      @page{ size: A4; margin: 12mm; }
      @media print{
        .print-bar{display:none}
        body{padding:0.4cm}
        /* コンテナ幅(920px)はA4の印刷可能幅を超えるため、印刷時はリセットする */
        .container{max-width:100%; width:100%}
        .print-page-footer{
          display:block;
          position:fixed;
          bottom:0;
          left:0;
          right:0;
          font-size:9px;
          color:#999;
          text-align:center;
          padding:4px 0;
          border-top:1px solid #ddd;
          background:#fff;
        }
      }
    </style></head><body>
      <div class="container">
        <div class="print-bar"><button onclick="window.print()">印刷する</button></div>
        <div class="print-page-footer">請求書 ${inv?.id || "—"} － ${customer?.name || inv?.customerName || "宛先未設定"} 御中</div>
        <div class="topbar"></div>
        <div class="header">
          <div>
            <div class="company">${mergedCompany.name || fallbackCompany.name}</div>
            <div class="tagline">${mergedCompany.tagline}</div>
          </div>
          <div class="inv-title">
            <div class="label">請求書</div>
            <div class="meta">No. ${inv?.id || "—"}</div>
            <div class="meta">発行日: ${formatJapaneseDate(inv?.issueDate)}</div>
          </div>
        </div>
        <div class="line"></div>

        <div class="info">
          <div class="box">
            <div class="label">請求先</div>
            <div class="name">${customer?.name || inv?.customerName || "宛先未設定"} 御中</div>
            <div>${customer?.address || "住所未設定"}</div>
          </div>
          <div class="box" style="text-align:right">
            <div class="label">請求元</div>
            <div>${mergedCompany.name || fallbackCompany.name}</div>
            <div>${mergedCompany.address || fallbackCompany.address}</div>
            <div>TEL: ${mergedCompany.phone || fallbackCompany.phone}</div>
            <div>MAIL: ${mergedCompany.email || fallbackCompany.email}</div>
            ${mergedCompany?.stampImage ? `<div style="margin-top:8px"><img src="${mergedCompany.stampImage}" alt="stamp" style="height:70px"/></div>` : ""}
          </div>
        </div>

        <div class="amount-box">
          <div class="label">ご請求金額</div>
          <div class="num">¥${(Number(inv?.total)||0).toLocaleString()}</div>
          <div>お支払期限: ${formatJapaneseDate(inv?.dueDate)}</div>
        </div>

        <table>
          <thead><tr><th>品目</th><th style="text-align:right;">数量</th><th style="text-align:right;">単価</th><th style="text-align:right;">金額</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>

        <div class="totals">
          <div class="totals-row"><span>小計</span><span>¥${(Number(inv?.amount)||0).toLocaleString()}</span></div>
          <div class="totals-row"><span>消費税</span><span>¥${(Number(inv?.tax)||0).toLocaleString()}</span></div>
          <div class="grand"><span>合計</span><span class="value">¥${(Number(inv?.total)||0).toLocaleString()}</span></div>
        </div>

        <div class="bank">
          <div class="label">お振込先</div>
          <div class="bank-grid">
            <div>銀行名</div><div>${parsedBankInfo.bankName}</div>
            <div>支店名</div><div>${parsedBankInfo.branch}</div>
            <div>口座種別</div><div>${parsedBankInfo.accountType}</div>
            <div>口座番号</div><div>${parsedBankInfo.accountNumber}</div>
            <div>口座名義</div><div>${parsedBankInfo.accountName}</div>
          </div>
        </div>

        <div class="note">
          <div class="label">備考</div>
          <div>${(inv?.note || "上記の通りご請求申し上げます。").replace(/\n/g, "<br/>")}</div>
        </div>
        <div class="footer">${mergedCompany.name || fallbackCompany.name} | このたびはご利用ありがとうございます</div>
      </div>
    </body></html>`;
  };

  /**
   * ===== ドライバー請求書のPDFテンプレート =====
   *
   * 顧客向け請求書（buildInvoiceHtml）と発行者・宛先の関係が逆になる。
   * ・顧客向け: 発行者＝自社、宛先＝顧客
   * ・ドライバー向け: 発行者＝ドライバー本人（個人事業主）、宛先＝自社
   *
   * ドライバーが適格請求書発行事業者として登録済みの場合のみ、
   * 登録番号・消費税額を明示した「適格請求書」として発行する。
   */
  const buildDriverInvoiceHtml = (inv) => {
    const driver = drivers.find((d) => d?.id === inv?.driverId);
    const fallbackCompany = {
      name: "（会社名未設定）",
      address: "（住所未設定）",
    };
    const mergedCompany = { ...fallbackCompany, ...companyInfo };
    const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
    const yen = (v) => `¥${(Number(v) || 0).toLocaleString()}`;

    const items = (Array.isArray(inv?.lineItems) ? inv.lineItems : []).map((item) => `
      <tr>
        <td>${esc(item.name)}</td>
        <td style="text-align:right">${yen(item.subtotal)}</td>
      </tr>`).join("");

    return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>請求書 ${esc(inv?.id)}</title>
<style>
  *{box-sizing:border-box} body{font-family:'Hiragino Sans','Noto Sans JP',sans-serif;color:#222;margin:0;padding:30px;background:#f5f5f5}
  .sheet{max-width:720px;margin:0 auto;background:#fff;padding:40px;border-radius:4px}
  .print-bar{max-width:720px;margin:0 auto 12px;text-align:right}
  .print-bar button{padding:8px 18px;font-size:13px;font-weight:700;color:#fff;background:#00a09a;border:none;border-radius:4px;cursor:pointer;font-family:inherit}
  h1{font-size:22px;text-align:center;letter-spacing:4px;margin:0 0 24px}
  .row{display:flex;justify-content:space-between;margin-bottom:24px}
  .from,.to{font-size:13px;line-height:1.8}
  .to{font-size:16px;font-weight:700}
  table{width:100%;border-collapse:collapse;margin:20px 0}
  th,td{border:1px solid #ddd;padding:8px 10px;font-size:13px}
  th{background:#f5f5f5;text-align:left}
  .totals{margin-left:auto;width:280px;font-size:13px}
  .totals div{display:flex;justify-content:space-between;padding:4px 0}
  .totals .grand{font-size:18px;font-weight:700;border-top:2px solid #222;margin-top:6px;padding-top:8px}
  .note{margin-top:24px;font-size:12px;color:#666;line-height:1.8}
  .footer{margin-top:30px;text-align:center;font-size:11px;color:#999}
  @page{ size: A4; margin: 12mm; }
  @media print{
    body{background:#fff;padding:0}
    .print-bar{display:none}
    .sheet{max-width:100%;width:100%;padding:0;border-radius:0}
  }
</style></head>
<body>
  <div class="print-bar"><button onclick="window.print()">印刷 / PDF保存</button></div>
  <div class="sheet">
    <h1>請 求 書</h1>
    <div class="row">
      <div class="to">
        ${esc(mergedCompany.name)} 御中<br/>
        <span style="font-size:12px;font-weight:400;color:#666">${esc(mergedCompany.address)}</span>
      </div>
      <div class="from">
        請求書番号：${esc(inv?.id)}<br/>
        発行日：${esc(inv?.issueDate)}<br/>
        お支払期限：${esc(inv?.dueDate)}<br/><br/>
        <b>${esc(inv?.driverName)}</b><br/>
        ${inv?.registered && inv?.invoiceRegNo ? `登録番号：${esc(inv.invoiceRegNo)}` : "（適格請求書発行事業者登録なし）"}
      </div>
    </div>

    <table>
      <thead><tr><th>内容</th><th style="text-align:right">金額</th></tr></thead>
      <tbody>${items}</tbody>
    </table>

    <div class="totals">
      <div><span>小計</span><span>${yen(inv?.amount)}</span></div>
      ${inv?.registered
        ? `<div><span>消費税（10%）</span><span>${yen(inv?.tax)}</span></div>`
        : `<div style="color:#999"><span>消費税</span><span>対象外</span></div>`
      }
      <div class="grand"><span>ご請求額</span><span>${yen(inv?.total)}</span></div>
    </div>

    <div class="note">
      ${esc(inv?.note || "")}<br/>
      ${inv?.registered ? "" : "※免税事業者のため、消費税は加算しておりません。"}
    </div>
    <div class="footer">この請求書はハコマネにより自動発行されています</div>
  </div>
</body></html>`;
  };

  const openPreview = () => {
    if (!invoiceDraft) return;
    const html = buildInvoiceHtml(invoiceDraft);
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  const openMailModal = () => {
    if (!invoiceDraft) return;
    const customer = customers.find((c) => c?.id === invoiceDraft.customerId);
    const to = customer?.email || "";
    const subject = `【請求書送付】${invoiceDraft.id} ${invoiceDraft.customerName || ""}`;
    const body = `いつもお世話になっております。\n請求書をお送りします。\n\n請求書番号: ${invoiceDraft.id}\n発行日: ${invoiceDraft.issueDate}\n支払期日: ${invoiceDraft.dueDate}\n合計: ¥${(Number(invoiceDraft.total)||0).toLocaleString()}\n\nPDFはプレビュー画面から印刷保存してご利用ください。`;
    setMailDraft({ to, subject, body });
    setShowMailModal(true);
  };

  const openMailer = () => {
    if (!invoiceDraft) return;
    const customer = customers.find((c) => c?.id === invoiceDraft.customerId);
    const customerEmail = encodeURIComponent(mailDraft.to || customer?.email || "");
    const customerName = invoiceDraft.customerName || customer?.name || "";
    const subject = encodeURIComponent(`【請求書送付】${invoiceDraft.id} ${customerName}`);
    // 差出人の会社名は「会社情報設定」で登録された companyInfo.name を使う。
    // 以前は「T-LINKの坪倉と申します」という特定テナント向けの文言が
    // 固定で入っていたため、他社が使うと誤った差出人名でメールが送られてしまっていた。
    const senderName = companyInfo?.name || "（会社名未設定）";
    const body = encodeURIComponent(
      `いつもお世話になっております。\n${senderName}でございます。\n\n請求書をお送りします。\n\n請求書番号: ${invoiceDraft.id}\n発行日: ${invoiceDraft.issueDate}\n支払期限: ${invoiceDraft.dueDate}\n合計: ¥${(Number(invoiceDraft.total) || 0).toLocaleString()}\n\nご確認よろしくお願いいたします。`
    );
    const mailtoUrl = `https://mail.google.com/mail/?view=cm&to=${customerEmail}&su=${subject}&body=${body}`;
    window.open(mailtoUrl, "_blank");
  };

  const recordSent = () => {
    if (!invoiceDraft?.id) return;
    setData((d) => ({
      ...d,
      invoices: (Array.isArray(d?.invoices) ? d.invoices : []).map((inv) =>
        inv?.id === invoiceDraft.id
          ? { ...inv, sentAt: new Date().toISOString(), sentTo: mailDraft.to || "" }
          : inv
      ),
    }));
    setShowMailModal(false);
  };

  const saveCompanyInfo = () => {
    logHistoryEntry(setData, { entityType: "company_info", entityId: "COMPANY-001", entityLabel: companyInfo?.name || "会社情報", before: companyInfo, userRole });
    setData((d) => ({
      ...d,
      companyInfo: { ...companyDraft, id: companyDraft?.id || "COMPANY-001" },
    }));
    setShowCompanyModal(false);
  };

  // 請求書一覧から、延滞・未払いの請求書をワンクリックで催促できるようにする。
  // これまでは請求書詳細を開いて通常の送付文面を作るしかなく、
  // 「期日を過ぎているので催促したい」という意図に合った文面を素早く送る手段がなかった。
  const sendReminderMail = (inv) => {
    const customer = customers.find((c) => c?.id === inv?.customerId);
    const customerEmail = encodeURIComponent(customer?.email || "");
    const customerName = inv?.customerName || customer?.name || "";
    const senderName = companyInfo?.name || "（会社名未設定）";
    const isOverdue = (inv?.dueDate || "") < getTodayLocalStr();
    const subject = encodeURIComponent(`【お支払いのお願い】${inv?.id} ${customerName}`);
    const body = encodeURIComponent(
      `いつもお世話になっております。\n${senderName}でございます。\n\n` +
      (isOverdue
        ? `下記請求書のお支払期日が過ぎておりますが、まだお支払いの確認ができておりません。\nご多用のところ恐れ入りますが、お支払い状況のご確認をお願いいたします。\n\n`
        : `下記請求書のお支払期日が近づいております。\nお手数をおかけいたしますが、お支払いのご準備をお願いいたします。\n\n`) +
      `請求書番号: ${inv?.id}\n発行日: ${inv?.issueDate || ""}\n支払期日: ${inv?.dueDate || ""}\n合計: ¥${(Number(inv?.total) || 0).toLocaleString()}\n\n` +
      `既にお支払いいただいている場合は本メールにご返信いただけますと幸いです。\nご確認よろしくお願いいたします。`
    );
    const mailtoUrl = `https://mail.google.com/mail/?view=cm&to=${customerEmail}&su=${subject}&body=${body}`;
    window.open(mailtoUrl, "_blank");
  };

  const invoiceIcon = <Icon size={14}><rect x="4" y="3" width="16" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="14" y2="12"/></Icon>;
  const companyIcon = <Icon size={14}><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/></Icon>;
  const mailIcon = <Icon size={14}><rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="3,7 12,13 21,7"/></Icon>;
  const warningIcon = <Icon size={14}><path d="M12 3 2.5 20h19L12 3z"/><line x1="12" y1="9" x2="12" y2="14"/><line x1="12" y1="17" x2="12" y2="17"/></Icon>;
  const fileIcon = <Icon size={12}><path d="M14 2H6a2 2 0 0 0-2 2v16h16V8z"/><polyline points="14,2 14,8 20,8"/></Icon>;
  const plusIcon = <Icon size={12}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></Icon>;
  const trashIcon = <Icon size={12}><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></Icon>;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
      {/* 顧客への請求書（入金）と、ドライバーからの請求書（支払）は
          お金の流れが逆なので、混同しないようタブで明確に切り替える */}
      <div style={{ display:"flex", gap:"6px", overflowX:"auto" }}>
        <button onClick={() => setInvoiceTab("customer")} style={{
          border:"1px solid #d0d0d0", borderBottom:"none", borderRadius:"4px 4px 0 0", padding:"8px 16px",
          fontSize:"12px", fontWeight:700, cursor:"pointer",
          background: invoiceTab === "customer" ? "#00a09a" : "#f0f2f5", color: invoiceTab === "customer" ? "#fff" : "#555",
        }}>顧客への請求書（{invoices.length}）</button>
        <button onClick={() => setInvoiceTab("driver")} style={{
          border:"1px solid #d0d0d0", borderBottom:"none", borderRadius:"4px 4px 0 0", padding:"8px 16px",
          fontSize:"12px", fontWeight:700, cursor:"pointer",
          background: invoiceTab === "driver" ? "#e65100" : "#f0f2f5", color: invoiceTab === "driver" ? "#fff" : "#555",
        }}>ドライバーからの請求書（{driverInvoicesAll.length}）</button>
      </div>

      {invoiceTab === "driver" ? (
        <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
            <span style={{ fontSize:"12px", color:"#666", fontWeight:600 }}>検索</span>
            <RetroInput value={invoiceSearch} onChange={e=>setInvoiceSearch(e.target.value)} placeholder="請求書番号・ドライバー名で検索"
              style={{ width: isMobile ? "200px" : "260px", border:"1px solid #d0d0d0", borderRadius:"3px", background:"#fff" }}/>
          </div>
          <p style={{ fontSize:"11px", color:"#888" }}>
            月を締めると、稼働があったドライバー分の請求書が自動で発行されます。個別に作成する必要はありません。
          </p>
          <div style={{ border:cardBorder, borderRadius:"6px", background:"#fff", overflow:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"12px" }}>
              <thead>
                <tr style={{ background:"#fafbfc" }}>
                  {["請求書番号","対象月","ドライバー","金額","状態","登録"].map(h => (
                    <th key={h} style={{ padding:"8px 10px", borderBottom:cardBorder, textAlign:"left", color:"#666", fontWeight:700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredDriverInvoices.length === 0 && (
                  <tr><td colSpan={6} style={{ padding:"24px", textAlign:"center", color:"#999" }}>まだドライバー請求書はありません（月を締めると発行されます）</td></tr>
                )}
                {filteredDriverInvoices.map(inv => (
                  <tr key={inv.id} onClick={() => setSelectedDriverInvoiceId(inv.id)} style={{ borderBottom:"1px solid #f0f0f0", cursor:"pointer" }}>
                    <td style={{ padding:"8px 10px" }}>{inv.id}</td>
                    <td style={{ padding:"8px 10px" }}>{inv.payoutMonth}</td>
                    <td style={{ padding:"8px 10px", fontWeight:700 }}>{inv.driverName}</td>
                    <td style={{ padding:"8px 10px", textAlign:"right" }}>¥{(inv.total || 0).toLocaleString()}</td>
                    <td style={{ padding:"8px 10px" }}>{inv.status === "paid" ? "支払済" : "未払"}</td>
                    <td style={{ padding:"8px 10px" }}>{inv.registered ? "適格" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedDriverInvoice && (
            <Modal title={`${selectedDriverInvoice.driverName} — ${selectedDriverInvoice.payoutMonth}`} onClose={() => setSelectedDriverInvoiceId(null)} width={480}>
              <div style={{ fontSize:"13px", lineHeight:2 }}>
                <div>請求書番号：{selectedDriverInvoice.id}</div>
                <div>金額：¥{(selectedDriverInvoice.total || 0).toLocaleString()}（内消費税 ¥{(selectedDriverInvoice.tax || 0).toLocaleString()}）</div>
                <div>支払期限：{selectedDriverInvoice.dueDate}</div>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", marginTop:"14px" }}>
                <RetroBtn onClick={() => {
                  setData(d => ({
                    ...d,
                    invoices: (d?.invoices || []).map(x => x.id === selectedDriverInvoice.id ? { ...x, status: x.status === "paid" ? "unpaid" : "paid", paidDate: x.status === "paid" ? null : getTodayLocalStr() } : x),
                  }));
                }} style={{ background: selectedDriverInvoice.status === "paid" ? "#fff" : "#00a09a", borderColor:"#00a09a", color: selectedDriverInvoice.status === "paid" ? "#00a09a" : "#fff" }}>
                  {selectedDriverInvoice.status === "paid" ? "未払に戻す" : "支払済にする"}
                </RetroBtn>
                <RetroBtn onClick={() => {
                  const html = buildDriverInvoiceHtml(selectedDriverInvoice);
                  const w = window.open("", "_blank");
                  if (w) { w.document.open(); w.document.write(html); w.document.close(); }
                }} style={{ background:"#e65100", borderColor:"#e65100", color:"#fff" }}>
                  {invoiceIcon}PDFで開く
                </RetroBtn>
              </div>
            </Modal>
          )}
        </div>
      ) : (
      <>
      <Panel title="顧客請求書の一括発行">
        <p style={{ fontSize:"11px", color:"#666", marginBottom:"8px" }}>
          配送完了した受注は、個別に請求書を発行するのではなく、顧客ごとに登録された締め日・支払いサイトに合わせて、
          対象月分をまとめて1通の請求書として発行します（法人契約の一般的な運用に合わせています）。
        </p>
        <div style={{ display:"flex", gap:"8px", alignItems:"flex-end", flexWrap:"wrap" }}>
          <Fl label="対象月"><RetroInput type="month" value={batchMonth} onChange={e=>setBatchMonth(e.target.value)}/></Fl>
          <RetroBtn onClick={()=>{
            // 連打対策。生成処理は複数の請求書・イベントをまとめて1回のsetDataで
            // 作るため、連続クリックすると同じ対象がまだ「未請求」に見えたまま
            // 二重に処理される危険がある。処理中は再度押せないようにする。
            if (isGeneratingBatch) return;
            setIsGeneratingBatch(true);
            const count = generateCustomerInvoicesForMonth(batchMonth);
            setBatchResultMsg(count > 0 ? `${batchMonth} 分の請求書を ${count}件 発行しました。` : `${batchMonth} 分の、まだ請求書化されていない配送完了実績が見つかりませんでした。`);
            setIsGeneratingBatch(false);
          }} disabled={isGeneratingBatch} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>
            {isGeneratingBatch ? "発行中..." : "この月のぶんを一括発行"}
          </RetroBtn>
        </div>
        {batchResultMsg && <p style={{ fontSize:"12px", color:"#00695c", marginTop:"8px" }}>{batchResultMsg}</p>}
      </Panel>
      <Panel title="取引先ごとの請求履歴">
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:"8px", marginBottom: showCustomerHistory ? "10px" : "0" }}>
          <p style={{ fontSize:"11px", color:"#888", margin:0 }}>
            請求書を1件ずつ探さなくても、月ごと・取引先ごとの請求額と入金状況をまとめて確認できます。
          </p>
          <RetroBtn small onClick={()=>setShowCustomerHistory(v=>!v)} style={{ background: showCustomerHistory ? "#00a09a" : "#fff", borderColor:"#00a09a", color: showCustomerHistory ? "#fff" : "#00a09a" }}>
            {showCustomerHistory ? "閉じる" : "履歴を一覧で見る"}
          </RetroBtn>
        </div>
        {showCustomerHistory && (
          <>
            <Fl label="取引先で絞り込む（未選択なら全取引先合計）">
              <RetroSelect value={historyCustomerId} onChange={(e)=>setHistoryCustomerId(e.target.value)} style={{ width:"220px" }}>
                <option value="">全取引先合計</option>
                {/* 削除済みの取引先も、過去の請求履歴を振り返れるようあえて選択肢に残す。
                    ただし何も表示しないと「なぜ消したはずの会社が出るのか」と
                    混乱するため、削除済みだと分かるようにラベルを付ける。 */}
                {customers.map(c => <option key={c?.id} value={c?.id}>{c?.name}{c?.deleted ? "（削除済み）" : ""}</option>)}
              </RetroSelect>
            </Fl>
            <div style={{ overflow:"auto", marginTop:"8px" }}>
              <table style={{ minWidth:"100%", width:"max-content", borderCollapse:"collapse", fontSize:"12px" }}>
                <thead>
                  <tr style={{ background:"#fafbfc" }}>
                    {["月","請求件数","請求合計","うち未回収"].map(h => (
                      <th key={h} style={{ color:"#666", fontSize:"11px", padding:"8px 10px", textAlign: h==="月" ? "left" : "right", fontWeight:700, whiteSpace:"nowrap", borderBottom:cardBorder }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {customerMonthlyHistory.map((row) => (
                    <tr key={row.month} style={{ borderBottom:"1px solid #f0f0f0" }}>
                      <td style={{ padding:"8px 10px", fontWeight:700 }}>{row.month}</td>
                      <td style={{ padding:"8px 10px", textAlign:"right" }}>{row.invoiceCount}件</td>
                      <td style={{ padding:"8px 10px", textAlign:"right", fontWeight:700, color:"#007a74" }}>¥{row.billedTotal.toLocaleString()}</td>
                      <td style={{ padding:"8px 10px", textAlign:"right", color: row.unpaidTotal > 0 ? "#e63946" : "#999" }}>¥{row.unpaidTotal.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {customerHistoryMonths < 36 && (
              <div style={{ marginTop:"8px", textAlign:"center" }}>
                <RetroBtn small onClick={()=>setCustomerHistoryMonths(v=>v+12)} style={{ background:"#fff", color:"#666", borderColor:"#ccc" }}>さらに12ヶ月分読み込む</RetroBtn>
              </div>
            )}
          </>
        )}
      </Panel>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:"8px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
          <span style={{ fontSize:"12px", color:"#666", fontWeight:600 }}>検索</span>
          <RetroInput value={invoiceSearch} onChange={e=>setInvoiceSearch(e.target.value)} placeholder="請求書番号・顧客名・備考で検索" style={{ width: isMobile ? "200px" : "260px", border:"1px solid #d0d0d0", borderRadius:"3px", background:"#fff" }}/>
        </div>
        <RetroBtn onClick={()=>setShowCompanyModal(true)} style={{ background:"#fff", borderColor:"#00a09a", color:"#00a09a" }}>{companyIcon}会社情報設定</RetroBtn>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:"8px" }}>
        {[["請求総額","¥"+invoices.reduce((s,i)=>s+(Number(i?.total)||0),0).toLocaleString(),"#7b1fa2"],["入金済","¥"+invoices.filter(i=>i?.status==="paid").reduce((s,i)=>s+(Number(i?.total)||0),0).toLocaleString(),"#4caf50"],["未回収","¥"+invoices.filter(i=>i?.status!=="paid").reduce((s,i)=>s+(Number(i?.total)||0),0).toLocaleString(),"#e63946"]].map(([l,v,c])=>(
          <div key={l} style={{ background:"#fff", border:cardBorder, borderRadius:"6px", padding:"12px" }}>
            <div style={{ fontSize:"11px", color:"#888", fontWeight:700 }}>{l}</div>
            <div style={{ fontSize:"20px", fontWeight:700, color:c }}>{v}</div>
          </div>
        ))}
      </div>
      {deliveredNoInv.length>0&&(
        <Panel style={{ borderColor:"#ffcc80", background:"#fff3e0" }}>
          <div style={{ fontSize:"12px", fontWeight:700, color:"#e65100", marginBottom:"6px", display:"flex", alignItems:"center", gap:"6px" }}>{warningIcon}請求書未発行</div>
          {deliveredNoInv.map(o=>(
            <div key={o.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"4px 0" }}>
              <span style={{ fontSize:"11px" }}>{o?.id||"—"} — {o?.customerName||""}（¥{(Number(o?.amount)||0).toLocaleString()}）</span>
              <RetroBtn small onClick={()=>createInv(o)} style={{ background:"#fff", borderColor:"#00a09a", color:"#00a09a" }}>{fileIcon}発行</RetroBtn>
            </div>
          ))}
        </Panel>
      )}
      <RetroTable
        maxHeight={isMobile ? "60vh" : "calc(100vh - 320px)"}
        headers={["請求書","顧客","期日","合計","状態","送付","備考","操作"]}
        rows={filteredInvoices.map(inv=>[
          <span style={{color:"#00a09a",fontWeight:700, cursor:"pointer"}} onClick={()=>openInvoiceModal(inv)}>{inv?.id||"—"}</span>,
          inv?.customerName||"", inv?.dueDate||"",
          <span style={{fontWeight:700}}>¥{(Number(inv?.total)||0).toLocaleString()}</span>,
          <StatusPill s={inv?.status}/>,
          inv?.sentAt ? <span style={{ color:"#2e7d32", fontWeight:700 }}>送付済</span> : <span style={{ color:"#999" }}>未送付</span>,
          <span style={{fontSize:"11px",color:"#999"}}>{inv?.note||"—"}</span>,
          inv?.status!=="paid"
            ? (customers.find((c) => c?.id === inv?.customerId)?.email
                ? <RetroBtn small onClick={()=>sendReminderMail(inv)} style={{ background:(inv?.dueDate||"")<getTodayLocalStr() ? "#e63946" : "#fff", borderColor:"#e63946", color:(inv?.dueDate||"")<getTodayLocalStr() ? "#fff" : "#e63946" }}>
                    {/* 「督促」は本来、支払期日を過ぎた請求に対して使う言葉。
                        期日前の請求にも同じラベルを出すと、送る前から
                        「もう滞納扱いなのか」という誤解を与えてしまう。
                        期日前は「支払い案内」、期日超過後だけ「督促」と表示を分ける。 */}
                    {(inv?.dueDate||"")<getTodayLocalStr() ? "督促" : "支払い案内"}
                  </RetroBtn>
                : <span style={{fontSize:"10px",color:"#999"}} title="顧客にメールアドレスが登録されていません">メール未登録</span>)
            : <span style={{fontSize:"10px",color:"#ccc"}}>—</span>
        ])}
      />

      {showInvoiceModal && invoiceDraft && (
        <Modal title={`請求書詳細 ${invoiceDraft.id}`} icon={invoiceIcon} onClose={()=>{ setShowInvoiceModal(false); setShowInvoiceHistory(false); }} width={780}>
          {(() => {
            const previewItems = (invoiceDraft.lineItems || []).map((item) => {
              const qty = Number(item?.qty) || 0;
              const unitPrice = Number(item?.unitPrice) || 0;
              return { ...item, subtotal: qty * unitPrice };
            });
            // 日本のビジネス慣習上、請求金額は円単位（整数）で扱うため、
            // 数量×単価が小数になるケース（距離・時間制など）でも
            // 合計時点で四捨五入し、小数のまま表示・保存されないようにする。
            const previewAmount = Math.round(previewItems.reduce((s, item) => s + (Number(item?.subtotal) || 0), 0));
            const previewTax = calcTax(previewAmount);
            const previewTotal = previewAmount + previewTax;
            return (
              <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"8px 12px" }}>
                <Fl label="発行日"><RetroInput type="date" value={invoiceDraft.issueDate || ""} onChange={(e)=>setInvoiceDraft((v)=>({ ...(v||{}), issueDate:e.target.value }))}/></Fl>
                <Fl label="支払期日"><RetroInput type="date" value={invoiceDraft.dueDate || ""} onChange={(e)=>setInvoiceDraft((v)=>({ ...(v||{}), dueDate:e.target.value }))}/></Fl>
                <Fl label="金額（明細から自動計算）"><RetroInput type="number" value={previewAmount} readOnly style={{ background:"#f5f5f5", color:"#666" }}/></Fl>
                <Fl label="消費税（自動計算・10%）"><RetroInput type="number" value={previewTax} readOnly style={{ background:"#f5f5f5", color:"#666" }}/></Fl>
                <Fl label="合計（自動計算）"><RetroInput type="number" value={previewTotal} readOnly style={{ background:"#f5f5f5", color:"#666", fontWeight:700 }}/></Fl>
                <Fl label="入金状況">
                  {/* 銀行CSV照合を経由しない支払い（現金・手形・対応していない金融機関など）の場合に、
                      手動で入金済みへ切り替えられる手段がこれまで一切なかったため追加する。
                      overdue（延滞）はダッシュボード等で「未払いかつ期日超過」として自動判定されるため、
                      ここでは手動操作の対象を unpaid / paid の2択に絞る。 */}
                  <RetroSelect
                    value={invoiceDraft.status === "paid" ? "paid" : "unpaid"}
                    onChange={(e)=>setInvoiceDraft((v)=>({ ...(v||{}), status:e.target.value, paidDate: e.target.value === "paid" ? (v?.paidDate || getTodayLocalStr()) : null }))}
                  >
                    <option value="unpaid">未払い</option>
                    <option value="paid">入金済み</option>
                  </RetroSelect>
                </Fl>
                {invoiceDraft.status === "paid" && (
                  <Fl label="入金日">
                    <RetroInput type="date" value={invoiceDraft.paidDate || ""} onChange={(e)=>setInvoiceDraft((v)=>({ ...(v||{}), paidDate:e.target.value }))}/>
                  </Fl>
                )}
                <Fl label="備考"><RetroInput value={invoiceDraft.note || ""} onChange={(e)=>setInvoiceDraft((v)=>({ ...(v||{}), note:e.target.value }))}/></Fl>
              </div>
            );
          })()}
          <Panel title="明細" icon={fileIcon} style={{ marginTop:"8px" }}>
            {(invoiceDraft.lineItems || []).map((item)=>(
              <div key={item.id} style={{ display:"grid", gridTemplateColumns:"2fr 70px 120px 120px auto", gap:"6px", alignItems:"end", marginBottom:"6px" }}>
                <Fl label="品目"><RetroInput value={item.name || ""} onChange={(e)=>updateLineItem(item.id, "name", e.target.value)}/></Fl>
                <Fl label="数量"><RetroInput type="number" min="0" value={item.qty ?? 0} onChange={(e)=>updateLineItem(item.id, "qty", Math.max(0, Number(e.target.value)||0))}/></Fl>
                {/* 単価は以前マイナス値が常に0に丸められていたため、「値引き」「返金」のような
                    マイナス金額の明細行を作る手段が一切なかった。運送業の請求書でも
                    キャンセル料の一部免除や長期契約割引などで必要になるケースがあるため、
                    単価だけはマイナス値を許可する（数量は個数として0未満が不自然なため従来通り）。 */}
                <Fl label="単価（値引きは負の数で入力可）"><RetroInput type="number" value={item.unitPrice ?? 0} onChange={(e)=>updateLineItem(item.id, "unitPrice", Number(e.target.value)||0)}/></Fl>
                <Fl label="小計"><RetroInput type="number" value={item.subtotal ?? 0} readOnly/></Fl>
                <RetroBtn small onClick={()=>removeLineItem(item.id)} style={{ background:"#fff", color:"#e63946", borderColor:"#e63946" }}>{trashIcon}</RetroBtn>
              </div>
            ))}
            <RetroBtn small onClick={addLineItem} style={{ background:"#fff", color:"#00a09a", borderColor:"#00a09a" }}>{plusIcon}明細追加</RetroBtn>
          </Panel>
          <div style={{ marginTop:"8px" }}>
            <button onClick={()=>setShowInvoiceHistory(v=>!v)} style={{
              border:"none", background:"none", color:"#00a09a", fontSize:"12px", fontWeight:700, cursor:"pointer", padding:"4px 0",
            }}>
              {showInvoiceHistory ? "▲ 変更履歴を閉じる" : "▼ 変更履歴を見る"}
            </button>
            {showInvoiceHistory && (
              <HistoryPanel
                data={data}
                entityType="invoice"
                entityId={invoiceDraft?.id}
                labelMap={{
                  issueDate:"発行日", dueDate:"支払期日", amount:"金額", tax:"消費税",
                  total:"合計", status:"状態", customerName:"顧客", note:"備考",
                }}
              />
            )}
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", gap:"6px", marginTop:"10px", flexWrap:"wrap" }}>
            <div style={{ display:"flex", gap:"6px" }}>
              <RetroBtn onClick={openPreview} style={{ background:"#fff", borderColor:"#00a09a", color:"#00a09a" }}>PDFプレビュー</RetroBtn>
              <RetroBtn onClick={openMailModal} style={{ background:"#fff", borderColor:"#00a09a", color:"#00a09a" }}>{mailIcon}メール送付</RetroBtn>
              {/* 「削除」は破壊的な操作のため、「保存」のすぐ隣に置くと
                  急いでいるときに押し間違えるリスクがある。誤操作を防ぐため、
                  保存・キャンセルのグループから離し、こちら側にまとめる。 */}
              <RetroBtn onClick={()=>{ if(!window.confirm("この請求書を削除しますか？（後から復元できます）")) return; setData(d=>({...d, invoices:(Array.isArray(d?.invoices)?d.invoices:[]).map(i=>i?.id===invoiceDraft?.id?{...i,deleted:true}:i)})); setShowInvoiceModal(false); }} style={{ background:"#fff", color:"#e63946", borderColor:"#e63946" }}>削除</RetroBtn>
            </div>
            <div style={{ display:"flex", gap:"6px" }}>
              <RetroBtn onClick={()=>setShowInvoiceModal(false)}>キャンセル</RetroBtn>
              <RetroBtn onClick={saveInvoice} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>保存</RetroBtn>
            </div>
          </div>
        </Modal>
      )}

      {showMailModal && (
        <Modal title="メール送付" icon={mailIcon} onClose={()=>setShowMailModal(false)} width={560}>
          <Fl label="送付先メール"><RetroInput value={mailDraft.to} onChange={(e)=>setMailDraft((v)=>({ ...(v||{}), to:e.target.value }))}/></Fl>
          <Fl label="件名"><RetroInput value={mailDraft.subject} onChange={(e)=>setMailDraft((v)=>({ ...(v||{}), subject:e.target.value }))}/></Fl>
          <Fl label="本文"><RetroTextarea value={mailDraft.body} onChange={(e)=>setMailDraft((v)=>({ ...(v||{}), body:e.target.value }))} style={{ minHeight:"140px" }}/></Fl>
          <div style={{ display:"flex", justifyContent:"space-between", gap:"6px", marginTop:"10px" }}>
            <RetroBtn onClick={recordSent} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>送付記録</RetroBtn>
            <div style={{ display:"flex", gap:"6px" }}>
              <RetroBtn onClick={()=>setShowMailModal(false)}>閉じる</RetroBtn>
              <RetroBtn onClick={openMailer} style={{ background:"#fff", borderColor:"#00a09a", color:"#00a09a" }}>メーラーで送る</RetroBtn>
            </div>
          </div>
        </Modal>
      )}

      {showCompanyModal && (
        <Modal title="会社情報設定" icon={companyIcon} onClose={()=>{ setShowCompanyModal(false); setShowCompanyHistory(false); }} width={620}>
          <Fl label="会社名"><RetroInput value={companyDraft.name} onChange={(e)=>setCompanyDraft((v)=>({ ...(v||{}), name:e.target.value }))}/></Fl>
          <Fl label="住所"><RetroInput value={companyDraft.address} onChange={(e)=>setCompanyDraft((v)=>({ ...(v||{}), address:e.target.value }))}/></Fl>
          <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"8px 12px" }}>
            <Fl label="電話番号"><RetroInput value={companyDraft.phone} onChange={(e)=>setCompanyDraft((v)=>({ ...(v||{}), phone:e.target.value }))}/></Fl>
            <Fl label="メール"><RetroInput value={companyDraft.email} onChange={(e)=>setCompanyDraft((v)=>({ ...(v||{}), email:e.target.value }))}/></Fl>
          </div>
          <Fl label="振込先"><RetroTextarea value={companyDraft.bankInfo} onChange={(e)=>setCompanyDraft((v)=>({ ...(v||{}), bankInfo:e.target.value }))}/></Fl>
          <Fl label="印影画像(base64)"><RetroTextarea value={companyDraft.stampImage} onChange={(e)=>setCompanyDraft((v)=>({ ...(v||{}), stampImage:e.target.value }))}/></Fl>
          <Fl label="免許・車検・保険の期限通知（何日前から警告するか）">
            <RetroInput
              type="number"
              min="1"
              max="180"
              value={companyDraft.expiryAlertDays}
              onChange={(e)=>setCompanyDraft((v)=>({ ...(v||{}), expiryAlertDays: Math.max(1, parseInt(e.target.value,10) || 30) }))}
            />
          </Fl>
          <div style={{ marginTop:"4px" }}>
            <button onClick={()=>setShowCompanyHistory(v=>!v)} style={{
              border:"none", background:"none", color:"#00a09a", fontSize:"12px", fontWeight:700, cursor:"pointer", padding:"4px 0",
            }}>
              {showCompanyHistory ? "▲ 変更履歴を閉じる" : "▼ 変更履歴を見る"}
            </button>
            {showCompanyHistory && (
              <HistoryPanel
                data={data}
                entityType="company_info"
                entityId="COMPANY-001"
                labelMap={{
                  name:"会社名", address:"住所", phone:"電話番号",
                  expiryAlertDays:"期限アラート日数",
                }}
              />
            )}
          </div>
          <div style={{ display:"flex", justifyContent:"flex-end", gap:"6px", marginTop:"8px" }}>
            <RetroBtn onClick={()=>{ setShowCompanyModal(false); setShowCompanyHistory(false); }}>キャンセル</RetroBtn>
            <RetroBtn onClick={saveCompanyInfo} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>保存</RetroBtn>
          </div>
        </Modal>
      )}
      </>
      )}
    </div>
  );
};

const DriversAccidentFormTab = ({ form, setForm, isMobile, tenantId }) => {
  const accidentLogs = form.accidentLogs || [];
  const internalLogs = form.internalLogs || [];
  const [newAcc, setNewAcc] = useState({ type:"重大事故", date:"", detail:"", result:"" });
  const [newInt, setNewInt] = useState({ date:"", detail:"", result:"" });
  return (
    <>
      <div style={{ fontSize:"12px", fontWeight:700, color:"#555", marginBottom:"6px" }}>過去重大事故・行政処分歴</div>
      <div style={{ border:"1px solid #e8e8e8", borderRadius:"6px", padding:"10px", background:"#fafbfc", marginBottom:"8px" }}>
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"6px 12px" }}>
          <Fl label="種別">
            <RetroSelect value={newAcc.type} onChange={e=>setNewAcc(v=>({...v,type:e.target.value}))}>
              <option value="重大事故">重大事故</option>
              <option value="行政処分">行政処分</option>
            </RetroSelect>
          </Fl>
          <Fl label="発生日"><RetroInput type="date" value={newAcc.date} onChange={e=>setNewAcc(v=>({...v,date:e.target.value}))}/></Fl>
        </div>
        <Fl label="内容"><RetroTextarea value={newAcc.detail} onChange={e=>setNewAcc(v=>({...v,detail:e.target.value}))} style={{ minHeight:"60px" }}/></Fl>
        <Fl label="処理結果"><RetroInput value={newAcc.result} onChange={e=>setNewAcc(v=>({...v,result:e.target.value}))}/></Fl>
        <RetroBtn onClick={async () => {
          if (!newAcc.date) return;
          const updated = [...(form.accidentLogs || []), { ...newAcc, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }];
          setForm(prev => ({ ...prev, accidentLogs: updated }));
          const { error } = await supabase
            .from('driver_incidents')
            .insert({
              driver_id: form.id,
              incident_type: 'major',
              incident_date: newAcc.date,
              description: newAcc.detail || null,
              counterparty: null,
              amount: null,
              memo: [newAcc.type ? `種別:${newAcc.type}` : null, newAcc.result ? `処理:${newAcc.result}` : null].filter(Boolean).join(" / ") || null,
              tenant_id: tenantId
            });
          if (error) console.error('driver_incidents(major) insert error:', error);
          setNewAcc({ type:"重大事故", date:"", detail:"", result:"" });
        }} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>
          <Icon size={12}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></Icon>記録を追加
        </RetroBtn>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:"6px", maxHeight:"160px", overflowY:"auto", marginBottom:"12px" }}>
        {accidentLogs.length === 0 && <div style={{ fontSize:"12px", color:"#999" }}>記録なし</div>}
        {[...accidentLogs].sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(rec => (
          <div key={rec.id} style={{ border:"1px solid #e8e8e8", borderRadius:"6px", padding:"8px 10px", background:"#fff", fontSize:"12px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontWeight:700, color:"#e63946" }}>{rec.date} 【{rec.type}】</span>
              <RetroBtn small onClick={() => { if (!window.confirm("この記録を削除しますか？")) return; setForm(prev => ({ ...prev, accidentLogs: (prev.accidentLogs || []).filter(x => x.id !== rec.id) })); }} style={{ background:"#fff", color:"#e63946", borderColor:"#e63946" }}>
                <Icon size={12}><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/></Icon>
              </RetroBtn>
            </div>
            {rec.detail && <div style={{ color:"#333", marginTop:"2px" }}>内容：{rec.detail}</div>}
            {rec.result && <div style={{ color:"#555", marginTop:"2px" }}>処理：{rec.result}</div>}
          </div>
        ))}
      </div>

      <div style={{ fontSize:"12px", fontWeight:700, color:"#555", marginBottom:"6px" }}>自社内事故歴</div>
      <div style={{ border:"1px solid #e8e8e8", borderRadius:"6px", padding:"10px", background:"#fafbfc", marginBottom:"8px" }}>
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"6px 12px" }}>
          <Fl label="事故発生日"><RetroInput type="date" value={newInt.date} onChange={e=>setNewInt(v=>({...v,date:e.target.value}))}/></Fl>
          <Fl label="処理結果"><RetroInput value={newInt.result} onChange={e=>setNewInt(v=>({...v,result:e.target.value}))}/></Fl>
        </div>
        <Fl label="事故内容"><RetroTextarea value={newInt.detail} onChange={e=>setNewInt(v=>({...v,detail:e.target.value}))} style={{ minHeight:"60px" }}/></Fl>
        <RetroBtn onClick={async () => {
          if (!newInt.date) return;
          const updated = [...(form.internalLogs || []), { ...newInt, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }];
          setForm(prev => ({ ...prev, internalLogs: updated }));
          const { error } = await supabase
            .from('driver_incidents')
            .insert({
              driver_id: form.id,
              incident_type: 'internal',
              incident_date: newInt.date,
              description: newInt.detail || null,
              counterparty: null,
              amount: null,
              memo: newInt.result || null,
              tenant_id: tenantId
            });
          if (error) console.error('driver_incidents(internal) insert error:', error);
          setNewInt({ date:"", detail:"", result:"" });
        }} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>
          <Icon size={12}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></Icon>記録を追加
        </RetroBtn>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:"6px", maxHeight:"160px", overflowY:"auto" }}>
        {internalLogs.length === 0 && <div style={{ fontSize:"12px", color:"#999" }}>記録なし</div>}
        {[...internalLogs].sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(rec => (
          <div key={rec.id} style={{ border:"1px solid #e8e8e8", borderRadius:"6px", padding:"8px 10px", background:"#fff", fontSize:"12px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontWeight:700, color:"#e65100" }}>{rec.date}</span>
              <RetroBtn small onClick={() => { if (!window.confirm("この記録を削除しますか？")) return; setForm(prev => ({ ...prev, internalLogs: (prev.internalLogs || []).filter(x => x.id !== rec.id) })); }} style={{ background:"#fff", color:"#e63946", borderColor:"#e63946" }}>
                <Icon size={12}><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/></Icon>
              </RetroBtn>
            </div>
            {rec.detail && <div>内容：{rec.detail}</div>}
            {rec.result && <div>処理：{rec.result}</div>}
          </div>
        ))}
      </div>
    </>
  );
};

const DriversHealthFormTab = ({ form, setForm, isMobile }) => {
  const healthLogs = form.healthLogs || [];
  const trainingLogs = form.trainingLogs || [];
  const [newHealth, setNewHealth] = useState({ date:"", org:"", note:"" });
  const [newTraining, setNewTraining] = useState({ date:"", content:"", sign:"" });
  return (
    <>
      <div style={{ fontSize:"12px", fontWeight:700, color:"#555", marginBottom:"6px" }}>健康診断履歴</div>
      <div style={{ border:"1px solid #e8e8e8", borderRadius:"6px", padding:"10px", background:"#fafbfc", marginBottom:"8px" }}>
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"6px 12px" }}>
          <Fl label="実施日"><RetroInput type="date" value={newHealth.date} onChange={e=>setNewHealth(v=>({...v,date:e.target.value}))}/></Fl>
          <Fl label="実施医療機関"><RetroInput value={newHealth.org} onChange={e=>setNewHealth(v=>({...v,org:e.target.value}))}/></Fl>
        </div>
        <Fl label="特記事項"><RetroTextarea value={newHealth.note} onChange={e=>setNewHealth(v=>({...v,note:e.target.value}))} placeholder="高血圧・糖尿病など" style={{ minHeight:"60px" }}/></Fl>
        <RetroBtn onClick={() => {
          if (!newHealth.date) return;
          const updated = [...(form.healthLogs || []), { ...newHealth, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }];
          setForm(prev => ({ ...prev, healthLogs: updated }));
          setNewHealth({ date:"", org:"", note:"" });
        }} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>
          <Icon size={12}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></Icon>記録を追加
        </RetroBtn>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:"6px", maxHeight:"180px", overflowY:"auto", marginBottom:"12px" }}>
        {healthLogs.length === 0 && <div style={{ fontSize:"12px", color:"#999" }}>記録なし</div>}
        {[...healthLogs].sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(rec => (
          <div key={rec.id} style={{ border:"1px solid #e8e8e8", borderRadius:"6px", padding:"8px 10px", background:"#fff", fontSize:"12px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontWeight:700, color:"#007a74" }}>{rec.date} — {rec.org||"—"}</span>
              <RetroBtn small onClick={() => setForm(prev => ({ ...prev, healthLogs: (prev.healthLogs || []).filter(x => x.id !== rec.id) }))} style={{ background:"#fff", color:"#e63946", borderColor:"#e63946" }}>
                <Icon size={12}><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/></Icon>
              </RetroBtn>
            </div>
            {rec.note && <div style={{ color:"#555", marginTop:"2px" }}>特記：{rec.note}</div>}
          </div>
        ))}
      </div>

      <div style={{ fontSize:"12px", fontWeight:700, color:"#555", marginBottom:"6px" }}>初任運転者特別指導・安全教育履歴</div>
      <div style={{ border:"1px solid #e8e8e8", borderRadius:"6px", padding:"10px", background:"#fafbfc", marginBottom:"8px" }}>
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"6px 12px" }}>
          <Fl label="実施日"><RetroInput type="date" value={newTraining.date} onChange={e=>setNewTraining(v=>({...v,date:e.target.value}))}/></Fl>
          <Fl label="安全管理者署名"><RetroInput value={newTraining.sign} onChange={e=>setNewTraining(v=>({...v,sign:e.target.value}))}/></Fl>
        </div>
        <Fl label="指導内容"><RetroTextarea value={newTraining.content} onChange={e=>setNewTraining(v=>({...v,content:e.target.value}))} style={{ minHeight:"60px" }}/></Fl>
        <RetroBtn onClick={() => {
          if (!newTraining.date) return;
          const updated = [...(form.trainingLogs || []), { ...newTraining, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }];
          setForm(prev => ({ ...prev, trainingLogs: updated }));
          setNewTraining({ date:"", content:"", sign:"" });
        }} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>
          <Icon size={12}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></Icon>記録を追加
        </RetroBtn>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:"6px", maxHeight:"160px", overflowY:"auto" }}>
        {trainingLogs.length === 0 && <div style={{ fontSize:"12px", color:"#999" }}>記録なし</div>}
        {[...trainingLogs].sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(rec => (
          <div key={rec.id} style={{ border:"1px solid #e8e8e8", borderRadius:"6px", padding:"8px 10px", background:"#fff", fontSize:"12px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontWeight:700, color:"#007a74" }}>{rec.date}</span>
              <RetroBtn small onClick={() => setForm(prev => ({ ...prev, trainingLogs: (prev.trainingLogs || []).filter(x => x.id !== rec.id) }))} style={{ background:"#fff", color:"#e63946", borderColor:"#e63946" }}>
                <Icon size={12}><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/></Icon>
              </RetroBtn>
            </div>
            {rec.content && <div>内容：{rec.content}</div>}
            {rec.sign && <div>署名：{rec.sign}</div>}
          </div>
        ))}
      </div>

      {/* ===== 法定の安全教育・指導のリマインド機能 =====
          年1回の安全指導・65歳以上の適性診断＋指導・事故惹起者への特別指導は、
          それぞれ実施期限・対象者が異なるため、通知（お知らせ）画面で
          自動的に「誰に何が必要か」を判定してリマインドする。
          ここでは、その判定に使う「最後にいつ実施したか」を記録する。 */}
      <div style={{ fontSize:"12px", fontWeight:700, color:"#555", marginTop:"16px", marginBottom:"6px", borderTop:"2px solid #e8e8e8", paddingTop:"12px" }}>
        法定安全教育・指導の実施記録（リマインド対象）
      </div>
      <div style={{ border:"1px solid #e8e8e8", borderRadius:"6px", padding:"10px", background:"#fafbfc" }}>
        <Fl label="年次安全指導（全ドライバー対象・年1回）">
          <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"6px 12px" }}>
            <RetroInput type="date" value={form.lastSafetyGuidanceDate} onChange={e=>setForm(v=>({...v,lastSafetyGuidanceDate:e.target.value}))}/>
            <RetroInput value={form.lastSafetyGuidanceContent} onChange={e=>setForm(v=>({...v,lastSafetyGuidanceContent:e.target.value}))} placeholder="指導内容（任意）"/>
          </div>
        </Fl>
        <Fl label="高齢者適性診断・指導（65歳以上が対象）" style={{ marginTop:"8px" }}>
          <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"6px 12px" }}>
            <RetroInput type="date" value={form.lastElderlyDiagnosisDate} onChange={e=>setForm(v=>({...v,lastElderlyDiagnosisDate:e.target.value}))}/>
            <RetroInput value={form.lastElderlyDiagnosisOrg} onChange={e=>setForm(v=>({...v,lastElderlyDiagnosisOrg:e.target.value}))} placeholder="実施機関（任意）"/>
          </div>
        </Fl>
        <Fl label="事故惹起者特別指導（重大事故を起こした場合のみ対象）" style={{ marginTop:"8px" }}>
          <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"6px 12px" }}>
            <RetroInput type="date" value={form.lastSpecialGuidanceDate} onChange={e=>setForm(v=>({...v,lastSpecialGuidanceDate:e.target.value}))}/>
            <RetroInput value={form.lastSpecialGuidanceContent} onChange={e=>setForm(v=>({...v,lastSpecialGuidanceContent:e.target.value}))} placeholder="指導内容（任意）"/>
          </div>
        </Fl>
      </div>
    </>
  );
};

/**
 * ドライバーフォームの初期値。
 * 以前は同じ初期値オブジェクトが useState / openAdd / openEdit の3箇所に
 * コピペで重複しており、項目を1つ足すたびに3箇所すべてを直す必要があった。
 * 1箇所でも直し忘れると「新規登録では入力できるのに、編集画面では値が消える」
 * といった発見しにくいバグになるため、必ずこの関数だけを直すこと。
 */
const createEmptyDriverForm = () => ({
  name:"", furigana:"", birthdate:"", address:"", phone:"", email:"",
  contractType:"業務委託", contractStart:"", contractEnd:"",
  license:"大型", licenseNumber:"", licenseType:"", licenseAcquired:"",
  license_expiry:"", licenseCondition:"",
  licenseFrontCopy:false, licenseBackCopy:false, licenseCheckDate:"",
  diagnosisType:[], diagnosisDate:"", diagnosisOrg:"", diagnosisNote:"",
  diagnosisOriginal:false, diagnosisData:false,
  accidentHistory:false, accidentDetail:"",
  violationHistory:false, violationDetail:"",
  internalAccidentDate:"", internalAccidentDetail:"", internalAccidentResult:"",
  healthCheckDate:"", healthCheckOrg:"", healthNote:"",
  initialTrainingDate:"", initialTrainingContent:"", safetyManagerSign:"", safetyEducationHistory:"",
  // ===== 法定の安全教育・指導のリマインド機能で使う項目 =====
  // 年1回、全ドライバーに義務付けられている一般的な安全指導の実施記録。
  lastSafetyGuidanceDate:"", lastSafetyGuidanceContent:"",
  // 65歳以上のドライバーに義務付けられている適性診断・指導の実施記録。
  lastElderlyDiagnosisDate:"", lastElderlyDiagnosisOrg:"",
  // 事故（重大事故）を起こしたドライバーに義務付けられている特別な指導の実施記録。
  lastSpecialGuidanceDate:"", lastSpecialGuidanceContent:"",
  vehicleNumber:"", chassisNumber:"",
  vehicleOwnership:"会社所有", vehicleInspectionExpiry:"", liabilityInsuranceExpiry:"",
  insuranceCompany:"", insurancePolicyNumber:"", insuranceCoverage:"",
  insuranceCopySaved:false,
  status:"available", notes:"",

  // ===== ここから報酬計算・振込のための項目（第1弾で追加）=====
  // 振込先口座（⑤振込一覧・全銀CSVで使用）
  bankName:"", bankCode:"", branchName:"", branchCode:"",
  accountType:"普通", accountNumber:"", accountHolderKana:"",
  // インボイス制度（①ドライバー管理）
  invoiceRegistered:false, invoiceRegNo:"",
  // ロイヤリティ（③報酬自動計算の控除項目）
  // 「率(%)」と「固定金額」の両方に対応する。royaltyType で切り替える。
  royaltyType:"rate", royaltyRate:"", royaltyFixed:"",
  // 毎月定額で発生する控除（③報酬自動計算）
  leaseCompany:"", leaseMonthly:"", leaseStart:"", leaseEnd:"",
  insuranceMonthly:"", uniformMonthly:"", suppliesMonthly:"", otherDeductionMonthly:"", otherDeductionNote:"",
  // 緊急連絡先（①ドライバー管理）
  emergencyName:"", emergencyRelation:"", emergencyPhone:"",
});

const DriversPage = ({ data, setData, tenantId, userRole, isMobile }) => {
  const drivers = (Array.isArray(data?.drivers) ? data.drivers : []).filter(d => !d?.deleted);
  const jobTypes = Array.isArray(data?.jobTypes) ? data.jobTypes : [];
  const allCustomers = (Array.isArray(data?.customers) ? data.customers : []).filter(c => !c?.deleted);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedDriverId, setSelectedDriverId] = useState(null);
  const [activeTab, setActiveTab] = useState("basic");
  const [form, setForm] = useState(createEmptyDriverForm);
  const [newPassword, setNewPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMessage, setPwMessage] = useState("");

  const selectedDriver = drivers.find(d => d?.id === selectedDriverId) || null;

  /**
   * ハコログのログインパスワードを設定・更新する。
   *
   * driver_auth テーブルは daily_records 等と列構成が異なる専用テーブルのため、
   * TABLE_CONFIG の汎用同期には乗せず、ここで直接 supabase を読み書きする。
   * パスワードはハコログ側と同じ方式（SHA-256 + ドライバーIDのソルト）で
   * ハッシュ化してから保存する。平文のまま保存しないこと。
   */
  const setDriverPassword = async (driverId, password) => {
    if (!driverId || !password.trim()) return;
    setPwSaving(true);
    setPwMessage("");
    try {
      const hashed = await hashPassword(driverId, password);
      // 既存の認証情報があれば更新、無ければ新規作成する。
      const { data: existing, error: selErr } = await supabase
        .from("driver_auth")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("driver_id", driverId);
      if (selErr) throw selErr;

      if (existing && existing.length > 0) {
        const { error } = await supabase
          .from("driver_auth")
          .update({ password_hash: hashed })
          .eq("id", existing[0].id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("driver_auth")
          .insert({ tenant_id: tenantId, driver_id: driverId, password_hash: hashed });
        if (error) throw error;
      }
      setPwMessage("✅ パスワードを設定しました");
      setNewPassword("");
    } catch (e) {
      setPwMessage("❌ 保存に失敗しました。driver_auth テーブルの設定をご確認ください。");
    }
    setPwSaving(false);
  };

  const openAdd = () => {
    setEditingId(null);
    setForm(createEmptyDriverForm());
    setActiveTab("basic");
    setShowModal(true);
  };

  const openEdit = (driver) => {
    setEditingId(driver?.id || null);
    // 既存ドライバーに新項目がまだ無い場合でも、初期値で埋めてから上書きすることで
    // 「undefined が入力欄に渡って React が警告を出す」状態を防ぐ。
    setForm({ ...createEmptyDriverForm(), ...driver });
    setActiveTab("basic");
    setShowModal(true);
    setSelectedDriverId(null);
  };

  const saveDriver = () => {
    // 以前は氏名が空の場合に何も起きず無言で処理が止まるだけだったため、
    // ユーザーには「保存ボタンが反応しない」ように見えてしまっていた。
    // 理由を明示する。
    if (!form.name || !form.name.trim()) {
      window.alert("氏名を入力してください。");
      return;
    }
    if (editingId) {
      const before = drivers.find((d) => d?.id === editingId);
      logHistoryEntry(setData, { entityType: "driver", entityId: editingId, entityLabel: before?.name, before, userRole });
    }
    setData((d) => {
      const currentDrivers = Array.isArray(d?.drivers) ? d.drivers : [];
      if (editingId) {
        return { ...d, drivers: currentDrivers.map(driver => driver?.id === editingId ? { ...driver, ...form } : driver) };
      }
      // 以前は `D${currentDrivers.length+1}` という配列長ベースのID生成だったため、
      // 削除済みデータの扱いが将来変わった場合などにIDが重複するリスクがあった。
      // 他のマスタと同じ generateUniqueBusinessId に統一する。
      const nextId = generateUniqueBusinessId(currentDrivers, "D", "");
      return { ...d, drivers: [...currentDrivers, { id: nextId, ...form }] };
    });
    setShowModal(false);
    setEditingId(null);
  };

  const deleteDriver = (id) => {
    // 配車済み・配送中の受注に紐づいているドライバーを削除すると、
    // 配車管理画面でドライバー名が表示できなくなるため、事前に警告する。
    const activeOrders = (Array.isArray(data?.orders) ? data.orders : []).filter(
      (o) => !o?.deleted && o?.driverId === id && ["scheduled", "in_transit"].includes(o?.status)
    );
    // 定期便（車建て契約）のテンプレートがこのドライバーを参照している場合も、
    // 削除すると毎日の稼働確認画面から対象外になってしまうため、あわせて伝える。
    const activeRecurring = (Array.isArray(data?.recurringAssignments) ? data.recurringAssignments : []).filter(
      (r) => !r?.deleted && r?.active !== false && r?.driverId === id
    );
    const warnings = [];
    if (activeOrders.length > 0) warnings.push(`配車済み・配送中の受注 ${activeOrders.length}件`);
    if (activeRecurring.length > 0) warnings.push(`稼働中の定期便 ${activeRecurring.length}件`);
    const confirmMessage =
      warnings.length > 0
        ? `このドライバーは現在、${warnings.join("・")}を担当しています。削除するとそれらの画面で表示・確認ができなくなる可能性があります。本当に削除しますか？（後から復元できます）`
        : "このドライバーを削除しますか？（後から復元できます）";
    if (!window.confirm(confirmMessage)) return;
    setData((d) => ({ ...d, drivers: (Array.isArray(d?.drivers) ? d.drivers : []).map(driver => driver?.id === id ? { ...driver, deleted: true } : driver) }));
    setSelectedDriverId(null);
  };

  const driverIcon = <Icon size={14}><circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.4-3.2 4.2-4.8 7-4.8s5.6 1.6 7 4.8"/></Icon>;
  const plusIcon = <Icon size={14}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></Icon>;

  const allTabs = [
    { id:"basic", label:"①基本情報" },
    { id:"license", label:"②免許情報" },
    { id:"diagnosis", label:"③適性診断" },
    { id:"accident", label:"④事故歴" },
    { id:"health", label:"⑤健康・教育" },
    { id:"vehicle", label:"⑥車両情報" },
    { id:"routes", label:"⑦担当ルート" },
    { id:"payout", label:"⑧報酬・振込" },
    { id:"precheck", label:"⑨乗務前点検" },
    { id:"shiftreport", label:"⑫乗務日報" },
    { id:"account", label:"⑩ログイン設定" },
    { id:"history", label:"⑪変更履歴" },
  ];
  /**
   * 【重要】配車担当（dispatcher）は業務上ドライバー管理ページ自体には
   * アクセスできるが、それは配送先確認等のためであり、
   * 他人の報酬額やログインパスワードまで見せる・変更させる理由はない。
   * ページ単位の権限だけでなく、この中の機微なタブも個別に絞り込む。
   */
  const restrictedTabIds = userRole === "dispatcher" ? ["payout", "account", "history"] : [];
  const tabs = allTabs.filter((t) => !restrictedTabIds.includes(t.id));

  const TabBar = ({ value, onChange }) => (
    <div style={{ display:"flex", gap:"4px", flexWrap:"wrap", marginBottom:"12px", borderBottom:"2px solid #e8e8e8", paddingBottom:"8px" }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{
          border:"none", borderRadius:"4px 4px 0 0", padding:"6px 10px", fontSize:"11px", fontWeight:700,
          cursor:"pointer", background: value===t.id ? "#00a09a" : "#f0f2f5",
          color: value===t.id ? "#fff" : "#555",
        }}>{t.label}</button>
      ))}
    </div>
  );

  const CheckRow = ({ label, checked, onChange }) => (
    <label style={{ display:"inline-flex", alignItems:"center", gap:"6px", fontSize:"12px", cursor:"pointer", marginRight:"12px" }}>
      <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} />
      {label}
    </label>
  );

  const renderFormTab = (tab, form, setForm) => {
    if (tab === "basic") return (
      <>
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"6px 12px" }}>
          <Fl label="氏名"><RetroInput value={form.name||""} onChange={e=>setForm(v=>({...v,name:e.target.value}))}/></Fl>
          <Fl label="フリガナ"><RetroInput value={form.furigana||""} onChange={e=>setForm(v=>({...v,furigana:e.target.value}))}/></Fl>
          <Fl label="生年月日"><RetroInput type="date" value={form.birthdate||""} onChange={e=>setForm(v=>({...v,birthdate:e.target.value}))}/></Fl>
          <Fl label="電話番号"><RetroInput value={form.phone||""} onChange={e=>setForm(v=>({...v,phone:e.target.value}))}/></Fl>
        </div>
        <Fl label="住所"><RetroInput value={form.address||""} onChange={e=>setForm(v=>({...v,address:e.target.value}))}/></Fl>
        <Fl label="メールアドレス"><RetroInput value={form.email||""} onChange={e=>setForm(v=>({...v,email:e.target.value}))}/></Fl>
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap:"6px 12px" }}>
          <Fl label="契約形態">
            <RetroSelect value={form.contractType||"業務委託"} onChange={e=>setForm(v=>({...v,contractType:e.target.value}))}>
              <option value="業務委託">業務委託</option>
              <option value="正社員">正社員</option>
              <option value="パート">パート</option>
            </RetroSelect>
          </Fl>
          <Fl label="契約開始日"><RetroInput type="date" value={form.contractStart||""} onChange={e=>setForm(v=>({...v,contractStart:e.target.value}))}/></Fl>
          <Fl label="契約終了日"><RetroInput type="date" value={form.contractEnd||""} onChange={e=>setForm(v=>({...v,contractEnd:e.target.value}))}/></Fl>
        </div>
        <Fl label="状態">
          <RetroSelect value={form.status||"available"} onChange={e=>setForm(v=>({...v,status:e.target.value}))}>
            <option value="available">待機中</option>
            <option value="on_duty">稼働中</option>
            <option value="off">休暇</option>
            <option value="retired">退職済み（ログイン不可）</option>
          </RetroSelect>
        </Fl>
        <Fl label="メモ"><RetroTextarea value={form.notes||""} onChange={e=>setForm(v=>({...v,notes:e.target.value}))}/></Fl>
      </>
    );
    if (tab === "license") return (
      <>
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"6px 12px" }}>
          <Fl label="運転免許証番号"><RetroInput value={form.licenseNumber||""} onChange={e=>setForm(v=>({...v,licenseNumber:e.target.value}))}/></Fl>
          <Fl label="免許種類（大型・中型等）">
            <RetroSelect value={form.license||"大型"} onChange={e=>setForm(v=>({...v,license:e.target.value}))}>
              <option value="大型">大型</option>
              <option value="中型">中型</option>
              <option value="普通">普通</option>
            </RetroSelect>
          </Fl>
          <Fl label="免許種類（正式名称）"><RetroInput value={form.licenseType||""} placeholder="例：普通第一種運転免許" onChange={e=>setForm(v=>({...v,licenseType:e.target.value}))}/></Fl>
          <Fl label="免許取得日"><RetroInput type="date" value={form.licenseAcquired||""} onChange={e=>setForm(v=>({...v,licenseAcquired:e.target.value}))}/></Fl>
          <Fl label="有効期限（免許更新日）"><RetroInput type="date" value={form.license_expiry||""} onChange={e=>setForm(v=>({...v,license_expiry:e.target.value}))}/></Fl>
          <Fl label="免許条件"><RetroInput value={form.licenseCondition||""} placeholder="例：AT限定・眼鏡等" onChange={e=>setForm(v=>({...v,licenseCondition:e.target.value}))}/></Fl>
        </div>
        <Fl label="免許証コピー保管">
          <CheckRow label="表面保管済" checked={form.licenseFrontCopy} onChange={v=>setForm(p=>({...p,licenseFrontCopy:v}))}/>
          <CheckRow label="裏面保管済" checked={form.licenseBackCopy} onChange={v=>setForm(p=>({...p,licenseBackCopy:v}))}/>
        </Fl>
        <Fl label="最終確認日"><RetroInput type="date" value={form.licenseCheckDate||""} onChange={e=>setForm(v=>({...v,licenseCheckDate:e.target.value}))}/></Fl>
      </>
    );
    if (tab === "diagnosis") return (
      <>
        <Fl label="診断種別">
          {["初任診断","一般診断","適齢診断","事故惹起者診断"].map(t => (
            <CheckRow key={t} label={t} checked={(form.diagnosisType||[]).includes(t)}
              onChange={v => setForm(p => ({ ...p, diagnosisType: v ? [...(p.diagnosisType||[]),t] : (p.diagnosisType||[]).filter(x=>x!==t) }))}/>
          ))}
        </Fl>
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"6px 12px" }}>
          <Fl label="受診日"><RetroInput type="date" value={form.diagnosisDate||""} onChange={e=>setForm(v=>({...v,diagnosisDate:e.target.value}))}/></Fl>
          <Fl label="実施機関名"><RetroInput value={form.diagnosisOrg||""} onChange={e=>setForm(v=>({...v,diagnosisOrg:e.target.value}))}/></Fl>
        </div>
        <Fl label="診断結果・所見"><RetroTextarea value={form.diagnosisNote||""} placeholder="例：注意力低下傾向あり 等" onChange={e=>setForm(v=>({...v,diagnosisNote:e.target.value}))}/></Fl>
        <Fl label="結果票保管">
          <CheckRow label="原本保管済" checked={form.diagnosisOriginal} onChange={v=>setForm(p=>({...p,diagnosisOriginal:v}))}/>
          <CheckRow label="データ保存済" checked={form.diagnosisData} onChange={v=>setForm(p=>({...p,diagnosisData:v}))}/>
        </Fl>
      </>
    );
    if (tab === "accident") return <DriversAccidentFormTab form={form} setForm={setForm} isMobile={isMobile} tenantId={tenantId} />;
    if (tab === "health") return <DriversHealthFormTab form={form} setForm={setForm} isMobile={isMobile} />;
    if (tab === "vehicle") return (
      <>
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"6px 12px" }}>
          <Fl label="使用車両登録番号"><RetroInput value={form.vehicleNumber||""} onChange={e=>setForm(v=>({...v,vehicleNumber:e.target.value}))}/></Fl>
          <Fl label="車台番号"><RetroInput value={form.chassisNumber||""} onChange={e=>setForm(v=>({...v,chassisNumber:e.target.value}))}/></Fl>
        </div>
        <Fl label="車両所有区分">
          {["本人所有","リース","会社所有"].map(t => (
            <CheckRow key={t} label={t} checked={form.vehicleOwnership===t} onChange={v=>{ if(v) setForm(p=>({...p,vehicleOwnership:t})); }}/>
          ))}
        </Fl>
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"6px 12px" }}>
          <Fl label="車検有効期限"><RetroInput type="date" value={form.vehicleInspectionExpiry||""} onChange={e=>setForm(v=>({...v,vehicleInspectionExpiry:e.target.value}))}/></Fl>
          <Fl label="自賠責保険期限"><RetroInput type="date" value={form.liabilityInsuranceExpiry||""} onChange={e=>setForm(v=>({...v,liabilityInsuranceExpiry:e.target.value}))}/></Fl>
          <Fl label="任意保険会社"><RetroInput value={form.insuranceCompany||""} onChange={e=>setForm(v=>({...v,insuranceCompany:e.target.value}))}/></Fl>
          <Fl label="任意保険証券番号"><RetroInput value={form.insurancePolicyNumber||""} onChange={e=>setForm(v=>({...v,insurancePolicyNumber:e.target.value}))}/></Fl>
        </div>
        <Fl label="対人・対物補償額"><RetroInput value={form.insuranceCoverage||""} onChange={e=>setForm(v=>({...v,insuranceCoverage:e.target.value}))}/></Fl>
        <Fl label="保険証コピー">
          <CheckRow label="保管済" checked={form.insuranceCopySaved} onChange={v=>setForm(p=>({...p,insuranceCopySaved:v}))}/>
        </Fl>
      </>
    );
    if (tab === "routes") {
      const dekaStyles = ["100以下","140","160","180","200","220","240","260"];
      const routes = form.routes || [];

      const addRoute = () => {
        // Date.now() だけだとミリ秒単位のため、理論上は同じミリ秒内に複数回呼ばれると
        // IDが重複する可能性がある。Reactの状態更新がキューイングされるため実害は
        // 起きにくいが、念のためランダムな文字列を付加して衝突をより確実に避ける。
        setForm(f => ({ ...f, routes: [...(f.routes||[]), {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          customerId: "",
          jobTypeId: "",
          unitPrice: "",
          driverUnitPrice: "",
          dekaRates: dekaStyles.map(s => ({ size: s, unitPrice: "", driverUnitPrice: "" })),
          note: "",
        }]}));
      };

      const removeRoute = (id) => {
        setForm(f => ({ ...f, routes: (f.routes||[]).filter(r => r.id !== id) }));
      };

      const updateRoute = (id, key, value) => {
        setForm(f => ({ ...f, routes: (f.routes||[]).map(r => r.id === id ? { ...r, [key]: value } : r) }));
      };

      const updateDekaRate = (routeId, size, key, value) => {
        setForm(f => ({ ...f, routes: (f.routes||[]).map(r => {
          if (r.id !== routeId) return r;
          const dekaRates = (r.dekaRates || dekaStyles.map(s => ({ size: s, unitPrice: "", driverUnitPrice: "" }))).map(dr =>
            dr.size === size ? { ...dr, [key]: value } : dr
          );
          return { ...r, dekaRates };
        })}));
      };

      return (
        <>
          <div style={{ fontSize:"12px", color:"#666", marginBottom:"10px" }}>
            このドライバーがよく担当する顧客・仕事種別・単価を登録しておくと、日次入力時に自動入力されます。
          </div>
          {routes.map((route, idx) => {
            const selectedJobType = jobTypes.find(j => j?.id === route.jobTypeId);
            const isDeka = selectedJobType?.name === "デカ宅";
            return (
              <div key={route.id} style={{ border:"1px solid #e8e8e8", borderRadius:"6px", padding:"12px", marginBottom:"10px", background:"#fafbfc" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"8px" }}>
                  <span style={{ fontSize:"12px", fontWeight:700, color:"#007a74" }}>ルート {idx+1}</span>
                  <RetroBtn small onClick={()=>removeRoute(route.id)} style={{ background:"#fff", color:"#e63946", borderColor:"#e63946" }}>削除</RetroBtn>
                </div>
                <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"6px 12px" }}>
                  <Fl label="顧客">
                    <RetroSelect value={route.customerId} onChange={e=>updateRoute(route.id,"customerId",e.target.value)}>
                      <option value="">選択</option>
                      {allCustomers.map(c=><option key={c?.id} value={c?.id}>{c?.name}</option>)}
                    </RetroSelect>
                  </Fl>
                  <Fl label="仕事種別">
                    <RetroSelect value={route.jobTypeId} onChange={e=>updateRoute(route.id,"jobTypeId",e.target.value)}>
                      <option value="">選択</option>
                      {jobTypes.map(j=><option key={j?.id} value={j?.id}>{j?.name}</option>)}
                    </RetroSelect>
                  </Fl>
                </div>
                {!isDeka && (
                  <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"6px 12px" }}>
                    <Fl label="売上単価（円）"><RetroInput type="number" min="0" value={route.unitPrice} onChange={e=>updateRoute(route.id,"unitPrice",e.target.value)} placeholder="例：180"/></Fl>
                    <Fl label="支払単価（円）"><RetroInput type="number" min="0" value={route.driverUnitPrice} onChange={e=>updateRoute(route.id,"driverUnitPrice",e.target.value)} placeholder="例：150"/></Fl>
                  </div>
                )}
                {isDeka && (
                  <div style={{ marginTop:"8px" }}>
                    <div style={{ fontSize:"11px", fontWeight:700, color:"#555", marginBottom:"6px" }}>サイズ別単価設定</div>
                    <div style={{ border:"1px solid #e8e8e8", borderRadius:"6px", overflow:"auto" }}>
                      <table style={{ minWidth:"100%", width:"max-content", borderCollapse:"collapse", fontSize:"12px" }}>
                        <thead>
                          <tr style={{ background:"#f0f2f5" }}>
                            <th style={{ padding:"6px 10px", textAlign:"left", fontWeight:700, color:"#555", borderBottom:"1px solid #e8e8e8" }}>サイズ</th>
                            <th style={{ padding:"6px 10px", textAlign:"center", fontWeight:700, color:"#555", borderBottom:"1px solid #e8e8e8" }}>売上単価（円）</th>
                            <th style={{ padding:"6px 10px", textAlign:"center", fontWeight:700, color:"#555", borderBottom:"1px solid #e8e8e8" }}>支払単価（円）</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(route.dekaRates || dekaStyles.map(s=>({size:s,unitPrice:"",driverUnitPrice:""}))).map(dr => (
                            <tr key={dr.size} style={{ borderBottom:"1px solid #f0f0f0" }}>
                              <td style={{ padding:"6px 10px", fontWeight:700, color:"#007a74" }}>{dr.size}</td>
                              <td style={{ padding:"4px 8px" }}>
                                <RetroInput type="number" min="0" value={dr.unitPrice} onChange={e=>updateDekaRate(route.id,dr.size,"unitPrice",e.target.value)} placeholder="例：300"/>
                              </td>
                              <td style={{ padding:"4px 8px" }}>
                                <RetroInput type="number" min="0" value={dr.driverUnitPrice} onChange={e=>updateDekaRate(route.id,dr.size,"driverUnitPrice",e.target.value)} placeholder="例：250"/>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                <Fl label="メモ" style={{ marginTop:"8px" }}><RetroInput value={route.note} onChange={e=>updateRoute(route.id,"note",e.target.value)} placeholder="例：午前便、週3回など"/></Fl>
              </div>
            );
          })}
          <RetroBtn onClick={addRoute} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>
            <Icon size={12}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></Icon>ルートを追加
          </RetroBtn>
        </>
      );
    }
    if (tab === "payout") {
      // 数字のみを許可する入力（銀行コード・支店コード・口座番号）。
      // 全角数字やハイフンが混ざると全銀フォーマットで弾かれるため、入力時点で除去する。
      const onlyDigits = (v) => String(v ?? "").normalize("NFKC").replace(/[^0-9]/g, "");
      // 金額系の入力（負の値は控除の意味が壊れるため許可しない）
      const onlyMoney = (v) => String(v ?? "").normalize("NFKC").replace(/[^0-9]/g, "");
      const sectionTitle = (t) => (
        <div style={{ fontSize:"12px", fontWeight:700, color:"#007a74", margin:"14px 0 6px", paddingBottom:"4px", borderBottom:"1px solid #e8e8e8" }}>{t}</div>
      );

      return (
        <>
          {sectionTitle("振込先口座（振込一覧・全銀CSVで使用）")}
          <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"6px 12px" }}>
            <Fl label="銀行名"><RetroInput value={form.bankName||""} onChange={e=>setForm(v=>({...v,bankName:e.target.value}))} placeholder="例：三井住友銀行"/></Fl>
            <Fl label="銀行コード（4桁）"><RetroInput value={form.bankCode||""} onChange={e=>setForm(v=>({...v,bankCode:onlyDigits(e.target.value).slice(0,4)}))} placeholder="0009"/></Fl>
            <Fl label="支店名"><RetroInput value={form.branchName||""} onChange={e=>setForm(v=>({...v,branchName:e.target.value}))} placeholder="例：梅田支店"/></Fl>
            <Fl label="支店コード（3桁）"><RetroInput value={form.branchCode||""} onChange={e=>setForm(v=>({...v,branchCode:onlyDigits(e.target.value).slice(0,3)}))} placeholder="123"/></Fl>
            <Fl label="預金種目">
              <RetroSelect value={form.accountType||"普通"} onChange={e=>setForm(v=>({...v,accountType:e.target.value}))}>
                <option value="普通">普通</option>
                <option value="当座">当座</option>
                <option value="貯蓄">貯蓄</option>
              </RetroSelect>
            </Fl>
            <Fl label="口座番号（7桁）"><RetroInput value={form.accountNumber||""} onChange={e=>setForm(v=>({...v,accountNumber:onlyDigits(e.target.value).slice(0,7)}))} placeholder="1234567"/></Fl>
          </div>
          <Fl label="口座名義（カナ）">
            <RetroInput
              value={form.accountHolderKana||""}
              onChange={e=>setForm(v=>({...v,accountHolderKana:normalizePayerKana(e.target.value)}))}
              placeholder="ヤマダ タロウ"
            />
            {/* 名義に漢字やひらがなが入っていると全銀CSVが銀行で弾かれ、
                「給料が振り込めない」という最悪の事態になる。入力中に警告する。 */}
            {(() => {
              const warn = validateBankKana(form.accountHolderKana);
              if (!warn) return null;
              return (
                <div style={{ marginTop:"4px", fontSize:"11px", color:"#e65100", fontWeight:600 }}>
                  ⚠ {warn}
                </div>
              );
            })()}
          </Fl>

          {sectionTitle("インボイス制度")}
          <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"6px 12px", alignItems:"end" }}>
            <div style={{ paddingBottom:"6px" }}>
              <CheckRow
                label="適格請求書発行事業者（インボイス登録済）"
                checked={form.invoiceRegistered}
                onChange={c=>setForm(v=>({...v,invoiceRegistered:c}))}
              />
            </div>
            <Fl label="登録番号（T + 13桁）">
              <RetroInput
                value={form.invoiceRegNo||""}
                onChange={e=>setForm(v=>({...v,invoiceRegNo:e.target.value}))}
                placeholder="T1234567890123"
                disabled={!form.invoiceRegistered}
              />
            </Fl>
          </div>

          {sectionTitle("ロイヤリティ（報酬からの控除）")}
          <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"6px 12px" }}>
            <Fl label="計算方法">
              <RetroSelect value={form.royaltyType||"rate"} onChange={e=>setForm(v=>({...v,royaltyType:e.target.value}))}>
                <option value="rate">売上に対する率（％）</option>
                <option value="fixed">固定金額（円／月）</option>
                <option value="none">なし</option>
              </RetroSelect>
            </Fl>
            {form.royaltyType === "fixed" ? (
              <Fl label="ロイヤリティ（円／月）">
                <RetroInput value={form.royaltyFixed||""} onChange={e=>setForm(v=>({...v,royaltyFixed:onlyMoney(e.target.value)}))} placeholder="30000"/>
              </Fl>
            ) : form.royaltyType === "none" ? (
              <div/>
            ) : (
              <Fl label="ロイヤリティ率（％）">
                <RetroInput
                  value={form.royaltyRate||""}
                  onChange={e=>{
                    // 小数第1位まで許可（例: 12.5%）。100%超は入力ミスの可能性が高いので防ぐ。
                    const raw = String(e.target.value).normalize("NFKC").replace(/[^0-9.]/g, "");
                    const num = Number(raw);
                    if (raw !== "" && (Number.isNaN(num) || num > 100)) return;
                    setForm(v=>({...v,royaltyRate:raw}));
                  }}
                  placeholder="10"
                />
              </Fl>
            )}
          </div>

          {sectionTitle("毎月の定額控除")}
          <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"6px 12px" }}>
            <Fl label="リース会社"><RetroInput value={form.leaseCompany||""} onChange={e=>setForm(v=>({...v,leaseCompany:e.target.value}))} placeholder="例：〇〇リース株式会社"/></Fl>
            <Fl label="車両リース料（円／月）"><RetroInput value={form.leaseMonthly||""} onChange={e=>setForm(v=>({...v,leaseMonthly:onlyMoney(e.target.value)}))} placeholder="50000"/></Fl>
            <Fl label="リース契約開始"><RetroInput type="date" value={form.leaseStart||""} onChange={e=>setForm(v=>({...v,leaseStart:e.target.value}))}/></Fl>
            <Fl label="リース契約終了"><RetroInput type="date" value={form.leaseEnd||""} onChange={e=>setForm(v=>({...v,leaseEnd:e.target.value}))}/></Fl>
            <Fl label="保険料（円／月）"><RetroInput value={form.insuranceMonthly||""} onChange={e=>setForm(v=>({...v,insuranceMonthly:onlyMoney(e.target.value)}))} placeholder="8000"/></Fl>
            <Fl label="制服代（円／月）"><RetroInput value={form.uniformMonthly||""} onChange={e=>setForm(v=>({...v,uniformMonthly:onlyMoney(e.target.value)}))} placeholder="0"/></Fl>
            <Fl label="備品代（円／月）"><RetroInput value={form.suppliesMonthly||""} onChange={e=>setForm(v=>({...v,suppliesMonthly:onlyMoney(e.target.value)}))} placeholder="0"/></Fl>
            <Fl label="その他控除（円／月）"><RetroInput value={form.otherDeductionMonthly||""} onChange={e=>setForm(v=>({...v,otherDeductionMonthly:onlyMoney(e.target.value)}))} placeholder="0"/></Fl>
          </div>
          <Fl label="その他控除の内容"><RetroInput value={form.otherDeductionNote||""} onChange={e=>setForm(v=>({...v,otherDeductionNote:e.target.value}))} placeholder="例：駐車場代"/></Fl>

          {sectionTitle("緊急連絡先")}
          <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap:"6px 12px" }}>
            <Fl label="氏名"><RetroInput value={form.emergencyName||""} onChange={e=>setForm(v=>({...v,emergencyName:e.target.value}))}/></Fl>
            <Fl label="続柄"><RetroInput value={form.emergencyRelation||""} onChange={e=>setForm(v=>({...v,emergencyRelation:e.target.value}))} placeholder="例：配偶者"/></Fl>
            <Fl label="電話番号"><RetroInput value={form.emergencyPhone||""} onChange={e=>setForm(v=>({...v,emergencyPhone:e.target.value}))}/></Fl>
          </div>
        </>
      );
    }
    return null;
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ fontSize:"14px", fontWeight:700, color:"#222" }}>運転者台帳</div>
        <RetroBtn onClick={openAdd} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>{plusIcon}ドライバー追加</RetroBtn>
      </div>
      <div style={{ border:cardBorder, borderRadius:"6px", background:"#fff", overflow:"auto", maxHeight: isMobile ? "60vh" : "calc(100vh - 260px)" }}>
        <table style={{ minWidth:"100%", width:"max-content", borderCollapse:"collapse", fontFamily:"'Noto Sans JP', sans-serif", fontSize:"12px" }}>
          <thead>
            <tr style={{ background:"#fafbfc", position:"sticky", top:0 }}>
              {["ID","氏名","免許種別","有効期限","電話","状態","操作"].map(h => (
                <th key={h} style={{ color:"#666", fontSize:"11px", padding:"8px 10px", textAlign:"left", fontWeight:700, whiteSpace:"nowrap", borderBottom:cardBorder }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {drivers.map((driver) => (
              <tr key={driver?.id} style={{ background:"#fff", borderBottom:"1px solid #f0f0f0" }}
                onMouseEnter={e=>e.currentTarget.style.background="#f9fcfc"}
                onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
                <td style={{ padding:"8px 10px" }}>
                  <span style={{ color:"#007a74", fontWeight:700, cursor:"pointer", textDecoration:"underline" }}
                    onClick={()=>setSelectedDriverId(driver?.id)}>{driver?.id||"—"}</span>
                </td>
                <td style={{ padding:"8px 10px" }}>
                  <span style={{ color:"#007a74", fontWeight:700, cursor:"pointer", textDecoration:"underline" }}
                    onClick={()=>setSelectedDriverId(driver?.id)}>{driver?.name||""}</span>
                </td>
                <td style={{ padding:"8px 10px" }}>{driver?.license||""}</td>
                <td style={{ padding:"8px 10px" }}>{driver?.license_expiry||"未設定"}</td>
                <td style={{ padding:"8px 10px" }}>{driver?.phone||""}</td>
                <td style={{ padding:"8px 10px" }}><StatusPill s={driver?.status}/></td>
                <td style={{ padding:"8px 10px" }}>
                  <div style={{ display:"flex", gap:"4px" }}>
                    <RetroBtn small onClick={()=>openEdit(driver)} style={{ background:"#fff", color:"#00a09a", borderColor:"#00a09a" }}>編集</RetroBtn>
                    <RetroBtn small onClick={()=>deleteDriver(driver?.id)} style={{ background:"#fff", color:"#e63946", borderColor:"#e63946" }}>削除</RetroBtn>
                  </div>
                </td>
              </tr>
            ))}
            {drivers.length===0&&<tr><td colSpan={7} style={{ padding:"16px", textAlign:"center", color:"#999" }}>データなし</td></tr>}
          </tbody>
        </table>
      </div>

      {selectedDriver && (
        <Modal title={`運転者台帳 ${selectedDriver?.id||""} ${selectedDriver?.name||""}`} icon={driverIcon} onClose={()=>setSelectedDriverId(null)} width={680}>
          <TabBar value={activeTab} onChange={setActiveTab}/>
          <div style={{ minHeight:"300px" }}>
            {activeTab==="basic" && (
              <div style={{ display:"grid", gridTemplateColumns:"120px 1fr", rowGap:"6px", columnGap:"8px", fontSize:"12px", color:"#333" }}>
                <div style={{ color:"#888" }}>氏名</div><div>{selectedDriver?.name||"—"}</div>
                <div style={{ color:"#888" }}>フリガナ</div><div>{selectedDriver?.furigana||"—"}</div>
                <div style={{ color:"#888" }}>生年月日</div><div>{selectedDriver?.birthdate||"—"}</div>
                <div style={{ color:"#888" }}>住所</div><div>{selectedDriver?.address||"—"}</div>
                <div style={{ color:"#888" }}>電話番号</div><div>{selectedDriver?.phone||"—"}</div>
                <div style={{ color:"#888" }}>メール</div><div>{selectedDriver?.email||"—"}</div>
                <div style={{ color:"#888" }}>契約形態</div><div>{selectedDriver?.contractType||"—"}</div>
                <div style={{ color:"#888" }}>契約開始日</div><div>{selectedDriver?.contractStart||"—"}</div>
                <div style={{ color:"#888" }}>契約終了日</div><div>{selectedDriver?.contractEnd||"—"}</div>
                <div style={{ color:"#888" }}>状態</div><div><StatusPill s={selectedDriver?.status}/></div>
                <div style={{ color:"#888" }}>メモ</div><div>{selectedDriver?.notes||"—"}</div>
              </div>
            )}
            {activeTab==="license" && (
              <div style={{ display:"grid", gridTemplateColumns:"140px 1fr", rowGap:"6px", columnGap:"8px", fontSize:"12px", color:"#333" }}>
                <div style={{ color:"#888" }}>免許証番号</div><div>{selectedDriver?.licenseNumber||"—"}</div>
                <div style={{ color:"#888" }}>免許種類</div><div>{selectedDriver?.license||"—"}</div>
                <div style={{ color:"#888" }}>正式名称</div><div>{selectedDriver?.licenseType||"—"}</div>
                <div style={{ color:"#888" }}>取得日</div><div>{selectedDriver?.licenseAcquired||"—"}</div>
                <div style={{ color:"#888" }}>有効期限</div><div>{selectedDriver?.license_expiry||"—"}</div>
                <div style={{ color:"#888" }}>免許条件</div><div>{selectedDriver?.licenseCondition||"—"}</div>
                <div style={{ color:"#888" }}>コピー保管</div><div>{[selectedDriver?.licenseFrontCopy&&"表面",selectedDriver?.licenseBackCopy&&"裏面"].filter(Boolean).join("・")||"—"}</div>
                <div style={{ color:"#888" }}>最終確認日</div><div>{selectedDriver?.licenseCheckDate||"—"}</div>
              </div>
            )}
            {activeTab==="diagnosis" && (
              <div style={{ display:"grid", gridTemplateColumns:"140px 1fr", rowGap:"6px", columnGap:"8px", fontSize:"12px", color:"#333" }}>
                <div style={{ color:"#888" }}>診断種別</div><div>{(selectedDriver?.diagnosisType||[]).join("・")||"—"}</div>
                <div style={{ color:"#888" }}>受診日</div><div>{selectedDriver?.diagnosisDate||"—"}</div>
                <div style={{ color:"#888" }}>実施機関</div><div>{selectedDriver?.diagnosisOrg||"—"}</div>
                <div style={{ color:"#888" }}>診断結果</div><div>{selectedDriver?.diagnosisNote||"—"}</div>
                <div style={{ color:"#888" }}>結果票保管</div><div>{[selectedDriver?.diagnosisOriginal&&"原本",selectedDriver?.diagnosisData&&"データ"].filter(Boolean).join("・")||"—"}</div>
              </div>
            )}
            {activeTab==="accident" && (
              <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
                <div style={{ fontSize:"12px", fontWeight:700, color:"#555" }}>重大事故・行政処分歴</div>
                {(selectedDriver?.accidentLogs||[]).length===0 && <div style={{ fontSize:"12px", color:"#999" }}>記録なし</div>}
                {[...(selectedDriver?.accidentLogs||[])].sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(rec=>(
                  <div key={rec.id} style={{ border:"1px solid #e8e8e8", borderRadius:"6px", padding:"8px 10px", background:"#fff", fontSize:"12px" }}>
                    <div style={{ fontWeight:700, color:"#e63946" }}>{rec.date} 【{rec.type}】</div>
                    {rec.detail && <div>内容：{rec.detail}</div>}
                    {rec.result && <div>処理：{rec.result}</div>}
                  </div>
                ))}
                <div style={{ fontSize:"12px", fontWeight:700, color:"#555", marginTop:"8px" }}>自社内事故歴</div>
                {(selectedDriver?.internalLogs||[]).length===0 && <div style={{ fontSize:"12px", color:"#999" }}>記録なし</div>}
                {[...(selectedDriver?.internalLogs||[])].sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(rec=>(
                  <div key={rec.id} style={{ border:"1px solid #e8e8e8", borderRadius:"6px", padding:"8px 10px", background:"#fff", fontSize:"12px" }}>
                    <div style={{ fontWeight:700, color:"#e65100" }}>{rec.date}</div>
                    {rec.detail && <div>内容：{rec.detail}</div>}
                    {rec.result && <div>処理：{rec.result}</div>}
                  </div>
                ))}
              </div>
            )}
            {activeTab==="health" && (
              <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
                <div style={{ fontSize:"12px", fontWeight:700, color:"#555" }}>健康診断履歴</div>
                {(selectedDriver?.healthLogs||[]).length===0 && <div style={{ fontSize:"12px", color:"#999" }}>記録なし</div>}
                {[...(selectedDriver?.healthLogs||[])].sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(rec=>(
                  <div key={rec.id} style={{ border:"1px solid #e8e8e8", borderRadius:"6px", padding:"8px 10px", background:"#fff", fontSize:"12px" }}>
                    <div style={{ fontWeight:700, color:"#007a74" }}>{rec.date} — {rec.org||"—"}</div>
                    {rec.note && <div>特記：{rec.note}</div>}
                  </div>
                ))}
                <div style={{ fontSize:"12px", fontWeight:700, color:"#555", marginTop:"8px" }}>指導・教育履歴</div>
                {(selectedDriver?.trainingLogs||[]).length===0 && <div style={{ fontSize:"12px", color:"#999" }}>記録なし</div>}
                {[...(selectedDriver?.trainingLogs||[])].sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(rec=>(
                  <div key={rec.id} style={{ border:"1px solid #e8e8e8", borderRadius:"6px", padding:"8px 10px", background:"#fff", fontSize:"12px" }}>
                    <div style={{ fontWeight:700, color:"#007a74" }}>{rec.date}</div>
                    {rec.content && <div>内容：{rec.content}</div>}
                    {rec.sign && <div>署名：{rec.sign}</div>}
                  </div>
                ))}
              </div>
            )}
            {activeTab==="vehicle" && (
              <div style={{ display:"grid", gridTemplateColumns:"140px 1fr", rowGap:"6px", columnGap:"8px", fontSize:"12px", color:"#333" }}>
                <div style={{ color:"#888" }}>車両登録番号</div><div>{selectedDriver?.vehicleNumber||"—"}</div>
                <div style={{ color:"#888" }}>車台番号</div><div>{selectedDriver?.chassisNumber||"—"}</div>
                <div style={{ color:"#888" }}>所有区分</div><div>{selectedDriver?.vehicleOwnership||"—"}</div>
                <div style={{ color:"#888" }}>車検有効期限</div><div>{selectedDriver?.vehicleInspectionExpiry||"—"}</div>
                <div style={{ color:"#888" }}>自賠責期限</div><div>{selectedDriver?.liabilityInsuranceExpiry||"—"}</div>
                <div style={{ color:"#888" }}>任意保険会社</div><div>{selectedDriver?.insuranceCompany||"—"}</div>
                <div style={{ color:"#888" }}>証券番号</div><div>{selectedDriver?.insurancePolicyNumber||"—"}</div>
                <div style={{ color:"#888" }}>補償額</div><div>{selectedDriver?.insuranceCoverage||"—"}</div>
                <div style={{ color:"#888" }}>保険証コピー</div><div>{selectedDriver?.insuranceCopySaved?"保管済":"—"}</div>
              </div>
            )}
            {activeTab==="routes" && (
              <div style={{ display:"flex", flexDirection:"column", gap:"6px" }}>
                {(selectedDriver?.routes||[]).length === 0 && <div style={{ fontSize:"12px", color:"#999" }}>担当ルート未登録</div>}
                {(selectedDriver?.routes||[]).map((route, idx) => {
                  const customers = (Array.isArray(data?.customers) ? data.customers : []).filter(c=>!c?.deleted);
                  const jobTypes = Array.isArray(data?.jobTypes) ? data.jobTypes : [];
                  const customer = customers.find(c=>c?.id===route?.customerId);
                  const jt = jobTypes.find(j=>j?.id===route?.jobTypeId);
                  return (
                    <div key={idx} style={{ border:"1px solid #e8e8e8", borderRadius:"6px", padding:"10px", background:"#fff", fontSize:"12px" }}>
                      <div style={{ fontWeight:700, color:"#007a74", marginBottom:"4px" }}>ルート {idx+1} {route?.note ? `— ${route.note}` : ""}</div>
                      <div>顧客：{customer?.name||"—"} / 仕事種別：{jt?.name||"—"}</div>
                      <div>売上単価：¥{Number(route?.unitPrice||0).toLocaleString()} / 支払単価：¥{Number(route?.driverUnitPrice||0).toLocaleString()}</div>
                    </div>
                  );
                })}
              </div>
            )}
            {activeTab==="payout" && !restrictedTabIds.includes("payout") && (() => {
              const d = selectedDriver;
              const yen = (v) => `¥${(Number(v)||0).toLocaleString()}`;
              const royaltyLabel =
                d?.royaltyType === "fixed" ? `固定 ${yen(d?.royaltyFixed)}／月`
                : d?.royaltyType === "none" ? "なし"
                : (d?.royaltyRate ? `売上の ${d.royaltyRate}％` : "—");
              // 毎月かならず発生する定額控除の合計（ロイヤリティは売上依存なのでここには含めない）
              const fixedDeductionTotal =
                (Number(d?.leaseMonthly)||0) + (Number(d?.insuranceMonthly)||0) +
                (Number(d?.uniformMonthly)||0) + (Number(d?.suppliesMonthly)||0) +
                (Number(d?.otherDeductionMonthly)||0);
              const hasBank = d?.bankName || d?.accountNumber;
              const row = (k, v) => (<><div style={{ color:"#888" }}>{k}</div><div>{v || "—"}</div></>);
              return (
                <div style={{ fontSize:"12px" }}>
                  {!hasBank && (
                    <div style={{ background:"#fff4e5", border:"1px solid #ffb74d", borderRadius:"6px", padding:"8px 10px", marginBottom:"10px", color:"#e65100" }}>
                      振込先口座が未登録です。振込一覧・報酬明細を出すには「編集」から登録してください。
                    </div>
                  )}
                  <div style={{ fontWeight:700, color:"#007a74", marginBottom:"6px" }}>振込先口座</div>
                  <div style={{ display:"grid", gridTemplateColumns:"140px 1fr", rowGap:"6px", columnGap:"8px", marginBottom:"12px" }}>
                    {row("銀行", d?.bankName ? `${d.bankName}${d?.bankCode ? `（${d.bankCode}）` : ""}` : "")}
                    {row("支店", d?.branchName ? `${d.branchName}${d?.branchCode ? `（${d.branchCode}）` : ""}` : "")}
                    {row("預金種目", d?.accountType)}
                    {row("口座番号", d?.accountNumber)}
                    {row("口座名義", d?.accountHolderKana)}
                  </div>
                  <div style={{ fontWeight:700, color:"#007a74", marginBottom:"6px" }}>インボイス</div>
                  <div style={{ display:"grid", gridTemplateColumns:"140px 1fr", rowGap:"6px", columnGap:"8px", marginBottom:"12px" }}>
                    {row("登録状況", d?.invoiceRegistered ? "登録済" : "未登録")}
                    {row("登録番号", d?.invoiceRegNo)}
                  </div>
                  <div style={{ fontWeight:700, color:"#007a74", marginBottom:"6px" }}>控除</div>
                  <div style={{ display:"grid", gridTemplateColumns:"140px 1fr", rowGap:"6px", columnGap:"8px" }}>
                    {row("ロイヤリティ", royaltyLabel)}
                    {row("車両リース", d?.leaseMonthly ? `${yen(d.leaseMonthly)}／月${d?.leaseCompany ? `（${d.leaseCompany}）` : ""}` : "")}
                    {row("リース期間", d?.leaseStart || d?.leaseEnd ? `${d?.leaseStart||"—"} 〜 ${d?.leaseEnd||"—"}` : "")}
                    {row("保険料", d?.insuranceMonthly ? `${yen(d.insuranceMonthly)}／月` : "")}
                    {row("制服代", d?.uniformMonthly ? `${yen(d.uniformMonthly)}／月` : "")}
                    {row("備品代", d?.suppliesMonthly ? `${yen(d.suppliesMonthly)}／月` : "")}
                    {row("その他控除", d?.otherDeductionMonthly ? `${yen(d.otherDeductionMonthly)}／月${d?.otherDeductionNote ? `（${d.otherDeductionNote}）` : ""}` : "")}
                  </div>
                  <div style={{ marginTop:"10px", padding:"8px 10px", background:"#f0fbfa", border:"1px solid #b2dfdb", borderRadius:"6px", display:"flex", justifyContent:"space-between", fontWeight:700 }}>
                    <span style={{ color:"#00695c" }}>定額控除の合計（毎月）</span>
                    <span style={{ color:"#00695c" }}>{yen(fixedDeductionTotal)}</span>
                  </div>
                  <div style={{ marginTop:"6px", color:"#888", fontSize:"11px" }}>
                    ※ロイヤリティは売上に応じて変動するため、この合計には含まれていません。
                  </div>
                  <div style={{ fontWeight:700, color:"#007a74", margin:"14px 0 6px" }}>緊急連絡先</div>
                  <div style={{ display:"grid", gridTemplateColumns:"140px 1fr", rowGap:"6px", columnGap:"8px" }}>
                    {row("氏名", d?.emergencyName)}
                    {row("続柄", d?.emergencyRelation)}
                    {row("電話番号", d?.emergencyPhone)}
                  </div>
                </div>
              );
            })()}
            {activeTab==="precheck" && (() => {
              // 貨物軽自動車運送事業のため記録の保存義務はないが、
              // ドライバーが任意で実施した場合は参考情報として閲覧できるようにする。
              const recs = (Array.isArray(data?.precheckRecords) ? data.precheckRecords : [])
                .filter(r => r?.driverId === selectedDriver?.id)
                .sort((a, b) => String(b?.checkedAt || "").localeCompare(String(a?.checkedAt || "")))
                .slice(0, 30);
              const itemLabel = { health: "飲酒・健康状態確認", appearance: "身だしなみ", vehicle: "車両点検" };
              return (
                <div style={{ fontSize: "12px" }}>
                  <div style={{ background: "#f0f2f5", border: "1px solid #dde1e6", borderRadius: "6px", padding: "8px 10px", marginBottom: "10px", color: "#666" }}>
                    貨物軽自動車運送事業のため記録保存の義務はありません。ドライバーが任意で実施した記録のみ表示しています。
                  </div>
                  {recs.length === 0 ? (
                    <div style={{ color: "#999", padding: "20px 0", textAlign: "center" }}>記録はありません</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {recs.map((r, i) => {
                        // 健康チェックの「不良」項目（飲酒・残酒はない、が不良ならアルコール確認あり）
                        const hc = r?.healthCheck;
                        const badHealthItems = hc ? (hc.items || []).filter(x => x.value === "bad") : [];
                        const alcoholFlag = badHealthItems.some(x => x.label === "飲酒・残酒はない");
                        // 車両点検の詳細から「修理対応」フラグの項目だけを抜き出す
                        const vc = r?.vehicleCheck;
                        const repairItems = vc
                          ? [...(vc.required || []), ...(vc.optional || [])].filter(x => x.value === "repair")
                          : [];
                        const prevRepair = vc?.prevAbnormal === "repair";
                        return (
                          <div key={r?.id || i} style={{ border: "1px solid #e8e8e8", borderRadius: "6px", padding: "8px 10px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                              <span style={{ fontWeight: 700 }}>{String(r?.checkedAt || "").slice(0, 16).replace("T", " ")}</span>
                              <span style={{ fontWeight: 700, color: alcoholFlag ? "#c62828" : "#00695c" }}>
                                {alcoholFlag ? "🚫 アルコール確認あり" : "✓ アルコールなし"}
                              </span>
                            </div>
                            <div style={{ color: "#666" }}>
                              {Object.entries(r?.items || {}).filter(([, v]) => v).map(([k]) => itemLabel[k] || k).join("・") || "（項目未選択）"}
                            </div>
                            {(repairItems.length > 0 || prevRepair) && (
                              <div style={{ marginTop: "6px", background: "#ffebee", border: "1px solid #e57373", borderRadius: "4px", padding: "6px 8px" }}>
                                <div style={{ fontWeight: 700, color: "#c62828", marginBottom: "2px" }}>⚠ 修理対応の項目があります</div>
                                {repairItems.map((x, j) => <div key={j} style={{ color: "#c62828" }}>・{x.label}</div>)}
                                {prevRepair && <div style={{ color: "#c62828" }}>・前回指摘箇所（未解消）{vc?.prevNote ? `：${vc.prevNote}` : ""}</div>}
                              </div>
                            )}
                            {badHealthItems.filter(x => x.label !== "飲酒・残酒はない").length > 0 && (
                              <div style={{ marginTop: "6px", background: "#fff4e5", border: "1px solid #ffb74d", borderRadius: "4px", padding: "6px 8px" }}>
                                <div style={{ fontWeight: 700, color: "#e65100", marginBottom: "2px" }}>⚠ 健康状態で「不良」の項目があります</div>
                                {badHealthItems.filter(x => x.label !== "飲酒・残酒はない").map((x, j) => <div key={j} style={{ color: "#e65100" }}>・{x.label}</div>)}
                              </div>
                            )}
                            {r?.note && <div style={{ color: "#999", marginTop: "2px" }}>メモ：{r.note}</div>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
            {activeTab==="shiftreport" && (() => {
              // ハコログの「乗務前日報・乗務後日報」機能から自動的に届くデータ。
              // 車両点検・アルコールチェックは⑨乗務前点検タブと重複するため、
              // ここでは乗務記録（出退庫・走行距離・給油・道路状況）と
              // 積荷情報のみを表示する。
              const reports = (Array.isArray(data?.shiftReports) ? data.shiftReports : [])
                .filter(r => r?.driverId === selectedDriver?.id)
                .sort((a, b) => String(b?.date || "").localeCompare(String(a?.date || "")))
                .slice(0, 30);
              const weatherLabel = { sun:"晴", cloud:"曇", rain:"雨", snow:"雪" };
              return (
                <div style={{ fontSize: "12px" }}>
                  <div style={{ background: "#f0f2f5", border: "1px solid #dde1e6", borderRadius: "6px", padding: "8px 10px", marginBottom: "10px", color: "#666" }}>
                    ハコログから届いた乗務前日報・乗務後日報です（直近30件）。車両点検・健康チェックは「⑨乗務前点検」タブをご覧ください。
                  </div>
                  {reports.length === 0 ? (
                    <div style={{ color: "#999", padding: "20px 0", textAlign: "center" }}>記録はありません</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {reports.map((r) => (
                        <div key={r.id} style={{ border: cardBorder, borderRadius: "6px", padding: "10px 12px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                            <span style={{ fontWeight: 700 }}>{r.date}</span>
                            <div style={{ display: "flex", gap: "6px" }}>
                              {r.preSubmittedAt && <span style={{ fontSize: "10px", background: "#e0f2f1", color: "#00695c", borderRadius: "999px", padding: "2px 8px" }}>乗務前提出済</span>}
                              {r.postSubmittedAt && <span style={{ fontSize: "10px", background: "#e8f5e9", color: "#2e7d32", borderRadius: "999px", padding: "2px 8px" }}>乗務後提出済</span>}
                            </div>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", rowGap: "4px", color: "#555" }}>
                            {r.vehicle && <div>車両番号：{r.vehicle}</div>}
                            {r.weather && <div>天気：{weatherLabel[r.weather] || r.weather}</div>}
                            {r.departureLoc && <div>出庫地：{r.departureLoc}</div>}
                            {r.returnLoc && <div>帰庫地：{r.returnLoc}</div>}
                            {(r.depH || r.depM) && <div>出庫時刻：{r.depH}:{r.depM}</div>}
                            {(r.retH || r.retM) && <div>帰庫時刻：{r.retH}:{r.retM}</div>}
                            {(r.odometerOut || r.odometerIn) && <div>走行距離：{r.odometerOut||"?"}km → {r.odometerIn||"?"}km</div>}
                            {r.fuelAmount && <div>給油：{r.fuelAmount}L</div>}
                            {r.highway && <div>高速道路：{r.highway === "yes" ? "使用あり" : "使用なし"}</div>}
                            {r.forklift && <div>フォークリフト：{r.forklift === "yes" ? "使用あり" : "使用なし"}</div>}
                          </div>
                          {r.abnormal === "yes" && (
                            <div style={{ marginTop: "6px", background: "#fff5f5", border: "1px solid #ffcdd2", borderRadius: "4px", padding: "6px 8px", color: "#c62828" }}>
                              ⚠️ 異常あり：{r.abnormalNote || "（詳細未記入）"}
                            </div>
                          )}
                          {r.memo && <div style={{ marginTop: "6px", color: "#666" }}>メモ：{r.memo}</div>}
                          {Array.isArray(r.cargo) && r.cargo.some(c => c?.type) && (
                            <div style={{ marginTop: "6px", borderTop: "1px solid #f0f0f0", paddingTop: "6px" }}>
                              {r.cargo.filter(c => c?.type).map((c, ci) => (
                                <div key={ci} style={{ color: "#555" }}>
                                  積荷{ci+1}：{c.type}（{c.weight || "?"}t / {c.ratio || "?"}%、{c.status === "ok" ? "良" : c.status === "no" ? "否" : "未確認"}）
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
            {activeTab==="account" && !restrictedTabIds.includes("account") && (
              <div style={{ fontSize: "12px" }}>
                <div style={{ background: "#f0f2f5", border: "1px solid #dde1e6", borderRadius: "6px", padding: "8px 10px", marginBottom: "12px", color: "#666" }}>
                  ハコログにログインするためのパスワードを設定します。ドライバーIDは
                  <b> {selectedDriver?.id} </b>です。
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "flex-end", flexWrap: "wrap" }}>
                  <Fl label="新しいパスワード">
                    <RetroInput
                      type="text"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="6文字以上を推奨"
                    />
                  </Fl>
                  <RetroBtn
                    onClick={() => setDriverPassword(selectedDriver?.id, newPassword)}
                    disabled={pwSaving || !newPassword.trim()}
                    style={{
                      background: newPassword.trim() ? "#00a09a" : "#ccc",
                      borderColor: newPassword.trim() ? "#00a09a" : "#ccc",
                      color: "#fff",
                      marginBottom: "2px",
                    }}
                  >
                    {pwSaving ? "設定中..." : "パスワードを設定"}
                  </RetroBtn>
                </div>
                {pwMessage && (
                  <div style={{ marginTop: "8px", fontWeight: 700, color: pwMessage.startsWith("✅") ? "#00695c" : "#c62828" }}>
                    {pwMessage}
                  </div>
                )}
                <div style={{ marginTop: "16px", color: "#999", lineHeight: 1.7 }}>
                  ・設定・変更したパスワードは、ドライバーご本人に直接お伝えください（この画面には表示されません）。<br/>
                  ・パスワードはハッシュ化して保存されるため、忘れた場合は再設定が必要です。
                </div>
              </div>
            )}
            {activeTab==="history" && !restrictedTabIds.includes("history") && (
              <HistoryPanel
                data={data}
                entityType="driver"
                entityId={selectedDriver?.id}
                labelMap={{
                  name:"氏名", kana:"フリガナ", birthDate:"生年月日", phone:"電話番号", address:"住所",
                  email:"メールアドレス", contractType:"契約形態", contractStart:"契約開始日", contractEnd:"契約終了日",
                  status:"状態", note:"メモ", licenseNo:"免許番号", licenseExpiry:"免許有効期限",
                  royaltyType:"ロイヤリティ種別", royaltyRate:"ロイヤリティ率", royaltyFixed:"ロイヤリティ固定額",
                  leaseMonthly:"リース料(月額)", insuranceMonthly:"保険料(月額)",
                  uniformMonthly:"制服代(月額)", suppliesMonthly:"備品代(月額)",
                }}
              />
            )}
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", marginTop:"12px" }}>
            <RetroBtn onClick={()=>deleteDriver(selectedDriver?.id)} style={{ background:"#fff", color:"#e63946", borderColor:"#e63946" }}>削除</RetroBtn>
            <div style={{ display:"flex", gap:"6px" }}>
              <RetroBtn onClick={()=>setSelectedDriverId(null)}>閉じる</RetroBtn>
              <RetroBtn onClick={()=>openEdit(selectedDriver)} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>編集</RetroBtn>
            </div>
          </div>
        </Modal>
      )}

      {showModal && (
        <Modal title={editingId ? "ドライバー編集" : "ドライバー追加"} icon={driverIcon} onClose={()=>setShowModal(false)} width={680}>
          <TabBar value={activeTab} onChange={setActiveTab}/>
          {/* タブによって項目数が違うため、最低高さを固定しないと
              タブを切り替えるたびにモーダル自体の大きさが変わって見づらい。
              一番項目が多いタブ（基本情報・健康教育など）に合わせて、
              余裕を持った高さにしておく。短いタブでは下に余白ができるが、
              サイズが安定する方を優先する。 */}
          <div style={{ minHeight:"620px" }}>
            {renderFormTab(activeTab, form, setForm)}
          </div>
          <div style={{ display:"flex", justifyContent:"flex-end", gap:"6px", marginTop:"12px" }}>
            <RetroBtn onClick={()=>setShowModal(false)}>キャンセル</RetroBtn>
            <RetroBtn onClick={saveDriver} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>保存する</RetroBtn>
          </div>
        </Modal>
      )}
    </div>
  );
};

/**
 * 車両フォームの初期値。ドライバー・実績フォームと同じ理由でここ1箇所に集約する。
 * lease〜oilChangeDate は第4弾で追加（仕様書⑨車両管理）。
 */
const createEmptyVehicleForm = () => ({
  plate:"", type:"", maker:"", year:"", maxLoad:"", vehicleWeight:"", grossWeight:"",
  nextInspection:"", inspectionHistory:[],
  accidentHistory:[], violationHistory:[],
  insuranceExpiry:"", liabilityExpiry:"", vehicleInsurance:"", roadServicePhone:"",
  assignedDriverId:"", status:"available", notes:"",
  // ===== 第4弾で追加（仕様書⑨）=====
  leaseCompany:"", leaseStart:"", leaseEnd:"", leaseMonthly:"",
  mileage:"", mileageUpdatedAt:"",
  oilChangeDate:"", oilChangeMileage:"", oilChangeIntervalKm:"5000",
});

const VehiclesPage = ({ data, setData, tenantId, userRole, isMobile }) => {
  const vehicles = (Array.isArray(data?.vehicles) ? data.vehicles : []).filter(v => !v?.deleted);
  const drivers = (Array.isArray(data?.drivers) ? data.drivers : []).filter(d => !d?.deleted);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);
  const [activeTab, setActiveTab] = useState("basic");
  const [form, setForm] = useState(createEmptyVehicleForm);
  const [newInspection, setNewInspection] = useState({ date:"", shop:"", content:"", issue:"", nextDate:"" });
  const [newAccident, setNewAccident] = useState({ datetime:"", place:"", opponent:"", repairStatus:"", insuranceUsed:false, note:"" });
  const [newViolation, setNewViolation] = useState({ date:"", content:"", penalty:"" });
  const selectedVehicle = vehicles.find(v => v?.id === selectedVehicleId) || null;
  const openAdd = () => { setEditingId(null); setForm(createEmptyVehicleForm()); setNewInspection({ date:"", shop:"", content:"", issue:"", nextDate:"" }); setNewAccident({ datetime:"", place:"", opponent:"", repairStatus:"", insuranceUsed:false, note:"" }); setNewViolation({ date:"", content:"", penalty:"" }); setActiveTab("basic"); setShowModal(true); };
  const openEdit = (vehicle) => {
    setEditingId(vehicle?.id || null);
    setForm({
      ...createEmptyVehicleForm(),
      ...vehicle,
      inspectionHistory: Array.isArray(vehicle?.inspectionHistory) ? vehicle.inspectionHistory : [],
      accidentHistory: Array.isArray(vehicle?.accidentHistory) ? vehicle.accidentHistory : [],
      violationHistory: Array.isArray(vehicle?.violationHistory) ? vehicle.violationHistory : [],
    });
    setNewInspection({ date:"", shop:"", content:"", issue:"", nextDate:"" });
    setNewAccident({ datetime:"", place:"", opponent:"", repairStatus:"", insuranceUsed:false, note:"" });
    setNewViolation({ date:"", content:"", penalty:"" });
    setActiveTab("basic");
    setShowModal(true);
    setSelectedVehicleId(null);
  };
  const saveVehicle = () => {
    // 以前はナンバーが空の場合に何も起きず無言で処理が止まるだけだったため、
    // ユーザーには「保存ボタンが反応しない」ように見えてしまっていた。
    if (!form.plate || !form.plate.trim()) {
      window.alert("ナンバーを入力してください。");
      return;
    }
    if (editingId) {
      const before = vehicles.find((v) => v?.id === editingId);
      logHistoryEntry(setData, { entityType: "vehicle", entityId: editingId, entityLabel: before?.plate, before, userRole });
    }
    setData((d) => {
      const current = Array.isArray(d?.vehicles) ? d.vehicles : [];
      if (editingId) return { ...d, vehicles: current.map(v => v?.id === editingId ? { ...v, ...form } : v) };
      // 以前は `V${current.length+1}` という配列長ベースのID生成だったため、
      // 削除済みデータの扱いが将来変わった場合などにIDが重複するリスクがあった。
      const nextId = generateUniqueBusinessId(current, "V", "");
      return { ...d, vehicles: [...current, { id: nextId, ...form }] };
    });
    setShowModal(false); setEditingId(null);
  };
  const deleteVehicle = (id) => {
    // 配車済み・配送中の受注に紐づいている車両を削除すると、
    // 配車管理画面で車両情報が表示できなくなるため、事前に警告する。
    const activeOrders = (Array.isArray(data?.orders) ? data.orders : []).filter(
      (o) => !o?.deleted && o?.vehicleId === id && ["scheduled", "in_transit"].includes(o?.status)
    );
    const confirmMessage =
      activeOrders.length > 0
        ? `この車両は現在 ${activeOrders.length}件 の配車済み・配送中の受注で使用されています。削除すると配車管理の表示に影響する可能性があります。本当に削除しますか？（後から復元できます）`
        : "この車両を削除しますか？（後から復元できます）";
    if (!window.confirm(confirmMessage)) return;
    setData((d) => ({ ...d, vehicles: (Array.isArray(d?.vehicles) ? d.vehicles : []).map(v => v?.id === id ? { ...v, deleted: true } : v) }));
    setSelectedVehicleId(null);
  };
  const addInspection = async () => {
    if (!newInspection.date) return;
    setForm(f => {
      const updated = { ...f, inspectionHistory: [...(f.inspectionHistory||[]), { ...newInspection, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }] };
      return updated;
    });
    const { error } = await supabase
      .from('vehicle_inspections')
      .insert({
        vehicle_id: form.id,
        inspection_date: newInspection.date,
        inspection_type: "定期点検",
        result: newInspection.issue || null,
        next_inspection_date: newInspection.nextDate || null,
        memo: [newInspection.shop ? `工場:${newInspection.shop}` : null, newInspection.content || null].filter(Boolean).join(" / ") || null,
        tenant_id: tenantId
      });
    if (error) console.error('vehicle_inspections insert error:', error);
    setNewInspection({ date:"", shop:"", content:"", issue:"", nextDate:"" });
  };
  const removeInspection = (id) => { if (!window.confirm("この記録を削除しますか？")) return; setForm(f => ({ ...f, inspectionHistory: (f.inspectionHistory||[]).filter(x => x.id !== id) })); };
  const addAccident = async () => {
    if (!newAccident.datetime) return;
    setForm(f => ({ ...f, accidentHistory: [...(f.accidentHistory||[]), { ...newAccident, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }] }));
    const { error } = await supabase
      .from('vehicle_incidents')
      .insert({
        vehicle_id: form.id,
        incident_type: 'accident',
        incident_date: newAccident.datetime.slice(0, 10),
        description: newAccident.place || null,
        counterparty: newAccident.opponent || null,
        amount: null,
        memo: [newAccident.repairStatus ? `修理:${newAccident.repairStatus}` : null, newAccident.insuranceUsed ? "保険対応あり" : "保険対応なし", newAccident.note || null].filter(Boolean).join(" / ") || null,
        tenant_id: tenantId
      });
    if (error) console.error('vehicle_incidents(accident) insert error:', error);
    setNewAccident({ datetime:"", place:"", opponent:"", repairStatus:"", insuranceUsed:false, note:"" });
  };
  const removeAccident = (id) => { if (!window.confirm("この記録を削除しますか？")) return; setForm(f => ({ ...f, accidentHistory: (f.accidentHistory||[]).filter(x => x.id !== id) })); };
  const addViolation = async () => {
    if (!newViolation.date) return;
    setForm(f => ({ ...f, violationHistory: [...(f.violationHistory||[]), { ...newViolation, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }] }));
    const penaltyAmount = Number(newViolation.penalty);
    const hasPenaltyAmount = newViolation.penalty !== "" && Number.isFinite(penaltyAmount);
    const { error } = await supabase
      .from('vehicle_incidents')
      .insert({
        vehicle_id: form.id,
        incident_type: 'violation',
        incident_date: newViolation.date,
        description: newViolation.content || null,
        counterparty: null,
        amount: hasPenaltyAmount ? penaltyAmount : null,
        memo: hasPenaltyAmount ? null : (newViolation.penalty || null),
        tenant_id: tenantId
      });
    if (error) console.error('vehicle_incidents(violation) insert error:', error);
    setNewViolation({ date:"", content:"", penalty:"" });
  };
  const removeViolation = (id) => { if (!window.confirm("この記録を削除しますか？")) return; setForm(f => ({ ...f, violationHistory: (f.violationHistory||[]).filter(x => x.id !== id) })); };
  const vehicleIcon = <Icon size={14}><rect x="3" y="9" width="18" height="7" rx="2"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></Icon>;
  const plusIcon = <Icon size={14}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></Icon>;
  const trashIcon = <Icon size={12}><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></Icon>;
  const tabs = [{ id:"basic", label:"①基本情報" },{ id:"inspection", label:"②定期点検" },{ id:"inspection_cert", label:"③車検管理" },{ id:"accident", label:"④事故・違反" },{ id:"insurance", label:"⑤保険管理" },{ id:"driver", label:"⑥使用ドライバー" },{ id:"lease", label:"⑦リース・整備" },{ id:"history", label:"⑧変更履歴" }];
  const TabBar = ({ value, onChange }) => (
    <div style={{ display:"flex", gap:"4px", flexWrap:"wrap", marginBottom:"12px", borderBottom:"2px solid #e8e8e8", paddingBottom:"8px" }}>
      {tabs.map(t => <button key={t.id} onClick={() => onChange(t.id)} style={{ border:"none", borderRadius:"4px 4px 0 0", padding:"6px 10px", fontSize:"11px", fontWeight:700, cursor:"pointer", background: value===t.id ? "#00a09a" : "#f0f2f5", color: value===t.id ? "#fff" : "#555" }}>{t.label}</button>)}
    </div>
  );
  const CB = ({ label, checked, onChange }) => (
    <label style={{ display:"inline-flex", alignItems:"center", gap:"6px", fontSize:"12px", cursor:"pointer", marginRight:"12px" }}>
      <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} />{label}
    </label>
  );
  const renderFormTab = (tab, f, setF) => {
    if (tab === "basic") return (
      <>
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"6px 12px" }}>
          <Fl label="ナンバー"><RetroInput value={f.plate||""} onChange={e=>setF(v=>({...v,plate:e.target.value}))}/></Fl>
          <Fl label="車種"><RetroInput value={f.type||""} onChange={e=>setF(v=>({...v,type:e.target.value}))}/></Fl>
          <Fl label="メーカー"><RetroInput value={f.maker||""} onChange={e=>setF(v=>({...v,maker:e.target.value}))}/></Fl>
          <Fl label="年式"><RetroInput value={f.year||""} placeholder="例：2020" onChange={e=>setF(v=>({...v,year:e.target.value}))}/></Fl>
          <Fl label="最大積載量"><RetroInput value={f.maxLoad||""} placeholder="例：2000kg" onChange={e=>setF(v=>({...v,maxLoad:e.target.value}))}/></Fl>
          <Fl label="車両重量"><RetroInput value={f.vehicleWeight||""} placeholder="例：3500kg" onChange={e=>setF(v=>({...v,vehicleWeight:e.target.value}))}/></Fl>
          <Fl label="総重量"><RetroInput value={f.grossWeight||""} placeholder="例：5500kg" onChange={e=>setF(v=>({...v,grossWeight:e.target.value}))}/></Fl>
          <Fl label="状態"><RetroSelect value={f.status||"available"} onChange={e=>setF(v=>({...v,status:e.target.value}))}><option value="available">待機中</option><option value="in_use">使用中</option><option value="maintenance">整備中</option></RetroSelect></Fl>
        </div>
        <Fl label="メモ"><RetroTextarea value={f.notes||""} onChange={e=>setF(v=>({...v,notes:e.target.value}))}/></Fl>
      </>
    );
    if (tab === "inspection") return (
      <>
        <div style={{ border:"1px solid #e8e8e8", borderRadius:"6px", padding:"10px", marginBottom:"10px", background:"#fafbfc" }}>
          <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"6px 12px" }}>
            <Fl label="実施日"><RetroInput type="date" value={newInspection.date} onChange={e=>setNewInspection(v=>({...v,date:e.target.value}))}/></Fl>
            <Fl label="実施工場"><RetroInput value={newInspection.shop} onChange={e=>setNewInspection(v=>({...v,shop:e.target.value}))}/></Fl>
            <Fl label="次回予定日"><RetroInput type="date" value={newInspection.nextDate} onChange={e=>setNewInspection(v=>({...v,nextDate:e.target.value}))}/></Fl>
          </div>
          <Fl label="整備内容"><RetroTextarea value={newInspection.content} onChange={e=>setNewInspection(v=>({...v,content:e.target.value}))} style={{ minHeight:"60px" }}/></Fl>
          <Fl label="不具合箇所"><RetroInput value={newInspection.issue} onChange={e=>setNewInspection(v=>({...v,issue:e.target.value}))}/></Fl>
          <RetroBtn onClick={addInspection} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>{plusIcon}✅ この点検を保存</RetroBtn>
          <p style={{fontSize:'11px', color:'#888', marginTop:'4px'}}>
            ※入力後、必ずこのボタンを押してください
          </p>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:"6px", maxHeight:"200px", overflowY:"auto" }}>
          {(f.inspectionHistory||[]).length === 0 && <div style={{ fontSize:"12px", color:"#999" }}>記録なし</div>}
          {[...(f.inspectionHistory||[])].sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(rec => (
            <div key={rec.id} style={{ border:"1px solid #e8e8e8", borderRadius:"6px", padding:"8px 10px", background:"#fff", fontSize:"12px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontWeight:700, color:"#007a74" }}>{rec.date}</span>
                <RetroBtn small onClick={()=>removeInspection(rec.id)} style={{ background:"#fff", color:"#e63946", borderColor:"#e63946" }}>{trashIcon}</RetroBtn>
              </div>
              <div>工場：{rec.shop||"—"} / 次回：{rec.nextDate||"—"}</div>
              {rec.content && <div>内容：{rec.content}</div>}
              {rec.issue && <div style={{ color:"#e65100" }}>不具合：{rec.issue}</div>}
            </div>
          ))}
        </div>
      </>
    );
    if (tab === "inspection_cert") return (
      <Fl label="車検期限"><RetroInput type="date" value={f.nextInspection||""} onChange={e=>setF(v=>({...v,nextInspection:e.target.value}))}/></Fl>
    );
    if (tab === "accident") return (
      <>
        <div style={{ border:"1px solid #e8e8e8", borderRadius:"6px", padding:"10px", marginBottom:"10px", background:"#fafbfc" }}>
          <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"6px 12px" }}>
            <Fl label="事故日時"><RetroInput type="datetime-local" value={newAccident.datetime} onChange={e=>setNewAccident(v=>({...v,datetime:e.target.value}))}/></Fl>
            <Fl label="事故場所"><RetroInput value={newAccident.place} onChange={e=>setNewAccident(v=>({...v,place:e.target.value}))}/></Fl>
            <Fl label="相手情報"><RetroInput value={newAccident.opponent} onChange={e=>setNewAccident(v=>({...v,opponent:e.target.value}))}/></Fl>
            <Fl label="修理状況"><RetroInput value={newAccident.repairStatus} onChange={e=>setNewAccident(v=>({...v,repairStatus:e.target.value}))}/></Fl>
          </div>
          <Fl label="保険対応"><CB label="保険対応あり" checked={newAccident.insuranceUsed} onChange={v=>setNewAccident(p=>({...p,insuranceUsed:v}))}/></Fl>
          <Fl label="備考"><RetroTextarea value={newAccident.note} onChange={e=>setNewAccident(v=>({...v,note:e.target.value}))} style={{ minHeight:"60px" }}/></Fl>
          <RetroBtn onClick={addAccident} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>{plusIcon}✅ この事故を保存</RetroBtn>
          <p style={{fontSize:'11px', color:'#888', marginTop:'4px'}}>
            ※入力後、必ずこのボタンを押してください
          </p>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:"6px", maxHeight:"140px", overflowY:"auto", marginBottom:"12px" }}>
          {(f.accidentHistory||[]).length === 0 && <div style={{ fontSize:"12px", color:"#999" }}>記録なし</div>}
          {[...(f.accidentHistory||[])].sort((a,b)=>(b.datetime||"").localeCompare(a.datetime||"")).map(rec => (
            <div key={rec.id} style={{ border:"1px solid #e8e8e8", borderRadius:"6px", padding:"8px 10px", background:"#fff", fontSize:"12px" }}>
              <div style={{ display:"flex", justifyContent:"space-between" }}>
                <span style={{ fontWeight:700, color:"#e63946" }}>{rec.datetime?.slice(0,10)||"—"}</span>
                <RetroBtn small onClick={()=>removeAccident(rec.id)} style={{ background:"#fff", color:"#e63946", borderColor:"#e63946" }}>{trashIcon}</RetroBtn>
              </div>
              <div>場所：{rec.place||"—"} / 相手：{rec.opponent||"—"}</div>
              <div>修理：{rec.repairStatus||"—"} / 保険：{rec.insuranceUsed?"あり":"なし"}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize:"12px", fontWeight:700, color:"#555", marginBottom:"8px" }}>違反・行政処分記録</div>
        <div style={{ border:"1px solid #e8e8e8", borderRadius:"6px", padding:"10px", marginBottom:"10px", background:"#fafbfc" }}>
          <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap:"6px 12px" }}>
            <Fl label="日付"><RetroInput type="date" value={newViolation.date} onChange={e=>setNewViolation(v=>({...v,date:e.target.value}))}/></Fl>
            <Fl label="違反内容"><RetroInput value={newViolation.content} onChange={e=>setNewViolation(v=>({...v,content:e.target.value}))}/></Fl>
            <Fl label="行政処分"><RetroInput value={newViolation.penalty} onChange={e=>setNewViolation(v=>({...v,penalty:e.target.value}))}/></Fl>
          </div>
          <RetroBtn onClick={addViolation} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>{plusIcon}✅ この違反を保存</RetroBtn>
          <p style={{fontSize:'11px', color:'#888', marginTop:'4px'}}>
            ※入力後、必ずこのボタンを押してください
          </p>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:"6px", maxHeight:"120px", overflowY:"auto" }}>
          {(f.violationHistory||[]).length === 0 && <div style={{ fontSize:"12px", color:"#999" }}>記録なし</div>}
          {[...(f.violationHistory||[])].sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(rec => (
            <div key={rec.id} style={{ border:"1px solid #e8e8e8", borderRadius:"6px", padding:"8px 10px", background:"#fff", fontSize:"12px" }}>
              <div style={{ display:"flex", justifyContent:"space-between" }}>
                <span style={{ fontWeight:700 }}>{rec.date||"—"}</span>
                <RetroBtn small onClick={()=>removeViolation(rec.id)} style={{ background:"#fff", color:"#e63946", borderColor:"#e63946" }}>{trashIcon}</RetroBtn>
              </div>
              <div>違反：{rec.content||"—"} / 処分：{rec.penalty||"—"}</div>
            </div>
          ))}
        </div>
      </>
    );
    if (tab === "insurance") return (
      <>
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"6px 12px" }}>
          <Fl label="任意保険期限"><RetroInput type="date" value={f.insuranceExpiry||""} onChange={e=>setF(v=>({...v,insuranceExpiry:e.target.value}))}/></Fl>
          <Fl label="自賠責期限"><RetroInput type="date" value={f.liabilityExpiry||""} onChange={e=>setF(v=>({...v,liabilityExpiry:e.target.value}))}/></Fl>
        </div>
        <Fl label="車両保険内容"><RetroTextarea value={f.vehicleInsurance||""} onChange={e=>setF(v=>({...v,vehicleInsurance:e.target.value}))} style={{ minHeight:"60px" }}/></Fl>
        <Fl label="ロードサービス電話番号"><RetroInput value={f.roadServicePhone||""} placeholder="例：0120-000-000" onChange={e=>setF(v=>({...v,roadServicePhone:e.target.value}))}/></Fl>
      </>
    );
    if (tab === "driver") return (
      <>
        <Fl label="使用ドライバー">
          <RetroSelect value={f.assignedDriverId||""} onChange={e=>setF(v=>({...v,assignedDriverId:e.target.value}))}>
            <option value="">未割当</option>
            {drivers.map(d => <option key={d?.id} value={d?.id||""}>{d?.name||""}</option>)}
          </RetroSelect>
        </Fl>
        {f.assignedDriverId && (() => { const d = drivers.find(x=>x?.id===f.assignedDriverId); if (!d) return null; return <div style={{ border:"1px solid #e8e8e8", borderRadius:"6px", padding:"10px", background:"#f9fcfc", fontSize:"12px", marginTop:"8px" }}><div style={{ fontWeight:700, color:"#007a74", marginBottom:"4px" }}>{d.name}</div><div>電話：{d.phone||"—"}</div><div>免許：{d.license||"—"} / 有効期限：{d.license_expiry||"—"}</div></div>; })()}
      </>
    );
    if (tab === "lease") {
      // 走行距離・金額は数字のみ。全角数字やカンマが混ざると計算が壊れるため入力時に除去する。
      const onlyNum = (v) => String(v ?? "").normalize("NFKC").replace(/[^0-9]/g, "");
      const sect = (t) => (
        <div style={{ fontSize:"12px", fontWeight:700, color:"#007a74", margin:"14px 0 6px", paddingBottom:"4px", borderBottom:"1px solid #e8e8e8" }}>{t}</div>
      );
      const interval = Number(f.oilChangeIntervalKm) || 5000;
      const nextOilKm = f.oilChangeMileage ? Number(f.oilChangeMileage) + interval : null;
      return (
        <>
          {sect("リース契約")}
          <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"6px 12px" }}>
            <Fl label="リース会社"><RetroInput value={f.leaseCompany||""} onChange={e=>setF(v=>({...v,leaseCompany:e.target.value}))} placeholder="例：〇〇リース株式会社"/></Fl>
            <Fl label="月額リース料（円）"><RetroInput value={f.leaseMonthly||""} onChange={e=>setF(v=>({...v,leaseMonthly:onlyNum(e.target.value)}))} placeholder="50000"/></Fl>
            <Fl label="契約開始日"><RetroInput type="date" value={f.leaseStart||""} onChange={e=>setF(v=>({...v,leaseStart:e.target.value}))}/></Fl>
            <Fl label="契約終了日"><RetroInput type="date" value={f.leaseEnd||""} onChange={e=>setF(v=>({...v,leaseEnd:e.target.value}))}/></Fl>
          </div>

          {sect("走行距離")}
          <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"6px 12px" }}>
            <Fl label="現在の走行距離（km）">
              <RetroInput
                value={f.mileage||""}
                onChange={e=>{
                  const val = onlyNum(e.target.value);
                  // 距離を更新したら、いつ時点の数字かを自動で記録する。
                  // 手入力させると必ず入れ忘れるため。
                  setF(v=>({ ...v, mileage: val, mileageUpdatedAt: val ? getTodayLocalStr() : "" }));
                }}
                placeholder="85000"
              />
            </Fl>
            <Fl label="距離の更新日（自動記録）">
              <RetroInput value={f.mileageUpdatedAt||""} disabled placeholder="距離を入力すると自動で入ります"/>
            </Fl>
          </div>

          {sect("オイル交換")}
          <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap:"6px 12px" }}>
            <Fl label="前回オイル交換日"><RetroInput type="date" value={f.oilChangeDate||""} onChange={e=>setF(v=>({...v,oilChangeDate:e.target.value}))}/></Fl>
            <Fl label="前回交換時の走行距離（km）"><RetroInput value={f.oilChangeMileage||""} onChange={e=>setF(v=>({...v,oilChangeMileage:onlyNum(e.target.value)}))} placeholder="80000"/></Fl>
            <Fl label="交換サイクル（km）"><RetroInput value={f.oilChangeIntervalKm||""} onChange={e=>setF(v=>({...v,oilChangeIntervalKm:onlyNum(e.target.value)}))} placeholder="5000"/></Fl>
          </div>
          {nextOilKm !== null && (
            <div style={{ marginTop:"8px", padding:"10px 12px", background:"#f0fbfa", border:"1px solid #b2dfdb", borderRadius:"6px", fontSize:"12px", color:"#00695c" }}>
              次回オイル交換の目安：<b>{nextOilKm.toLocaleString()} km</b>
              {f.mileage && (
                <span style={{ marginLeft:"8px" }}>
                  （現在 {Number(f.mileage).toLocaleString()} km ／ 残り約 {(nextOilKm - Number(f.mileage)).toLocaleString()} km）
                </span>
              )}
            </div>
          )}
        </>
      );
    }
    return null;
  };
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ fontSize:"14px", fontWeight:700, color:"#222" }}>車両管理台帳</div>
        <RetroBtn onClick={openAdd} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>{plusIcon}車両追加</RetroBtn>
      </div>
      <div style={{ border:cardBorder, borderRadius:"6px", background:"#fff", overflow:"auto", maxHeight: isMobile ? "60vh" : "calc(100vh - 260px)" }}>
        <table style={{ minWidth:"100%", width:"max-content", borderCollapse:"collapse", fontFamily:"'Noto Sans JP', sans-serif", fontSize:"12px" }}>
          <thead>
            <tr style={{ background:"#fafbfc", position:"sticky", top:0 }}>
              {["ID","ナンバー","車種","車検期限","任意保険期限","状態","操作"].map(h => <th key={h} style={{ color:"#666", fontSize:"11px", padding:"8px 10px", textAlign:"left", fontWeight:700, whiteSpace:"nowrap", borderBottom:cardBorder }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {vehicles.map((vehicle) => (
              <tr key={vehicle?.id} style={{ background:"#fff", borderBottom:"1px solid #f0f0f0" }} onMouseEnter={e=>e.currentTarget.style.background="#f9fcfc"} onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
                <td style={{ padding:"8px 10px" }}><span style={{ color:"#007a74", fontWeight:700, cursor:"pointer", textDecoration:"underline" }} onClick={()=>{ setSelectedVehicleId(vehicle?.id); setActiveTab("basic"); }}>{vehicle?.id||"—"}</span></td>
                <td style={{ padding:"8px 10px" }}><span style={{ color:"#007a74", fontWeight:700, cursor:"pointer", textDecoration:"underline" }} onClick={()=>{ setSelectedVehicleId(vehicle?.id); setActiveTab("basic"); }}>{vehicle?.plate||""}</span></td>
                <td style={{ padding:"8px 10px" }}>{vehicle?.type||""}</td>
                <td style={{ padding:"8px 10px" }}>{vehicle?.nextInspection||"未設定"}</td>
                <td style={{ padding:"8px 10px" }}>{vehicle?.insuranceExpiry||"未設定"}</td>
                <td style={{ padding:"8px 10px" }}><StatusPill s={vehicle?.status}/></td>
                <td style={{ padding:"8px 10px" }}><div style={{ display:"flex", gap:"4px" }}><RetroBtn small onClick={()=>openEdit(vehicle)} style={{ background:"#fff", color:"#00a09a", borderColor:"#00a09a" }}>編集</RetroBtn><RetroBtn small onClick={()=>deleteVehicle(vehicle?.id)} style={{ background:"#fff", color:"#e63946", borderColor:"#e63946" }}>削除</RetroBtn></div></td>
              </tr>
            ))}
            {vehicles.length===0&&<tr><td colSpan={7} style={{ padding:"16px", textAlign:"center", color:"#999" }}>データなし</td></tr>}
          </tbody>
        </table>
      </div>
      {selectedVehicle && (
        <Modal title={`車両台帳 ${selectedVehicle?.id||""} ${selectedVehicle?.plate||""}`} icon={vehicleIcon} onClose={()=>setSelectedVehicleId(null)} width={680}>
          <TabBar value={activeTab} onChange={setActiveTab}/>
          <div style={{ minHeight:"300px" }}>
            {activeTab==="basic" && <div style={{ display:"grid", gridTemplateColumns:"120px 1fr", rowGap:"6px", columnGap:"8px", fontSize:"12px" }}><div style={{ color:"#888" }}>ナンバー</div><div>{selectedVehicle?.plate||"—"}</div><div style={{ color:"#888" }}>車種</div><div>{selectedVehicle?.type||"—"}</div><div style={{ color:"#888" }}>メーカー</div><div>{selectedVehicle?.maker||"—"}</div><div style={{ color:"#888" }}>年式</div><div>{selectedVehicle?.year||"—"}</div><div style={{ color:"#888" }}>最大積載量</div><div>{selectedVehicle?.maxLoad||"—"}</div><div style={{ color:"#888" }}>車両重量</div><div>{selectedVehicle?.vehicleWeight||"—"}</div><div style={{ color:"#888" }}>総重量</div><div>{selectedVehicle?.grossWeight||"—"}</div><div style={{ color:"#888" }}>状態</div><div><StatusPill s={selectedVehicle?.status}/></div><div style={{ color:"#888" }}>メモ</div><div>{selectedVehicle?.notes||"—"}</div></div>}
            {activeTab==="inspection" && <div style={{ display:"flex", flexDirection:"column", gap:"6px", maxHeight:"340px", overflowY:"auto" }}>{(selectedVehicle?.inspectionHistory||[]).length===0&&<div style={{ fontSize:"12px", color:"#999" }}>記録なし</div>}{[...(selectedVehicle?.inspectionHistory||[])].sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(rec=><div key={rec.id} style={{ border:"1px solid #e8e8e8", borderRadius:"6px", padding:"10px", background:"#fff", fontSize:"12px" }}><div style={{ fontWeight:700, color:"#007a74" }}>{rec.date} — {rec.shop||"—"}</div><div>次回：{rec.nextDate||"—"}</div>{rec.content&&<div>内容：{rec.content}</div>}{rec.issue&&<div style={{ color:"#e65100" }}>不具合：{rec.issue}</div>}</div>)}</div>}
            {activeTab==="inspection_cert" && <div style={{ display:"grid", gridTemplateColumns:"120px 1fr", rowGap:"6px", columnGap:"8px", fontSize:"12px" }}><div style={{ color:"#888" }}>車検期限</div><div>{selectedVehicle?.nextInspection||"—"}</div></div>}
            {activeTab==="accident" && <><div style={{ fontSize:"12px", fontWeight:700, color:"#555", marginBottom:"6px" }}>事故記録</div><div style={{ display:"flex", flexDirection:"column", gap:"6px", maxHeight:"160px", overflowY:"auto", marginBottom:"12px" }}>{(selectedVehicle?.accidentHistory||[]).length===0&&<div style={{ fontSize:"12px", color:"#999" }}>記録なし</div>}{[...(selectedVehicle?.accidentHistory||[])].sort((a,b)=>(b.datetime||"").localeCompare(a.datetime||"")).map(rec=><div key={rec.id} style={{ border:"1px solid #e8e8e8", borderRadius:"6px", padding:"8px 10px", background:"#fff", fontSize:"12px" }}><div style={{ fontWeight:700, color:"#e63946" }}>{rec.datetime?.slice(0,10)||"—"} {rec.place||""}</div><div>相手：{rec.opponent||"—"} / 修理：{rec.repairStatus||"—"} / 保険：{rec.insuranceUsed?"あり":"なし"}</div></div>)}</div><div style={{ fontSize:"12px", fontWeight:700, color:"#555", marginBottom:"6px" }}>違反・処分記録</div><div style={{ display:"flex", flexDirection:"column", gap:"6px", maxHeight:"120px", overflowY:"auto" }}>{(selectedVehicle?.violationHistory||[]).length===0&&<div style={{ fontSize:"12px", color:"#999" }}>記録なし</div>}{[...(selectedVehicle?.violationHistory||[])].sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(rec=><div key={rec.id} style={{ border:"1px solid #e8e8e8", borderRadius:"6px", padding:"8px 10px", background:"#fff", fontSize:"12px" }}><div style={{ fontWeight:700 }}>{rec.date||"—"}</div><div>違反：{rec.content||"—"} / 処分：{rec.penalty||"—"}</div></div>)}</div></>}
            {activeTab==="insurance" && <div style={{ display:"grid", gridTemplateColumns:"140px 1fr", rowGap:"6px", columnGap:"8px", fontSize:"12px" }}><div style={{ color:"#888" }}>任意保険期限</div><div>{selectedVehicle?.insuranceExpiry||"—"}</div><div style={{ color:"#888" }}>自賠責期限</div><div>{selectedVehicle?.liabilityExpiry||"—"}</div><div style={{ color:"#888" }}>車両保険</div><div>{selectedVehicle?.vehicleInsurance||"—"}</div><div style={{ color:"#888" }}>ロードサービス</div><div>{selectedVehicle?.roadServicePhone||"—"}</div></div>}
            {activeTab==="driver" && <div style={{ fontSize:"12px" }}>{(()=>{ const d=drivers.find(x=>x?.id===selectedVehicle?.assignedDriverId); if(!d) return <div style={{ color:"#999" }}>未割当</div>; return <div style={{ border:"1px solid #e8e8e8", borderRadius:"6px", padding:"10px", background:"#f9fcfc" }}><div style={{ fontWeight:700, color:"#007a74", marginBottom:"4px" }}>{d.name}</div><div>電話：{d.phone||"—"}</div><div>免許：{d.license||"—"} / 有効期限：{d.license_expiry||"—"}</div></div>; })()}</div>}
            {activeTab==="lease" && (() => {
              const v = selectedVehicle;
              const num = (x) => Number(x) || 0;
              const row = (k, val) => (<><div style={{ color:"#888" }}>{k}</div><div>{val || "—"}</div></>);
              // 次回オイル交換の目安走行距離 = 前回交換時の距離 + 交換サイクル
              const interval = num(v?.oilChangeIntervalKm) || 5000;
              const nextOilKm = v?.oilChangeMileage ? num(v.oilChangeMileage) + interval : null;
              const remainKm = nextOilKm !== null && v?.mileage ? nextOilKm - num(v.mileage) : null;
              const oilDue = remainKm !== null && remainKm <= 500; // 残り500km以下で警告
              return (
                <div style={{ fontSize:"12px" }}>
                  <div style={{ fontWeight:700, color:"#007a74", marginBottom:"6px" }}>リース契約</div>
                  <div style={{ display:"grid", gridTemplateColumns:"140px 1fr", rowGap:"6px", columnGap:"8px", marginBottom:"14px" }}>
                    {row("リース会社", v?.leaseCompany)}
                    {row("契約期間", (v?.leaseStart || v?.leaseEnd) ? `${v?.leaseStart||"—"} 〜 ${v?.leaseEnd||"—"}` : "")}
                    {row("月額リース料", v?.leaseMonthly ? `¥${num(v.leaseMonthly).toLocaleString()}／月` : "")}
                  </div>
                  <div style={{ fontWeight:700, color:"#007a74", marginBottom:"6px" }}>走行距離・整備</div>
                  <div style={{ display:"grid", gridTemplateColumns:"140px 1fr", rowGap:"6px", columnGap:"8px" }}>
                    {row("現在の走行距離", v?.mileage ? `${num(v.mileage).toLocaleString()} km` : "")}
                    {row("距離の更新日", v?.mileageUpdatedAt)}
                    {row("前回オイル交換日", v?.oilChangeDate)}
                    {row("前回交換時の距離", v?.oilChangeMileage ? `${num(v.oilChangeMileage).toLocaleString()} km` : "")}
                    {row("交換サイクル", `${interval.toLocaleString()} km ごと`)}
                  </div>
                  {nextOilKm !== null && (
                    <div style={{ marginTop:"10px", padding:"10px 12px", borderRadius:"6px",
                      background: oilDue ? "#fff4e5" : "#f0fbfa",
                      border: `1px solid ${oilDue ? "#ffb74d" : "#b2dfdb"}`,
                      color: oilDue ? "#e65100" : "#00695c" }}>
                      <div style={{ fontWeight:700 }}>次回オイル交換の目安：{nextOilKm.toLocaleString()} km</div>
                      {remainKm !== null && (
                        <div style={{ marginTop:"3px" }}>
                          {remainKm > 0
                            ? `あと約 ${remainKm.toLocaleString()} km${oilDue ? "（もうすぐ交換時期です）" : ""}`
                            : `交換時期を ${Math.abs(remainKm).toLocaleString()} km 超過しています。至急交換してください。`}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
            {activeTab==="history" && (
              <HistoryPanel
                data={data}
                entityType="vehicle"
                entityId={selectedVehicle?.id}
                labelMap={{
                  plate:"ナンバー", model:"車種", year:"年式", mileage:"走行距離",
                  inspectionExpiry:"車検有効期限", insuranceCompany:"保険会社",
                  leaseCompany:"リース会社", leaseMonthly:"月額リース料",
                  driverId:"使用ドライバー", status:"状態", note:"メモ",
                }}
              />
            )}
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", marginTop:"12px" }}>
            <RetroBtn onClick={()=>deleteVehicle(selectedVehicle?.id)} style={{ background:"#fff", color:"#e63946", borderColor:"#e63946" }}>削除</RetroBtn>
            <div style={{ display:"flex", gap:"6px" }}>
              <RetroBtn onClick={()=>setSelectedVehicleId(null)}>閉じる</RetroBtn>
              <RetroBtn onClick={()=>openEdit(selectedVehicle)} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>編集</RetroBtn>
            </div>
          </div>
        </Modal>
      )}
      {showModal && (
        <Modal title={editingId ? "車両編集" : "車両追加"} icon={vehicleIcon} onClose={()=>setShowModal(false)} width={680}>
          <TabBar value={activeTab} onChange={setActiveTab}/>
          {/* ドライバー編集と同じ理由。タブ切り替えでモーダルの大きさが
              変わらないよう、最低高さを固定する。 */}
          <div style={{ minHeight:"620px" }}>{renderFormTab(activeTab, form, setForm)}</div>
          <div style={{ display:"flex", justifyContent:"flex-end", gap:"6px", marginTop:"12px" }}>
            <RetroBtn onClick={()=>setShowModal(false)}>キャンセル</RetroBtn>
            <RetroBtn onClick={saveVehicle} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>車両情報を保存</RetroBtn>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ドライバーロールでアクセスできるページのIDだけを許可リスト化する。
// 以前は "tenants"（テナント管理）以外のメニューが全ロールで無条件に表示されていたため、
// ドライバーアカウントでログインすると、他のドライバーの個人情報・給与単価、
// 顧客の連絡先、経理（請求・入金）データまで全て見えてしまう重大な権限漏れがあった。
// ドライバーには「自分の配送予定を確認する」用途に絞ったメニューだけを見せる。
/**
 * ===== 権限管理（仕様書⑬）=====
 *
 * 権限は必ずこの表だけで定義する。画面のあちこちに if を書くと、
 * 新しい画面を追加したときに設定漏れが起き、「事務担当に他人の給与が見えてしまう」
 * といった取り返しのつかない事故につながるため。
 *
 * 【役割】
 * - super_admin : Anthropic側/システム管理者。全機能＋テナント管理。
 * - admin       : 会社の社長・管理者。全機能。
 * - office      : 事務担当。経理・請求・報酬振込は扱うが、テナント管理は不可。
 * - dispatcher  : 配車担当。案件・配車・ドライバー・車両は見るが、経理・報酬は見せない
 *                 （他人の給与額が見えてしまうため）。
 * - driver      : ドライバー本人。自分の予定確認のみ。
 */
const ROLE_LABELS = {
  super_admin: "システム管理者",
  admin: "管理者",
  office: "事務担当",
  dispatcher: "配車担当",
  driver: "ドライバー",
};

/** 役割ごとに閲覧できるメニューID。super_admin と admin は全画面のため個別指定しない。 */
const ROLE_VISIBLE_MENUS = {
  // 事務担当：経理まわりを担当。配車の実務操作は不要だが、閲覧はできてよい。
  office: [
    "dashboard", "calendar", "analytics",
    "orders", "recurring", "dispatch", "approval", "notices", "chat",
    "drivers", "vehicles", "customers",
    "invoices", "bank", "sales_mgmt", "payout", "quality_mgmt", "change_history",
  ],
  // 配車担当：現場の配車が仕事。他人の報酬額・請求・入金は業務上不要なので見せない。
  dispatcher: [
    "dashboard", "calendar",
    "orders", "dispatch",
    "drivers", "vehicles", "customers",
    "quality_mgmt",
  ],
  // ドライバー本人：他のドライバーの個人情報・給与単価、顧客連絡先、経理データが
  // 見えてしまう権限漏れを防ぐため、自分の予定確認に絞る。
  driver: ["dashboard", "calendar"],
};

const menuVisibleForRole = (m, userRole) => {
  // テナント管理はシステム管理者のみ
  if (m.id === "tenants") return userRole === "super_admin";
  // 管理者・システム管理者は全画面
  if (userRole === "admin" || userRole === "super_admin") return true;
  const allowed = ROLE_VISIBLE_MENUS[userRole];
  // 未知の役割が入ってきた場合は、安全側に倒して何も見せない。
  // （「知らない役割だから全部見せる」という実装は、権限追加時に事故を起こす）
  if (!allowed) return false;
  return allowed.includes(m.id);
};

/** その役割がデータを編集できるか（閲覧のみか）を判定する */
const canEditForRole = (userRole) =>
  userRole === "admin" || userRole === "super_admin" || userRole === "office" || userRole === "dispatcher";

const TenantsPage = ({ tenantId, userRole }) => {
  const isSuper = userRole === "super_admin";
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [plan, setPlan] = useState("standard");
  const [saving, setSaving] = useState(false);
  const [tenantFormError, setTenantFormError] = useState(null);
  const [usersModalTenant, setUsersModalTenant] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteTenantId, setInviteTenantId] = useState("");
  const [inviteRole, setInviteRole] = useState("admin");
  const [inviting, setInviting] = useState(false);

  const loadTenants = async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from("tenants")
      .select("id, name, slug, plan, is_active, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      setLoadError(error.message);
      setRows([]);
    } else {
      setRows(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!isSuper) {
      setLoading(false);
      return;
    }
    loadTenants();
  }, [isSuper]);

  const openUsersModal = async (t) => {
    // t（テナント行）が null になっている場合に t.id でクラッシュしないよう、
    // オプショナルチェイニングで安全にアクセスする。
    if (!t?.id) {
      window.alert("テナント情報が取得できませんでした。一覧を再読み込みしてください。");
      return;
    }
    setUsersModalTenant(t);
    setProfiles([]);
    setProfilesLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("tenant_id", t.id)
      .order("id", { ascending: true });
    if (error) {
      console.warn("Failed to load profiles:", error);
      setProfiles([]);
    } else {
      setProfiles(data || []);
    }
    setProfilesLoading(false);
  };

  const slugOk = (s) => /^[a-zA-Z0-9-]+$/.test(String(s || ""));

  const saveNewTenant = async () => {
    if (saving) return;
    setTenantFormError(null);
    const n = String(name || "").trim();
    const sl = String(slug || "").trim().toLowerCase();
    if (!n) {
      setTenantFormError("会社名を入力してください");
      return;
    }
    if (!slugOk(sl)) {
      setTenantFormError("スラッグは英数字・ハイフンのみで入力してください");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("tenants")
      .insert({ name: n, slug: sl, plan, features: {}, is_active: true })
      .select()
      .single();
    setSaving(false);
    if (error) {
      setTenantFormError(error.message || "保存に失敗しました");
      return;
    }
    setName("");
    setSlug("");
    setPlan("standard");
    // Supabaseの応答が想定外に null になった場合（テスト環境や通信エラー時など）、
    // null をそのまま一覧に追加すると、一覧のレンダリングや「ユーザー一覧」ボタンの
    // クリック時に「null の id を読み取れない」というエラーでページがクラッシュする。
    // data が取得できた場合だけ一覧に反映する。
    if (data) {
      setRows((prev) => [data, ...prev.filter((r) => r?.id !== data?.id)]);
    } else {
      // 保存自体は成功している可能性があるため、一覧を再読み込みして最新状態を反映する。
      loadTenants();
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !inviteTenantId) return;
    if (inviting) return;
    setInviting(true);
    try {
      const tempPassword = Math.random().toString(36).slice(-12) + "Aa1!";
      // 招待するロールは画面で選択された値（admin または driver）を使う。
      // 以前は role: "admin" が固定だったため、ドライバーを招待しても
      // 管理者権限が付与されてしまい、ドライバー専用アカウントを作る手段が
      // 実質存在しないバグになっていた。
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: inviteEmail.trim(),
        password: tempPassword,
        options: {
          data: {
            role: inviteRole,
            tenant_id: inviteTenantId,
          },
        },
      });
      if (signUpError) throw signUpError;

      if (signUpData?.user?.id) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const { error: profileError } = await supabase
          .from("profiles")
          .update({
            role: inviteRole,
            tenant_id: inviteTenantId,
          })
          .eq("id", signUpData.user.id);
        if (profileError) console.warn("profile update:", profileError.message);
      }

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(inviteEmail.trim(), {
        redirectTo: "https://haisokanri.vercel.app",
      });
      if (resetError) throw resetError;

      alert(`${inviteEmail} に招待メールを送信しました！\nメールのリンクからパスワードを設定してもらってください。`);
      setInviteEmail("");
      setInviteTenantId("");
      setInviteRole("admin");
    } catch (err) {
      alert("エラー: " + err.message);
    } finally {
      setInviting(false);
    }
  };

  if (!isSuper) {
    return (
      <Panel title="テナント管理" icon={<span style={{ fontSize: "16px" }}>🏢</span>}>
        <div style={{ fontSize: "13px", color: "#c62828", fontWeight: 700 }}>アクセス権限がありません</div>
        <div style={{ fontSize: "12px", color: UI.textMuted, marginTop: "8px" }}>
          この画面は super_admin のみ利用できます。
        </div>
      </Panel>
    );
  }

  const tableRows = rows.map((r) => [
    r?.name ?? "—",
    r?.slug ?? "—",
    r?.plan ?? "—",
    typeof r?.is_active === "boolean" ? (r.is_active ? "有効" : "無効") : String(r?.is_active ?? "—"),
    r?.created_at ? String(r.created_at).slice(0, 10) : "—",
    <RetroBtn key={`u-${r?.id}`} small onClick={() => openUsersModal(r)}>
      ユーザー一覧
    </RetroBtn>,
  ]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <Panel title="テナント一覧" icon={<span style={{ fontSize: "16px" }}>🏢</span>}>
        {loading && <div style={{ fontSize: "12px", color: UI.textMuted }}>読み込み中…</div>}
        {loadError && (
          <div style={{ fontSize: "12px", color: "#c62828", marginBottom: "8px" }}>{loadError}</div>
        )}
        {!loading && !loadError && (
          <div style={{ maxHeight: "360px", overflow: "auto" }}>
            <RetroTable
              headers={["名前", "スラッグ", "プラン", "状態", "作成日", ""]}
              rows={tableRows}
            />
          </div>
        )}
        {!loading && (
          <div style={{ marginTop: "10px" }}>
            <RetroBtn small onClick={loadTenants} style={{ borderColor: UI.accent, color: UI.accent }}>
              再読込
            </RetroBtn>
          </div>
        )}
      </Panel>

      <Panel title="新規テナント追加" icon={<Icon size={16}><path d="M12 5v14M5 12h14"/></Icon>}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", maxWidth: "640px" }}>
          <Fl label="会社名（name）">
            <RetroInput value={name} onChange={(e) => setName(e.target.value)} placeholder="例：株式会社サンプル" />
          </Fl>
          <Fl label="スラッグ（slug）※英数字・ハイフンのみ">
            <RetroInput
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="例：sample-corp"
            />
          </Fl>
          <Fl label="プラン">
            <RetroSelect value={plan} onChange={(e) => setPlan(e.target.value)}>
              <option value="standard">standard</option>
              <option value="pro">pro</option>
              <option value="elite">elite</option>
            </RetroSelect>
          </Fl>
        </div>
        {tenantFormError && (
          <div style={{ fontSize: "12px", color: "#c62828", marginTop: "8px" }}>{tenantFormError}</div>
        )}
        <div style={{ marginTop: "12px" }}>
          <RetroBtn onClick={saveNewTenant} style={{ background: UI.accent, borderColor: UI.accent, color: "#fff", opacity: saving ? 0.7 : 1 }}>
            {saving ? "保存中…" : "テナントを保存"}
          </RetroBtn>
        </div>
      </Panel>

      <Panel title="ユーザー招待" icon={<Icon size={16}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></Icon>}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", maxWidth: "780px" }}>
          <Fl label="招待先テナント">
            <RetroSelect value={inviteTenantId} onChange={(e) => setInviteTenantId(e.target.value)}>
              <option value="">選択してください</option>
              {rows.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </RetroSelect>
          </Fl>
          <Fl label="メールアドレス">
            <RetroInput
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="user@example.com"
            />
          </Fl>
          <Fl label="権限">
            <RetroSelect value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
              <option value="admin">管理者</option>
              <option value="driver">ドライバー</option>
            </RetroSelect>
          </Fl>
        </div>
        <div style={{ marginTop: "12px" }}>
          <RetroBtn
            onClick={handleInvite}
            style={{ opacity: inviting ? 0.75 : 1 }}
          >
            {inviting ? "送信中..." : "招待メールを送る"}
          </RetroBtn>
        </div>
      </Panel>

      {usersModalTenant && (
        <Modal
          title={`ユーザー一覧 — ${usersModalTenant.name || ""}`}
          icon={<Icon size={14}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></Icon>}
          onClose={() => setUsersModalTenant(null)}
          width={560}
        >
          {profilesLoading ? (
            <div style={{ fontSize: "12px", color: UI.textMuted }}>読み込み中…</div>
          ) : (
            <RetroTable
              headers={["ユーザーID", "ロール"]}
              rows={profiles.map((p) => [p?.id ?? "—", p?.role ?? "—"])}
            />
          )}
        </Modal>
      )}

    </div>
  );
};

// ===== MAIN =====
const MENU = [
  { id:"dashboard", icon:<Icon size={16}><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></Icon>, label:"ダッシュボード", section:"メイン" },
  { id:"calendar",  icon:<Icon size={16}><rect x="3" y="4" width="18" height="18"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/></Icon>, label:"カレンダー", section:"メイン" },
  { id:"analytics", icon:<Icon size={16}><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></Icon>, label:"経営分析", section:"メイン" },
  { id:"orders",    icon:<Icon size={16}><rect x="4" y="3" width="16" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/></Icon>, label:"受注管理", section:"案件管理" },
  { id:"recurring", icon:<Icon size={16}><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 8v4l3 2"/></Icon>, label:"定期便管理", section:"案件管理" },
  { id:"dispatch",  icon:<Icon size={16}><rect x="2" y="8" width="15" height="8"/><path d="M17 10h3l2 3v3h-5"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></Icon>, label:"配車管理", section:"案件管理" },
  { id:"approval",  icon:<Icon size={16}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></Icon>, label:"実績承認", section:"案件管理" },
  { id:"notices",   icon:<Icon size={16}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></Icon>, label:"お知らせ配信", section:"案件管理" },
  { id:"chat",      icon:<Icon size={16}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></Icon>, label:"チャット", section:"案件管理" },
  { id:"drivers",   icon:<Icon size={16}><circle cx="12" cy="8" r="4"/><path d="M4 21c1.6-3.8 4.7-5.5 8-5.5s6.4 1.7 8 5.5"/></Icon>, label:"ドライバー管理", section:"マスタ管理" },
  { id:"vehicles",  icon:<Icon size={16}><rect x="3" y="9" width="18" height="7" rx="2"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></Icon>, label:"車両管理", section:"マスタ管理" },
  { id:"customers", icon:<Icon size={16}><circle cx="9" cy="8" r="3"/><circle cx="16" cy="9" r="2.5"/><path d="M3 20c1.4-3 3.8-4.5 6-4.5"/><path d="M10 20c1.8-3 4.6-4.5 7-4.5"/></Icon>, label:"顧客管理", section:"マスタ管理" },
  { id:"invoices",  icon:<Icon size={16}><rect x="4" y="3" width="16" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="14" y2="12"/></Icon>, label:"請求管理", section:"経理" },
  { id:"bank",      icon:<Icon size={16}><rect x="3" y="6" width="18" height="12" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></Icon>, label:"口座・入金", section:"経理" },
  { id:"sales_mgmt", icon:<Icon size={16}><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></Icon>, label:"売上管理", section:"経理" },
  { id:"payout", icon:<Icon size={16}><path d="M12 12v8"/><path d="M8 4l4 6 4-6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="7" y1="16" x2="17" y2="16"/></Icon>, label:"報酬・振込", section:"経理" },
  { id:"quality_mgmt", icon:<Icon size={16}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></Icon>, label:"実績・品質管理", section:"経理" },
  { id:"tenants", label:"テナント管理", icon:"🏢", section:"admin" },
];

const TABLE_CONFIG = [
  { key: "customers", table: "customers" },
  { key: "orders", table: "orders" },
  { key: "drivers", table: "drivers" },
  { key: "vehicles", table: "vehicles" },
  { key: "invoices", table: "invoices" },
  { key: "events", table: "events" },
  { key: "payables", table: "payables" },
  { key: "companyInfo", table: "company_info", single: true },
  { key: "jobTypes", table: "job_types" },
  { key: "dailyRecords", table: "daily_records" },
  { key: "qualityRecords", table: "quality_records" },
  // ドライバーが任意で実施した乗務前点検（アルコールチェック等）の記録。
  // 貨物軽自動車運送事業のため保存義務はないが、参考情報として閲覧できるようにする。
  // Hakomane側からは読むだけで、書き込み・編集は行わない（ハコログ専用の記録のため）。
  { key: "precheckRecords", table: "precheck_records" },
  // 乗務前日報・乗務後日報。ハコログ側から自動的に届く、乗務記録
  // （出退庫時刻・走行距離・給油・道路状況）と積荷情報。
  // Hakomane側からは読むだけで、書き込み・編集は行わない。
  { key: "shiftReports", table: "shift_reports" },
  // 変更履歴（監査ログ）。受注・請求書・ドライバー情報・実績の編集前の内容を
  // スナップショットとして残す。追記専用（編集・削除は行わない）。
  { key: "changeHistory", table: "change_history" },
  // 定期便（車建て契約）。曜日ごとに固定の売上・報酬額であらかじめ登録しておき、
  // 毎日「稼働確認」をワンクリックするだけで実績データを自動生成できるようにする。
  // 平日ずっと同じ内容の受注を毎回作り直す手間を無くすための仕組み。
  { key: "recurringAssignments", table: "recurring_assignments" },
  // 定期便の「稼働あり／稼働なし」の確認記録。押し忘れと「本当に稼働が
  // 無かった」を区別できるようにするため、実績データとは別に記録する。
  { key: "recurringConfirmations", table: "recurring_confirmations" },
];

const createEmptyData = () => ({
  customers: [],
  orders: [],
  drivers: [],
  vehicles: [],
  invoices: [],
  bankTransactions: [],
  events: [],
  payables: [],
  companyInfo: null,
  jobTypes: [],
  dailyRecords: [],
  qualityRecords: [],
  precheckRecords: [],
  shiftReports: [],
  changeHistory: [],
  recurringAssignments: [],
  recurringConfirmations: [],
});

const cleanEvents = (events) => {
  const seen = new Set();
  return (Array.isArray(events) ? events : []).filter((ev) => {
    if (ev?.type !== "payment_due") return true;
    const key = `${ev.date}_${ev.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * 「直近Nヶ月」の起点日（YYYY-MM-01）を計算する。
 * daily_records・change_history は時間とともに際限なく増え続けるため、
 * 起動のたびに全期間を読み込むと、データが数年分溜まった頃には
 * 起動・画面表示が徐々に遅くなっていく。
 * デフォルトでは直近分だけを読み込み、それより古いデータは
 * 必要になったタイミングで別途読み込む（fetchOlderDailyRecords 等）。
 */
const defaultLoadCutoff = (monthsBack = 15) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - (monthsBack - 1));
  return formatDate(d);
};

const fetchDataFromSupabase = async (tenantId) => {
  // tenantId が指定されていない場合に「絞り込みなし＝全テナントの全データを返す」という
  // 動作になっていると、将来この関数が想定外の場所から呼ばれたときに
  // 他社のデータを丸ごと取得してしまう重大なセキュリティリスクになる。
  // 安全側に倒し、tenantId が無効な場合は明確にエラーとして扱う。
  if (tenantId == null || tenantId === "") {
    throw new Error("fetchDataFromSupabase: tenantId が指定されていません（テナント未確定の状態でのデータ取得は許可されません）");
  }

  const nextData = createEmptyData();
  const cutoff = defaultLoadCutoff();

  const results = await Promise.all(
    TABLE_CONFIG.map(async ({ key, table, single }) => {
      let q = supabase.from(table).select("id,payload").eq("tenant_id", tenantId).order("id", { ascending: true });
      // 実績・変更履歴だけは、際限なく増え続けるため直近分に絞って読み込む。
      // それ以外（ドライバー・顧客・請求書など）は件数の増え方が緩やかなため、
      // 従来通り全件読み込む（絞り込みによる複雑さのほうが害が大きいため）。
      if (key === "dailyRecords") q = q.gte("payload->>date", cutoff);
      if (key === "changeHistory") q = q.gte("payload->>changedAt", `${cutoff}T00:00:00`);
      const { data: rows, error } = await q;
      return { key, table, rows, error, single };
    })
  );

  for (const result of results) {
    if (result.error) {
      // 【重要】以前はここで即座に throw していたため、
      // 例えば change_history のような1つのテーブルだけが何らかの理由で
      // 読み込めなかった場合に、それ以外の全テーブル（ドライバー・実績・
      // 顧客・請求書など）まで巻き添えで「読み込み失敗」扱いになり、
      // 画面を再読み込みすると全データが空っぽに見えてしまう、という
      // 深刻な事故を引き起こしていた。
      // 1つのテーブルの失敗は、そのテーブルだけ空として扱い、
      // 他の正常なテーブルの読み込みは続行する。
      console.error(`fetchDataFromSupabase: ${result.table || result.key} の読み込みに失敗しました`, result.error);
      nextData[result.key] = result.single ? null : [];
      continue;
    }
    if (result.single) {
      const row = (result.rows || [])[0];
      nextData[result.key] = row?.payload ?? null;
      continue;
    }
    if (result.key === "invoices") {
      nextData[result.key] = (result.rows || [])
        .map((row) => {
          if (!row?.payload || typeof row.payload !== "object") return null;
          return { ...row.payload, _dbId: row.id };
        })
        .filter(Boolean);
      continue;
    }
    const payloads = (result.rows || []).map((row) => row.payload).filter(Boolean);
    nextData[result.key] = payloads;
  }

  if (Array.isArray(nextData.events)) {
    nextData.events = cleanEvents(nextData.events);
  }

  return nextData;
};

/**
 * 直近分だけ読み込んだ後、それより古いデータを追加で取得する。
 * 過去の月の実績を確認したい／古い変更履歴を遡って見たい、といった
 * ニーズは実際にあるため、必要になった時点でボタン一つで読み込めるようにする。
 */
const fetchOlderDailyRecords = async (tenantId, beforeDate) => {
  const { data: rows, error } = await supabase
    .from("daily_records")
    .select("id,payload")
    .eq("tenant_id", tenantId)
    .lt("payload->>date", beforeDate)
    .order("id", { ascending: true });
  if (error) throw error;
  return (rows || []).map((row) => row.payload).filter(Boolean);
};

const fetchOlderChangeHistory = async (tenantId, beforeDate) => {
  const { data: rows, error } = await supabase
    .from("change_history")
    .select("id,payload")
    .eq("tenant_id", tenantId)
    .lt("payload->>changedAt", `${beforeDate}T00:00:00`)
    .order("id", { ascending: true });
  if (error) throw error;
  return (rows || []).map((row) => row.payload).filter(Boolean);
};

/** invoices 行を Supabase upsert 用 { id, payload } に変換（行PKは uuid、payload.id は請求番号） */
const invoiceRowToUpsert = (row, tenantId) => {
  if (!row) return null;
  let payload;
  let dbId;
  if (row.payload != null && typeof row.payload === "object") {
    payload = { ...row.payload };
    dbId = row._dbId ?? null;
  } else {
    const rest = { ...row };
    dbId = rest._dbId ?? null;
    delete rest._dbId;
    payload = { ...rest };
  }
  if (!dbId) {
    dbId = crypto.randomUUID();
  }
  return { id: dbId, payload, tenant_id: tenantId };
};

const saveDataToSupabase = async (nextData, prevData, tenantId) => {
  // テナントが確定していない状態での保存は、tenant_id が null のデータを
  // 作ってしまったり、削除範囲の絞り込みが効かなくなったりするため、
  // ここで明確に拒否する（fetchDataFromSupabase と同じ方針）。
  if (tenantId == null || tenantId === "") {
    throw new Error("saveDataToSupabase: tenantId が指定されていません（テナント未確定の状態での保存は許可されません）");
  }

  const failedTables = [];

  const jobs = TABLE_CONFIG.map(async ({ key, table, single }) => {
    // 【重要】以前はテーブルごとの保存処理内で throw していたため、
    // 例えば change_history のような1つのテーブルの保存が何らかの理由で
    // 失敗すると、Promise.all 全体が失敗扱いになり、既に正常に完了して
    // いたはずの他のテーブル（実績・請求書など）の保存結果まで巻き添えで
    // 「失敗」として扱われてしまっていた（実際に発生した重大な不具合）。
    // 1つのテーブルの失敗は、そのテーブルだけの失敗として記録し、
    // 他のテーブルの保存は独立して成功させる。
    try {
      const currentRows = single
        ? (nextData[key]
            ? [{ id: nextData[key]?.id || "COMPANY-001", payload: nextData[key], tenant_id: tenantId }]
            : [])
        : (Array.isArray(nextData[key]) ? nextData[key] : [])
            .filter((row) => row && row.id && (key !== "invoices" || invoiceRowToUpsert(row, tenantId)))
            .map((row) => {
              if (key === "invoices") return invoiceRowToUpsert(row, tenantId);
              if (key === "qualityRecords") return {
                id: row.id,
                payload: row,
                driverid: row.driverId || null,
                date: row.date || null,
                tenant_id: tenantId
              };
              return { id: row.id, payload: row, tenant_id: tenantId };
            });
      const previousRows = single
        ? (prevData[key]
            ? [{ id: prevData[key]?.id || "COMPANY-001", payload: prevData[key], tenant_id: tenantId }]
            : [])
        : (Array.isArray(prevData[key]) ? prevData[key] : [])
            .filter((row) => row && row.id && (key !== "invoices" || invoiceRowToUpsert(row, tenantId)))
            .map((row) => {
              if (key === "invoices") return invoiceRowToUpsert(row, tenantId);
              if (key === "qualityRecords") return {
                id: row.id,
                payload: row,
                driverid: row.driverId || null,
                date: row.date || null,
                tenant_id: tenantId
              };
              return { id: row.id, payload: row, tenant_id: tenantId };
            });

      if (currentRows.length > 0) {
        const upsertRows = currentRows;
        if (upsertRows.length > 0) {
          const { error } = await supabase
            .from(table)
            .upsert(upsertRows, { onConflict: "id" });
          if (error) throw error;
        }
      }

      const currentIdSet = new Set(currentRows.map((row) => row?.id).filter(Boolean));
      const removedIds = previousRows
        .map((row) => row?.id)
        .filter((id) => id && !currentIdSet.has(id));

      if (removedIds.length > 0) {
        // 削除対象のIDだけでなく tenant_id でも絞り込むことで、
        // 仮にSupabase側のRLS（行レベルセキュリティ）が未設定・設定ミスの状態でも、
        // アプリ側のクエリ自体が他テナントの行を誤って削除しないようにする。
        const { error } = await supabase.from(table).delete().eq("tenant_id", tenantId).in("id", removedIds);
        if (error) throw error;
      }
    } catch (err) {
      console.error(`saveDataToSupabase: ${table} の保存に失敗しました`, err);
      failedTables.push({ table, err });
    }
  });

  await Promise.all(jobs);

  if (failedTables.length > 0) {
    // 一部のテーブルだけ失敗した場合でも、他の正常なテーブルは既に保存済み。
    // その上で、失敗があったことは呼び出し元（保存失敗バナー）に伝える。
    const names = failedTables.map((f) => f.table).join("、");
    throw new Error(`一部のデータの保存に失敗しました（${names}）。他のデータは正常に保存されています。`);
  }
};

const cloneData = (value) => {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

const MenuBtn = ({ icon, label, onClick, active, badge }) => {
  return (
    <div style={{ position:"relative" }}>
      <button onClick={onClick}
        style={{ width:"100%", border:"none", background:active?"#fff":"transparent", borderLeft:active?"3px solid #00a09a":"3px solid transparent",
          borderRadius:"4px", color:active?"#007a74":"#333", cursor:"pointer", padding:"8px 10px", display:"flex", alignItems:"center",
          gap:"8px", fontFamily:"'Noto Sans JP', sans-serif", fontSize:"13px", fontWeight:active?700:500, textAlign:"left" }}>
        <span style={{ display:"inline-flex", color:active?"#00a09a":"#666" }}>{icon}</span>
        <span style={{ fontSize:"12px", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{label}</span>
      </button>
      {badge>0&&<div style={{ position:"absolute", top:"4px", right:"6px", background:"#e63946", color:"#fff", fontSize:"10px", fontWeight:700, minWidth:"18px", height:"18px", borderRadius:"999px", display:"grid", placeItems:"center", zIndex:1 }}>{badge}</div>}
    </div>
  );
};

// ===== ハコマネ LOGO (SVG版・拡大縮小してもボケない/歪まない) =====
export const HakomaneLogo = ({ height = 44 }) => {
  const width = Math.round(height * (320 / 76));
  return (
    <svg width={width} height={height} viewBox="0 0 320 76" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      <defs>
        <linearGradient id="hkm-badgeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00c2ba" />
          <stop offset="100%" stopColor="#00655f" />
        </linearGradient>
        <linearGradient id="hkm-topFace" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8ce8e1" />
          <stop offset="100%" stopColor="#4dd0c9" />
        </linearGradient>
        <linearGradient id="hkm-leftFace" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00b3ab" />
          <stop offset="100%" stopColor="#008780" />
        </linearGradient>
        <linearGradient id="hkm-rightFace" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#006b65" />
          <stop offset="100%" stopColor="#004d49" />
        </linearGradient>
        <filter id="hkm-badgeShadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#00332f" floodOpacity="0.28" />
        </filter>
      </defs>

      <rect x="4" y="8" width="60" height="60" rx="16" fill="url(#hkm-badgeGrad)" filter="url(#hkm-badgeShadow)" />

      <g transform="translate(19, 21)">
        <polygon points="15,0 30,7.5 15,15 0,7.5" fill="url(#hkm-topFace)" />
        <polygon points="0,7.5 0,22.5 15,30 15,15" fill="url(#hkm-leftFace)" />
        <polygon points="30,7.5 30,22.5 15,30 15,15" fill="url(#hkm-rightFace)" />
        <line x1="15" y1="15" x2="15" y2="30" stroke="#00332f" strokeWidth="0.6" opacity="0.4" />
        <line x1="7.5" y1="3.7" x2="7.5" y2="18.7" stroke="#ffffff" strokeWidth="0.6" opacity="0.35" />
      </g>

      <circle cx="60" cy="14" r="7" fill="#ff6b4a" stroke="#ffffff" strokeWidth="2" />
      <circle cx="60" cy="14" r="2.2" fill="#ffffff" />

      <text x="80" y="38" fontFamily="'Noto Sans JP', 'Hiragino Sans', sans-serif" fontWeight="800" fontSize="28" letterSpacing="0.2" fill="#1a1a1a">ハコマネ</text>
      <rect x="81" y="45" width="26" height="2" rx="1" fill="#00a09a" />
      <text x="81" y="58" fontFamily="'Noto Sans JP', 'Hiragino Sans', sans-serif" fontWeight="600" fontSize="9.5" letterSpacing="1.6" fill="#7a8a89">DELIVERY MANAGEMENT SYSTEM</text>
    </svg>
  );
};

export function DeliveryManagementApp({ onLogout, authRole, authEmail, isMobile: mobileProp }) {
  const isMobileLocal = useIsMobile();
  const isMobile = typeof mobileProp === "boolean" ? mobileProp : isMobileLocal;
  const [page, setPage] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [data, setData] = useState(initialData);
  const [isLoaded, setIsLoaded] = useState(false);
  const [tenantId, setTenantId] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [profileResolved, setProfileResolved] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  // システムアラートを「今のセッションだけ」非表示にするためのID一覧。
  // 次回ログイン時にはリセットされる（＝実際に直っていなければまた表示される）。
  // これにより「もう分かっているのでずっと出続けるのは邪魔」という要望に応えつつ、
  // 「対応せず放置される」という元々の安全設計も両立させる。
  const [dismissedAlertIds, setDismissedAlertIds] = useState(() => new Set());
  const [saveErrorBanner, setSaveErrorBanner] = useState(null);
  const previousDataRef = useRef(createEmptyData());
  const latestDataRef = useRef(initialData);
  const saveGenerationRef = useRef(0);
  const saveChainRef = useRef(Promise.resolve());
  const pageHistoryRef = useRef(["dashboard"]);
  const handlingPopRef = useRef(false);
  const now = new Date();

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: profile } = await supabase
          .from("profiles")
          .select("tenant_id, role")
          .eq("id", user.id)
          .single();
        if (profile) {
          setTenantId(profile.tenant_id);
          setUserRole(profile.role);
        }
      } finally {
        setProfileResolved(true);
      }
    };
    fetchProfile();
  }, []);

  useEffect(() => {
    latestDataRef.current = data;
  }, [data]);

  useEffect(() => {
    if (!profileResolved) return;

    if (tenantId == null) {
      setIsLoaded(true);
      previousDataRef.current = cloneData(initialData);
      latestDataRef.current = initialData;
      return;
    }

    let alive = true;
    // tenantId が変わった瞬間（ログアウト→別アカウントでのログインなど）に、
    // 前のテナントのデータが新しいデータのロードが終わるまで画面に残り続けてしまう
    // ギャップがあったため、ロード開始時点で即座にクリアする。
    setIsLoaded(false);
    setData(createEmptyData());

    const load = async () => {
      try {
        const remoteData = await fetchDataFromSupabase(tenantId);
        const hasRemoteData = TABLE_CONFIG.some(({ key, single }) =>
          single ? !!remoteData[key] : (remoteData[key] || []).length > 0
        );

        if (!alive) return;

        if (hasRemoteData) {
          const merged = { ...initialData, ...remoteData };
          setData(merged);
          previousDataRef.current = cloneData(merged);
          latestDataRef.current = merged;
        } else {
          await saveDataToSupabase(initialData, createEmptyData(), tenantId);
          setData(initialData);
          previousDataRef.current = cloneData(initialData);
          latestDataRef.current = initialData;
        }
      } catch (error) {
        // データ取得に失敗した場合、以前は setData を呼んでいなかったため、
        // 前のテナント（前にログインしていた別の会社）のデータがそのまま
        // 画面に残り続けてしまう重大な問題があった。失敗時も必ず空データに戻す。
        console.warn("Failed to load data from Supabase:", error);
        if (!alive) return;
        setData(createEmptyData());
        previousDataRef.current = cloneData(initialData);
        latestDataRef.current = initialData;
        setSaveErrorBanner("データの読み込みに失敗しました。通信状態を確認し、画面を再読み込みしてください。");
      } finally {
        if (alive) {
          setIsLoaded(true);
        }
      }
    };

    load();

    return () => {
      alive = false;
    };
  }, [profileResolved, tenantId]);

  /**
   * ===== 実績データの軽量な定期更新 =====
   *
   * 【なぜ必要か】
   * このアプリ全体で、データの自動更新はチャット機能にしかなかった。
   * つまり「実績承認」画面を開きっぱなしにしていると、その間に
   * ドライバーから新しく届いた申請に、ブラウザを手動で再読み込みする
   * まで気づけないという事故が起きうる。
   *
   * 全テーブルを丸ごと再取得すると重くなるため、ここでは承認待ち一覧が
   * 依存する daily_records だけを軽く取得し、差分を静かにマージする。
   * 事務員が実績編集モーダルを開いていても、そのフォームはモーダルを
   * 開いた時点のローカルな状態を保持するだけなので、この背景更新で
   * 入力中の内容が消えることはない。
   */
  useEffect(() => {
    if (!isLoaded || tenantId == null) return;
    const t = setInterval(async () => {
      try {
        const { data: rows, error } = await supabase
          .from("daily_records")
          .select("id,payload")
          .eq("tenant_id", tenantId)
          .order("id", { ascending: true });
        if (error || !rows) return;
        const fresh = rows.map((row) => ({ ...(row.payload || {}), _dbId: row.id }));
        setData((d) => ({ ...d, dailyRecords: fresh }));
      } catch {
        // 通信に失敗しても、次回のタイマーでまた試みるため無視してよい
      }
    }, 45000);
    return () => clearInterval(t);
  }, [isLoaded, tenantId]);

  useEffect(() => {
    window.history.replaceState({ appPage: "dashboard" }, "", window.location.href);
  }, []);

  useEffect(() => {
    const onPopState = () => {
      if (pageHistoryRef.current.length > 1) {
        handlingPopRef.current = true;
        pageHistoryRef.current.pop();
        const previousPage = pageHistoryRef.current[pageHistoryRef.current.length - 1] || "dashboard";
        setPage(previousPage);
        queueMicrotask(() => {
          handlingPopRef.current = false;
        });
        return;
      }

      setPage("dashboard");
      window.history.pushState({ appPage: "dashboard" }, "", window.location.href);
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  const setPageWithHistory = (nextPage) => {
    setPage((currentPage) => {
      if (currentPage === nextPage) {
        return currentPage;
      }
      if (!handlingPopRef.current) {
        pageHistoryRef.current.push(nextPage);
        window.history.pushState({ appPage: nextPage }, "", window.location.href);
      }
      return nextPage;
    });
  };

  useEffect(() => {
    if (!isLoaded || tenantId == null) return;

    const gen = ++saveGenerationRef.current;
    const snapshot = cloneData(data);

    saveChainRef.current = saveChainRef.current.then(async () => {
      if (saveGenerationRef.current !== gen) return;
      try {
        await saveDataToSupabase(snapshot, previousDataRef.current, tenantId);
        if (saveGenerationRef.current === gen) {
          previousDataRef.current = cloneData(snapshot);
          setSaveErrorBanner(null);
        }
      } catch (error) {
        console.warn("Failed to save data to Supabase:", error);
        setSaveErrorBanner(
          "データの保存に失敗しました。通信状態を確認し、もう一度操作してください（このまま画面を閉じると変更が失われる可能性があります）。"
        );
      }
    });

    return () => {};
  }, [data, isLoaded, tenantId]);

  useEffect(() => {
    if (!isLoaded || tenantId == null) return;

    const flush = () => {
      const snapshot = cloneData(latestDataRef.current);
      saveChainRef.current = saveChainRef.current.then(async () => {
        try {
          await saveDataToSupabase(snapshot, previousDataRef.current, tenantId);
          previousDataRef.current = cloneData(snapshot);
        } catch (error) {
          console.warn("Failed to flush save to Supabase:", error);
        }
      });
    };

    const onPageHide = () => flush();

    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [isLoaded, tenantId]);

  // 複数の管理者が同時にこのアプリを開いている場合、片方が編集・削除した内容を
  // 別のタブが古いデータのまま保存すると、その変更が意図せず打ち消されてしまう
  // （上書き競合）リスクがある。完全な解決にはリアルタイム同期が必要だが、
  // それには大規模な変更が必要なため、まずは現実的に効果が大きい緩和策として、
  // 「タブを切り替えて戻ってきたとき、自分がまだ何も編集していなければ
  // 安全に最新データを取り直す」仕組みを入れる。
  // 編集中（保存待ちの変更がある）場合は何もしない＝自分の作業中の内容を失わせない。
  useEffect(() => {
    if (!isLoaded || !tenantId) return;

    const onVisibilityChange = async () => {
      if (document.visibilityState !== "visible") return;
      // 直前にこのタブ自身が変更を加えていない（previousDataRef と最新のdataが一致している）
      // 場合だけ、安全に最新データへ更新する。
      const isUnmodified = JSON.stringify(latestDataRef.current) === JSON.stringify(previousDataRef.current);
      if (!isUnmodified) return;
      try {
        const remoteData = await fetchDataFromSupabase(tenantId);
        const merged = { ...initialData, ...remoteData };
        // 再取得した後も自分が何か編集していないことを再確認してから反映する
        // （fetch中に操作が始まっていた場合は反映しない）。
        const stillUnmodified = JSON.stringify(latestDataRef.current) === JSON.stringify(previousDataRef.current);
        if (stillUnmodified) {
          setData(merged);
          previousDataRef.current = cloneData(merged);
          latestDataRef.current = merged;
        }
      } catch (error) {
        console.warn("Failed to refresh data on tab focus:", error);
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isLoaded, tenantId]);

  useEffect(() => {
    if (!isLoaded || !tenantId) return;

    // 当月だけでなく、請求し忘れている前月以前の月も拾えるようにする。
    // クライアント側の処理は「アプリを開いたとき」にしか走らないため、
    // 月末ぴったりにアプリを開かなくても、開いたタイミングで未請求分を検出できるようにする。
    // toISOString() はUTC基準になるため、日本時間の深夜0時〜9時の間は
    // 前日（月初なら前月）の日付になってしまう。特に月初の深夜帯にアプリを開くと、
    // まだ確定していない前月分を誤って「確定済みの月」と判定するリスクがあるため、
    // ローカル時刻基準の文字列を使う。
    const todayDateStr = getTodayLocalStr();
    const currentMonthKey = todayDateStr.slice(0, 7);

    const invoices = (Array.isArray(data?.invoices) ? data.invoices : []).filter((inv) => !inv?.deleted);
    const customers = Array.isArray(data?.customers) ? data.customers : [];
    const qualityRecords = Array.isArray(data?.qualityRecords) ? data.qualityRecords : [];
    const dailyRecords = Array.isArray(data?.dailyRecords) ? data.dailyRecords : [];
    const orders = Array.isArray(data?.orders) ? data.orders : [];
    void orders;

    // 「今月分」は月が完全に終わるまで確定させない（締め後に実績が追加される可能性があるため）。
    // 集計対象は「過去の確定済みの月（今月より前）」のうち、まだ請求が作られていない月。
    const salesByMonth = {}; // { "2026-05": { [customerId]: { items: [], total: 0 } } }

    const addToMonth = (monthKey, customerId, item) => {
      if (!salesByMonth[monthKey]) salesByMonth[monthKey] = {};
      if (!salesByMonth[monthKey][customerId]) salesByMonth[monthKey][customerId] = { items: [], total: 0 };
      salesByMonth[monthKey][customerId].items.push(item);
      salesByMonth[monthKey][customerId].total += Number(item.amount) || 0;
    };

    // 受注完了時に自動生成された個別請求書（orderId を持つもの）も合わせて確認する。
    // 以前は salesMgmtMonth タグの有無だけで「既に請求済みか」を判定していたため、
    // 個別請求書が存在する受注の実績がこのチェックに引っかからず、
    // 翌月以降にこのuseEffectが走った際に同じ実績がもう一度 INV-AUTO として
    // 請求書化されてしまう（二重請求）バグがあった。
    const billedOrderIds = new Set(
      invoices
        .map((inv) => {
          const p = inv?.payload || inv;
          return p?.orderId;
        })
        .filter(Boolean)
    );

    // 消費税を「税抜の合計にまとめて10%をかける」のではなく、実際に発行される
    // 請求書と同じ「1件（1実績）ごとに税込み計算してから合算する」方式に
    // 統一するため、各実績が非課税の仕事種別かどうかをここで判定して付与する。
    const jobTypesForTax = Array.isArray(data?.jobTypes) ? data.jobTypes : [];
    const isTaxableRecord = (r) => {
      const jt = jobTypesForTax.find(j => j?.id === r?.jobTypeId);
      return jt?.taxable !== false;
    };

    qualityRecords
      .filter((r) => r?.date && r.date.slice(0, 7) < currentMonthKey && r?.customerId && r?.salesAmount)
      .filter((r) => !r?.orderId || !billedOrderIds.has(r.orderId))
      .forEach((r) => {
        const monthKey = r.date.slice(0, 7);
        addToMonth(monthKey, r.customerId, {
          date: r.date,
          description: `実績 ${r.date}`,
          amount: Number(r.salesAmount),
          taxable: isTaxableRecord(r),
        });
      });

    dailyRecords
      .filter((r) => r?.date && r.date.slice(0, 7) < currentMonthKey && r?.customerId && r?.salesAmount)
      .filter((r) => !r?.orderId || !billedOrderIds.has(r.orderId))
      .forEach((r) => {
        const monthKey = r.date.slice(0, 7);
        addToMonth(monthKey, r.customerId, {
          date: r.date,
          description: r.note || `配送 ${r.date}`,
          amount: Number(r.salesAmount),
          taxable: isTaxableRecord(r),
        });
      });

    const alreadyBilledKey = new Set(
      invoices
        .filter((inv) => {
          const p = inv?.payload || inv;
          return !!p?.salesMgmtMonth && !!p?.customerId;
        })
        .map((inv) => {
          const p = inv?.payload || inv;
          return `${p.salesMgmtMonth}_${p.customerId}`;
        })
    );

    const newInvoices = [];
    Object.keys(salesByMonth).forEach((monthKey) => {
      const customerSales = salesByMonth[monthKey];
      Object.keys(customerSales).forEach((customerId) => {
        const key = `${monthKey}_${customerId}`;
        if (alreadyBilledKey.has(key)) return;
        const sales = customerSales[customerId];
        if (!(sales.total > 0)) return;
        const customer = customers.find((c) => c?.id === customerId);
        const subtotal = sales.total;
        // 消費税は「税抜の合計にまとめて10%をかける」方式ではなく、実際に発行される
        // 個別請求書と同じ「1件ごとに税込み計算してから合算する」方式に統一する。
        // これが食い違っていると、月をまたいで自動生成される請求書の消費税額が、
        // 同じ実績から個別に発行していた場合と1円単位でズレてしまう。
        const total = sales.items.reduce((sum, item) => {
          const amount = Number(item.amount) || 0;
          const tax = item.taxable !== false ? calcTax(amount) : 0;
          return sum + amount + tax;
        }, 0);
        const tax = total - subtotal;
        const issueDate = todayDateStr;
        const [y, m] = monthKey.split("-").map(Number);
        // new Date(...).toISOString().slice(0,10) は一度UTCに変換されるため、
        // 日本時間では月末日の前日にズレてしまうバグがあった（支払期日が1日早くなる）。
        // formatDate はローカル時刻のまま文字列化するため、ズレが起きない。
        const dueDate = formatDate(new Date(y, m + 1, 0));

        newInvoices.push({
          id: `INV-AUTO-${monthKey}-${customerId}`,
          _dbId: crypto.randomUUID(),
          customerId,
          customerName: customer?.name || customerId,
          issueDate,
          dueDate,
          amount: subtotal,
          tax,
          total,
          status: "unpaid",
          bankRef: "",
          paidDate: null,
          note: `${monthKey} 月次自動請求`,
          salesMgmtMonth: monthKey,
          lineItems: sales.items.map((item, i) => ({
            id: `LI-${Date.now()}-${i}`,
            name: item.description,
            qty: 1,
            unitPrice: item.amount,
            subtotal: item.amount,
          })),
          sentAt: null,
          sentTo: "",
        });
      });
    });

    if (newInvoices.length === 0) return;

    setData((d) => ({
      ...d,
      invoices: [...(Array.isArray(d?.invoices) ? d.invoices : []), ...newInvoices],
    }));

    const billedMonths = [...new Set(newInvoices.map((inv) => inv.salesMgmtMonth))].sort().join("・");

    setNotifications((prev) => [
      ...prev,
      {
        id: `notif-${Date.now()}`,
        type: "invoice",
        message: `${billedMonths} の請求書を ${newInvoices.length}件 自動生成しました。内容を確認して送付してください。`,
        createdAt: new Date().toISOString(),
        read: false,
      },
    ]);
  }, [isLoaded, tenantId, data?.qualityRecords, data?.dailyRecords]);

  const pendingCount = (Array.isArray(data?.orders) ? data.orders : []).filter(o=>o?.status==="pending").length;
  const unmatchedCount = (Array.isArray(data?.bankTransactions) ? data.bankTransactions : []).filter(b=>b?.status==="unmatched").length;
  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  const overdueCount = (Array.isArray(data?.invoices) ? data.invoices : []).filter(i=>i?.status==="overdue"||(i?.status==="unpaid"&&(i?.dueDate||"")<todayStr)).length;

  // ダッシュボードの期限接近アラート（免許更新・車検・任意保険）と同じ判定を、
  // メニューのバッジにも反映する。ダッシュボードを開かないと気づけない状態を防ぐ。
  const expiryAlertDaysForBadge = Number(data?.companyInfo?.expiryAlertDays) || 30;
  const todayDateObjForBadge = new Date(todayStr + "T00:00:00");
  const daysUntilForBadge = (dateStr) => {
    if (!dateStr) return null;
    const target = new Date(dateStr + "T00:00:00");
    if (isNaN(target.getTime())) return null;
    return Math.round((target - todayDateObjForBadge) / (1000 * 60 * 60 * 24));
  };
  const driversExpiringCount = (Array.isArray(data?.drivers) ? data.drivers : [])
    .filter(d => !d?.deleted)
    .filter(d => { const days = daysUntilForBadge(d?.license_expiry); return days !== null && days >= 0 && days <= expiryAlertDaysForBadge; })
    .length;
  const vehiclesExpiringCount = (Array.isArray(data?.vehicles) ? data.vehicles : [])
    .filter(v => !v?.deleted)
    .filter(v => {
      const inspectionDays = daysUntilForBadge(v?.nextInspection);
      const insuranceDays = daysUntilForBadge(v?.insuranceExpiry);
      const inspectionSoon = inspectionDays !== null && inspectionDays >= 0 && inspectionDays <= expiryAlertDaysForBadge;
      const insuranceSoon = insuranceDays !== null && insuranceDays >= 0 && insuranceDays <= expiryAlertDaysForBadge;
      return inspectionSoon || insuranceSoon;
    })
    .length;

  // ===== 第4弾：システムアラート（仕様書⑫通知機能）=====
  // 車検・保険・契約更新・インボイス・報酬確定漏れ・未入力実績を毎回計算して洗い出す。
  // ドライバー本人には他人の情報を見せないため、管理側の役割のときだけ計算する。
  const systemAlerts = useMemo(() => {
    if (userRole === "driver") return [];
    return buildSystemAlerts(data, Number(data?.companyInfo?.expiryAlertDays) || 30)
      .filter((a) => !dismissedAlertIds.has(a.id))
      // 【重要】通知ベルはページ単位のメニュー制限とは関係なく全ロール共通で
      // 見られるため、ここで絞り込まないと権限の抜け穴になる。
      // 「報酬確定漏れ」（振込先未登録・ロイヤリティ未設定など）は
      // ドライバーへの支払いに関する内容のため、配車担当には見せない。
      .filter((a) => !(userRole === "dispatcher" && a.category === "報酬確定漏れ"));
  }, [data, userRole, dismissedAlertIds]);
  const dangerAlertCount = systemAlerts.filter(a => a.level === "danger").length;

  const badges = { dispatch:pendingCount, bank:unmatchedCount+overdueCount, drivers:driversExpiringCount, vehicles:vehiclesExpiringCount };

  const pages = { dashboard:DashboardPage, calendar:CalendarPage, analytics:AnalyticsPage, orders:OrdersPage, recurring:RecurringPage, dispatch:DispatchPage, approval:ApprovalPage, notices:NoticeBroadcastPage, chat:ChatPage, drivers:DriversPage, vehicles:VehiclesPage, customers:CustomersPage, invoices:InvoicesPage, bank:BankPage, sales_mgmt: SalesMgmtPage, payout: PayoutPage, quality_mgmt: QualityMgmtPage, change_history: ChangeHistoryPage, tenants: TenantsPage };
  const PageComponent = pages[page];

  const sectionOrder = [
    { key: "メイン", label: "メイン" },
    { key: "案件管理", label: "案件管理" },
    { key: "マスタ管理", label: "マスタ管理" },
    { key: "経理", label: "経理" },
    { key: "admin", label: "管理者" },
  ];
  return (
    <div style={{ minHeight:"100vh", background:UI.mainBg, fontFamily:"'Noto Sans JP', sans-serif", fontSize:"13px", color:UI.text }}>
      <div style={{ background:"#fff", borderBottom:cardBorder, height:"72px", display:"flex", alignItems:"center", padding:"0 14px", gap:"10px" }}>
        {isMobile && (
          <button onClick={()=>setMenuOpen(v=>!v)} style={{ border:cardBorder, background:"#fff", borderRadius:"4px", width:"32px", height:"32px", display:"grid", placeItems:"center", color:"#666" }}>
            <Icon size={16}><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></Icon>
          </button>
        )}
        <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
          <HakomaneLogo height={44} />
        </div>
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:"10px" }}>
          <button onClick={()=>setShowSettings(v=>!v)} style={{ border:"none", background:"transparent", color:"#666", display:"inline-flex", cursor:"pointer" }}>
            <Icon size={18}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></Icon>
          </button>
          <button onClick={()=>setShowNotifications(v=>!v)} style={{ position:"relative", border:"none", background:"transparent", color:"#666", display:"inline-flex", cursor:"pointer" }}>
            <Icon size={18}><path d="M18 8a6 6 0 1 0-12 0c0 7-3 6-3 8h18c0-2-3-1-3-8"/><path d="M10 19a2 2 0 0 0 4 0"/></Icon>
            {(systemAlerts.length + notifications.length) > 0 && (
              // 「赤い点」だけだと何件あるか分からず、確認の優先度が判断できない。
              // 件数を出し、期限切れ等の危険な通知がある場合は色を濃くする。
              <span style={{
                position:"absolute", top:"-4px", right:"-6px", minWidth:"16px", height:"16px",
                borderRadius:"999px", background: dangerAlertCount > 0 ? "#c62828" : "#e65100",
                color:"#fff", fontSize:"10px", fontWeight:700, lineHeight:"16px", textAlign:"center",
                padding:"0 4px", boxSizing:"border-box",
              }}>
                {systemAlerts.length + notifications.length}
              </span>
            )}
          </button>
          {!isMobile && (
            <>
              <div style={{ display:"flex", alignItems:"center", gap:"6px", color:"#666", fontSize:"12px" }}>
                <span style={{ background:"#e8f5f4", color:"#007a74", borderRadius:"999px", padding:"2px 8px", fontWeight:700 }}>{ROLE_LABELS[authRole] || "ユーザー"}</span>
                <span>{authEmail || "-"}</span>
              </div>
              {typeof onLogout === "function" && <RetroBtn small onClick={async ()=>{
                // 保存処理は非同期でバックグラウンドに積まれているため、
                // データを入力した直後にすぐログアウトを押すと、
                // Supabaseへの保存が完了する前にアプリごと切り替わってしまい、
                // 直前の変更が保存されないまま失われるリスクがあった。
                // ログアウト前に、保留中の保存チェーンがすべて完了するのを待つ。
                try {
                  await saveChainRef.current;
                } catch (e) {
                  // 保存自体が失敗していても、ログアウト操作自体はブロックしない
                  // （ユーザーが待たされ続けるのを防ぐ）。エラーは既に
                  // saveErrorBanner で表示されているはず。
                }
                onLogout();
              }}>ログアウト</RetroBtn>}
            </>
          )}
        </div>
      </div>

      {saveErrorBanner && (
        <div
          style={{
            background: "#ffebee",
            borderBottom: "1px solid #e63946",
            color: "#c62828",
            fontSize: "12px",
            fontWeight: 700,
            padding: "8px 14px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span style={{ flex: 1 }}>⚠ {saveErrorBanner}</span>
          <button
            onClick={() => setSaveErrorBanner(null)}
            style={{ border: "none", background: "transparent", color: "#c62828", cursor: "pointer", fontSize: "14px", fontWeight: 700 }}
          >
            ×
          </button>
        </div>
      )}

      {showNotifications && (
        <div style={{
          position: "absolute",
          top: "48px",
          right: "60px",
          width: "320px",
          background: "#fff",
          border: "1px solid #e0e0e0",
          borderRadius: "8px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
          zIndex: 1000,
          maxHeight: "400px",
          overflowY: "auto"
        }}>
          <div style={{ padding:"12px 16px", borderBottom:"1px solid #eee", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontWeight:700, fontSize:"13px" }}>通知</span>
            <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
              {notifications.length > 0 && (
                <button
                  onClick={() => setNotifications([])}
                  style={{ fontSize:"11px", color:"#00a09a", border:"none", background:"none", cursor:"pointer" }}
                >
                  全て既読
                </button>
              )}
              <button
                onClick={() => setShowNotifications(false)}
                aria-label="通知を閉じる"
                style={{ border:"none", background:"none", color:"#999", cursor:"pointer", fontSize:"16px", lineHeight:1, padding:"2px" }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* ===== 第4弾：システムアラート（車検・保険・契約・インボイス・報酬確定漏れ・未入力実績）=====
              毎回その場で計算するため、期限を更新すれば通知は自動的に消える。
              「既読にしても対応しなければ消えない」＝見逃しを防ぐ設計。 */}
          {systemAlerts.length > 0 && (
            <div>
              <div style={{ padding:"6px 16px", background:"#fafbfc", fontSize:"10px", fontWeight:700, color:"#888", borderBottom:"1px solid #f0f0f0" }}>
                要対応（{systemAlerts.length}件）
              </div>
              {systemAlerts.map((a) => {
                const c = a.level === "danger"
                  ? { bg:"#fff5f5", border:"#e57373", text:"#c62828", tag:"#c62828" }
                  : { bg:"#fffaf0", border:"#ffb74d", text:"#e65100", tag:"#e65100" };
                return (
                  <div
                    key={a.id}
                    onClick={() => { if (a.page) { setPage(a.page); setShowNotifications(false); } }}
                    style={{
                      padding:"10px 16px", borderBottom:"1px solid #f5f5f5",
                      borderLeft:`3px solid ${c.border}`, background:c.bg, cursor: a.page ? "pointer" : "default",
                      display:"flex", justifyContent:"space-between", gap:"8px",
                    }}
                  >
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:"6px", marginBottom:"3px" }}>
                        <span style={{ fontSize:"9px", fontWeight:700, color:"#fff", background:c.tag, borderRadius:"3px", padding:"1px 5px" }}>
                          {a.category}
                        </span>
                      </div>
                      <div style={{ fontSize:"12px", color:c.text, lineHeight:1.5 }}>{a.message}</div>
                    </div>
                    {/* この警告を今のセッション中だけ非表示にする。
                        次回ログイン時、実際に直っていなければまた表示される。 */}
                    <button
                      onClick={(e) => { e.stopPropagation(); setDismissedAlertIds((prev) => new Set(prev).add(a.id)); }}
                      aria-label="この警告を非表示にする"
                      style={{ border:"none", background:"none", color:"#999", cursor:"pointer", fontSize:"14px", lineHeight:1, padding:"2px", flexShrink:0 }}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {systemAlerts.length === 0 && notifications.length === 0 ? (
            <div style={{ padding:"20px", textAlign:"center", color:"#999", fontSize:"12px" }}>
              通知はありません
            </div>
          ) : (
            notifications.map((n) => (
              <div key={n.id} style={{ padding:"12px 16px", borderBottom:"1px solid #f5f5f5", background: n.read ? "#fff" : "#f0fffe" }}>
                <div style={{ fontSize:"12px", color:"#333", marginBottom:"4px" }}>{n.message}</div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:"8px" }}>
                  <div style={{ fontSize:"10px", color:"#999" }}>{n.createdAt?.slice(0,10)}</div>
                  {!n.read && (
                    <button
                      onClick={() =>
                        setNotifications((prev) =>
                          prev.map((x) => (x.id === n.id ? { ...x, read: true } : x))
                        )
                      }
                      style={{ fontSize:"11px", color:"#00a09a", border:"none", background:"none", cursor:"pointer" }}
                    >
                      既読
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <div style={{ display:"flex", minHeight:"calc(100vh - 48px)" }}>
        {!isMobile && (
          <aside style={{ width:"210px", borderRight:`1px solid ${UI.sidebarBorder}`, background:UI.sidebarBg, padding:"10px", boxSizing:"border-box", flexShrink:0 }}>
            <div style={{ background:UI.sidebarHeader, border:`1px solid ${UI.sidebarBorder}`, borderRadius:"6px", padding:"8px", marginBottom:"10px" }}>
              <div style={{ fontSize:"11px", fontWeight:700, color:"#555", marginBottom:"6px" }}>組織</div>
              <div style={{ background:"#fff", border:cardBorder, borderRadius:"4px", padding:"6px 8px", fontSize:"12px", color:"#333", marginBottom:"6px" }}>{data?.companyInfo?.name || "（会社名未設定）"}</div>
              <div style={{ fontSize:"11px", color:"#888" }}>{now.getFullYear()}年{now.getMonth()+1}月{now.getDate()}日 {now.getHours()}:{String(now.getMinutes()).padStart(2,"0")}</div>
            </div>
            {sectionOrder.map((section)=>{
              const items = MENU.filter(
                (m) => m.section === section.key && menuVisibleForRole(m, userRole)
              );
              if (items.length === 0) return null;
              return (
                <div key={section.key} style={{ marginBottom:"10px" }}>
                  <div style={{ fontSize:"11px", fontWeight:700, color:"#555", marginBottom:"4px" }}>{section.label}</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:"2px" }}>
                    {items.map((m)=>(
                      <MenuBtn key={m.id} icon={m.icon} label={m.label} onClick={()=>setPageWithHistory(m.id)} active={page===m.id} badge={badges[m.id]||0}/>
                    ))}
                  </div>
                </div>
              );
            })}
          </aside>
        )}

        <main style={{ flex:1, padding:isMobile ? "10px" : "14px", overflow:"auto" }}>
          {isMobile && menuOpen && (
            <div style={{ background:UI.sidebarBg, border:`1px solid ${UI.sidebarBorder}`, borderRadius:"6px", padding:"8px", marginBottom:"10px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px" }}>
              {MENU.filter((m)=>menuVisibleForRole(m, userRole)).map((m)=>(
                <button key={m.id} onClick={()=>{setPageWithHistory(m.id);setMenuOpen(false);}} style={{ border:cardBorder, background:page===m.id?"#e8f5f4":"#fff", borderRadius:"4px", padding:"8px", display:"flex", alignItems:"center", gap:"6px", color:"#333", fontSize:"12px", fontWeight:600 }}>
                  {m.icon}{m.label}
                </button>
              ))}
            </div>
          )}
          <div style={{ border:cardBorder, background:"#fff", borderRadius:"6px", padding:"8px 10px", marginBottom:"10px", display:"flex", alignItems:"center", gap:"8px" }}>
            <span style={{ fontSize:"11px", color:"#888" }}>現在：</span>
            <span style={{ fontSize:"12px", fontWeight:700, color:"#007a74", display:"inline-flex", alignItems:"center", gap:"6px" }}>{MENU.find(m=>m.id===page)?.icon}{MENU.find(m=>m.id===page)?.label}</span>
          </div>
          {!isLoaded ? (
            <div style={{ border:cardBorder, borderRadius:"6px", background:"#fff", padding:"24px", textAlign:"center", fontSize:"12px", color:"#888" }}>
              データを読み込んでいます...
            </div>
          ) : (() => {
            // サイドバーのメニュー表示を隠すだけでは、ブラウザの操作や
            // state改ざんによって権限のないページに直接アクセスできてしまう。
            // ここでも同じ menuVisibleForRole のルールを使って、
            // 表示しようとしているページ自体が現在のロールで許可されているか再チェックする。
            const currentMenuItem = MENU.find((m) => m.id === page);
            const isAllowed = !currentMenuItem || menuVisibleForRole(currentMenuItem, userRole);
            if (!isAllowed) {
              return (
                <div style={{ border:cardBorder, borderRadius:"6px", background:"#fff", padding:"24px", textAlign:"center", fontSize:"13px", color:"#c62828", fontWeight:700 }}>
                  このページにアクセスする権限がありません。
                </div>
              );
            }
            return (
              <PageErrorBoundary resetKey={page}>
                <PageComponent
                  data={data}
                  setData={setData}
                  setPage={setPageWithHistory}
                  isMobile={isMobile}
                  tenantId={tenantId}
                  userRole={userRole}
                  authEmail={authEmail}
                />
              </PageErrorBoundary>
            );
          })()}
        </main>
      </div>

      <div style={{ borderTop:cardBorder, background:"#fff", padding:"6px 12px", display:"flex", gap:"8px", alignItems:"center", flexWrap:"wrap" }}>
        <div style={{ fontSize:"11px", color:"#666", flex:1 }}>
          稼働案件：{(Array.isArray(data?.orders) ? data.orders : []).filter(o=>o?.status==="in_transit").length}件　未配車：{pendingCount}件　ドライバー待機：{(Array.isArray(data?.drivers) ? data.drivers : []).filter(d=>d?.status==="available").length}名
        </div>
        {unmatchedCount>0&&<span style={{ fontSize:"11px", color:"#e65100", background:"#fff3e0", border:"1px solid #ff9800", borderRadius:"999px", padding:"2px 8px", fontWeight:700 }}>未照合入金：{unmatchedCount}件</span>}
        {overdueCount>0&&<span style={{ fontSize:"11px", color:"#c62828", background:"#ffebee", border:"1px solid #e63946", borderRadius:"999px", padding:"2px 8px", fontWeight:700 }}>延滞：{overdueCount}件</span>}
        <span style={{ fontSize:"11px", color:"#999" }}>Ver.2.0</span>
      </div>

      {showSettings && (
        <Modal title="設定・管理" icon={<Icon size={14}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></Icon>} onClose={()=>setShowSettings(false)} width={640}>
          {/* 【重要】請求書（金額・入金状況を含む）は、配車担当には見せない
              既存の方針に合わせ、この設定画面の「削除済みデータの復元」
              「CSVダウンロード」からも invoices を除外する。
              この設定モーダル自体はロール共通で開けるため、ここで
              確実に絞り込まないと、ページ単位のメニュー制限をすり抜けて
              請求データ全体をCSVで持ち出せてしまう。 */}
          <div style={{ fontSize:"13px", fontWeight:700, color:"#555", marginBottom:"10px" }}>削除済みデータの復元</div>
          {(userRole === "dispatcher" ? ["customers","drivers","vehicles","orders"] : ["customers","drivers","vehicles","orders","invoices"]).map(key => {
            const labelMap = { customers:"顧客", drivers:"ドライバー", vehicles:"車両", orders:"受注", invoices:"請求書" };
            const deleted = (Array.isArray(data?.[key]) ? data[key] : []).filter(item => item?.deleted);
            if (deleted.length === 0) return null;
            return (
              <div key={key} style={{ marginBottom:"12px" }}>
                <div style={{ fontSize:"12px", fontWeight:700, color:"#007a74", marginBottom:"6px" }}>{labelMap[key]}（{deleted.length}件）</div>
                {deleted.map(item => {
                  const label = item?.name || item?.plate || item?.customerName || item?.id || "—";
                  return (
                    <div key={item?.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 10px", border:"1px solid #e8e8e8", borderRadius:"6px", background:"#fff", marginBottom:"4px" }}>
                      <span style={{ fontSize:"12px", color:"#333" }}>{item?.id} — {label}</span>
                      <RetroBtn small onClick={()=>{ setData(d=>({ ...d, [key]:(Array.isArray(d?.[key])?d[key]:[]).map(x=>x?.id===item?.id?{...x,deleted:false}:x) })); }} style={{ background:"#e8f5e9", color:"#2e7d32", borderColor:"#4caf50" }}>復元</RetroBtn>
                    </div>
                  );
                })}
              </div>
            );
          })}
          {(userRole === "dispatcher" ? ["customers","drivers","vehicles","orders"] : ["customers","drivers","vehicles","orders","invoices"]).every(key => (Array.isArray(data?.[key]) ? data[key] : []).filter(item => item?.deleted).length === 0) && (
            <div style={{ fontSize:"12px", color:"#999", textAlign:"center", padding:"20px" }}>削除済みデータはありません</div>
          )}
          <div style={{ borderTop:"2px solid #e8e8e8", marginTop:"16px", paddingTop:"16px" }}>
            <div style={{ fontSize:"13px", fontWeight:700, color:"#555", marginBottom:"10px" }}>CSVダウンロード</div>
            {[
              { key:"customers", label:"顧客一覧", headers:["ID","会社名","担当者","電話","メール","住所","単価","締め日","支払サイト","振込名義カナ","メモ"], getRow: c => [c.id,c.name,c.contact,c.phone,c.email,c.address,c.unitPrice,c.closingDay,c.paymentSite,c.payer_kana,c.notes] },
              { key:"orders", label:"受注一覧", headers:["ID","顧客","配送種別","配達日","出発地","配送先","荷物","重量","金額","状態"], getRow: o => [o.id,o.customerName,o.deliveryType,o.deliveryDate,o.from,o.to,o.cargo,o.weight,o.amount,o.status] },
              { key:"invoices", label:"請求書一覧", headers:["ID","顧客","発行日","期日","金額","消費税","合計","状態"], getRow: i => { const p = i.payload ? (typeof i.payload === "string" ? JSON.parse(i.payload) : i.payload) : i; return [p.id||i.id, p.customerName, p.issueDate, p.dueDate, p.amount, p.tax, p.total, p.status]; } },
              { key:"drivers", label:"ドライバー一覧", headers:["ID","氏名","フリガナ","生年月日","電話","免許種別","有効期限","契約形態","状態"], getRow: d => [d.id,d.name,d.furigana,d.birthdate,d.phone,d.license,d.license_expiry,d.contractType,d.status] },
              { key:"vehicles", label:"車両一覧", headers:["ID","ナンバー","車種","メーカー","年式","最大積載量","車検期限","任意保険期限","状態"], getRow: v => [v.id,v.plate,v.type,v.maker,v.year,v.maxLoad,v.nextInspection,v.insuranceExpiry,v.status] },
            ].filter(({ key }) => !(userRole === "dispatcher" && key === "invoices")).map(({ key, label, headers, getRow }) => {
              const rows = (Array.isArray(data?.[key]) ? data[key] : []).filter(item => !item?.deleted);
              const downloadCsv = () => {
                const escape = val => {
                  const s = String(val ?? "").replace(/"/g, '""');
                  return s.includes(",") || s.includes("\n") || s.includes('"') ? `"${s}"` : s;
                };
                const csv = [headers, ...rows.map(getRow)].map(row => row.map(escape).join(",")).join("\n");
                const bom = "\uFEFF";
                const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${label}_${getTodayLocalStr()}.csv`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              };
              return (
                <div key={key} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 10px", border:"1px solid #e8e8e8", borderRadius:"6px", background:"#fff", marginBottom:"6px" }}>
                  <div>
                    <span style={{ fontSize:"12px", fontWeight:700, color:"#333" }}>{label}</span>
                    <span style={{ fontSize:"11px", color:"#999", marginLeft:"8px" }}>{rows.length}件</span>
                  </div>
                  <RetroBtn small onClick={downloadCsv} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>CSVダウンロード</RetroBtn>
                </div>
              );
            })}
          </div>
          {(userRole === "office" || userRole === "admin" || userRole === "super_admin") && (
            <div style={{ borderTop:"2px solid #e8e8e8", marginTop:"16px", paddingTop:"16px" }}>
              <div style={{ fontSize:"13px", fontWeight:700, color:"#555", marginBottom:"10px" }}>変更履歴</div>
              <RetroBtn small onClick={()=>{ setShowSettings(false); setPage("change_history"); }} style={{ background:"#fff", color:"#00a09a", borderColor:"#00a09a" }}>
                変更履歴を見る
              </RetroBtn>
            </div>
          )}
        </Modal>
      )}

    </div>
  );
}
