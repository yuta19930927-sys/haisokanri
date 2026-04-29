import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "./src/lib/supabase";

// ===== T-LINK THEME =====
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

const endOfMonth = (year, monthIndex) => new Date(year, monthIndex + 1, 0).getDate();

const calcDueDateByTerms = (deliveredDate, closingDay = 31, paymentSite = "翌月末払い") => {
  const base = parseDate(deliveredDate) || new Date();
  const closeDayNum = Number(closingDay) || 31;
  const closeDay = closeDayNum === 31 ? endOfMonth(base.getFullYear(), base.getMonth()) : closeDayNum;
  const inCurrentClosing = base.getDate() <= closeDay;
  const closingMonthOffset = inCurrentClosing ? 0 : 1;
  const closingYear = base.getFullYear();
  const closingMonth = base.getMonth() + closingMonthOffset;

  let targetYear = closingYear;
  let targetMonth = closingMonth;
  let targetDay = 31;

  if (paymentSite === "当月末払い") {
    targetDay = 31;
  } else if (paymentSite === "翌月末払い") {
    targetMonth += 1;
    targetDay = 31;
  } else if (paymentSite === "翌々月末払い") {
    targetMonth += 2;
    targetDay = 31;
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

  targetYear += Math.floor(targetMonth / 12);
  targetMonth %= 12;
  const lastDay = endOfMonth(targetYear, targetMonth);
  const safeDay = targetDay === 31 ? lastDay : Math.min(targetDay, lastDay);
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
const Fl = ({ label, children }) => (
  <div style={{ marginBottom:"8px" }}>
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

const CalendarPage = ({ data, setData, isMobile=false }) => {
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
    const invoiceItems = invoices
      .filter((inv) => normalizeDateString(inv?.dueDate) === targetDate)
      .map((inv) => ({
        id: `invoice-${inv?.id || Math.random()}`,
        source: "invoice",
        sourceId: inv?.id,
        date: targetDate,
        type: "payment_receive",
        title: `入金期日：${inv?.customerName || ""}`,
        color: EVENT_TYPE_COLOR.payment_receive,
        raw: inv,
      }));
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
        title: `車検：${vehicle?.plate || ""}`,
        color: "#cc0099",
        raw: vehicle,
      }));
    return [...businessEvents, ...invoiceItems, ...payableItems, ...licenseItems, ...inspectionItems];
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
const BankPage = ({ data, setData }) => {
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

  const confirmMatch = async (bankTxId, invoiceId) => {
    if (!bankTxId || !invoiceId) return;
    try {
      const tx = bankTransactions.find((row) => row?.id === bankTxId);
      const inv = invoices.find((row) => {
        const dbId = getInvoiceDbId(row);
        const pid = getEntityPayload(row).id;
        return dbId === invoiceId || pid === invoiceId;
      });
      if (!tx || !inv) return;

      const nowIso = new Date().toISOString();
      const paidAmount = getBankDepositAmount(tx);
      const invDbId = getInvoiceDbId(inv);
      const invPayloadNext = { ...getEntityPayload(inv) };
      invPayloadNext.status = "paid";
      invPayloadNext.paid_at = nowIso;
      invPayloadNext.paidDate = String(nowIso).slice(0, 10);
      invPayloadNext.paid_amount = paidAmount;
      invPayloadNext.paidAmount = paidAmount;
      const customerNameForEvent = invPayloadNext.customerName || invPayloadNext.customer_name || "";

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
          matched_invoice_id: invDbId,
          matched_at: nowIso,
          matched_by: userId,
        })
        .eq("id", bankTxId);
      if (txErr) throw txErr;

      const { error: invErr } = await supabase
        .from("invoices")
        .update({ payload: invPayloadNext })
        .eq("id", invDbId);
      if (invErr) throw invErr;

      setBankTransactions((prev) =>
        prev.map((row) =>
          row?.id === bankTxId
            ? {
                ...row,
                status: "matched",
                match_status: "matched",
                matchedInvoice: invDbId,
                matched_invoice_id: invDbId,
                matched_at: nowIso,
                matched_by: userId,
              }
            : row
        )
      );

      setData((d) => ({
        ...d,
        bankTransactions: (Array.isArray(d?.bankTransactions) ? d.bankTransactions : []).map((row) =>
          row?.id === bankTxId
            ? {
                ...row,
                status: "matched",
                match_status: "matched",
                matchedInvoice: invDbId,
                matched_invoice_id: invDbId,
                matched_at: nowIso,
                matched_by: userId,
              }
            : row
        ),
        invoices: (Array.isArray(d?.invoices) ? d.invoices : []).map((row) => {
          const dbId = getInvoiceDbId(row);
          const pid = getEntityPayload(row).id;
          const matches =
            dbId === invoiceId ||
            pid === invoiceId ||
            String(dbId) === String(invoiceId) ||
            String(pid) === String(invoiceId);
          if (!matches) return row;
          if (row.payload != null && typeof row.payload === "object" && row.id)
            return { ...row, payload: invPayloadNext };
          if (row._dbId != null) return { ...invPayloadNext, _dbId: row._dbId };
          return { ...invPayloadNext };
        }),
        events: [
          ...(Array.isArray(d?.events) ? d.events : []),
          {
            id:`EV-B${Date.now()}`,
            date: tx?.transaction_date || tx?.date || String(nowIso).slice(0, 10),
            type:"bank_in",
            title:`入金確認：${customerNameForEvent} ¥${paidAmount.toLocaleString()}`,
            color:"#006600",
          },
        ],
      }));
      showUploadToast(`照合完了：請求書 ${invPayloadNext.id || invDbId}`);
    } catch (error) {
      console.warn("confirmMatch failed:", error);
      window.alert(`照合確定に失敗しました：${error?.message || String(error)}`);
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
                            <RetroBtn onClick={()=>confirmMatch(b?.id, invRowId)} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>
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
const DashboardPage = ({ data, setData, setPage }) => {
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
const OrdersPage = ({ data, setData }) => {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ customerId:"", deliveryType:"route", deliveryDate:"", from:"", to:"", cargo:"", weight:"", amount:"", notes:"" });
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
  const orders = Array.isArray(data.orders) ? data.orders : [];
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

      const alreadyExists = currentInvoices.some((inv) => inv?.orderId === orderId);
      if (alreadyExists) {
        return { ...d, orders: nextOrders };
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
      const nextEvents = [
        ...(Array.isArray(d?.events) ? d.events : []),
        {
          id:`EV-INV${Date.now()}`,
          date: dueDate,
          type:"payment_due",
          title:`入金期日：${nextInvoice.customerName}`,
          color:"#660099",
          invoiceId: nextInvoice.id,
        },
      ];

      return {
        ...d,
        orders: nextOrders,
        invoices: [nextInvoice, ...currentInvoices],
        events: nextEvents,
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
    const o = { id:`ORD-${String(orders.length+1).padStart(3,"0")}`, customerId:form.customerId, customerName:c?.name||"", deliveryType:form.deliveryType || "route", date:fmt(today.getDate()), deliveryDate:form.deliveryDate, from:form.from, to:form.to, cargo:form.cargo, weight:form.weight, status:"pending", driverId:null, vehicleId:null, amount:parseInt(form.amount)||0, notes:form.notes };
    setData(d=>({ ...d, orders:[o,...(Array.isArray(d?.orders) ? d.orders : [])], events:[...(Array.isArray(d?.events) ? d.events : []),{id:`EV-O${Date.now()}`,date:form.deliveryDate,type:"delivery",title:`${o.id} 配達予定 ${c?.name||""}`,color:"#0000cc"}] }));
    setShowModal(false); setForm({ customerId:"", deliveryType:"route", deliveryDate:"", from:"", to:"", cargo:"", weight:"", amount:"", notes:"" });
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

const DispatchPage = ({ data, setData }) => {
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

const CustomersPage = ({ data, setData }) => {
  const customers = Array.isArray(data?.customers) ? data.customers : [];
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
    if (!window.confirm("この顧客を削除しますか？")) return;
    setData((d) => ({
      ...d,
      customers: (Array.isArray(d?.customers) ? d.customers : []).filter((customer) => customer?.id !== customerId),
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

const InvoicesPage = ({ data, setData }) => {
  const orders = Array.isArray(data?.orders) ? data.orders : [];
  const invoices = Array.isArray(data?.invoices) ? data.invoices : [];
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
    setData(d=>({...d, invoices:[inv,...(Array.isArray(d?.invoices) ? d.invoices : [])], events:[...(Array.isArray(d?.events) ? d.events : events),{id:`EV-INV${Date.now()}`,date:dueDate,type:"payment_due",title:`${inv.id} 入金期日：${o?.customerName||""}`,color:"#660099"}] }));
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
      name: "T-LINK",
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

const DriversPage = ({ data, setData }) => {
  const drivers = Array.isArray(data?.drivers) ? data.drivers : [];
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name:"", license:"大型", license_expiry:"", phone:"", status:"available", notes:"" });

  const openAdd = () => {
    setEditingId(null);
    setForm({ name:"", license:"大型", license_expiry:"", phone:"", status:"available", notes:"" });
    setShowModal(true);
  };

  const openEdit = (driver) => {
    setEditingId(driver?.id || null);
    setForm({
      name: driver?.name || "",
      license: driver?.license || "大型",
      license_expiry: driver?.license_expiry || "",
      phone: driver?.phone || "",
      status: driver?.status || "available",
      notes: driver?.notes || "",
    });
    setShowModal(true);
  };

  const saveDriver = () => {
    if (!form.name) return;
    setData((d) => {
      const currentDrivers = Array.isArray(d?.drivers) ? d.drivers : [];
      if (editingId) {
        return {
          ...d,
          drivers: currentDrivers.map((driver) =>
            driver?.id === editingId ? { ...driver, ...form } : driver
          ),
        };
      }
      const nextId = `D${String(currentDrivers.length + 1).padStart(3, "0")}`;
      return {
        ...d,
        drivers: [...currentDrivers, { id: nextId, ...form }],
      };
    });
    setShowModal(false);
    setEditingId(null);
  };

  const deleteDriver = (id) => {
    setData((d) => ({
      ...d,
      drivers: (Array.isArray(d?.drivers) ? d.drivers : []).filter((driver) => driver?.id !== id),
    }));
  };
  const driverIcon = <Icon size={14}><circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.4-3.2 4.2-4.8 7-4.8s5.6 1.6 7 4.8"/></Icon>;
  const plusIcon = <Icon size={14}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></Icon>;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
      <div>
        <RetroBtn onClick={openAdd} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>{plusIcon}ドライバー追加</RetroBtn>
      </div>
      <RetroTable
        headers={["ID","氏名","免許種別","免許更新日","電話","状態","メモ","操作"]}
        rows={drivers.map((driver)=>[
          <span style={{ color:"#007a74", fontWeight:700 }}>{driver?.id || "—"}</span>,
          <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
            <div style={{ width:"24px", height:"24px", borderRadius:"50%", background:"#e8f5f4", color:"#00a09a", display:"grid", placeItems:"center", fontWeight:700, fontSize:"11px" }}>{(driver?.name || "?").slice(0,1)}</div>
            <span>{driver?.name || ""}</span>
          </div>,
          driver?.license || "",
          <span style={{ color:"#555", fontWeight:600 }}>{driver?.license_expiry || "未設定"}</span>,
          driver?.phone || "",
          <StatusPill s={driver?.status}/>,
          <span style={{ fontSize:"11px", color:"#888" }}>{driver?.notes || "—"}</span>,
          <div style={{ display:"flex", gap:"4px" }}>
            <RetroBtn small onClick={()=>openEdit(driver)} style={{ background:"#fff", color:"#00a09a", borderColor:"#00a09a" }}>編集</RetroBtn>
            <RetroBtn small onClick={()=>deleteDriver(driver?.id)} style={{ background:"#fff", color:"#e63946", borderColor:"#e63946" }}>削除</RetroBtn>
          </div>
        ])}
      />
      {showModal && (
        <Modal title={editingId ? "ドライバー編集" : "ドライバー追加"} icon={driverIcon} onClose={()=>setShowModal(false)} width={460}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 12px" }}>
            <Fl label="氏名"><RetroInput value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></Fl>
            <Fl label="免許種別">
              <RetroSelect value={form.license} onChange={e=>setForm(f=>({...f,license:e.target.value}))}>
                <option value="大型">大型</option>
                <option value="中型">中型</option>
                <option value="普通">普通</option>
              </RetroSelect>
            </Fl>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 12px" }}>
            <Fl label="免許更新日（有効期限）"><RetroInput type="date" value={form.license_expiry} onChange={e=>setForm(f=>({...f,license_expiry:e.target.value}))}/></Fl>
            <Fl label="電話"><RetroInput value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/></Fl>
          </div>
          <Fl label="状態">
            <RetroSelect value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>
              <option value="available">待機中</option>
              <option value="on_duty">稼働中</option>
              <option value="off">休暇</option>
            </RetroSelect>
          </Fl>
          <Fl label="メモ"><RetroTextarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></Fl>
          <div style={{ display:"flex", justifyContent:"flex-end", gap:"6px", marginTop:"8px" }}>
            <RetroBtn onClick={()=>setShowModal(false)}>キャンセル</RetroBtn>
            <RetroBtn onClick={saveDriver} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>保存する</RetroBtn>
          </div>
        </Modal>
      )}
    </div>
  );
};

const VehiclesPage = ({ data, setData }) => {
  const vehicles = Array.isArray(data?.vehicles) ? data.vehicles : [];
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ plate:"", type:"", nextInspection:"", status:"available", notes:"" });

  const openAdd = () => {
    setEditingId(null);
    setForm({ plate:"", type:"", nextInspection:"", status:"available", notes:"" });
    setShowModal(true);
  };

  const openEdit = (vehicle) => {
    setEditingId(vehicle?.id || null);
    setForm({
      plate: vehicle?.plate || "",
      type: vehicle?.type || "",
      nextInspection: vehicle?.nextInspection || "",
      status: vehicle?.status || "available",
      notes: vehicle?.notes || "",
    });
    setShowModal(true);
  };

  const saveVehicle = () => {
    if (!form.plate) return;
    setData((d) => {
      const currentVehicles = Array.isArray(d?.vehicles) ? d.vehicles : [];
      if (editingId) {
        return {
          ...d,
          vehicles: currentVehicles.map((vehicle) =>
            vehicle?.id === editingId ? { ...vehicle, ...form } : vehicle
          ),
        };
      }
      const nextId = `V${String(currentVehicles.length + 1).padStart(3, "0")}`;
      return {
        ...d,
        vehicles: [...currentVehicles, { id: nextId, ...form }],
      };
    });
    setShowModal(false);
    setEditingId(null);
  };

  const deleteVehicle = (id) => {
    setData((d) => ({
      ...d,
      vehicles: (Array.isArray(d?.vehicles) ? d.vehicles : []).filter((vehicle) => vehicle?.id !== id),
    }));
  };
  const vehicleIcon = <Icon size={14}><rect x="3" y="9" width="18" height="7" rx="2"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></Icon>;
  const plusIcon = <Icon size={14}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></Icon>;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
      <div>
        <RetroBtn onClick={openAdd} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>{plusIcon}車両追加</RetroBtn>
      </div>
      <RetroTable
        headers={["ID","ナンバー","車種","車検日","状態","メモ","操作"]}
        rows={vehicles.map((vehicle)=>[
          <span style={{ color:"#007a74", fontWeight:700 }}>{vehicle?.id || "—"}</span>,
          vehicle?.plate || "",
          vehicle?.type || "",
          <span style={{ color:"#555", fontWeight:600 }}>{vehicle?.nextInspection || "未設定"}</span>,
          <StatusPill s={vehicle?.status}/>,
          <span style={{ fontSize:"11px", color:"#888" }}>{vehicle?.notes || "—"}</span>,
          <div style={{ display:"flex", gap:"4px" }}>
            <RetroBtn small onClick={()=>openEdit(vehicle)} style={{ background:"#fff", color:"#00a09a", borderColor:"#00a09a" }}>編集</RetroBtn>
            <RetroBtn small onClick={()=>deleteVehicle(vehicle?.id)} style={{ background:"#fff", color:"#e63946", borderColor:"#e63946" }}>削除</RetroBtn>
          </div>
        ])}
      />
      {showModal && (
        <Modal title={editingId ? "車両編集" : "車両追加"} icon={vehicleIcon} onClose={()=>setShowModal(false)} width={460}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 12px" }}>
            <Fl label="ナンバー"><RetroInput value={form.plate} onChange={e=>setForm(f=>({...f,plate:e.target.value}))}/></Fl>
            <Fl label="車種"><RetroInput value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}/></Fl>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 12px" }}>
            <Fl label="車検日（次回）"><RetroInput type="date" value={form.nextInspection} onChange={e=>setForm(f=>({...f,nextInspection:e.target.value}))}/></Fl>
            <Fl label="状態">
              <RetroSelect value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>
                <option value="available">待機中</option>
                <option value="in_use">使用中</option>
                <option value="maintenance">整備中</option>
              </RetroSelect>
            </Fl>
          </div>
          <Fl label="メモ"><RetroTextarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></Fl>
          <div style={{ display:"flex", justifyContent:"flex-end", gap:"6px", marginTop:"8px" }}>
            <RetroBtn onClick={()=>setShowModal(false)}>キャンセル</RetroBtn>
            <RetroBtn onClick={saveVehicle} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>保存する</RetroBtn>
          </div>
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
});

const fetchDataFromSupabase = async () => {
  const nextData = createEmptyData();

  const results = await Promise.all(
    TABLE_CONFIG.map(async ({ key, table, single }) => {
      const { data: rows, error } = await supabase
        .from(table)
        .select("id,payload")
        .order("id", { ascending: true });
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

  return nextData;
};

/** invoices 行を Supabase upsert 用 { id, payload } に変換（行PKは uuid、payload.id は請求番号） */
const invoiceRowToUpsert = (row) => {
  if (!row) return null;
  let payload;
  let dbId;
  if (row.payload != null && typeof row.payload === "object") {
    payload = { ...row.payload };
    dbId = row._dbId ?? row.id;
  } else {
    const rest = { ...row };
    dbId = rest._dbId ?? rest.id;
    delete rest._dbId;
    payload = { ...rest };
    if (!dbId) dbId = payload.id;
  }
  if (!dbId) return null;
  return { id: dbId, payload };
};

const saveDataToSupabase = async (nextData, prevData) => {
  const jobs = TABLE_CONFIG.map(async ({ key, table, single }) => {
    const currentRows = single
      ? (nextData[key] ? [{ id: nextData[key]?.id || "COMPANY-001", payload: nextData[key] }] : [])
      : (Array.isArray(nextData[key]) ? nextData[key] : [])
          .filter((row) => row && row.id && (key !== "invoices" || invoiceRowToUpsert(row)))
          .map((row) => (key === "invoices" ? invoiceRowToUpsert(row) : { id: row.id, payload: row }));
    const previousRows = single
      ? (prevData[key] ? [{ id: prevData[key]?.id || "COMPANY-001", payload: prevData[key] }] : [])
      : (Array.isArray(prevData[key]) ? prevData[key] : [])
          .filter((row) => row && row.id && (key !== "invoices" || invoiceRowToUpsert(row)))
          .map((row) => (key === "invoices" ? invoiceRowToUpsert(row) : { id: row.id, payload: row }));

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
  const previousDataRef = useRef(createEmptyData());
  const latestDataRef = useRef(initialData);
  const saveGenerationRef = useRef(0);
  const saveChainRef = useRef(Promise.resolve());
  const pageHistoryRef = useRef(["dashboard"]);
  const handlingPopRef = useRef(false);
  const now = new Date();

  useEffect(() => {
    latestDataRef.current = data;
  }, [data]);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const remoteData = await fetchDataFromSupabase();
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
          await saveDataToSupabase(initialData, createEmptyData());
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
  }, []);

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
    if (!isLoaded) return;

    const gen = ++saveGenerationRef.current;
    const snapshot = cloneData(data);

    saveChainRef.current = saveChainRef.current.then(async () => {
      if (saveGenerationRef.current !== gen) return;
      try {
        await saveDataToSupabase(snapshot, previousDataRef.current);
        if (saveGenerationRef.current === gen) {
          previousDataRef.current = cloneData(snapshot);
        }
      } catch (error) {
        console.warn("Failed to save data to Supabase:", error);
      }
    });

    return () => {};
  }, [data, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;

    const flush = () => {
      const snapshot = cloneData(latestDataRef.current);
      saveChainRef.current = saveChainRef.current.then(async () => {
        try {
          await saveDataToSupabase(snapshot, previousDataRef.current);
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
  }, [isLoaded]);

  const pendingCount = (Array.isArray(data?.orders) ? data.orders : []).filter(o=>o?.status==="pending").length;
  const unmatchedCount = (Array.isArray(data?.bankTransactions) ? data.bankTransactions : []).filter(b=>b?.status==="unmatched").length;
  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  const overdueCount = (Array.isArray(data?.invoices) ? data.invoices : []).filter(i=>i?.status==="overdue"||(i?.status==="unpaid"&&(i?.dueDate||"")<todayStr)).length;

  const badges = { dispatch:pendingCount, bank:unmatchedCount+overdueCount };

  const pages = { dashboard:DashboardPage, calendar:CalendarPage, orders:OrdersPage, dispatch:DispatchPage, drivers:DriversPage, vehicles:VehiclesPage, customers:CustomersPage, invoices:InvoicesPage, bank:BankPage };
  const PageComponent = pages[page];

  const sectionOrder = ["メイン", "案件管理", "マスタ管理", "経理"];
  return (
    <div style={{ minHeight:"100vh", background:UI.mainBg, fontFamily:"'Noto Sans JP', sans-serif", fontSize:"13px", color:UI.text }}>
      <div style={{ background:"#fff", borderBottom:cardBorder, height:"48px", display:"flex", alignItems:"center", padding:"0 14px", gap:"10px" }}>
        {isMobile && (
          <button onClick={()=>setMenuOpen(v=>!v)} style={{ border:cardBorder, background:"#fff", borderRadius:"4px", width:"32px", height:"32px", display:"grid", placeItems:"center", color:"#666" }}>
            <Icon size={16}><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></Icon>
          </button>
        )}
        <div style={{ width:"30px", height:"30px", borderRadius:"5px", background:"linear-gradient(135deg,#00a09a,#007a74)", color:"#fff", display:"grid", placeItems:"center", fontWeight:700, fontSize:"12px" }}>T-L</div>
        <div style={{ display:"flex", flexDirection:"column", lineHeight:1.1 }}>
          <div style={{ fontSize:"14px", color:"#222", fontWeight:500 }}><span style={{ color:"#00a09a", fontWeight:700 }}>T-LINK</span> 配送管理システム</div>
          <div style={{ fontSize:"10px", color:"#999" }}>Delivery Management System</div>
        </div>
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:"10px" }}>
          <button style={{ border:"none", background:"transparent", color:"#666", display:"inline-flex", cursor:"pointer" }}>
            <Icon size={18}><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 5 0c0 1.7-2.5 2-2.5 3.5"/><line x1="12" y1="17.5" x2="12" y2="17.5"/></Icon>
          </button>
          <button style={{ position:"relative", border:"none", background:"transparent", color:"#666", display:"inline-flex", cursor:"pointer" }}>
            <Icon size={18}><path d="M18 8a6 6 0 1 0-12 0c0 7-3 6-3 8h18c0-2-3-1-3-8"/><path d="M10 19a2 2 0 0 0 4 0"/></Icon>
            <span style={{ position:"absolute", top:"0", right:"0", width:"7px", height:"7px", borderRadius:"50%", background:"#e63946" }} />
          </button>
          {!isMobile && (
            <>
              <div style={{ display:"flex", alignItems:"center", gap:"6px", color:"#666", fontSize:"12px" }}>
                <span style={{ background:"#e8f5f4", color:"#007a74", borderRadius:"999px", padding:"2px 8px", fontWeight:700 }}>{authRole === "admin" ? "管理者" : authRole === "driver" ? "ドライバー" : "ユーザー"}</span>
                <span>{authEmail || "-"}</span>
              </div>
              {typeof onLogout === "function" && <RetroBtn small onClick={onLogout}>ログアウト</RetroBtn>}
            </>
          )}
        </div>
      </div>

      <div style={{ display:"flex", minHeight:"calc(100vh - 48px)" }}>
        {!isMobile && (
          <aside style={{ width:"210px", borderRight:`1px solid ${UI.sidebarBorder}`, background:UI.sidebarBg, padding:"10px", boxSizing:"border-box", flexShrink:0 }}>
            <div style={{ background:UI.sidebarHeader, border:`1px solid ${UI.sidebarBorder}`, borderRadius:"6px", padding:"8px", marginBottom:"10px" }}>
              <div style={{ fontSize:"11px", fontWeight:700, color:"#555", marginBottom:"6px" }}>組織</div>
              <div style={{ background:"#fff", border:cardBorder, borderRadius:"4px", padding:"6px 8px", fontSize:"12px", color:"#333", marginBottom:"6px" }}>T-LINK 本社</div>
              <div style={{ fontSize:"11px", color:"#888" }}>{now.getFullYear()}年{now.getMonth()+1}月{now.getDate()}日 {now.getHours()}:{String(now.getMinutes()).padStart(2,"0")}</div>
            </div>
            {sectionOrder.map((section)=>(
              <div key={section} style={{ marginBottom:"10px" }}>
                <div style={{ fontSize:"11px", fontWeight:700, color:"#555", marginBottom:"4px" }}>{section}</div>
                <div style={{ display:"flex", flexDirection:"column", gap:"2px" }}>
                  {MENU.filter((m)=>m.section===section).map((m)=>(
                    <MenuBtn key={m.id} icon={m.icon} label={m.label} onClick={()=>setPageWithHistory(m.id)} active={page===m.id} badge={badges[m.id]||0}/>
                  ))}
                </div>
              </div>
            ))}
          </aside>
        )}

        <main style={{ flex:1, padding:isMobile ? "10px" : "14px", overflow:"auto" }}>
          {isMobile && menuOpen && (
            <div style={{ background:UI.sidebarBg, border:`1px solid ${UI.sidebarBorder}`, borderRadius:"6px", padding:"8px", marginBottom:"10px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px" }}>
              {MENU.map((m)=>(
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
            <PageComponent data={data} setData={setData} setPage={setPageWithHistory} isMobile={isMobile}/>
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
    </div>
  );
}
