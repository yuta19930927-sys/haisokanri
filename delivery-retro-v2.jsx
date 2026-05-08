import { useState, useEffect, useRef, useMemo } from "react";
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
const today = new Date();
const y = today.getFullYear(), mo = today.getMonth();
const fmt = (d) => `${y}-${String(mo+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
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

/** 振込名義カナ入力: 半角カタカナ等を全角に寄せる（小書きはそのまま） */
const normalizePayerKana = (value) => {
  if (value == null || value === "") return "";
  try {
    return String(value).normalize("NFKC");
  } catch {
    return String(value);
  }
};

const initialData = {
  customers: [
    { id:"C001", name:"株式会社田中商事", contact:"田中 太郎", phone:"03-1234-5678", email:"tanaka@tanakashoji.co.jp", address:"東京都中央区1-2-3", notes:"月末締め翌月払い", unitPrice:600, closingDay:31, paymentSite:"翌月末払い" },
    { id:"C002", name:"山田運輸有限会社", contact:"山田 花子", phone:"06-2345-6789", email:"yamada@yamada-unyu.co.jp", address:"大阪府大阪市北区4-5-6", notes:"午前中納品希望", unitPrice:850, closingDay:15, paymentSite:"翌月15日払い", payer_kana:"ヤマダウンユ" },
    { id:"C003", name:"鈴木食品株式会社", contact:"鈴木 次郎", phone:"052-3456-7890", email:"suzuki@suzukifood.co.jp", address:"愛知県名古屋市中区7-8-9", notes:"冷凍便あり", unitPrice:1200, closingDay:20, paymentSite:"翌々月末払い" },
  ],
  orders: [
    { id:"ORD-001", customerId:"C001", customerName:"株式会社田中商事", deliveryType:"route", deliveryDate:fmt(8), from:"東京都江東区", to:"東京都港区", cargo:"電子部品", weight:"500kg", status:"delivered", amount:45000 },
    { id:"ORD-002", customerId:"C002", customerName:"山田運輸有限会社", deliveryType:"charter", deliveryDate:fmt(12), from:"大阪府堺市", to:"大阪府豊中市", cargo:"食料品", weight:"1200kg", status:"in_transit", amount:68000 },
    { id:"ORD-003", customerId:"C003", customerName:"鈴木食品株式会社", deliveryType:"route", deliveryDate:fmt(18), from:"名古屋市港区", to:"愛知県一宮市", cargo:"冷凍食品", weight:"800kg", status:"scheduled", amount:52000 },
    { id:"ORD-004", customerId:"C001", customerName:"株式会社田中商事", deliveryType:"charter", deliveryDate:fmt(22), from:"東京都品川区", to:"神奈川県横浜市", cargo:"精密機械", weight:"350kg", status:"pending", amount:38000 },
  ],
  drivers: [
    { id:"D001", name:"佐藤 健", license:"大型", status:"available", license_expiry:fmt(28), phone:"090-1111-2222", notes:"ベテランドライバー" },
    { id:"D002", name:"伊藤 誠", license:"中型", status:"on_duty", license_expiry:fmt(24), phone:"090-3333-4444", notes:"冷凍便対応可" },
    { id:"D003", name:"渡辺 勇", license:"大型", status:"available", license_expiry:fmt(20), phone:"090-5555-6666", notes:"夜間配送対応" },
  ],
  vehicles: [
    { id:"V001", plate:"品川300あ1234", type:"4tトラック", status:"available", nextInspection: fmt(20), notes:"定期点検済み" },
    { id:"V002", plate:"なにわ400い5678", type:"10tトラック", status:"in_use", nextInspection: fmt(45), notes:"冷凍設備あり" },
    { id:"V003", plate:"名古屋200う9012", type:"2tトラック", status:"available", nextInspection: fmt(35), notes:"小口配送向け" },
  ],
  invoices: [
    { id:"INV-001", orderId:"ORD-001", customerId:"C001", customerName:"株式会社田中商事", issueDate:fmt(8), dueDate:fmt(20), amount:45000, tax:4500, total:49500, status:"pending_confirmation", bankRef:"TAN20250408", paidDate:null, note:"" },
    { id:"INV-002", orderId:"ORD-002", customerId:"C002", customerName:"山田運輸有限会社", issueDate:fmt(5), dueDate:fmt(10), amount:68000, tax:6800, total:74800, status:"overdue", bankRef:"", paidDate:null, note:"督促済み" },
    { id:"INV-003", orderId:"ORD-003", customerId:"C003", customerName:"鈴木食品株式会社", issueDate:fmt(3), dueDate:fmt(25), amount:52000, tax:5200, total:57200, status:"unpaid", bankRef:"", paidDate:null, note:"" },
  ],
  // Bank transactions (simulated from bank API)
  bankTransactions: [
    { id:"BNK-001", date:fmt(8), amount:49500, description:"タナカシヨウジ　　カブ", matchedInvoice:"INV-001", status:"matched" },
    { id:"BNK-002", date:fmt(9), amount:12000, description:"ネットショップ支払", matchedInvoice:null, status:"unmatched" },
    { id:"BNK-003", date:fmt(11), amount:74800, description:"ヤマダウンユ　ユウ", matchedInvoice:null, status:"unmatched" },
  ],
  // Calendar events / tasks
  events: [
    { id:"EV-001", date:fmt(8), type:"delivery", title:"配達完了：株式会社田中商事", orderId:"ORD-001", color:"#006600" },
    { id:"EV-002", date:fmt(10), type:"payment_due", title:"支払期日：山田運輸有限会社", invoiceId:"INV-002", color:"#cc0000" },
    { id:"EV-003", date:fmt(12), type:"delivery", title:"配達予定：山田運輸有限会社", orderId:"ORD-002", color:"#0000cc" },
    { id:"EV-004", date:fmt(15), type:"task", title:"車検：品川300あ1234", color:"#cc6600" },
    { id:"EV-005", date:fmt(18), type:"delivery", title:"配達予定：鈴木食品株式会社", orderId:"ORD-003", color:"#0000cc" },
    { id:"EV-006", date:fmt(20), type:"payment_due", title:"入金期日：株式会社田中商事", invoiceId:"INV-001", color:"#660099" },
    { id:"EV-007", date:fmt(22), type:"delivery", title:"配達予定：株式会社田中商事", orderId:"ORD-004", color:"#0000cc" },
    { id:"EV-008", date:fmt(25), type:"payment_due", title:"入金期日：鈴木食品株式会社", invoiceId:"INV-003", color:"#660099" },
  ],
  // Payables (支払予定)
  payables: [
    { id:"PAY-001", vendor:"佐藤燃料株式会社", amount:38000, dueDate:fmt(14), status:"unpaid", category:"燃料費" },
    { id:"PAY-002", vendor:"中部運輸協同組合", amount:25000, dueDate:fmt(20), status:"unpaid", category:"協力費" },
    { id:"PAY-003", vendor:"東日本高速道路", amount:8400, dueDate:fmt(16), status:"paid", category:"高速代" },
  ],
  companyInfo: {
    id: "COMPANY-001",
    name: "配送管理株式会社",
    address: "東京都千代田区1-1-1",
    phone: "03-0000-0000",
    email: "info@example.com",
    bankInfo: "みずほ銀行 東京支店 普通 1234567 ハイソウカンリ（カ",
    stampImage: "",
  },
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

const RetroBtn = ({ children, onClick, color, wide, small, style:ext }) => {
  const [dn, setDn] = useState(false);
  const custom = color
    ? {
        background: color,
        borderColor: color,
        color: color === "#fff" || color === "#ffffff" ? UI.text : UI.white,
      }
    : {};
  return (
    <button onMouseDown={()=>setDn(true)} onMouseUp={()=>setDn(false)} onMouseLeave={()=>setDn(false)} onClick={onClick}
      style={{
        background: UI.white,
        border: `1px solid ${UI.softBorder}`,
        borderRadius: "3px",
        fontFamily:"'Noto Sans JP', sans-serif",
        fontSize:small?"12px":"13px",
        fontWeight:600,
        color: UI.text,
        cursor:"pointer",
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
const StatusPill = ({ s }) => {
  const map = {
    pending:["未配車","#fff3e0","#e65100","#ff9800"], scheduled:["配車済","#e3f2fd","#1565c0","#2196f3"],
    in_transit:["配送中","#00a09a","#fff","#00a09a"], delivered:["完了","#4caf50","#fff","#4caf50"],
    unpaid:["未払い","#e8e8e8","#555","#d0d0d0"], pending_confirmation:["確認待ち","#fff3e0","#e65100","#ff9800"],
    overdue:["延滞","#ffebee","#c62828","#e63946"], paid:["入金済","#e8f5e9","#2e7d32","#4caf50"],
    available:["待機中","#e8f5e9","#2e7d32","#4caf50"], on_duty:["稼働中","#e8f5f4","#007a74","#00a09a"], off:["休暇","#f1f3f5","#666","#d0d0d0"],
    in_use:["使用中","#e3f2fd","#1565c0","#2196f3"], maintenance:["整備中","#f3e5f5","#6a1b9a","#7b1fa2"],
    matched:["照合済","#e8f5e9","#2e7d32","#4caf50"], unmatched:["未照合","#ffebee","#c62828","#e63946"],
  };
  const [label,bg,fg,border] = map[s]||[s,"#e8e8e8","#555","#d0d0d0"];
  return <span style={{ background:bg, color:fg, fontSize:"11px", fontWeight:700, padding:"2px 8px", fontFamily:"'Noto Sans JP', sans-serif", border:`1px solid ${border}`, borderRadius:"999px", display:"inline-flex", alignItems:"center" }}>{label}</span>;
};
const RetroTable = ({ headers, rows }) => (
  <div style={{ border:cardBorder, borderRadius:"6px", background:"#fff", overflow:"auto", maxHeight:"280px" }}>
    <table style={{ width:"100%", borderCollapse:"collapse", fontFamily:"'Noto Sans JP', sans-serif", fontSize:"12px" }}>
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
const Modal = ({ title, icon, onClose, children, width=480 }) => (
  <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:"12px" }}>
    <div style={{ background:"#fff", width:`min(${typeof width === "number" ? `${width}px` : width}, 95vw)`, maxWidth:"95vw", maxHeight:"90vh", overflow:"auto", borderRadius:"6px", boxShadow:softShadow, border:cardBorder }}>
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

// ===== CALENDAR =====
const EVENT_TYPE_COLOR = {
  delivery:"#0000cc", payment_due:"#cc0000", payment_receive:"#006600",
  task:"#cc6600", sales:"#009999", bank_in:"#006600", bank_out:"#cc0000"
};
const EVENT_TYPE_LABEL = {
  delivery:"配送", payment_due:"支払期日", payment_receive:"入金予定",
  task:"タスク", sales:"営業", bank_in:"入金", bank_out:"支出"
};

const CalendarPage = ({ data, setData, isMobile=false, tenantId, userRole }) => {
  const [calYear, setCalYear] = useState(y);
  const [calMonth, setCalMonth] = useState(mo);
  const [calMode, setCalMode] = useState("delivery");
  const [selectedDate, setSelectedDate] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [addDate, setAddDate] = useState("");
  const [newEvent, setNewEvent] = useState({ title:"", type:"task", note:"" });
  const [newOrder, setNewOrder] = useState({ customerId:"", deliveryType:"route", deliveryDate:"", from:"", to:"", cargo:"", weight:"", amount:"", notes:"" });
  const [editingItem, setEditingItem] = useState(null);
  const [editEvent, setEditEvent] = useState({ id:"", date:"", type:"task", title:"", note:"" });
  const [editOrder, setEditOrder] = useState({ id:"", customerId:"", deliveryType:"route", deliveryDate:"", from:"", to:"", cargo:"", weight:"", amount:"", notes:"", status:"pending" });

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
  const orders = Array.isArray(data?.orders) ? data.orders : [];
  const events = Array.isArray(data?.events) ? data.events : [];
  const invoices = Array.isArray(data?.invoices) ? data.invoices : [];
  const payables = Array.isArray(data?.payables) ? data.payables : [];
  const drivers = Array.isArray(data?.drivers) ? data.drivers : [];
  const vehicles = Array.isArray(data?.vehicles) ? data.vehicles : [];
  const customers = Array.isArray(data?.customers) ? data.customers : [];

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
    (Array.isArray(data?.invoices) ? data.invoices : [])
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
    const vehicles2 = Array.isArray(data?.vehicles) ? data.vehicles : [];
    const vehicleInsuranceItems = vehicles2
      .filter((vehicle) => normalizeDateString(vehicle?.insuranceExpiry) === targetDate)
      .map((vehicle) => ({
        id: `vinsurance-${vehicle?.id || Math.random()}`,
        source: "vehicle", sourceId: vehicle?.id, date: targetDate, type: "task",
        title: `【任意保険更新】${vehicle?.plate || ""}`, color: "#9b27af", raw: vehicle,
      }));
    const vehicleLiabilityItems = vehicles2
      .filter((vehicle) => normalizeDateString(vehicle?.liabilityExpiry) === targetDate)
      .map((vehicle) => ({
        id: `vliability-${vehicle?.id || Math.random()}`,
        source: "vehicle", sourceId: vehicle?.id, date: targetDate, type: "task",
        title: `【自賠責更新】${vehicle?.plate || ""}`, color: "#7b1fa2", raw: vehicle,
      }));
    const vehicleNextInspectionItems = vehicles2
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

  const openAddModal = (dateStr) => {
    const targetDate = normalizeDateString(dateStr || todayStr);
    setAddDate(targetDate);
    if (calMode === "delivery") {
      setNewOrder({ customerId:"", deliveryType:"route", deliveryDate:targetDate, from:"", to:"", cargo:"", weight:"", amount:"", notes:"" });
    } else {
      setNewEvent({ title:"", type:"task", note:"" });
    }
    setShowAddModal(true);
  };

  const saveNewItem = () => {
    if (calMode === "delivery") {
      if (!newOrder.customerId || !newOrder.deliveryDate) return;
      const customer = customers.find((c) => c?.id === newOrder.customerId);
      const nextOrder = {
        id:`ORD-${String(orders.length+1).padStart(3,"0")}`,
        customerId:newOrder.customerId,
        customerName:customer?.name || "",
        deliveryType:newOrder.deliveryType || "route",
        date:fmt(today.getDate()),
        deliveryDate:normalizeDateString(newOrder.deliveryDate),
        from:newOrder.from,
        to:newOrder.to,
        cargo:newOrder.cargo,
        weight:newOrder.weight,
        status:"pending",
        driverId:null,
        vehicleId:null,
        amount:parseInt(newOrder.amount, 10) || 0,
        notes:newOrder.notes,
      };
      setData((d) => ({ ...d, orders:[nextOrder, ...(Array.isArray(d?.orders) ? d.orders : [])] }));
    } else {
      if (!newEvent.title || !addDate) return;
      const safeEvents = Array.isArray(data?.events) ? data.events : [];
      const nextEvent = {
        id:`EV-${String(safeEvents.length+1).padStart(3,"0")}`,
        date:normalizeDateString(addDate),
        type:newEvent.type,
        title:newEvent.title,
        color:EVENT_TYPE_COLOR[newEvent.type]||"#999",
        note:newEvent.note,
      };
      setData((d) => ({ ...d, events:[...(Array.isArray(d?.events) ? d.events : []), nextEvent] }));
    }
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
            <button onClick={()=>setCalMode("business")} style={{ border:"1px solid #d0d0d0", borderRadius:"3px", padding:"7px 12px", background:calMode==="business"?"#00a09a":"#fff", color:calMode==="business"?"#fff":"#555", fontSize:"13px", fontWeight:600, cursor:"pointer" }}>業務カレンダー</button>
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
              <RetroBtn onClick={()=>openAddModal(selectedDate)} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>{plusIcon}この日に予定を追加</RetroBtn>
            </div>

            {selectedItems.length>0&&(
              <Panel title={calMode === "delivery" ? "配送予定一覧" : "業務予定一覧"} icon={listIcon}>
                {selectedItems.map(item=>(
                  <div key={item.id} style={{ display:"flex", alignItems:"center", gap:"8px", padding:"8px 10px", border:"1px solid #e8e8e8", borderLeft:`4px solid ${item.color}`, borderRadius:"4px", background:"#fff", cursor:"pointer", marginBottom:"6px" }} onClick={() => openEditModal(item)}>
                    <div style={{ flex:1, fontSize:"12px" }}>
                      <span style={{ background:item.color, color:"#fff", padding:"2px 6px", fontSize:"10px", marginRight:"6px", borderRadius:"2px" }}>
                        {item.source === "order" ? item.deliveryType === "charter" ? "チャーター便" : "ルート配送" : item.source === "driver" ? "免許更新" : item.source === "vehicle" ? "車検" : EVENT_TYPE_LABEL[item.type] || item.type}
                      </span>
                      {item.title}
                      {item.source === "order" && <div style={{ marginTop:"2px", fontSize:"10px", color:"#666" }}>ドライバー：{item.subtitle || "未配車"}</div>}
                    </div>
                    {(item.source === "order" || item.source === "event") && <span style={{ fontSize:"10px", color:"#00a09a", display:"inline-flex", alignItems:"center", gap:"3px" }}>{editIcon}編集</span>}
                  </div>
                ))}
              </Panel>
            )}

            {selectedItems.length===0&&(
              <div style={{ border:cardBorder, borderRadius:"6px", background:"#fff", padding:"24px", textAlign:"center", fontSize:"12px", color:"#999" }}>
                この日の予定・記録はありません<br/>
                <RetroBtn onClick={()=>openAddModal(selectedDate)} style={{ marginTop:"10px", background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>{plusIcon}予定を追加する</RetroBtn>
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
                </RetroSelect>
              </Fl>
              <Fl label="配達日"><RetroInput type="date" value={newOrder.deliveryDate} onChange={(e)=>setNewOrder((v)=>({...v, deliveryDate:e.target.value}))}/></Fl>
              <Fl label="出発地"><RetroInput value={newOrder.from} onChange={(e)=>setNewOrder((v)=>({...v, from:e.target.value}))}/></Fl>
              <Fl label="配送先"><RetroInput value={newOrder.to} onChange={(e)=>setNewOrder((v)=>({...v, to:e.target.value}))}/></Fl>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 10px" }}>
                <Fl label="荷物"><RetroInput value={newOrder.cargo} onChange={(e)=>setNewOrder((v)=>({...v, cargo:e.target.value}))}/></Fl>
                <Fl label="重量"><RetroInput value={newOrder.weight} onChange={(e)=>setNewOrder((v)=>({...v, weight:e.target.value}))}/></Fl>
              </div>
              <Fl label="金額"><RetroInput type="number" value={newOrder.amount} onChange={(e)=>setNewOrder((v)=>({...v, amount:e.target.value}))}/></Fl>
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
                </RetroSelect>
              </Fl>
              <Fl label="配達日"><RetroInput type="date" value={editOrder.deliveryDate} onChange={(e)=>setEditOrder((v)=>({...v, deliveryDate:e.target.value}))}/></Fl>
              <Fl label="出発地"><RetroInput value={editOrder.from} onChange={(e)=>setEditOrder((v)=>({...v, from:e.target.value}))}/></Fl>
              <Fl label="配送先"><RetroInput value={editOrder.to} onChange={(e)=>setEditOrder((v)=>({...v, to:e.target.value}))}/></Fl>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 10px" }}>
                <Fl label="荷物"><RetroInput value={editOrder.cargo} onChange={(e)=>setEditOrder((v)=>({...v, cargo:e.target.value}))}/></Fl>
                <Fl label="重量"><RetroInput value={editOrder.weight} onChange={(e)=>setEditOrder((v)=>({...v, weight:e.target.value}))}/></Fl>
              </div>
              <Fl label="金額"><RetroInput type="number" value={editOrder.amount} onChange={(e)=>setEditOrder((v)=>({...v, amount:e.target.value}))}/></Fl>
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
const BankPage = ({ data, setData, tenantId, userRole }) => {
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
  const todayStr = new Date().toISOString().split("T")[0];
  const fileInputRef = useRef(null);
  const [addTx, setAddTx] = useState(false);
  const [form, setForm] = useState({ date:todayStr, amount:"", description:"", direction:"in" });
  const [uploadingCsv, setUploadingCsv] = useState(false);
  const [uploadToast, setUploadToast] = useState("");
  const [expandedTxId, setExpandedTxId] = useState(null);
  const [rematchVersion, setRematchVersion] = useState(0);

  const todayStr2 = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
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
      const { data: rows, error } = await supabase
        .from("bank_transactions")
        .select("*")
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
    };
    loadBankTransactions();
    return () => {
      alive = false;
    };
  }, []);

  const addTxn = () => {
    const tx = { id:`BNK-${String(bankTransactions.length+1).padStart(3,"0")}`, date:form.date, amount:parseInt(form.amount)||0, description:form.description, matchedInvoice:null, status:"unmatched" };
    setBankTransactions((prev) => [tx, ...prev]);
    setData(d=>({...d, bankTransactions:[tx,...(Array.isArray(d?.bankTransactions) ? d.bankTransactions : [])]}));
    setAddTx(false); setForm({ date:todayStr2, amount:"", description:"", direction:"in" });
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

        console.log("[MATCH]", {
          counterparty: counterpartyRaw,
          normalizedCounterparty,
          payerKana,
          normalizedPayerKana,
          invAmount,
          bankAmount: deposit,
          amountMatch,
          kanaMatch,
          invStatus,
          invId: invPayload.id || getInvoiceDbId(inv),
        });

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
    try {
      const tx = bankTransactions.find((row) => row?.id === bankTxId);
      if (!tx) return;

      const nowIso = new Date().toISOString();
      const paidAmount = getBankDepositAmount(tx);

      const { data: invRows, error: lookupErr } = await supabase
        .from("invoices")
        .select("id, payload")
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
        window.alert("請求書IDが取得できませんでした。console.logで確認: " + JSON.stringify(invoiceOrId));
        return;
      }

      console.log("invRows sample:", JSON.stringify(invRows?.[0]));
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
      console.log("invoiceDbId確認:", invoiceDbId, "businessId:", businessId);

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
        .eq("id", bankTxId);
      if (txErr) throw txErr;

      const { error: invErr } = await supabase
        .from("invoices")
        .update({ payload: invPayloadNext })
        .eq("id", invoiceDbId);
      if (invErr) throw invErr;

      setBankTransactions((prev) =>
        prev.map((row) =>
          row?.id === bankTxId
            ? { ...row, status: "matched", match_status: "matched", matched_invoice_id: invoiceDbId, matched_at: nowIso, matched_by: userId }
            : row
        )
      );

      setData((d) => ({
        ...d,
        bankTransactions: (Array.isArray(d?.bankTransactions) ? d.bankTransactions : []).map((row) =>
          row?.id === bankTxId
            ? { ...row, status: "matched", match_status: "matched", matched_invoice_id: invoiceDbId, matched_at: nowIso, matched_by: userId }
            : row
        ),
      }));

      window.alert("照合確定しました（" + customerNameForEvent + " / " + invBusinessId + "）");
    } catch (err) {
      console.error("confirmMatch error:", err);
      window.alert("照合確定に失敗しました：" + (err?.message || String(err)));
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

  const onUploadCsv = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingCsv(true);
    try {
      const parsedRows = await decodeCsvFile(file);
      const existingKeys = new Set(bankTransactions.map(makeDedupeKey));
      const newRows = parsedRows.filter((row) => !existingKeys.has(makeDedupeKey(row)));
      const skipped = parsedRows.length - newRows.length;

      console.log("[CSV dedupe] 既存キー一覧:", Array.from(existingKeys));
      console.log("[CSV dedupe] パース結果＋キー:", parsedRows.map((r) => ({ ...r, _key: makeDedupeKey(r) })));
      console.log("[CSV dedupe] 新規:", newRows.length, "スキップ:", skipped);

      if (newRows.length > 0) {
        const { data: inserted, error: saveErr } = await supabase
          .from("bank_transactions")
          .insert(newRows)
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
          <RetroBtn onClick={() => fileInputRef.current?.click()} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>
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
                            <RetroBtn onClick={()=>confirmMatch(b?.id, candidate.invoice || inv)} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>
                              {checkIcon}この候補で確定
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
        <RetroTable
          headers={["支払先","区分","期日","金額","状態","操作"]}
          rows={payables.map(p=>[
            p?.vendor||"", p?.category||"", p?.dueDate||"",
            "¥"+(Number(p?.amount)||0).toLocaleString(),
            <StatusPill s={p?.status}/>,
            p?.status==="unpaid"
              ? <RetroBtn small onClick={()=>setData(d=>({...d,payables:(Array.isArray(d?.payables) ? d.payables : []).map(x=>x?.id===p?.id?{...x,status:"paid"}:x)}))} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>{checkIcon}支払済</RetroBtn>
              : <span style={{ fontSize:"10px", color:"#999" }}>済</span>
          ])}
        />
      </Panel>

      {addTx&&(
        <Modal title="入出金を手動追加" icon={bankIcon} onClose={()=>setAddTx(false)} width={400}>
          <Fl label="日付"><RetroInput type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/></Fl>
          <Fl label="金額（円）"><RetroInput type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} placeholder="50000"/></Fl>
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
const DashboardPage = ({ data, setData, setPage, tenantId, userRole }) => {
  const events = Array.isArray(data?.events) ? data.events : [];
  const bankTransactions = Array.isArray(data?.bankTransactions) ? data.bankTransactions : [];
  const invoices = Array.isArray(data?.invoices) ? data.invoices : [];
  const orders = Array.isArray(data?.orders) ? data.orders : [];
  const drivers = Array.isArray(data?.drivers) ? data.drivers : [];
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
  const todayEvents = events.filter(e=>e?.date===todayStr);
  const todayBanks = bankTransactions.filter(b=>b?.date===todayStr);
  const unmatchedCount = bankTransactions.filter(b=>b?.status==="unmatched").length;
  const overdueCount = invoices.filter(i=>i?.status==="overdue"||(i?.status==="unpaid"&&(i?.dueDate||"")<todayStr)).length;
  const activeOrders = orders.filter(o=>["pending","scheduled","in_transit"].includes(o?.status)).length;
  const availableDrivers = drivers.filter(d=>d?.status==="available").length;
  const totalRevenue = invoices.filter(i=>i?.status==="paid").reduce((s,i)=>s+(Number(i?.total)||0),0);
  const unpaidTotal = invoices.filter(i=>i?.status!=="paid").reduce((s,i)=>s+(Number(i?.total)||0),0);

  const alertCard = (bg, color, title, body, onClick) => (
    <div style={{ background:bg, border:cardBorder, borderLeft:`4px solid ${color}`, borderRadius:"6px", padding:"10px 12px", flex:1, cursor:"pointer" }} onClick={onClick}>
      <div style={{ color, fontWeight:700, fontSize:"12px", marginBottom:"2px" }}>{title}</div>
      <div style={{ color:"#666", fontSize:"12px" }}>{body}</div>
    </div>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>
      <div style={{ display:"flex", gap:"10px", flexWrap:"wrap" }}>
        {unmatchedCount>0 && alertCard("#fff3e0", "#ff9800", "未照合入金があります", `${unmatchedCount}件の入金照合が未処理です`, ()=>setPage("bank"))}
        {overdueCount>0 && alertCard("#ffebee", "#e63946", "支払延滞があります", `${overdueCount}件の延滞が発生しています`, ()=>setPage("bank"))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:"10px" }}>
        {[["稼働中案件",activeOrders+"件","#00a09a"],["待機ドライバー",availableDrivers+"名","#2196f3"],["入金済売上","¥"+totalRevenue.toLocaleString(),"#7b1fa2"],["未回収","¥"+unpaidTotal.toLocaleString(),"#e63946"]].map(([l,v,c])=>(
          <div key={l} style={{ background:"#fff", border:cardBorder, borderRadius:"6px", padding:"12px" }}>
            <div style={{ fontSize:"11px", color:"#888", marginBottom:"6px", fontWeight:700 }}>{l}</div>
            <div style={{ fontSize:"21px", fontWeight:700, color:c }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))", gap:"12px" }}>
        <Panel title={`本日の予定（${todayStr}）`} icon={<Icon size={14}><rect x="3" y="4" width="18" height="18"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/></Icon>}>
          {todayEvents.length===0&&todayBanks.length===0&&<div style={{ fontSize:"12px", color:"#999", padding:"8px" }}>本日の予定はありません</div>}
          {todayEvents.map(ev=>(
            <div key={ev.id} style={{ display:"flex", alignItems:"center", gap:"8px", padding:"8px 4px", borderBottom:"1px solid #f0f0f0" }}>
              <div style={{ width:"8px", height:"8px", borderRadius:"50%", background:ev.color }}/>
              <span style={{ fontSize:"12px", flex:1 }}>{ev.title}</span>
              <span style={{ background:"#f5f7f8", color:"#666", fontSize:"10px", padding:"2px 6px", borderRadius:"999px" }}>{EVENT_TYPE_LABEL[ev.type]||ev.type}</span>
            </div>
          ))}
          {todayBanks.map(b=>(
            <div key={b.id} style={{ display:"flex", alignItems:"center", gap:"8px", padding:"8px 4px", borderBottom:"1px solid #f0f0f0" }}>
              <div style={{ width:"8px", height:"8px", borderRadius:"50%", background:"#00a09a" }}/>
              <span style={{ fontSize:"12px", flex:1 }}>入金 ¥{b.amount.toLocaleString()} {b.description}</span>
              <StatusPill s={b.status}/>
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
      </div>
    </div>
  );
};

// ===== OTHER PAGES (simplified) =====
const OrdersPage = ({ data, setData, tenantId, userRole }) => {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ customerId:"", deliveryType:"route", deliveryDate:"", pickupTime:"", deliveryTime:"", from:"", to:"", cargo:"", weight:"", amount:"", notes:"" });
  const [search, setSearch] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [orderEditMode, setOrderEditMode] = useState(false);
  const [orderDraft, setOrderDraft] = useState(null);
  if (!data) {
    return (
      <div style={{ border:cardBorder, borderRadius:"6px", background:"#fff", padding:"24px", textAlign:"center", fontSize:"12px", color:"#999" }}>
        読み込み中...
      </div>
    );
  }
  const orders = (Array.isArray(data.orders) ? data.orders : []).filter(o => !o?.deleted);
  const customers = Array.isArray(data.customers) ? data.customers : [];
  const filtered = orders.filter((o) => {
    const customerName = o?.customerName || "";
    const id = o?.id || "";
    const cargo = o?.cargo || "";
    return customerName.includes(search) || id.includes(search) || cargo.includes(search);
  });
  const statusNext = { pending:"scheduled", scheduled:"in_transit", in_transit:"delivered" };
  const statusPrev = { delivered:"in_transit", in_transit:"scheduled", scheduled:"pending" };
  const selectedOrder = orders.find((o) => o?.id === selectedOrderId) || null;

  useEffect(() => {
    if (!Array.isArray(data?.orders)) return;
    const todayStr = new Date().toISOString().slice(0, 10);
    const hasUpdate = data.orders.some(
      (o) => o?.deliveryDate && o.deliveryDate < todayStr &&
        o?.status !== "delivered" && o?.status !== "cancelled"
    );
    if (!hasUpdate) return;
    setData((d) => ({
      ...d,
      orders: (Array.isArray(d?.orders) ? d.orders : []).map((o) => {
        if (o?.deliveryDate && o.deliveryDate < todayStr &&
            o?.status !== "delivered" && o?.status !== "cancelled") {
          return { ...o, status: "delivered" };
        }
        return o;
      }),
      dailyRecords: [
        ...(Array.isArray(d?.dailyRecords) ? d.dailyRecords : []),
        ...(Array.isArray(d?.orders) ? d.orders : [])
          .filter((o) =>
            o?.deliveryDate && o.deliveryDate < todayStr &&
            o?.status !== "delivered" && o?.status !== "cancelled" &&
            !(Array.isArray(d?.dailyRecords) ? d.dailyRecords : [])
              .some((r) => r?.orderId === o.id)
          )
          .map((o) => ({
            id: `DR-${Date.now()}-${o.id}`,
            orderId: o.id,
            date: o.deliveryDate,
            driverId: o.assignedDriverId || "",
            customerId: o.customerId || "",
            jobTypeId: o.jobTypeId || "",
            count: 1,
            distance: o.distance || "",
            hours: o.hours || "",
            salesAmount: Number(o.amount) || 0,
            driverAmount: 0,
            note: `受注 ${o.id} より自動連携`,
          })),
      ],
    }));
  }, [data?.orders, setData]);

  const openOrderDetail = (order) => {
    setSelectedOrderId(order?.id || null);
    setOrderEditMode(false);
    setOrderDraft(order ? { ...order } : null);
  };

  const closeOrderDetail = () => {
    setSelectedOrderId(null);
    setOrderEditMode(false);
    setOrderDraft(null);
  };

  const saveOrderDetail = () => {
    if (!orderDraft?.id) return;
    setData((d) => ({
      ...d,
      orders: (Array.isArray(d?.orders) ? d.orders : []).map((order) =>
        order?.id === orderDraft.id ? { ...order, ...orderDraft, amount: Number(orderDraft?.amount) || 0 } : order
      ),
    }));
    setOrderEditMode(false);
  };

  const goNextStatus = (orderId, currentStatus) => {
    const next = statusNext[currentStatus];
    if (!next) return;
    setData((d) => {
      const currentOrders = Array.isArray(d?.orders) ? d.orders : [];
      const currentInvoices = Array.isArray(d?.invoices) ? d.invoices : [];
      const currentCustomers = Array.isArray(d?.customers) ? d.customers : [];
      const targetOrder = currentOrders.find((x) => x?.id === orderId);
      const nextOrders = currentOrders.map((x) =>
        x?.id === orderId ? { ...x, status: next } : x
      );

      if (next !== "delivered" || !targetOrder) {
        return { ...d, orders: nextOrders };
      }

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
              driverAmount: 0,
              note: `受注 ${targetOrder?.id} より自動連携`,
            },
          ];

      const alreadyExists = currentInvoices.some((inv) => inv?.orderId === orderId);
      if (alreadyExists) {
        return { ...d, orders: nextOrders, dailyRecords: nextDailyRecords };
      }

      const customer = currentCustomers.find((c) => c?.id === targetOrder?.customerId);
      const baseAmount = Number(targetOrder?.amount) || Number(customer?.unitPrice) || 0;
      const tax = Math.round(baseAmount * 0.1);
      const issueDate = targetOrder?.deliveryDate || formatDate(new Date());
      const dueDate = calcDueDateByTerms(
        issueDate,
        customer?.closingDay ?? 31,
        customer?.paymentSite || "翌月末払い"
      );
      const nextInvoice = {
        id:`INV-${String(currentInvoices.length+1).padStart(3,"0")}`,
        orderId: targetOrder?.id,
        customerId: targetOrder?.customerId,
        customerName: targetOrder?.customerName || customer?.name || "",
        issueDate,
        dueDate,
        amount: baseAmount,
        tax,
        total: baseAmount + tax,
        status:"unpaid",
        bankRef:"",
        paidDate:null,
        note:"",
      };
      const customerName = nextInvoice.customerName;
      const customerId = nextInvoice.customerId;
      const baseEv = Array.isArray(d?.events) ? d.events : [];
      const alreadyHasEvent = baseEv.some((ev) =>
        ev?.type === "payment_due" &&
        ev?.date === dueDate &&
        (ev?.title?.includes(customerName) || ev?.customerId === customerId)
      );
      const nextEvents = alreadyHasEvent
        ? baseEv
        : [
            ...baseEv,
            {
              id:`EV-INV${Date.now()}`,
              date: dueDate,
              type:"payment_due",
              title:`入金期日：${nextInvoice.customerName}`,
              color:"#660099",
              invoiceId: nextInvoice.id,
              customerId,
            },
          ];

      return {
        ...d,
        orders: nextOrders,
        invoices: [nextInvoice, ...currentInvoices],
        events: nextEvents,
        dailyRecords: nextDailyRecords,
      };
    });
  };

  const goPrevStatus = (orderId, currentStatus) => {
    const prev = statusPrev[currentStatus];
    if (!prev) return;
    setData((d) => ({
      ...d,
      orders: (Array.isArray(d?.orders) ? d.orders : []).map((x) =>
        x?.id === orderId ? { ...x, status: prev } : x
      ),
    }));
  };
  const handleAdd = () => {
    const c = customers.find(x=>x.id===form.customerId);
    const o = { id:`ORD-${String(orders.length+1).padStart(3,"0")}`, customerId:form.customerId, customerName:c?.name||"", deliveryType:form.deliveryType || "route", date:fmt(today.getDate()), deliveryDate:form.deliveryDate, pickupTime:form.pickupTime || "", deliveryTime:form.deliveryTime || "", from:form.from, to:form.to, cargo:form.cargo, weight:form.weight, status:"pending", driverId:null, vehicleId:null, amount:parseInt(form.amount)||0, notes:form.notes };
    setData(d=>({ ...d, orders:[o,...(Array.isArray(d?.orders) ? d.orders : [])], events:[...(Array.isArray(d?.events) ? d.events : []),{id:`EV-O${Date.now()}`,date:form.deliveryDate,type:"delivery",title:`${o.id} 配達予定 ${c?.name||""}`,color:"#0000cc"}] }));
    setShowModal(false); setForm({ customerId:"", deliveryType:"route", deliveryDate:"", pickupTime:"", deliveryTime:"", from:"", to:"", cargo:"", weight:"", amount:"", notes:"" });
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
      <div style={{ border:`1px solid ${UI.border}`, borderRadius:"6px", background:"#fff", overflow:"auto", maxHeight:"320px" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontFamily:"'Noto Sans JP', sans-serif", fontSize:"12px" }}>
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
                <td style={{ padding:"8px 10px" }}>{`${o?.cargo||""}(${o?.weight||""})`}</td>
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
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"6px 12px" }}>
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
            </RetroSelect>
          </Fl>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 12px" }}>
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
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"6px 12px" }}>
          <Fl label="荷物名"><RetroInput value={form.cargo} onChange={e=>setForm(f=>({...f,cargo:e.target.value}))}/></Fl>
          <Fl label="重量"><RetroInput value={form.weight} onChange={e=>setForm(f=>({...f,weight:e.target.value}))}/></Fl>
          <Fl label="金額（円）"><RetroInput type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))}/></Fl>
        </div>
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
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 12px" }}>
                <Fl label="配達日"><RetroInput type="date" value={orderDraft?.deliveryDate || ""} onChange={(e)=>setOrderDraft((prev)=>({ ...(prev||{}), deliveryDate:e.target.value }))}/></Fl>
                <Fl label="配送種別">
                  <RetroSelect value={orderDraft?.deliveryType || "route"} onChange={(e)=>setOrderDraft((prev)=>({ ...(prev||{}), deliveryType:e.target.value }))}>
                    <option value="route">ルート配送</option>
                    <option value="charter">チャーター便</option>
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
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"6px 12px" }}>
                <Fl label="荷物"><RetroInput value={orderDraft?.cargo || ""} onChange={(e)=>setOrderDraft((prev)=>({ ...(prev||{}), cargo:e.target.value }))}/></Fl>
                <Fl label="重量"><RetroInput value={orderDraft?.weight || ""} onChange={(e)=>setOrderDraft((prev)=>({ ...(prev||{}), weight:e.target.value }))}/></Fl>
                <Fl label="金額"><RetroInput type="number" value={orderDraft?.amount ?? ""} onChange={(e)=>setOrderDraft((prev)=>({ ...(prev||{}), amount:e.target.value }))}/></Fl>
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
                  <div>配送種別</div><div>{selectedOrder?.deliveryType === "charter" ? "チャーター便" : "ルート配送"}</div>
                  <div>配達日</div><div>{selectedOrder?.deliveryDate || ""}</div>
                  <div>出発地</div><div>{selectedOrder?.from || ""}</div>
                  <div>配送先</div><div>{selectedOrder?.to || ""}</div>
                  <div>荷物</div><div>{selectedOrder?.cargo || ""}</div>
                  <div>重量</div><div>{selectedOrder?.weight || ""}</div>
                  <div>金額</div><div>¥{(Number(selectedOrder?.amount)||0).toLocaleString()}</div>
                  <div>備考</div><div>{selectedOrder?.notes || "—"}</div>
                  <div>状態</div><div><StatusPill s={selectedOrder?.status}/></div>
                </div>
              </Panel>
              <div style={{ display:"flex", justifyContent:"flex-end", gap:"6px", marginTop:"8px" }}>
                <RetroBtn onClick={()=>{ if(!window.confirm("この受注を削除しますか？（後から復元できます）")) return; setData(d=>({...d, orders:(Array.isArray(d?.orders)?d.orders:[]).map(o=>o?.id===selectedOrder?.id?{...o,deleted:true}:o)})); closeOrderDetail(); }} style={{ background:"#fff", color:"#e63946", borderColor:"#e63946" }}>削除</RetroBtn>
                <RetroBtn onClick={closeOrderDetail}>閉じる</RetroBtn>
                <RetroBtn onClick={()=>{ setOrderDraft(selectedOrder ? { ...selectedOrder } : null); setOrderEditMode(true); }} style={{ background:"#fff", color:"#00a09a", borderColor:"#00a09a" }}>編集</RetroBtn>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
};

const DispatchPage = ({ data, setData, tenantId, userRole }) => {
  const orders = Array.isArray(data?.orders) ? data.orders : [];
  const drivers = Array.isArray(data?.drivers) ? data.drivers : [];
  const vehicles = Array.isArray(data?.vehicles) ? data.vehicles : [];
  const [sel, setSel] = useState(null);
  const [aD, setAD] = useState(""); const [aV, setAV] = useState("");
  const pending = orders.filter(o=>o?.status==="pending");
  const scheduled = orders.filter(o=>o?.status==="scheduled");
  const doAssign = () => {
    if(!sel||!aD||!aV) return;
    setData(d=>({...d,orders:(Array.isArray(d?.orders) ? d.orders : []).map(o=>o?.id===sel?{...o,driverId:aD,vehicleId:aV,status:"scheduled"}:o)}));
    setSel(null); setAD(""); setAV("");
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
            <div key={o?.id||`pending-${Math.random()}`} onClick={()=>setSel(o?.id===sel?null:o?.id)} style={{ border:cardBorder, background:sel===o?.id?"#e8f5f4":"#fff", padding:"8px 10px", marginBottom:"6px", cursor:"pointer", borderRadius:"6px" }}>
              <div style={{ fontSize:"12px", fontWeight:700, color:"#007a74" }}>{o?.id||"—"} — {o?.customerName||""}</div>
              <div style={{ fontSize:"12px", color:"#666" }}>{o?.cargo||""}（{o?.weight||""}）配達日：{o?.deliveryDate||""}</div>
            </div>
          ))}
        </Panel>
        {sel&&<Panel title="配車アサイン" icon={truckIcon} style={{ marginTop:"10px" }}>
          <Fl label="ドライバー"><RetroSelect value={aD} onChange={e=>setAD(e.target.value)}><option value="">選択</option>{drivers.filter(d=>d?.status==="available").map(d=><option key={d?.id||`driver-${Math.random()}`} value={d?.id||""}>{d?.name||""}（{d?.license||""}）</option>)}</RetroSelect></Fl>
          <Fl label="車両"><RetroSelect value={aV} onChange={e=>setAV(e.target.value)}><option value="">選択</option>{vehicles.filter(v=>v?.status==="available").map(v=><option key={v?.id||`vehicle-${Math.random()}`} value={v?.id||""}>{v?.plate||""}</option>)}</RetroSelect></Fl>
          <RetroBtn onClick={doAssign} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>{truckIcon}配車確定</RetroBtn>
        </Panel>}
      </div>
      <div style={{ flex:1 }}>
        <Panel title={`配車済（${scheduled.length}件）`} icon={checkIcon}>
          {scheduled.map(o=>{
            const dr=drivers.find(d=>d?.id===o?.driverId); const vh=vehicles.find(v=>v?.id===o?.vehicleId);
            return <div key={o?.id||`scheduled-${Math.random()}`} style={{ border:cardBorder, background:"#fff", padding:"8px 10px", marginBottom:"6px", borderRadius:"6px" }}>
              <div style={{ fontSize:"12px", fontWeight:700, color:"#007a74" }}>{o?.id||"—"} — {o?.customerName||""}</div>
              <div style={{ display:"flex", gap:"6px", marginTop:"3px" }}>
                {dr&&<span style={{ background:"#e3f2fd", color:"#1565c0", fontSize:"10px", padding:"2px 8px", borderRadius:"999px", display:"inline-flex", alignItems:"center", gap:"4px" }}>{userIcon}{dr?.name||""}</span>}
                {vh&&<span style={{ background:"#e8f5e9", color:"#2e7d32", fontSize:"10px", padding:"2px 8px", borderRadius:"999px", display:"inline-flex", alignItems:"center", gap:"4px" }}>{truckIcon}{vh?.plate||""}</span>}
              </div>
            </div>;
          })}
        </Panel>
      </div>
    </div>
  );
};

const CustomersPage = ({ data, setData, tenantId, userRole }) => {
  const customers = (Array.isArray(data?.customers) ? data.customers : []).filter(c => !c?.deleted);
  const orders = Array.isArray(data?.orders) ? data.orders : [];
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name:"", contact:"", phone:"", email:"", payer_kana:"", address:"", notes:"", unitPrice:"", closingDay:31, paymentSite:"翌月末払い" });
  const [isAddPayerKanaComposing, setIsAddPayerKanaComposing] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [customerEditMode, setCustomerEditMode] = useState(false);
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
    setData(d=>({...d,customers:[...(Array.isArray(d?.customers) ? d.customers : []),{id:`C${String((Array.isArray(d?.customers) ? d.customers.length : 0)+1).padStart(3,"0")}`, ...form, unitPrice:Number(form.unitPrice)||0, closingDay:Number(form.closingDay)||31 }]}));
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
  };

  const saveCustomer = () => {
    if (!customerDraft?.id) return;
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
    if (!window.confirm("この顧客を削除しますか？（後から復元できます）")) return;
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
      <div><RetroBtn onClick={()=>setShowModal(true)} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>{plusIcon}顧客追加</RetroBtn></div>
      <div style={{ border:cardBorder, borderRadius:"6px", background:"#fff", overflow:"auto", maxHeight:"320px" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontFamily:"'Noto Sans JP', sans-serif", fontSize:"12px" }}>
          <thead>
            <tr style={{ background:"#fafbfc", position:"sticky", top:0 }}>
              {["ID","会社名","担当者","電話","単価","締め日/支払サイト","案件数","累計売上"].map((h)=><th key={h} style={{ color:"#666", fontSize:"11px", padding:"8px 10px", textAlign:"left", fontWeight:700, whiteSpace:"nowrap", borderBottom:cardBorder }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {customers.map((c, index) => {
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
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 12px"}}>
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
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"6px 12px"}}>
          <Fl label="単価（円）"><RetroInput type="number" value={form.unitPrice} onChange={e=>setForm(f=>({...f,unitPrice:e.target.value}))}/></Fl>
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
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 12px"}}>
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
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"6px 12px"}}>
                <Fl label="単価（円）"><RetroInput type="number" value={customerDraft?.unitPrice ?? ""} onChange={(e)=>setCustomerDraft((prev)=>({ ...(prev||{}), unitPrice:Number(e.target.value)||0 }))}/></Fl>
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

const QualityMgmtPage = ({ data, setData, tenantId, userRole }) => {
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
    console.log("saveCell called", { driverId, date, jobTypeId, field, value, customerId, salesAmount, driverAmount });
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
const SalesMgmtPage = ({ data, setData, tenantId, userRole }) => {
  const qualityRecords = Array.isArray(data?.qualityRecords) ? data.qualityRecords : [];
  const drivers = (Array.isArray(data?.drivers) ? data.drivers : []).filter(d => !d?.deleted);
  const customers = (Array.isArray(data?.customers) ? data.customers : []).filter(c => !c?.deleted);
  const jobTypes = Array.isArray(data?.jobTypes) ? data.jobTypes : [];
  const dailyRecords = Array.isArray(data?.dailyRecords) ? data.dailyRecords : [];
  const [activeTab, setActiveTab] = useState("daily");
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  });
  const [showJobTypeModal, setShowJobTypeModal] = useState(false);
  const [editingJobType, setEditingJobType] = useState(null);
  const [jobTypeForm, setJobTypeForm] = useState({ name:"", calcPattern:"count", taxable:true, unitPrice:"", driverUnitPrice:"", note:"" });
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [recordForm, setRecordForm] = useState({
    date: new Date().toISOString().slice(0,10),
    driverId:"", customerId:"", jobTypeId:"",
    count:"", distance:"", hours:"",
    unitPrice:"", driverUnitPrice:"",
    salesAmount:0, driverAmount:0,
    note:"",
  });

  const driverRoutes = (() => {
    const driver = drivers.find(d => d?.id === recordForm.driverId);
    return driver?.routes || [];
  })();

  const calcPatternLabel = { count:"個数×単価", fixed:"固定料金", distance:"距離制", time:"時間制" };

  const calcAmounts = (form, jt) => {
    const pattern = jt?.calcPattern || form.calcPattern || "count";
    const up = Number(form.unitPrice) || Number(jt?.unitPrice) || 0;
    const dup = Number(form.driverUnitPrice) || Number(jt?.driverUnitPrice) || 0;
    let sales = 0, driver = 0;
    if (pattern === "count") { const c = Number(form.count)||0; sales = c * up; driver = c * dup; }
    else if (pattern === "fixed") { sales = up; driver = dup; }
    else if (pattern === "distance") { const d = Number(form.distance)||0; sales = d * up; driver = d * dup; }
    else if (pattern === "time") { const h = Number(form.hours)||0; sales = h * up; driver = h * dup; }
    return { salesAmount: sales, driverAmount: driver };
  };

  const updateRecordCalc = (newForm) => {
    const jt = jobTypes.find(j => j?.id === newForm.jobTypeId);
    const { salesAmount, driverAmount } = calcAmounts(newForm, jt);
    setRecordForm({ ...newForm, salesAmount, driverAmount });
  };

  const openAddRecord = () => {
    const base = { date: new Date().toISOString().slice(0,10), driverId:"", customerId:"", jobTypeId:"", count:"", distance:"", hours:"", unitPrice:"", driverUnitPrice:"", salesAmount:0, driverAmount:0, note:"" };
    setEditingRecord(null);
    setRecordForm(base);
    setShowRecordModal(true);
  };

  const openEditRecord = (rec) => {
    setEditingRecord(rec);
    setRecordForm({ ...rec, count: rec.count||"", distance: rec.distance||"", hours: rec.hours||"" });
    setShowRecordModal(true);
  };

  const saveRecord = () => {
    if (!recordForm.date || !recordForm.driverId || !recordForm.customerId || !recordForm.jobTypeId) return;
    const jt = jobTypes.find(j => j?.id === recordForm.jobTypeId);
    const { salesAmount, driverAmount } = calcAmounts(recordForm, jt);
    const next = { ...recordForm, salesAmount, driverAmount };
    setData(d => {
      const current = Array.isArray(d?.dailyRecords) ? d.dailyRecords : [];
      if (editingRecord) return { ...d, dailyRecords: current.map(r => r?.id === editingRecord.id ? { ...r, ...next } : r) };
      return { ...d, dailyRecords: [...current, { ...next, id: `DR-${Date.now()}` }] };
    });
    setShowRecordModal(false);
  };

  const deleteRecord = (id) => {
    if (!window.confirm("この記録を削除しますか？")) return;
    setData(d => ({ ...d, dailyRecords: (Array.isArray(d?.dailyRecords) ? d.dailyRecords : []).filter(r => r?.id !== id) }));
  };

  const saveJobType = () => {
    if (!jobTypeForm.name) return;
    setData(d => {
      const current = Array.isArray(d?.jobTypes) ? d.jobTypes : [];
      if (editingJobType) return { ...d, jobTypes: current.map(j => j?.id === editingJobType.id ? { ...j, ...jobTypeForm, unitPrice: Number(jobTypeForm.unitPrice)||0, driverUnitPrice: Number(jobTypeForm.driverUnitPrice)||0 } : j) };
      return { ...d, jobTypes: [...current, { ...jobTypeForm, id: `JT-${String(current.length+1).padStart(3,"0")}`, unitPrice: Number(jobTypeForm.unitPrice)||0, driverUnitPrice: Number(jobTypeForm.driverUnitPrice)||0 }] };
    });
    setShowJobTypeModal(false);
  };

  const deleteJobType = (id) => {
    if (!window.confirm("この仕事種別を削除しますか？")) return;
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
    const taxable = combined.filter(r => { const jt = jobTypes.find(j=>j?.id===r?.jobTypeId); return jt?.taxable !== false; }).reduce((s,r)=>s+(Number(r?.salesAmount)||0),0);
    const tax = Math.round(taxable * 0.1);
    return { customer, count: combined.length, subtotal, tax, total: subtotal + tax };
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
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div style={{ fontSize:"14px", fontWeight:700, color:"#222" }}>日次配送実績入力</div>
            <RetroBtn onClick={openAddRecord} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>{plusIcon}実績を追加</RetroBtn>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
            <span style={{ fontSize:"12px", color:"#666" }}>表示月：</span>
            <input type="month" value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)} style={{ border:"1px solid #d0d0d0", borderRadius:"4px", padding:"6px 10px", fontSize:"13px" }}/>
          </div>
          <div style={{ border:cardBorder, borderRadius:"6px", background:"#fff", overflow:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"12px", fontFamily:"'Noto Sans JP', sans-serif" }}>
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
                      <td style={{ padding:"8px 10px" }}>{driver?.name||"—"}</td>
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
                      <td style={{ padding:"8px 10px" }}>{driver?.name||row.driverId||"—"}</td>
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
                  const alreadyExists = (Array.isArray(data?.invoices) ? data.invoices : []).some(inv => {
                    const p = inv?.payload ? (typeof inv.payload === "string" ? JSON.parse(inv.payload) : inv.payload) : inv;
                    return p?.salesMgmtMonth === selectedMonth
                      && p?.salesMgmtMonth != null
                      && (p?.customerId === s.customer?.id || inv?.customerId === s.customer?.id);
                  });
                  return (
                    <div key={s.customer?.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 12px", border:"1px solid #e8e8e8", borderRadius:"6px", background:"#fff" }}>
                      <div>
                        <div style={{ fontSize:"12px", fontWeight:700, color:"#333" }}>{s.customer?.name}</div>
                        <div style={{ fontSize:"11px", color:"#888", marginTop:"2px" }}>
                          {s.count}件 / 小計¥{s.subtotal.toLocaleString()} / 税¥{s.tax.toLocaleString()} / 合計¥{s.total.toLocaleString()}
                        </div>
                      </div>
                      {alreadyExists ? (
                        <span style={{ fontSize:"11px", color:"#2e7d32", fontWeight:700, background:"#e8f5e9", border:"1px solid #4caf50", borderRadius:"999px", padding:"2px 10px" }}>生成済</span>
                      ) : (
                        <RetroBtn small onClick={() => {
                          const recs = [...monthRecords, ...qualityDailyRows].filter(r => r?.customerId === s.customer?.id);
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
                          const issueDate = `${selectedMonth}-${new Date(selectedMonth+"-01").toISOString().slice(0,7) === selectedMonth ? String(new Date(new Date(selectedMonth+"-01").getFullYear(), new Date(selectedMonth+"-01").getMonth()+1, 0).getDate()).padStart(2,"0") : "30"}`;
                          const dueDate = calcDueDateByTerms(issueDate, customer?.closingDay ?? 31, customer?.paymentSite || "翌月末払い");
                          const currentInvoices = Array.isArray(data?.invoices) ? data.invoices : [];
                          const newInv = {
                            id: `INV-${String(currentInvoices.length+1).padStart(3,"0")}`,
                            customerId: customer?.id,
                            customerName: customer?.name || "",
                            issueDate,
                            dueDate,
                            amount: s.subtotal,
                            tax: s.tax,
                            total: s.total,
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
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 12px" }}>
            <Fl label="日付"><RetroInput type="date" value={recordForm.date} onChange={e=>updateRecordCalc({...recordForm,date:e.target.value})}/></Fl>
            <Fl label="ドライバー">
              <RetroSelect value={recordForm.driverId} onChange={e=>updateRecordCalc({...recordForm,driverId:e.target.value})}>
                <option value="">選択</option>
                {drivers.map(d=><option key={d?.id} value={d?.id}>{d?.name}</option>)}
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
                    updateRecordCalc({
                      ...recordForm,
                      customerId: route.customerId||"",
                      jobTypeId: route.jobTypeId||"",
                      unitPrice: String(route.unitPrice||jt?.unitPrice||""),
                      driverUnitPrice: String(route.driverUnitPrice||jt?.driverUnitPrice||""),
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
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"6px 12px" }}>
            {(pattern==="count"||pattern==="fixed"||!pattern) && <Fl label="個数"><RetroInput type="number" value={recordForm.count} onChange={e=>updateRecordCalc({...recordForm,count:e.target.value})}/></Fl>}
            {pattern==="distance" && <Fl label="距離(km)"><RetroInput type="number" value={recordForm.distance} onChange={e=>updateRecordCalc({...recordForm,distance:e.target.value})}/></Fl>}
            {pattern==="time" && <Fl label="稼働時間(h)"><RetroInput type="number" value={recordForm.hours} onChange={e=>updateRecordCalc({...recordForm,hours:e.target.value})}/></Fl>}
            <Fl label="売上単価"><RetroInput type="number" value={recordForm.unitPrice} onChange={e=>updateRecordCalc({...recordForm,unitPrice:e.target.value})}/></Fl>
            <Fl label="支払単価"><RetroInput type="number" value={recordForm.driverUnitPrice} onChange={e=>updateRecordCalc({...recordForm,driverUnitPrice:e.target.value})}/></Fl>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 12px", background:"#f9fcfc", border:"1px solid #e8e8e8", borderRadius:"6px", padding:"10px", marginBottom:"8px" }}>
            <Fl label="売上金額（自動計算）"><div style={{ fontSize:"18px", fontWeight:700, color:"#007a74", padding:"6px 0" }}>¥{(Number(recordForm.salesAmount)||0).toLocaleString()}</div></Fl>
            <Fl label="支払額（自動計算）"><div style={{ fontSize:"18px", fontWeight:700, color:"#e65100", padding:"6px 0" }}>¥{(Number(recordForm.driverAmount)||0).toLocaleString()}</div></Fl>
          </div>
          <Fl label="備考"><RetroInput value={recordForm.note} onChange={e=>setRecordForm(v=>({...v,note:e.target.value}))}/></Fl>
          <div style={{ display:"flex", justifyContent:"flex-end", gap:"6px", marginTop:"10px" }}>
            <RetroBtn onClick={()=>setShowRecordModal(false)}>キャンセル</RetroBtn>
            <RetroBtn onClick={saveRecord} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>保存する</RetroBtn>
          </div>
        </Modal>
      )}

      {showJobTypeModal && (
        <Modal title={editingJobType ? "仕事種別編集" : "仕事種別追加"} icon={salesIcon} onClose={()=>setShowJobTypeModal(false)} width={480}>
          <Fl label="種別名"><RetroInput value={jobTypeForm.name} onChange={e=>setJobTypeForm(v=>({...v,name:e.target.value}))} placeholder="例：ルート、チビ宅"/></Fl>
          <Fl label="計算パターン">
            <RetroSelect value={jobTypeForm.calcPattern} onChange={e=>setJobTypeForm(v=>({...v,calcPattern:e.target.value}))}>
              <option value="count">個数×単価</option>
              <option value="fixed">固定料金</option>
              <option value="distance">距離制（km×単価）</option>
              <option value="time">時間制（時間×単価）</option>
            </RetroSelect>
          </Fl>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 12px" }}>
            <Fl label="売上単価（円）"><RetroInput type="number" value={jobTypeForm.unitPrice} onChange={e=>setJobTypeForm(v=>({...v,unitPrice:e.target.value}))} placeholder="例：180"/></Fl>
            <Fl label="ドライバー支払単価（円）"><RetroInput type="number" value={jobTypeForm.driverUnitPrice} onChange={e=>setJobTypeForm(v=>({...v,driverUnitPrice:e.target.value}))} placeholder="例：150"/></Fl>
          </div>
          <Fl label="課税区分">
            <label style={{ display:"inline-flex", alignItems:"center", gap:"6px", fontSize:"12px", cursor:"pointer" }}>
              <input type="checkbox" checked={!!jobTypeForm.taxable} onChange={e=>setJobTypeForm(v=>({...v,taxable:e.target.checked}))}/>
              課税（消費税10%）
            </label>
          </Fl>
          <Fl label="メモ"><RetroInput value={jobTypeForm.note} onChange={e=>setJobTypeForm(v=>({...v,note:e.target.value}))}/></Fl>
          <div style={{ display:"flex", justifyContent:"flex-end", gap:"6px", marginTop:"10px" }}>
            <RetroBtn onClick={()=>setShowJobTypeModal(false)}>キャンセル</RetroBtn>
            <RetroBtn onClick={saveJobType} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>保存する</RetroBtn>
          </div>
        </Modal>
      )}
    </div>
  );
};

const InvoicesPage = ({ data, setData, tenantId, userRole }) => {
  const orders = Array.isArray(data?.orders) ? data.orders : [];
  const invoices = (Array.isArray(data?.invoices) ? data.invoices : []).filter(i => !i?.deleted);
  const events = Array.isArray(data?.events) ? data.events : [];
  const customers = Array.isArray(data?.customers) ? data.customers : [];
  const companyInfo = data?.companyInfo || {};
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);
  const [invoiceDraft, setInvoiceDraft] = useState(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showMailModal, setShowMailModal] = useState(false);
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [companyDraft, setCompanyDraft] = useState({
    id: companyInfo?.id || "COMPANY-001",
    name: companyInfo?.name || "",
    address: companyInfo?.address || "",
    phone: companyInfo?.phone || "",
    email: companyInfo?.email || "",
    bankInfo: companyInfo?.bankInfo || "",
    stampImage: companyInfo?.stampImage || "",
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
    const tax=Math.round((Number(o?.amount)||0)*0.1);
    const customer = customers.find((c) => c?.id === o?.customerId);
    const issueDate = o?.deliveryDate || fmt(today.getDate());
    const dueDate = calcDueDateByTerms(
      issueDate,
      customer?.closingDay ?? 31,
      customer?.paymentSite || "翌月末払い"
    );
    const baseAmount = Number(o?.amount)||0;
    const inv={
      id:`INV-${String(invoices.length+1).padStart(3,"0")}`,
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
    const normalizedItems = (invoiceDraft.lineItems || []).map((item) => {
      const qty = Number(item?.qty) || 0;
      const unitPrice = Number(item?.unitPrice) || 0;
      return { ...item, qty, unitPrice, subtotal: qty * unitPrice };
    });
    const amount = normalizedItems.reduce((s, item) => s + (Number(item?.subtotal) || 0), 0);
    const tax = Number(invoiceDraft.tax) || 0;
    const total = Number(invoiceDraft.total) || amount + tax;
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
    setInvoiceDraft((prev) => ({
      ...(prev || {}),
      lineItems: [...(prev?.lineItems || []), { id:`LI-${Date.now()}`, name:"", qty:1, unitPrice:0, subtotal:0 }],
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
    const fallbackCompany = {
      name: "ハコマネ",
      tagline: "LOGISTICS & DELIVERY SOLUTIONS",
      address: "住所未設定",
      phone: "電話未設定",
      email: "メール未設定",
      bankInfo: {
        bankName: "－",
        branch: "－",
        accountType: "－",
        accountNumber: "－",
        accountName: "－",
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
    const lineItems = Array.isArray(inv?.lineItems) && inv.lineItems.length > 0
      ? inv.lineItems
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
      @media print{.print-bar{display:none} body{padding:0.4cm}}
    </style></head><body>
      <div class="container">
        <div class="print-bar"><button onclick="window.print()">PDF印刷</button></div>
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
        ${mergedCompany?.stampImage ? `<div style="margin-top:12px"><img src="${mergedCompany.stampImage}" alt="stamp" style="height:86px"/></div>` : ""}
        <div class="footer">${mergedCompany.name || fallbackCompany.name} | このたびはご利用ありがとうございます</div>
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
    const url = `mailto:${encodeURIComponent(mailDraft.to)}?subject=${encodeURIComponent(mailDraft.subject)}&body=${encodeURIComponent(mailDraft.body)}`;
    window.location.href = url;
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
    setData((d) => ({
      ...d,
      companyInfo: { ...companyDraft, id: companyDraft?.id || "COMPANY-001" },
    }));
    setShowCompanyModal(false);
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
      <div style={{ display:"flex", justifyContent:"flex-end" }}>
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
        headers={["請求書","顧客","期日","合計","状態","送付","備考"]}
        rows={invoices.map(inv=>[
          <span style={{color:"#00a09a",fontWeight:700, cursor:"pointer"}} onClick={()=>openInvoiceModal(inv)}>{inv?.id||"—"}</span>,
          inv?.customerName||"", inv?.dueDate||"",
          <span style={{fontWeight:700}}>¥{(Number(inv?.total)||0).toLocaleString()}</span>,
          <StatusPill s={inv?.status}/>,
          inv?.sentAt ? <span style={{ color:"#2e7d32", fontWeight:700 }}>送付済</span> : <span style={{ color:"#999" }}>未送付</span>,
          <span style={{fontSize:"11px",color:"#999"}}>{inv?.note||"—"}</span>
        ])}
      />

      {showInvoiceModal && invoiceDraft && (
        <Modal title={`請求書詳細 ${invoiceDraft.id}`} icon={invoiceIcon} onClose={()=>setShowInvoiceModal(false)} width={780}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px 12px" }}>
            <Fl label="発行日"><RetroInput type="date" value={invoiceDraft.issueDate || ""} onChange={(e)=>setInvoiceDraft((v)=>({ ...(v||{}), issueDate:e.target.value }))}/></Fl>
            <Fl label="支払期日"><RetroInput type="date" value={invoiceDraft.dueDate || ""} onChange={(e)=>setInvoiceDraft((v)=>({ ...(v||{}), dueDate:e.target.value }))}/></Fl>
            <Fl label="金額"><RetroInput type="number" value={invoiceDraft.amount ?? ""} onChange={(e)=>setInvoiceDraft((v)=>({ ...(v||{}), amount:Number(e.target.value)||0 }))}/></Fl>
            <Fl label="消費税"><RetroInput type="number" value={invoiceDraft.tax ?? ""} onChange={(e)=>setInvoiceDraft((v)=>({ ...(v||{}), tax:Number(e.target.value)||0 }))}/></Fl>
            <Fl label="合計"><RetroInput type="number" value={invoiceDraft.total ?? ""} onChange={(e)=>setInvoiceDraft((v)=>({ ...(v||{}), total:Number(e.target.value)||0 }))}/></Fl>
            <Fl label="備考"><RetroInput value={invoiceDraft.note || ""} onChange={(e)=>setInvoiceDraft((v)=>({ ...(v||{}), note:e.target.value }))}/></Fl>
          </div>
          <Panel title="明細" icon={fileIcon} style={{ marginTop:"8px" }}>
            {(invoiceDraft.lineItems || []).map((item)=>(
              <div key={item.id} style={{ display:"grid", gridTemplateColumns:"2fr 70px 120px 120px auto", gap:"6px", alignItems:"end", marginBottom:"6px" }}>
                <Fl label="品目"><RetroInput value={item.name || ""} onChange={(e)=>updateLineItem(item.id, "name", e.target.value)}/></Fl>
                <Fl label="数量"><RetroInput type="number" value={item.qty ?? 0} onChange={(e)=>updateLineItem(item.id, "qty", Number(e.target.value)||0)}/></Fl>
                <Fl label="単価"><RetroInput type="number" value={item.unitPrice ?? 0} onChange={(e)=>updateLineItem(item.id, "unitPrice", Number(e.target.value)||0)}/></Fl>
                <Fl label="小計"><RetroInput type="number" value={item.subtotal ?? 0} readOnly/></Fl>
                <RetroBtn small onClick={()=>removeLineItem(item.id)} style={{ background:"#fff", color:"#e63946", borderColor:"#e63946" }}>{trashIcon}</RetroBtn>
              </div>
            ))}
            <RetroBtn small onClick={addLineItem} style={{ background:"#fff", color:"#00a09a", borderColor:"#00a09a" }}>{plusIcon}明細追加</RetroBtn>
          </Panel>
          <div style={{ display:"flex", justifyContent:"space-between", gap:"6px", marginTop:"10px" }}>
            <div style={{ display:"flex", gap:"6px" }}>
              <RetroBtn onClick={openPreview} style={{ background:"#fff", borderColor:"#00a09a", color:"#00a09a" }}>PDFプレビュー</RetroBtn>
              <RetroBtn onClick={openMailModal} style={{ background:"#fff", borderColor:"#00a09a", color:"#00a09a" }}>{mailIcon}メール送付</RetroBtn>
            </div>
            <div style={{ display:"flex", gap:"6px" }}>
              <RetroBtn onClick={()=>setShowInvoiceModal(false)}>キャンセル</RetroBtn>
              <RetroBtn onClick={()=>{ if(!window.confirm("この請求書を削除しますか？（後から復元できます）")) return; setData(d=>({...d, invoices:(Array.isArray(d?.invoices)?d.invoices:[]).map(i=>i?.id===invoiceDraft?.id?{...i,deleted:true}:i)})); setShowInvoiceModal(false); }} style={{ background:"#fff", color:"#e63946", borderColor:"#e63946" }}>削除</RetroBtn>
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
        <Modal title="会社情報設定" icon={companyIcon} onClose={()=>setShowCompanyModal(false)} width={620}>
          <Fl label="会社名"><RetroInput value={companyDraft.name} onChange={(e)=>setCompanyDraft((v)=>({ ...(v||{}), name:e.target.value }))}/></Fl>
          <Fl label="住所"><RetroInput value={companyDraft.address} onChange={(e)=>setCompanyDraft((v)=>({ ...(v||{}), address:e.target.value }))}/></Fl>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px 12px" }}>
            <Fl label="電話番号"><RetroInput value={companyDraft.phone} onChange={(e)=>setCompanyDraft((v)=>({ ...(v||{}), phone:e.target.value }))}/></Fl>
            <Fl label="メール"><RetroInput value={companyDraft.email} onChange={(e)=>setCompanyDraft((v)=>({ ...(v||{}), email:e.target.value }))}/></Fl>
          </div>
          <Fl label="振込先"><RetroTextarea value={companyDraft.bankInfo} onChange={(e)=>setCompanyDraft((v)=>({ ...(v||{}), bankInfo:e.target.value }))}/></Fl>
          <Fl label="印影画像(base64)"><RetroTextarea value={companyDraft.stampImage} onChange={(e)=>setCompanyDraft((v)=>({ ...(v||{}), stampImage:e.target.value }))}/></Fl>
          <div style={{ display:"flex", justifyContent:"flex-end", gap:"6px", marginTop:"8px" }}>
            <RetroBtn onClick={()=>setShowCompanyModal(false)}>キャンセル</RetroBtn>
            <RetroBtn onClick={saveCompanyInfo} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>保存</RetroBtn>
          </div>
        </Modal>
      )}
    </div>
  );
};

const DriversAccidentFormTab = ({ form, setForm }) => {
  const accidentLogs = form.accidentLogs || [];
  const internalLogs = form.internalLogs || [];
  const [newAcc, setNewAcc] = useState({ type:"重大事故", date:"", detail:"", result:"" });
  const [newInt, setNewInt] = useState({ date:"", detail:"", result:"" });
  return (
    <>
      <div style={{ fontSize:"12px", fontWeight:700, color:"#555", marginBottom:"6px" }}>過去重大事故・行政処分歴</div>
      <div style={{ border:"1px solid #e8e8e8", borderRadius:"6px", padding:"10px", background:"#fafbfc", marginBottom:"8px" }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 12px" }}>
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
          const updated = [...(form.accidentLogs || []), { ...newAcc, id: Date.now() }];
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
              memo: [newAcc.type ? `種別:${newAcc.type}` : null, newAcc.result ? `処理:${newAcc.result}` : null].filter(Boolean).join(" / ") || null
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
              <RetroBtn small onClick={() => setForm(prev => ({ ...prev, accidentLogs: (prev.accidentLogs || []).filter(x => x.id !== rec.id) }))} style={{ background:"#fff", color:"#e63946", borderColor:"#e63946" }}>
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
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 12px" }}>
          <Fl label="事故発生日"><RetroInput type="date" value={newInt.date} onChange={e=>setNewInt(v=>({...v,date:e.target.value}))}/></Fl>
          <Fl label="処理結果"><RetroInput value={newInt.result} onChange={e=>setNewInt(v=>({...v,result:e.target.value}))}/></Fl>
        </div>
        <Fl label="事故内容"><RetroTextarea value={newInt.detail} onChange={e=>setNewInt(v=>({...v,detail:e.target.value}))} style={{ minHeight:"60px" }}/></Fl>
        <RetroBtn onClick={async () => {
          if (!newInt.date) return;
          const updated = [...(form.internalLogs || []), { ...newInt, id: Date.now() }];
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
              memo: newInt.result || null
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
              <RetroBtn small onClick={() => setForm(prev => ({ ...prev, internalLogs: (prev.internalLogs || []).filter(x => x.id !== rec.id) }))} style={{ background:"#fff", color:"#e63946", borderColor:"#e63946" }}>
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

const DriversHealthFormTab = ({ form, setForm }) => {
  const healthLogs = form.healthLogs || [];
  const trainingLogs = form.trainingLogs || [];
  const [newHealth, setNewHealth] = useState({ date:"", org:"", note:"" });
  const [newTraining, setNewTraining] = useState({ date:"", content:"", sign:"" });
  return (
    <>
      <div style={{ fontSize:"12px", fontWeight:700, color:"#555", marginBottom:"6px" }}>健康診断履歴</div>
      <div style={{ border:"1px solid #e8e8e8", borderRadius:"6px", padding:"10px", background:"#fafbfc", marginBottom:"8px" }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 12px" }}>
          <Fl label="実施日"><RetroInput type="date" value={newHealth.date} onChange={e=>setNewHealth(v=>({...v,date:e.target.value}))}/></Fl>
          <Fl label="実施医療機関"><RetroInput value={newHealth.org} onChange={e=>setNewHealth(v=>({...v,org:e.target.value}))}/></Fl>
        </div>
        <Fl label="特記事項"><RetroTextarea value={newHealth.note} onChange={e=>setNewHealth(v=>({...v,note:e.target.value}))} placeholder="高血圧・糖尿病など" style={{ minHeight:"60px" }}/></Fl>
        <RetroBtn onClick={() => {
          if (!newHealth.date) return;
          const updated = [...(form.healthLogs || []), { ...newHealth, id: Date.now() }];
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
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 12px" }}>
          <Fl label="実施日"><RetroInput type="date" value={newTraining.date} onChange={e=>setNewTraining(v=>({...v,date:e.target.value}))}/></Fl>
          <Fl label="安全管理者署名"><RetroInput value={newTraining.sign} onChange={e=>setNewTraining(v=>({...v,sign:e.target.value}))}/></Fl>
        </div>
        <Fl label="指導内容"><RetroTextarea value={newTraining.content} onChange={e=>setNewTraining(v=>({...v,content:e.target.value}))} style={{ minHeight:"60px" }}/></Fl>
        <RetroBtn onClick={() => {
          if (!newTraining.date) return;
          const updated = [...(form.trainingLogs || []), { ...newTraining, id: Date.now() }];
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
    </>
  );
};

const DriversPage = ({ data, setData, tenantId, userRole }) => {
  const drivers = (Array.isArray(data?.drivers) ? data.drivers : []).filter(d => !d?.deleted);
  const jobTypes = Array.isArray(data?.jobTypes) ? data.jobTypes : [];
  const allCustomers = (Array.isArray(data?.customers) ? data.customers : []).filter(c => !c?.deleted);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedDriverId, setSelectedDriverId] = useState(null);
  const [activeTab, setActiveTab] = useState("basic");
  const [form, setForm] = useState({
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
    vehicleNumber:"", chassisNumber:"",
    vehicleOwnership:"会社所有", vehicleInspectionExpiry:"", liabilityInsuranceExpiry:"",
    insuranceCompany:"", insurancePolicyNumber:"", insuranceCoverage:"",
    insuranceCopySaved:false,
    status:"available", notes:"",
  });

  const selectedDriver = drivers.find(d => d?.id === selectedDriverId) || null;

  const openAdd = () => {
    setEditingId(null);
    setForm({
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
      vehicleNumber:"", chassisNumber:"",
      vehicleOwnership:"会社所有", vehicleInspectionExpiry:"", liabilityInsuranceExpiry:"",
      insuranceCompany:"", insurancePolicyNumber:"", insuranceCoverage:"",
      insuranceCopySaved:false,
      status:"available", notes:"",
    });
    setActiveTab("basic");
    setShowModal(true);
  };

  const openEdit = (driver) => {
    setEditingId(driver?.id || null);
    setForm({ ...{
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
      vehicleNumber:"", chassisNumber:"",
      vehicleOwnership:"会社所有", vehicleInspectionExpiry:"", liabilityInsuranceExpiry:"",
      insuranceCompany:"", insurancePolicyNumber:"", insuranceCoverage:"",
      insuranceCopySaved:false,
      status:"available", notes:"",
    }, ...driver });
    setActiveTab("basic");
    setShowModal(true);
    setSelectedDriverId(null);
  };

  const saveDriver = () => {
    if (!form.name) return;
    setData((d) => {
      const currentDrivers = Array.isArray(d?.drivers) ? d.drivers : [];
      if (editingId) {
        return { ...d, drivers: currentDrivers.map(driver => driver?.id === editingId ? { ...driver, ...form } : driver) };
      }
      const nextId = `D${String(currentDrivers.length + 1).padStart(3, "0")}`;
      return { ...d, drivers: [...currentDrivers, { id: nextId, ...form }] };
    });
    setShowModal(false);
    setEditingId(null);
  };

  const deleteDriver = (id) => {
    if (!window.confirm("このドライバーを削除しますか？（後から復元できます）")) return;
    setData((d) => ({ ...d, drivers: (Array.isArray(d?.drivers) ? d.drivers : []).map(driver => driver?.id === id ? { ...driver, deleted: true } : driver) }));
    setSelectedDriverId(null);
  };

  const driverIcon = <Icon size={14}><circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.4-3.2 4.2-4.8 7-4.8s5.6 1.6 7 4.8"/></Icon>;
  const plusIcon = <Icon size={14}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></Icon>;

  const tabs = [
    { id:"basic", label:"①基本情報" },
    { id:"license", label:"②免許情報" },
    { id:"diagnosis", label:"③適性診断" },
    { id:"accident", label:"④事故歴" },
    { id:"health", label:"⑤健康・教育" },
    { id:"vehicle", label:"⑥車両情報" },
    { id:"routes", label:"⑦担当ルート" },
  ];

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
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 12px" }}>
          <Fl label="氏名"><RetroInput value={form.name||""} onChange={e=>setForm(v=>({...v,name:e.target.value}))}/></Fl>
          <Fl label="フリガナ"><RetroInput value={form.furigana||""} onChange={e=>setForm(v=>({...v,furigana:e.target.value}))}/></Fl>
          <Fl label="生年月日"><RetroInput type="date" value={form.birthdate||""} onChange={e=>setForm(v=>({...v,birthdate:e.target.value}))}/></Fl>
          <Fl label="電話番号"><RetroInput value={form.phone||""} onChange={e=>setForm(v=>({...v,phone:e.target.value}))}/></Fl>
        </div>
        <Fl label="住所"><RetroInput value={form.address||""} onChange={e=>setForm(v=>({...v,address:e.target.value}))}/></Fl>
        <Fl label="メールアドレス"><RetroInput value={form.email||""} onChange={e=>setForm(v=>({...v,email:e.target.value}))}/></Fl>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"6px 12px" }}>
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
          </RetroSelect>
        </Fl>
        <Fl label="メモ"><RetroTextarea value={form.notes||""} onChange={e=>setForm(v=>({...v,notes:e.target.value}))}/></Fl>
      </>
    );
    if (tab === "license") return (
      <>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 12px" }}>
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
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 12px" }}>
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
    if (tab === "accident") return <DriversAccidentFormTab form={form} setForm={setForm} />;
    if (tab === "health") return <DriversHealthFormTab form={form} setForm={setForm} />;
    if (tab === "vehicle") return (
      <>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 12px" }}>
          <Fl label="使用車両登録番号"><RetroInput value={form.vehicleNumber||""} onChange={e=>setForm(v=>({...v,vehicleNumber:e.target.value}))}/></Fl>
          <Fl label="車台番号"><RetroInput value={form.chassisNumber||""} onChange={e=>setForm(v=>({...v,chassisNumber:e.target.value}))}/></Fl>
        </div>
        <Fl label="車両所有区分">
          {["本人所有","リース","会社所有"].map(t => (
            <CheckRow key={t} label={t} checked={form.vehicleOwnership===t} onChange={v=>{ if(v) setForm(p=>({...p,vehicleOwnership:t})); }}/>
          ))}
        </Fl>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 12px" }}>
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
        setForm(f => ({ ...f, routes: [...(f.routes||[]), {
          id: Date.now(),
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
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 12px" }}>
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
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 12px" }}>
                    <Fl label="売上単価（円）"><RetroInput type="number" value={route.unitPrice} onChange={e=>updateRoute(route.id,"unitPrice",e.target.value)} placeholder="例：180"/></Fl>
                    <Fl label="支払単価（円）"><RetroInput type="number" value={route.driverUnitPrice} onChange={e=>updateRoute(route.id,"driverUnitPrice",e.target.value)} placeholder="例：150"/></Fl>
                  </div>
                )}
                {isDeka && (
                  <div style={{ marginTop:"8px" }}>
                    <div style={{ fontSize:"11px", fontWeight:700, color:"#555", marginBottom:"6px" }}>サイズ別単価設定</div>
                    <div style={{ border:"1px solid #e8e8e8", borderRadius:"6px", overflow:"hidden" }}>
                      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"12px" }}>
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
                                <RetroInput type="number" value={dr.unitPrice} onChange={e=>updateDekaRate(route.id,dr.size,"unitPrice",e.target.value)} placeholder="例：300"/>
                              </td>
                              <td style={{ padding:"4px 8px" }}>
                                <RetroInput type="number" value={dr.driverUnitPrice} onChange={e=>updateDekaRate(route.id,dr.size,"driverUnitPrice",e.target.value)} placeholder="例：250"/>
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
    return null;
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ fontSize:"14px", fontWeight:700, color:"#222" }}>運転者台帳</div>
        <RetroBtn onClick={openAdd} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>{plusIcon}ドライバー追加</RetroBtn>
      </div>
      <div style={{ border:cardBorder, borderRadius:"6px", background:"#fff", overflow:"auto", maxHeight:"400px" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontFamily:"'Noto Sans JP', sans-serif", fontSize:"12px" }}>
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
          <div style={{ minHeight:"300px" }}>
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

const VehiclesPage = ({ data, setData, tenantId, userRole }) => {
  const vehicles = (Array.isArray(data?.vehicles) ? data.vehicles : []).filter(v => !v?.deleted);
  const drivers = Array.isArray(data?.drivers) ? data.drivers : [];
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);
  const [activeTab, setActiveTab] = useState("basic");
  const [form, setForm] = useState({
    plate:"", type:"", maker:"", year:"", maxLoad:"", vehicleWeight:"", grossWeight:"",
    nextInspection:"", inspectionHistory:[],
    accidentHistory:[], violationHistory:[],
    insuranceExpiry:"", liabilityExpiry:"", vehicleInsurance:"", roadServicePhone:"",
    assignedDriverId:"", status:"available", notes:"",
  });
  const [newInspection, setNewInspection] = useState({ date:"", shop:"", content:"", issue:"", nextDate:"" });
  const [newAccident, setNewAccident] = useState({ datetime:"", place:"", opponent:"", repairStatus:"", insuranceUsed:false, note:"" });
  const [newViolation, setNewViolation] = useState({ date:"", content:"", penalty:"" });
  const selectedVehicle = vehicles.find(v => v?.id === selectedVehicleId) || null;
  const blankForm = { plate:"", type:"", maker:"", year:"", maxLoad:"", vehicleWeight:"", grossWeight:"", nextInspection:"", inspectionHistory:[], accidentHistory:[], violationHistory:[], insuranceExpiry:"", liabilityExpiry:"", vehicleInsurance:"", roadServicePhone:"", assignedDriverId:"", status:"available", notes:"" };
  const openAdd = () => { setEditingId(null); setForm({...blankForm}); setNewInspection({ date:"", shop:"", content:"", issue:"", nextDate:"" }); setNewAccident({ datetime:"", place:"", opponent:"", repairStatus:"", insuranceUsed:false, note:"" }); setNewViolation({ date:"", content:"", penalty:"" }); setActiveTab("basic"); setShowModal(true); };
  const openEdit = (vehicle) => {
    setEditingId(vehicle?.id || null);
    setForm({
      ...blankForm,
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
    if (!form.plate) return;
    setData((d) => {
      const current = Array.isArray(d?.vehicles) ? d.vehicles : [];
      if (editingId) return { ...d, vehicles: current.map(v => v?.id === editingId ? { ...v, ...form } : v) };
      const nextId = `V${String(current.length + 1).padStart(3, "0")}`;
      return { ...d, vehicles: [...current, { id: nextId, ...form }] };
    });
    setShowModal(false); setEditingId(null);
  };
  const deleteVehicle = (id) => {
    if (!window.confirm("この車両を削除しますか？（後から復元できます）")) return;
    setData((d) => ({ ...d, vehicles: (Array.isArray(d?.vehicles) ? d.vehicles : []).map(v => v?.id === id ? { ...v, deleted: true } : v) }));
    setSelectedVehicleId(null);
  };
  const addInspection = async () => {
    if (!newInspection.date) return;
    console.log("addInspection called", newInspection);
    setForm(f => {
      const updated = { ...f, inspectionHistory: [...(f.inspectionHistory||[]), { ...newInspection, id: Date.now() }] };
      console.log("updated form inspectionHistory", updated.inspectionHistory);
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
        memo: [newInspection.shop ? `工場:${newInspection.shop}` : null, newInspection.content || null].filter(Boolean).join(" / ") || null
      });
    if (error) console.error('vehicle_inspections insert error:', error);
    setNewInspection({ date:"", shop:"", content:"", issue:"", nextDate:"" });
  };
  const removeInspection = (id) => { setForm(f => ({ ...f, inspectionHistory: (f.inspectionHistory||[]).filter(x => x.id !== id) })); };
  const addAccident = async () => {
    if (!newAccident.datetime) return;
    setForm(f => ({ ...f, accidentHistory: [...(f.accidentHistory||[]), { ...newAccident, id: Date.now() }] }));
    const { error } = await supabase
      .from('vehicle_incidents')
      .insert({
        vehicle_id: form.id,
        incident_type: 'accident',
        incident_date: newAccident.datetime.slice(0, 10),
        description: newAccident.place || null,
        counterparty: newAccident.opponent || null,
        amount: null,
        memo: [newAccident.repairStatus ? `修理:${newAccident.repairStatus}` : null, newAccident.insuranceUsed ? "保険対応あり" : "保険対応なし", newAccident.note || null].filter(Boolean).join(" / ") || null
      });
    if (error) console.error('vehicle_incidents(accident) insert error:', error);
    setNewAccident({ datetime:"", place:"", opponent:"", repairStatus:"", insuranceUsed:false, note:"" });
  };
  const removeAccident = (id) => { setForm(f => ({ ...f, accidentHistory: (f.accidentHistory||[]).filter(x => x.id !== id) })); };
  const addViolation = async () => {
    if (!newViolation.date) return;
    setForm(f => ({ ...f, violationHistory: [...(f.violationHistory||[]), { ...newViolation, id: Date.now() }] }));
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
        memo: hasPenaltyAmount ? null : (newViolation.penalty || null)
      });
    if (error) console.error('vehicle_incidents(violation) insert error:', error);
    setNewViolation({ date:"", content:"", penalty:"" });
  };
  const removeViolation = (id) => { setForm(f => ({ ...f, violationHistory: (f.violationHistory||[]).filter(x => x.id !== id) })); };
  const vehicleIcon = <Icon size={14}><rect x="3" y="9" width="18" height="7" rx="2"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></Icon>;
  const plusIcon = <Icon size={14}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></Icon>;
  const trashIcon = <Icon size={12}><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></Icon>;
  const tabs = [{ id:"basic", label:"①基本情報" },{ id:"inspection", label:"②定期点検" },{ id:"inspection_cert", label:"③車検管理" },{ id:"accident", label:"④事故・違反" },{ id:"insurance", label:"⑤保険管理" },{ id:"driver", label:"⑥使用ドライバー" }];
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
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 12px" }}>
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
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 12px" }}>
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
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 12px" }}>
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
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"6px 12px" }}>
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
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 12px" }}>
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
    return null;
  };
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ fontSize:"14px", fontWeight:700, color:"#222" }}>車両管理台帳</div>
        <RetroBtn onClick={openAdd} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>{plusIcon}車両追加</RetroBtn>
      </div>
      <div style={{ border:cardBorder, borderRadius:"6px", background:"#fff", overflow:"auto", maxHeight:"400px" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontFamily:"'Noto Sans JP', sans-serif", fontSize:"12px" }}>
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
          <div style={{ minHeight:"300px" }}>{renderFormTab(activeTab, form, setForm)}</div>
          <div style={{ display:"flex", justifyContent:"flex-end", gap:"6px", marginTop:"12px" }}>
            <RetroBtn onClick={()=>setShowModal(false)}>キャンセル</RetroBtn>
            <RetroBtn onClick={saveVehicle} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>車両情報を保存</RetroBtn>
          </div>
        </Modal>
      )}
    </div>
  );
};

const menuVisibleForRole = (m, userRole) =>
  m.id !== "tenants" || userRole === "super_admin";

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
    setRows((prev) => [data, ...prev.filter((r) => r?.id !== data?.id)]);
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !inviteTenantId) return;
    if (inviting) return;
    setInviting(true);
    try {
      const tempPassword = Math.random().toString(36).slice(-12) + "Aa1!";
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: inviteEmail.trim(),
        password: tempPassword,
        options: {
          data: {
            role: "admin",
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
            role: "admin",
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
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", maxWidth: "640px" }}>
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
  { id:"orders",    icon:<Icon size={16}><rect x="4" y="3" width="16" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/></Icon>, label:"受注管理", section:"案件管理" },
  { id:"dispatch",  icon:<Icon size={16}><rect x="2" y="8" width="15" height="8"/><path d="M17 10h3l2 3v3h-5"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></Icon>, label:"配車管理", section:"案件管理" },
  { id:"drivers",   icon:<Icon size={16}><circle cx="12" cy="8" r="4"/><path d="M4 21c1.6-3.8 4.7-5.5 8-5.5s6.4 1.7 8 5.5"/></Icon>, label:"ドライバー管理", section:"マスタ管理" },
  { id:"vehicles",  icon:<Icon size={16}><rect x="3" y="9" width="18" height="7" rx="2"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></Icon>, label:"車両管理", section:"マスタ管理" },
  { id:"customers", icon:<Icon size={16}><circle cx="9" cy="8" r="3"/><circle cx="16" cy="9" r="2.5"/><path d="M3 20c1.4-3 3.8-4.5 6-4.5"/><path d="M10 20c1.8-3 4.6-4.5 7-4.5"/></Icon>, label:"顧客管理", section:"マスタ管理" },
  { id:"invoices",  icon:<Icon size={16}><rect x="4" y="3" width="16" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="14" y2="12"/></Icon>, label:"請求管理", section:"経理" },
  { id:"bank",      icon:<Icon size={16}><rect x="3" y="6" width="18" height="12" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></Icon>, label:"口座・入金", section:"経理" },
  { id:"sales_mgmt", icon:<Icon size={16}><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></Icon>, label:"売上管理", section:"経理" },
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

const fetchDataFromSupabase = async (tenantId) => {
  const nextData = createEmptyData();

  const results = await Promise.all(
    TABLE_CONFIG.map(async ({ key, table, single }) => {
      let q = supabase.from(table).select("id,payload").order("id", { ascending: true });
      if (tenantId != null) {
        q = q.eq("tenant_id", tenantId);
      }
      const { data: rows, error } = await q;
      return { key, rows, error, single };
    })
  );

  for (const result of results) {
    if (result.error) {
      throw result.error;
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
  return { id: dbId, payload, tenant_id: tenantId || null };
};

const saveDataToSupabase = async (nextData, prevData, tenantId) => {
  const jobs = TABLE_CONFIG.map(async ({ key, table, single }) => {
    const currentRows = single
      ? (nextData[key]
          ? [{ id: nextData[key]?.id || "COMPANY-001", payload: nextData[key], tenant_id: tenantId || null }]
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
              tenant_id: tenantId || null
            };
            return { id: row.id, payload: row, tenant_id: tenantId || null };
          });
    const previousRows = single
      ? (prevData[key]
          ? [{ id: prevData[key]?.id || "COMPANY-001", payload: prevData[key], tenant_id: tenantId || null }]
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
              tenant_id: tenantId || null
            };
            return { id: row.id, payload: row, tenant_id: tenantId || null };
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
      const { error } = await supabase.from(table).delete().in("id", removedIds);
      if (error) throw error;
    }
  });

  await Promise.all(jobs);
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
        console.warn("Failed to load data from Supabase:", error);
        previousDataRef.current = cloneData(initialData);
        latestDataRef.current = initialData;
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
        }
      } catch (error) {
        console.warn("Failed to save data to Supabase:", error);
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

  useEffect(() => {
    if (!isLoaded || !tenantId) return;

    const today = new Date();
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const isLastDay = today.getDate() === lastDayOfMonth;
    if (!isLastDay) return;

    const currentMonth = today.toISOString().slice(0, 7);
    const invoices = Array.isArray(data?.invoices) ? data.invoices : [];

    const customers = Array.isArray(data?.customers) ? data.customers : [];
    const qualityRecords = Array.isArray(data?.qualityRecords) ? data.qualityRecords : [];
    const dailyRecords = Array.isArray(data?.dailyRecords) ? data.dailyRecords : [];
    const orders = Array.isArray(data?.orders) ? data.orders : [];
    void orders;

    const customerSales = {};

    qualityRecords
      .filter((r) => r?.date?.startsWith(currentMonth) && r?.customerId && r?.salesAmount)
      .forEach((r) => {
        if (!customerSales[r.customerId]) customerSales[r.customerId] = { items: [], total: 0 };
        customerSales[r.customerId].items.push({
          date: r.date,
          description: `実績 ${r.date}`,
          amount: Number(r.salesAmount),
        });
        customerSales[r.customerId].total += Number(r.salesAmount);
      });

    dailyRecords
      .filter((r) => r?.date?.startsWith(currentMonth) && r?.customerId && r?.salesAmount)
      .forEach((r) => {
        if (!customerSales[r.customerId]) customerSales[r.customerId] = { items: [], total: 0 };
        customerSales[r.customerId].items.push({
          date: r.date,
          description: r.note || `配送 ${r.date}`,
          amount: Number(r.salesAmount),
        });
        customerSales[r.customerId].total += Number(r.salesAmount);
      });

    const alreadyBilled = new Set(
      invoices
        .filter((inv) => {
          const p = inv?.payload || inv;
          return p?.salesMgmtMonth === currentMonth;
        })
        .map((inv) => (inv?.payload || inv)?.customerId)
    );

    const unbilledCustomers = Object.keys(customerSales)
      .filter((cId) => !alreadyBilled.has(cId) && customerSales[cId].total > 0);

    if (unbilledCustomers.length === 0) return;

    const newInvoices = unbilledCustomers.map((customerId) => {
      const customer = customers.find((c) => c?.id === customerId);
      const sales = customerSales[customerId];
      const subtotal = sales.total;
      const tax = Math.round(subtotal * 0.1);
      const total = subtotal + tax;
      const issueDate = today.toISOString().slice(0, 10);
      const dueDate = new Date(today.getFullYear(), today.getMonth() + 2, 0)
        .toISOString().slice(0, 10);

      return {
        id: `INV-AUTO-${currentMonth}-${customerId}`,
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
        note: `${currentMonth} 月次自動請求`,
        salesMgmtMonth: currentMonth,
        lineItems: sales.items.map((item, i) => ({
          id: `LI-${Date.now()}-${i}`,
          name: item.description,
          qty: 1,
          unitPrice: item.amount,
          subtotal: item.amount,
        })),
        sentAt: null,
        sentTo: "",
      };
    });

    if (newInvoices.length === 0) return;

    setData((d) => ({
      ...d,
      invoices: [...(Array.isArray(d?.invoices) ? d.invoices : []), ...newInvoices],
    }));

    setNotifications((prev) => [
      ...prev,
      {
        id: `notif-${Date.now()}`,
        type: "invoice",
        message: `${currentMonth} の請求書を ${newInvoices.length}件 自動生成しました。内容を確認して送付してください。`,
        createdAt: new Date().toISOString(),
        read: false,
      },
    ]);
  }, [isLoaded, tenantId, data?.qualityRecords, data?.dailyRecords]);

  const pendingCount = (Array.isArray(data?.orders) ? data.orders : []).filter(o=>o?.status==="pending").length;
  const unmatchedCount = (Array.isArray(data?.bankTransactions) ? data.bankTransactions : []).filter(b=>b?.status==="unmatched").length;
  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  const overdueCount = (Array.isArray(data?.invoices) ? data.invoices : []).filter(i=>i?.status==="overdue"||(i?.status==="unpaid"&&(i?.dueDate||"")<todayStr)).length;

  const badges = { dispatch:pendingCount, bank:unmatchedCount+overdueCount };

  const pages = { dashboard:DashboardPage, calendar:CalendarPage, orders:OrdersPage, dispatch:DispatchPage, drivers:DriversPage, vehicles:VehiclesPage, customers:CustomersPage, invoices:InvoicesPage, bank:BankPage, sales_mgmt: SalesMgmtPage, quality_mgmt: QualityMgmtPage, tenants: TenantsPage };
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
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:"2px", paddingTop:"8px", paddingBottom:"8px", flexShrink:0 }}>
          <img
            src="/hakomane-logo.png"
            alt="ハコマネ"
            style={{
              height: "88px",
              width: "auto",
              objectFit: "contain",
              marginBottom: "0px",
              flexShrink: 0
            }}
          />
          <div style={{ fontSize:"9px", color:"#999", whiteSpace:"nowrap", lineHeight: 1, marginTop: "0px" }}>
            Delivery Management System
          </div>
        </div>
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:"10px" }}>
          <button onClick={()=>setShowSettings(v=>!v)} style={{ border:"none", background:"transparent", color:"#666", display:"inline-flex", cursor:"pointer" }}>
            <Icon size={18}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></Icon>
          </button>
          <button onClick={()=>setShowNotifications(v=>!v)} style={{ position:"relative", border:"none", background:"transparent", color:"#666", display:"inline-flex", cursor:"pointer" }}>
            <Icon size={18}><path d="M18 8a6 6 0 1 0-12 0c0 7-3 6-3 8h18c0-2-3-1-3-8"/><path d="M10 19a2 2 0 0 0 4 0"/></Icon>
            {notifications.length > 0 && (
              <span style={{ position:"absolute", top:"0", right:"0", width:"7px", height:"7px", borderRadius:"50%", background:"#e63946" }} />
            )}
          </button>
          {!isMobile && (
            <>
              <div style={{ display:"flex", alignItems:"center", gap:"6px", color:"#666", fontSize:"12px" }}>
                <span style={{ background:"#e8f5f4", color:"#007a74", borderRadius:"999px", padding:"2px 8px", fontWeight:700 }}>{authRole === "admin" || authRole === "super_admin" ? "管理者" : authRole === "driver" ? "ドライバー" : "ユーザー"}</span>
                <span>{authEmail || "-"}</span>
              </div>
              {typeof onLogout === "function" && <RetroBtn small onClick={onLogout}>ログアウト</RetroBtn>}
            </>
          )}
        </div>
      </div>

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
            {notifications.length > 0 && (
              <button
                onClick={() => setNotifications([])}
                style={{ fontSize:"11px", color:"#00a09a", border:"none", background:"none", cursor:"pointer" }}
              >
                全て既読
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
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
              <div style={{ background:"#fff", border:cardBorder, borderRadius:"4px", padding:"6px 8px", fontSize:"12px", color:"#333", marginBottom:"6px" }}>T-LINK 本社</div>
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
          ) : (
            <PageComponent
              data={data}
              setData={setData}
              setPage={setPageWithHistory}
              isMobile={isMobile}
              tenantId={tenantId}
              userRole={userRole}
            />
          )}
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
          <div style={{ fontSize:"13px", fontWeight:700, color:"#555", marginBottom:"10px" }}>削除済みデータの復元</div>
          {["customers","drivers","vehicles","orders","invoices"].map(key => {
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
          {["customers","drivers","vehicles","orders","invoices"].every(key => (Array.isArray(data?.[key]) ? data[key] : []).filter(item => item?.deleted).length === 0) && (
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
            ].map(({ key, label, headers, getRow }) => {
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
                a.download = `${label}_${new Date().toISOString().slice(0,10)}.csv`;
                a.click();
                URL.revokeObjectURL(url);
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
        </Modal>
      )}

    </div>
  );
}
