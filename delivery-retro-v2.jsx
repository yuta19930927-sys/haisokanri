import { useState, useEffect, useRef } from "react";
import { supabase } from "./src/lib/supabase";

// ===== WIN95 STYLE =====
const raised = { borderTop:"2px solid #fff", borderLeft:"2px solid #fff", borderBottom:"2px solid #404040", borderRight:"2px solid #404040" };
const pressed = { borderTop:"2px solid #404040", borderLeft:"2px solid #404040", borderBottom:"2px solid #fff", borderRight:"2px solid #fff" };
const inset3d = { borderTop:"2px solid #808080", borderLeft:"2px solid #808080", borderBottom:"2px solid #fff", borderRight:"2px solid #fff" };
const groove = { border:"2px groove #808080" };
const winBg = "#d4d0c8";

// ===== MOCK DATA =====
const today = new Date();
const y = today.getFullYear(), mo = today.getMonth();
const fmt = (d) => `${y}-${String(mo+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;

const initialData = {
  customers: [
    { id:"C001", name:"株式会社田中商事", contact:"田中 太郎", phone:"03-1234-5678", email:"tanaka@tanakashoji.co.jp", address:"東京都中央区1-2-3", notes:"月末締め翌月払い" },
    { id:"C002", name:"山田運輸有限会社", contact:"山田 花子", phone:"06-2345-6789", email:"yamada@yamada-unyu.co.jp", address:"大阪府大阪市北区4-5-6", notes:"午前中納品希望" },
    { id:"C003", name:"鈴木食品株式会社", contact:"鈴木 次郎", phone:"052-3456-7890", email:"suzuki@suzukifood.co.jp", address:"愛知県名古屋市中区7-8-9", notes:"冷凍便あり" },
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
};

// ===== UI COMPONENTS =====
const RetroBtn = ({ children, onClick, color, wide, small, style:ext }) => {
  const [dn, setDn] = useState(false);
  return (
    <button onMouseDown={()=>setDn(true)} onMouseUp={()=>setDn(false)} onMouseLeave={()=>setDn(false)} onClick={onClick}
      style={{ background:color||winBg, fontFamily:"'MS Gothic','Noto Sans JP',monospace", fontSize:small?"11px":"12px", fontWeight:"bold", color:"#000", cursor:"pointer",
        padding:small?"2px 8px":wide?"8px 16px":"5px 10px", display:"inline-flex", alignItems:"center", gap:"4px", userSelect:"none",
        ...(dn?pressed:raised), ...ext }}>
      {children}
    </button>
  );
};
const RetroInput = (props) => (
  <input {...props} style={{ ...inset3d, background:"#fff", fontFamily:"'MS Gothic','Noto Sans JP',monospace", fontSize:"12px", padding:"3px 6px", color:"#000", outline:"none", width:"100%", boxSizing:"border-box", ...props.style }} />
);
const RetroSelect = ({ children, ...props }) => (
  <select {...props} style={{ ...inset3d, background:"#fff", fontFamily:"'MS Gothic','Noto Sans JP',monospace", fontSize:"12px", padding:"3px 6px", color:"#000", outline:"none", width:"100%", boxSizing:"border-box", ...props.style }}>
    {children}
  </select>
);
const RetroTextarea = (props) => (
  <textarea {...props} style={{ ...inset3d, background:"#fff", fontFamily:"'MS Gothic','Noto Sans JP',monospace", fontSize:"12px", padding:"3px 6px", color:"#000", outline:"none", width:"100%", boxSizing:"border-box", resize:"vertical", minHeight:"50px", ...props.style }} />
);
const Fl = ({ label, children }) => (
  <div style={{ marginBottom:"6px" }}>
    <div style={{ fontFamily:"monospace", fontSize:"11px", fontWeight:"bold", marginBottom:"2px" }}>{label}</div>
    {children}
  </div>
);
const StatusPill = ({ s }) => {
  const map = {
    pending:["未配車","#ffcc00","#000"], scheduled:["配車済","#0000cc","#fff"],
    in_transit:["配送中","#660099","#fff"], delivered:["完了","#006600","#fff"],
    unpaid:["未払い","#808080","#fff"], pending_confirmation:["確認待ち","#cc6600","#fff"],
    overdue:["延滞","#cc0000","#fff"], paid:["入金済","#006600","#fff"],
    available:["待機中","#006600","#fff"], on_duty:["稼働中","#0000cc","#fff"], off:["休暇","#808080","#fff"],
    in_use:["使用中","#0000cc","#fff"], maintenance:["整備中","#cc6600","#fff"],
    matched:["照合済","#006600","#fff"], unmatched:["未照合","#cc0000","#fff"],
  };
  const [label,bg,fg] = map[s]||[s,"#ccc","#000"];
  return <span style={{ background:bg, color:fg, fontSize:"10px", fontWeight:"bold", padding:"1px 7px", fontFamily:"monospace" }}>{label}</span>;
};
const RetroTable = ({ headers, rows }) => (
  <div style={{ ...inset3d, background:"#fff", overflow:"auto", maxHeight:"280px" }}>
    <table style={{ width:"100%", borderCollapse:"collapse", fontFamily:"'MS Gothic','Noto Sans JP',monospace", fontSize:"11px" }}>
      <thead>
        <tr style={{ background:"#000080", position:"sticky", top:0 }}>
          {headers.map((h,i)=><th key={i} style={{ color:"#fff", padding:"3px 8px", textAlign:"left", fontWeight:"bold", whiteSpace:"nowrap", borderRight:"1px solid #4040a0" }}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row,ri)=>(
          <tr key={ri} style={{ background:ri%2===0?"#fff":"#f0f0f8", borderBottom:"1px solid #ddd" }}
            onMouseEnter={e=>e.currentTarget.style.background="#eef4ff"}
            onMouseLeave={e=>e.currentTarget.style.background=ri%2===0?"#fff":"#f0f0f8"}>
            {row.map((cell,ci)=><td key={ci} style={{ padding:"3px 8px", borderRight:"1px solid #eee", whiteSpace:"nowrap" }}>{cell}</td>)}
          </tr>
        ))}
        {rows.length===0&&<tr><td colSpan={headers.length} style={{ padding:"16px", textAlign:"center", color:"#808080" }}>データなし</td></tr>}
      </tbody>
    </table>
  </div>
);
const TitleBar = ({ title, icon }) => (
  <div style={{ background:"linear-gradient(to right,#000080,#1084d0)", padding:"3px 6px", display:"flex", alignItems:"center", gap:"6px" }}>
    <span style={{ fontSize:"14px" }}>{icon}</span>
    <span style={{ color:"#fff", fontFamily:"'MS Gothic','ＭＳ ゴシック','Noto Sans JP',monospace", fontSize:"12px", fontWeight:"bold", flex:1 }}>{title}</span>
    {["－","□","✕"].map((c,i)=><div key={i} style={{ ...raised, background:winBg, width:"14px", height:"12px", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"8px", cursor:"pointer" }}>{c}</div>)}
  </div>
);
const Panel = ({ title, icon, children, style:ext }) => (
  <fieldset style={{ ...groove, padding:"6px 10px", ...ext }}>
    {title&&<legend style={{ fontFamily:"monospace", fontSize:"11px", fontWeight:"bold", padding:"0 4px" }}>{icon&&icon+" "}{title}</legend>}
    {children}
  </fieldset>
);

// ===== MODAL =====
const Modal = ({ title, icon, onClose, children, width=480 }) => (
  <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center" }}>
    <div style={{ background:winBg, ...raised, width, maxWidth:"95vw", maxHeight:"90vh", overflow:"auto" }}>
      <div style={{ background:"linear-gradient(to right,#000080,#1084d0)", padding:"3px 6px", display:"flex", alignItems:"center", gap:"6px" }}>
        <span style={{ fontSize:"14px" }}>{icon}</span>
        <span style={{ color:"#fff", fontFamily:"'MS Gothic','ＭＳ ゴシック','Noto Sans JP',monospace", fontSize:"12px", fontWeight:"bold", flex:1 }}>{title}</span>
        <button onClick={onClose} style={{ ...raised, background:winBg, width:"14px", height:"12px", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"8px", cursor:"pointer", padding:0 }}>
          ✕
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

const CalendarPage = ({ data, setData }) => {
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
        color: event?.color || EVENT_TYPE_COLOR[event?.type] || "#808080",
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
        color:EVENT_TYPE_COLOR[newEvent.type]||"#808080",
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
                color: EVENT_TYPE_COLOR[editEvent.type] || "#808080",
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

  return (
    <div style={{ display:"flex", gap:"10px" }}>
      {/* Left: Calendar */}
      <div style={{ flex:"0 0 auto", width:"420px" }}>
        <Panel title={`${calYear}年${calMonth+1}月`} icon="📅" style={{ marginBottom:"8px" }}>
          <div style={{ display:"flex", gap:"6px", marginBottom:"8px" }}>
            <RetroBtn onClick={()=>setCalMode("delivery")} color={calMode==="delivery" ? "#c0c0c0" : winBg} style={calMode==="delivery" ? pressed : raised}>配送カレンダー</RetroBtn>
            <RetroBtn onClick={()=>setCalMode("business")} color={calMode==="business" ? "#c0c0c0" : winBg} style={calMode==="business" ? pressed : raised}>業務カレンダー</RetroBtn>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:"6px", marginBottom:"8px" }}>
            <RetroBtn onClick={prevMonth}>◀</RetroBtn>
            <span style={{ fontFamily:"monospace", fontSize:"13px", fontWeight:"bold", flex:1, textAlign:"center" }}>{calYear}年 {calMonth+1}月</span>
            <RetroBtn onClick={nextMonth}>▶</RetroBtn>
          </div>

          {/* Weekday headers */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:"1px", marginBottom:"2px" }}>
            {["日","月","火","水","木","金","土"].map((w,i)=>(
              <div key={w} style={{ textAlign:"center", fontSize:"11px", fontWeight:"bold", fontFamily:"monospace",
                color:i===0?"#cc0000":i===6?"#0000cc":"#000", padding:"2px 0" }}>{w}</div>
            ))}
          </div>

          {/* Days grid */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:"1px" }}>
            {Array.from({length:firstDay}).map((_,i)=><div key={`e${i}`} style={{ background:"#c8c8c8", minHeight:"54px" }}/>)}
            {Array.from({length:daysInMonth}).map((_,i)=>{
              const d = i+1;
              const ds = getDayStr(d);
              const dayItems = getItemsForDate(ds);
              const isToday = ds===todayStr;
              const isSelected = ds===normalizeDateString(selectedDate);
              const dow = (firstDay+i)%7;
              return (
                <div key={d} onClick={()=>setSelectedDate(ds===selectedDate?null:ds)}
                  style={{ background:isSelected?"#cce0ff":isToday?"#ffffc0":"#fff",
                    ...inset3d, minHeight:"54px", cursor:"pointer", padding:"2px", overflow:"hidden",
                    outline:isSelected?"2px solid #000080":"none" }}>
                  <div style={{ fontFamily:"monospace", fontSize:"11px", fontWeight:isToday?"bold":"normal",
                    color:dow===0?"#cc0000":dow===6?"#0000cc":"#000",
                    display:"flex", alignItems:"center", gap:"2px" }}>
                    {isToday&&<span style={{ background:"#000080", color:"#fff", fontSize:"9px", padding:"0 2px" }}>今日</span>}
                    {d}
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:"1px" }}>
                    {dayItems.slice(0,2).map(item=>(
                      <div key={item.id} style={{ background:item.color, color:"#fff", fontSize:"9px", fontFamily:"monospace", padding:"1px 3px", overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis" }}>
                        <div>{item.title}</div>
                        {item.source === "order" && (
                          <div style={{ fontSize:"8px", opacity:0.9 }}>
                            {item.subtitle || "未配車"}
                          </div>
                        )}
                      </div>
                    ))}
                    {dayItems.length>2&&<div style={{ fontSize:"9px", fontFamily:"monospace", color:"#808080" }}>+{dayItems.length-2}件</div>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{ display:"flex", gap:"8px", marginTop:"6px", flexWrap:"wrap" }}>
            {(calMode === "delivery" ? [
              { label:"ルート配送", color:"#0000cc" },
              { label:"チャーター便", color:"#008800" },
            ] : BUSINESS_LEGEND).map((item)=>(
              <div key={item.label} style={{ display:"flex", alignItems:"center", gap:"3px" }}>
                <div style={{ width:"8px", height:"8px", background:item.color }}/>
                <span style={{ fontFamily:"monospace", fontSize:"9px" }}>{item.label}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Right: Day detail */}
      <div style={{ flex:1 }}>
        {selectedDate ? (
          <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ fontFamily:"monospace", fontSize:"14px", fontWeight:"bold" }}>
                📅 {selectedDate} の{calMode === "delivery" ? "配送予定" : "業務予定"}
              </div>
              <RetroBtn onClick={()=>openAddModal(selectedDate)} color="#d0e0ff">
                ＋この日に予定を追加
              </RetroBtn>
            </div>

            {selectedItems.length>0&&(
              <Panel title={calMode === "delivery" ? "配送予定一覧" : "業務予定一覧"} icon="📋">
                {selectedItems.map(item=>(
                  <div key={item.id} style={{ display:"flex", alignItems:"center", gap:"8px", padding:"5px 0", borderBottom:"1px solid #ddd", cursor:"pointer" }} onClick={() => openEditModal(item)}>
                    <div style={{ width:"10px", height:"10px", background:item.color, flexShrink:0 }}/>
                    <div style={{ flex:1, fontFamily:"monospace", fontSize:"12px" }}>
                      <span style={{ background:item.color, color:"#fff", padding:"1px 6px", fontSize:"10px", marginRight:"6px" }}>
                        {item.source === "order"
                          ? item.deliveryType === "charter" ? "チャーター便" : "ルート配送"
                          : item.source === "driver"
                            ? "免許更新"
                            : item.source === "vehicle"
                              ? "車検"
                              : EVENT_TYPE_LABEL[item.type] || item.type}
                      </span>
                      {item.title}
                      {item.source === "order" && (
                        <div style={{ marginTop:"2px", fontSize:"10px", color:"#404040" }}>
                          ドライバー：{item.subtitle || "未配車"}
                        </div>
                      )}
                    </div>
                    {(item.source === "order" || item.source === "event") && <span style={{ fontSize:"10px", color:"#000080" }}>編集</span>}
                  </div>
                ))}
              </Panel>
            )}

            {selectedItems.length===0&&(
              <div style={{ ...inset3d, background:"#fff", padding:"24px", textAlign:"center", fontFamily:"monospace", fontSize:"12px", color:"#808080" }}>
                この日の予定・記録はありません<br/>
                <RetroBtn onClick={()=>openAddModal(selectedDate)} color="#d0e0ff" style={{ marginTop:"10px" }}>＋予定を追加する</RetroBtn>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
            <div style={{ fontFamily:"monospace", fontSize:"11px", color:"#808080", textAlign:"center" }}>
              カレンダーの日付をクリックすると詳細が表示されます
            </div>
          </div>
        )}
      </div>

      {/* Add event modal */}
      {showAddModal&&(
        <Modal title={calMode === "delivery" ? "配送予定追加" : "業務予定追加"} icon="📅" onClose={()=>setShowAddModal(false)} width={420}>
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
            <RetroBtn onClick={saveNewItem} color="#d0e0ff">　追加する　</RetroBtn>
          </div>
        </Modal>
      )}

      {showEditModal&&editingItem&&(
        <Modal title="予定編集" icon="📝" onClose={()=>{setShowEditModal(false);setEditingItem(null);}} width={420}>
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
            <div style={{ fontFamily:"monospace", fontSize:"12px", color:"#404040" }}>
              この予定は自動表示項目のため編集できません。
            </div>
          )}
          <div style={{ display:"flex", justifyContent:"space-between", gap:"6px", marginTop:"10px" }}>
            <RetroBtn color="#ffd0d0" onClick={deleteEditingItem} style={{ visibility:(editingItem.source==="order"||editingItem.source==="event")?"visible":"hidden" }}>
              削除
            </RetroBtn>
            <div style={{ display:"flex", gap:"6px" }}>
              <RetroBtn onClick={()=>{setShowEditModal(false);setEditingItem(null);}}>キャンセル</RetroBtn>
              <RetroBtn onClick={saveEditedItem} color="#d0e0ff" style={{ visibility:(editingItem.source==="order"||editingItem.source==="event")?"visible":"hidden" }}>
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
  const bankTransactions = Array.isArray(data?.bankTransactions) ? data.bankTransactions : [];
  const invoices = Array.isArray(data?.invoices) ? data.invoices : [];
  const payables = Array.isArray(data?.payables) ? data.payables : [];
  const events = Array.isArray(data?.events) ? data.events : [];
  const [addTx, setAddTx] = useState(false);
  const [form, setForm] = useState({ date:todayStr, amount:"", description:"", direction:"in" });

  const todayStr2 = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
  const unmatchedBanks = bankTransactions.filter(b=>b?.status==="unmatched");
  const totalUnmatched = unmatchedBanks.reduce((s,b)=>s+(Number(b?.amount)||0),0);
  const overdueTotal = invoices.filter(i=>i?.status==="overdue"||(i?.status==="unpaid"&&(i?.dueDate||"")<todayStr2)).reduce((s,i)=>s+(Number(i?.total)||0),0);

  const addTxn = () => {
    const tx = { id:`BNK-${String(bankTransactions.length+1).padStart(3,"0")}`, date:form.date, amount:parseInt(form.amount)||0, description:form.description, matchedInvoice:null, status:"unmatched" };
    setData(d=>({...d, bankTransactions:[tx,...(Array.isArray(d?.bankTransactions) ? d.bankTransactions : [])]}));
    setAddTx(false); setForm({ date:todayStr2, amount:"", description:"", direction:"in" });
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
      {/* Stats */}
      <div style={{ display:"flex", gap:"8px" }}>
        {[
          ["未照合入金", "¥"+totalUnmatched.toLocaleString(), "#cc6600"],
          ["未払い請求", "¥"+invoices.filter(i=>i?.status!=="paid").reduce((s,i)=>s+(Number(i?.total)||0),0).toLocaleString(), "#0000cc"],
          ["延滞金額", "¥"+overdueTotal.toLocaleString(), "#cc0000"],
          ["入金済", "¥"+invoices.filter(i=>i?.status==="paid").reduce((s,i)=>s+(Number(i?.total)||0),0).toLocaleString(), "#006600"],
        ].map(([l,v,c])=>(
          <div key={l} style={{ ...inset3d, background:"#fff", padding:"8px 12px", flex:1, textAlign:"center" }}>
            <div style={{ fontFamily:"monospace", fontSize:"10px", color:"#404040", marginBottom:"3px" }}>{l}</div>
            <div style={{ fontFamily:"monospace", fontSize:"16px", fontWeight:"bold", color:c }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Unmatched alert */}
      {unmatchedBanks.length>0&&(
        <Panel style={{ border:"2px solid #cc6600", background:"#fff8e0" }}>
          <div style={{ fontFamily:"monospace", fontSize:"12px", fontWeight:"bold", color:"#cc6600", marginBottom:"8px" }}>
            ★ 未照合の入金 {unmatchedBanks.length}件 — 請求書と照合してください
          </div>
          {unmatchedBanks.map(b=>(
            <div key={b.id} style={{ ...inset3d, background:"#fff", padding:"8px 10px", marginBottom:"6px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"6px" }}>
                <div>
                  <span style={{ fontFamily:"monospace", fontSize:"12px", fontWeight:"bold" }}>{b.date}</span>
                  <span style={{ fontFamily:"monospace", fontSize:"12px", marginLeft:"10px", color:"#006600", fontWeight:"bold" }}>¥{b.amount.toLocaleString()} 入金</span>
                  <span style={{ fontFamily:"monospace", fontSize:"11px", color:"#404040", marginLeft:"10px" }}>{b.description}</span>
                </div>
                <StatusPill s={b.status}/>
              </div>
              <div style={{ display:"flex", gap:"6px", alignItems:"center" }}>
                <span style={{ fontFamily:"monospace", fontSize:"11px" }}>照合：</span>
                <RetroSelect style={{ width:"250px" }} onChange={e=>{
                  if(!e.target.value) return;
                  const inv = invoices.find(i=>i?.id===e.target.value);
                  setData(d=>({
                    ...d,
                    bankTransactions:(Array.isArray(d?.bankTransactions) ? d.bankTransactions : []).map(bt=>bt?.id===b?.id?{...bt,matchedInvoice:e.target.value,status:"matched"}:bt),
                    invoices:(Array.isArray(d?.invoices) ? d.invoices : []).map(i=>i?.id===e.target.value?{...i,status:"paid",paidDate:b?.date}:i),
                    events:[...(Array.isArray(d?.events) ? d.events : []),{id:`EV-B${Date.now()}`,date:b?.date,type:"bank_in",title:`入金確認：${inv?.customerName||""} ¥${(Number(b?.amount)||0).toLocaleString()}`,color:"#006600"}]
                  }));
                }}>
                  <option value="">請求書を選択...</option>
                  {invoices.filter(i=>i?.status!=="paid").map(i=>(
                    <option key={i?.id||`inv-${Math.random()}`} value={i?.id||""}>{i?.id||"—"} {i?.customerName||""} ¥{(Number(i?.total)||0).toLocaleString()}</option>
                  ))}
                </RetroSelect>
              </div>
            </div>
          ))}
        </Panel>
      )}

      {/* All bank transactions */}
      <Panel title="口座入出金履歴" icon="🏦">
        <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:"6px" }}>
          <RetroBtn onClick={()=>setAddTx(true)} color="#d0e0ff">＋入出金を手動追加</RetroBtn>
        </div>
        <RetroTable
          headers={["日付","内容（振込名義等）","金額","照合状況","照合先"]}
          rows={bankTransactions.map(b=>[
            b?.date||"",
            <span style={{ fontFamily:"monospace", fontSize:"11px" }}>{b?.description||""}</span>,
            <span style={{ color:"#006600", fontWeight:"bold" }}>¥{(Number(b?.amount)||0).toLocaleString()}</span>,
            <StatusPill s={b?.status}/>,
            b?.matchedInvoice ? (
              <span style={{ color:"#006600", fontFamily:"monospace", fontSize:"11px" }}>
                {b.matchedInvoice} / {invoices.find(i=>i?.id===b.matchedInvoice)?.customerName||""}
              </span>
            ) : "—",
          ])}
        />
      </Panel>

      {/* Invoices with status */}
      <Panel title="入金管理（請求書別）" icon="💴">
        <RetroTable
          headers={["請求書","顧客","発行日","期日","金額","状態","メモ"]}
          rows={invoices.map(inv=>[
            <span style={{ color:"#000080", fontWeight:"bold" }}>{inv?.id||"—"}</span>,
            inv?.customerName||"", inv?.issueDate||"", inv?.dueDate||"",
            <span style={{ fontWeight:"bold" }}>¥{(Number(inv?.total)||0).toLocaleString()}</span>,
            <StatusPill s={inv?.status}/>,
            <span style={{ fontSize:"10px", color:"#808080" }}>{inv?.note||"—"}</span>,
          ])}
        />
      </Panel>

      {/* Payables */}
      <Panel title="支払管理（支払予定一覧）" icon="💸">
        <RetroTable
          headers={["支払先","区分","期日","金額","状態","操作"]}
          rows={payables.map(p=>[
            p?.vendor||"", p?.category||"", p?.dueDate||"",
            "¥"+(Number(p?.amount)||0).toLocaleString(),
            <StatusPill s={p?.status}/>,
            p?.status==="unpaid"
              ? <RetroBtn small color="#d0ffd0" onClick={()=>setData(d=>({...d,payables:(Array.isArray(d?.payables) ? d.payables : []).map(x=>x?.id===p?.id?{...x,status:"paid"}:x)}))}>✓ 支払済</RetroBtn>
              : <span style={{ fontFamily:"monospace", fontSize:"10px", color:"#808080" }}>済</span>
          ])}
        />
      </Panel>

      {addTx&&(
        <Modal title="入出金を手動追加" icon="🏦" onClose={()=>setAddTx(false)} width={400}>
          <Fl label="日付"><RetroInput type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/></Fl>
          <Fl label="金額（円）"><RetroInput type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} placeholder="50000"/></Fl>
          <Fl label="摘要・振込名義"><RetroInput value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="タナカシヨウジ　カブ"/></Fl>
          <div style={{ display:"flex", justifyContent:"flex-end", gap:"6px", marginTop:"10px" }}>
            <RetroBtn onClick={()=>setAddTx(false)}>キャンセル</RetroBtn>
            <RetroBtn onClick={addTxn} color="#d0e0ff">　追加する　</RetroBtn>
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

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
      {/* Alert row */}
      <div style={{ display:"flex", gap:"8px" }}>
        {unmatchedCount>0&&(
          <div style={{ ...inset3d, background:"#fff8e0", padding:"8px 12px", flex:1, borderLeft:"4px solid #cc6600", cursor:"pointer" }} onClick={()=>setPage("bank")}>
            <span style={{ fontFamily:"monospace", fontSize:"12px", fontWeight:"bold", color:"#cc6600" }}>★ 未照合入金 {unmatchedCount}件 → 口座照合へ</span>
          </div>
        )}
        {overdueCount>0&&(
          <div style={{ ...inset3d, background:"#fff0f0", padding:"8px 12px", flex:1, borderLeft:"4px solid #cc0000", cursor:"pointer" }} onClick={()=>setPage("bank")}>
            <span style={{ fontFamily:"monospace", fontSize:"12px", fontWeight:"bold", color:"#cc0000" }}>⚠ 支払延滞 {overdueCount}件 — 要対応</span>
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{ display:"flex", gap:"8px" }}>
        {[["稼働中案件",activeOrders+"件","#000080"],["待機ドライバー",availableDrivers+"名","#006600"],["入金済売上","¥"+totalRevenue.toLocaleString(),"#660099"],["未回収","¥"+unpaidTotal.toLocaleString(),"#cc0000"]].map(([l,v,c])=>(
          <div key={l} style={{ ...inset3d, background:"#fff", padding:"8px 12px", flex:1, textAlign:"center" }}>
            <div style={{ fontFamily:"monospace", fontSize:"10px", color:"#404040", marginBottom:"3px" }}>{l}</div>
            <div style={{ fontFamily:"monospace", fontSize:"18px", fontWeight:"bold", color:c }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ display:"flex", gap:"10px" }}>
        {/* Today's schedule */}
        <div style={{ flex:1 }}>
          <Panel title={`本日の予定（${todayStr}）`} icon="📅">
            {todayEvents.length===0&&todayBanks.length===0&&(
              <div style={{ fontFamily:"monospace", fontSize:"11px", color:"#808080", padding:"8px" }}>本日の予定はありません</div>
            )}
            {todayEvents.map(ev=>(
              <div key={ev.id} style={{ display:"flex", alignItems:"center", gap:"6px", padding:"4px 0", borderBottom:"1px solid #ddd" }}>
                <div style={{ width:"8px", height:"8px", background:ev.color }}/>
                <span style={{ fontFamily:"monospace", fontSize:"11px", flex:1 }}>{ev.title}</span>
                <span style={{ background:ev.color, color:"#fff", fontSize:"9px", fontFamily:"monospace", padding:"1px 5px" }}>{EVENT_TYPE_LABEL[ev.type]||ev.type}</span>
              </div>
            ))}
            {todayBanks.map(b=>(
              <div key={b.id} style={{ display:"flex", alignItems:"center", gap:"6px", padding:"4px 0", borderBottom:"1px solid #ddd" }}>
                <div style={{ width:"8px", height:"8px", background:"#006600" }}/>
                <span style={{ fontFamily:"monospace", fontSize:"11px", flex:1 }}>💰 入金 ¥{b.amount.toLocaleString()} {b.description}</span>
                <StatusPill s={b.status}/>
              </div>
            ))}
          </Panel>
        </div>

        {/* Recent orders */}
        <div style={{ flex:1.5 }}>
          <Panel title="最近の案件" icon="🚛">
            <RetroTable
              headers={["ID","顧客","配達日","状態"]}
              rows={[...orders].reverse().slice(0,5).map(o=>[
                <span style={{ color:"#000080", fontWeight:"bold" }}>{o?.id||"—"}</span>,
                o?.customerName||"", o?.deliveryDate||"", <StatusPill s={o?.status}/>
              ])}
            />
          </Panel>
        </div>
      </div>

      <div style={{ display:"flex", gap:"10px" }}>
        <Panel title="ドライバー状況" icon="👤" style={{ flex:1 }}>
          <RetroTable
            headers={["氏名","免許","状態"]}
            rows={drivers.map(d=>[d?.name||"", d?.license||"", <StatusPill s={d?.status}/>])}
          />
        </Panel>
        <Panel title="口座照合が必要な入金" icon="🏦" style={{ flex:1 }}>
          <RetroTable
            headers={["日付","金額","摘要","状態"]}
            rows={bankTransactions.filter(b=>b?.status==="unmatched").map(b=>[
              b?.date||"",
              <span style={{ color:"#006600", fontWeight:"bold" }}>¥{(Number(b?.amount)||0).toLocaleString()}</span>,
              <span style={{ fontSize:"10px" }}>{b?.description||""}</span>,
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
      <div style={{ ...inset3d, background:"#fff", padding:"24px", textAlign:"center", fontFamily:"monospace", fontSize:"12px", color:"#808080" }}>
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
    setData((d) => ({
      ...d,
      orders: (Array.isArray(d?.orders) ? d.orders : []).map((x) =>
        x?.id === orderId ? { ...x, status: next } : x
      ),
    }));
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
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
      <div style={{ display:"flex", gap:"6px", alignItems:"center" }}>
        <RetroBtn onClick={()=>setShowModal(true)} color="#d0e0ff">📋 新規受注</RetroBtn>
        <span style={{ fontFamily:"monospace", fontSize:"11px" }}>検索：</span>
        <RetroInput value={search} onChange={e=>setSearch(e.target.value)} style={{ width:"200px" }}/>
      </div>
      <div style={{ ...inset3d, background:"#fff", overflow:"auto", maxHeight:"320px" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontFamily:"'MS Gothic','Noto Sans JP',monospace", fontSize:"11px" }}>
          <thead>
            <tr style={{ background:"#000080", position:"sticky", top:0 }}>
              {["ID","顧客","荷物","配達日","金額","状態","操作"].map((h)=><th key={h} style={{ color:"#fff", padding:"3px 8px", textAlign:"left", fontWeight:"bold", whiteSpace:"nowrap", borderRight:"1px solid #4040a0" }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.map((o, index) => (
              <tr key={o?.id || `order-${index}`} onClick={() => openOrderDetail(o)} style={{ background:index%2===0?"#fff":"#f0f0f8", borderBottom:"1px solid #ddd", cursor:"pointer" }}>
                <td style={{ padding:"3px 8px", borderRight:"1px solid #eee" }}><span style={{ color:"#000080", fontWeight:"bold" }}>{o?.id||"—"}</span></td>
                <td style={{ padding:"3px 8px", borderRight:"1px solid #eee" }}>{o?.customerName||""}</td>
                <td style={{ padding:"3px 8px", borderRight:"1px solid #eee" }}>{`${o?.cargo||""}(${o?.weight||""})`}</td>
                <td style={{ padding:"3px 8px", borderRight:"1px solid #eee" }}>{o?.deliveryDate||""}</td>
                <td style={{ padding:"3px 8px", borderRight:"1px solid #eee" }}>¥{(Number(o?.amount)||0).toLocaleString()}</td>
                <td style={{ padding:"3px 8px", borderRight:"1px solid #eee" }}><StatusPill s={o?.status}/></td>
                <td style={{ padding:"3px 8px", borderRight:"1px solid #eee", whiteSpace:"nowrap" }}>
                  <div style={{ display:"flex", gap:"4px" }}>
                    {statusPrev[o?.status] && (
                      <RetroBtn small onClick={(e)=>{ e.stopPropagation(); goPrevStatus(o?.id, o?.status); }}>←戻る</RetroBtn>
                    )}
                    {statusNext[o?.status] && (
                      <RetroBtn small onClick={(e)=>{ e.stopPropagation(); goNextStatus(o?.id, o?.status); }}>次へ→</RetroBtn>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length===0&&<tr><td colSpan={7} style={{ padding:"16px", textAlign:"center", color:"#808080" }}>データなし</td></tr>}
          </tbody>
        </table>
      </div>
      {showModal&&<Modal title="新規受注登録" icon="📋" onClose={()=>setShowModal(false)}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"6px 12px" }}>
          <Fl label="顧客"><RetroSelect value={form.customerId} onChange={e=>setForm(f=>({...f,customerId:e.target.value}))}><option value="">選択</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</RetroSelect></Fl>
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
          <RetroBtn onClick={handleAdd} color="#d0e0ff">　登録する　</RetroBtn>
        </div>
      </Modal>}
      {selectedOrder && (
        <Modal title={`受注詳細 ${selectedOrder?.id || ""}`} icon="📋" onClose={closeOrderDetail} width={520}>
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
                <RetroBtn onClick={saveOrderDetail} color="#d0e0ff">保存</RetroBtn>
              </div>
            </>
          ) : (
            <>
              <Panel>
                <div style={{ display:"grid", gridTemplateColumns:"120px 1fr", rowGap:"6px", columnGap:"8px", fontFamily:"monospace", fontSize:"12px" }}>
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
                <RetroBtn onClick={()=>{ setOrderDraft(selectedOrder ? { ...selectedOrder } : null); setOrderEditMode(true); }} color="#d0e0ff">編集</RetroBtn>
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
  return (
    <div style={{ display:"flex", gap:"10px" }}>
      <div style={{ flex:1 }}>
        <Panel title={`未配車（${pending.length}件）`} icon="⚠">
          {pending.map(o=>(
            <div key={o?.id||`pending-${Math.random()}`} onClick={()=>setSel(o?.id===sel?null:o?.id)} style={{ ...inset3d, background:sel===o?.id?"#cce0ff":"#fff", padding:"7px 10px", marginBottom:"5px", cursor:"pointer" }}>
              <div style={{ fontFamily:"monospace", fontSize:"11px", fontWeight:"bold", color:"#000080" }}>{o?.id||"—"} — {o?.customerName||""}</div>
              <div style={{ fontFamily:"monospace", fontSize:"11px", color:"#404040" }}>{o?.cargo||""}（{o?.weight||""}）配達日：{o?.deliveryDate||""}</div>
            </div>
          ))}
        </Panel>
        {sel&&<Panel title="配車アサイン" icon="🚛" style={{ marginTop:"8px", border:"2px solid #000080" }}>
          <Fl label="ドライバー"><RetroSelect value={aD} onChange={e=>setAD(e.target.value)}><option value="">選択</option>{drivers.filter(d=>d?.status==="available").map(d=><option key={d?.id||`driver-${Math.random()}`} value={d?.id||""}>{d?.name||""}（{d?.license||""}）</option>)}</RetroSelect></Fl>
          <Fl label="車両"><RetroSelect value={aV} onChange={e=>setAV(e.target.value)}><option value="">選択</option>{vehicles.filter(v=>v?.status==="available").map(v=><option key={v?.id||`vehicle-${Math.random()}`} value={v?.id||""}>{v?.plate||""}</option>)}</RetroSelect></Fl>
          <RetroBtn onClick={doAssign} color="#d0ffd0">🚛 配車確定</RetroBtn>
        </Panel>}
      </div>
      <div style={{ flex:1 }}>
        <Panel title={`配車済（${scheduled.length}件）`} icon="✓">
          {scheduled.map(o=>{
            const dr=drivers.find(d=>d?.id===o?.driverId); const vh=vehicles.find(v=>v?.id===o?.vehicleId);
            return <div key={o?.id||`scheduled-${Math.random()}`} style={{ ...inset3d, background:"#f0fff0", padding:"7px 10px", marginBottom:"5px" }}>
              <div style={{ fontFamily:"monospace", fontSize:"11px", fontWeight:"bold", color:"#000080" }}>{o?.id||"—"} — {o?.customerName||""}</div>
              <div style={{ display:"flex", gap:"6px", marginTop:"3px" }}>
                {dr&&<span style={{ background:"#000080", color:"#fff", fontFamily:"monospace", fontSize:"10px", padding:"1px 6px" }}>👤{dr?.name||""}</span>}
                {vh&&<span style={{ background:"#006600", color:"#fff", fontFamily:"monospace", fontSize:"10px", padding:"1px 6px" }}>🚛{vh?.plate||""}</span>}
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
  const [form, setForm] = useState({ name:"", contact:"", phone:"", email:"", address:"", notes:"" });
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [customerEditMode, setCustomerEditMode] = useState(false);
  const [customerDraft, setCustomerDraft] = useState(null);
  const selectedCustomer = customers.find((c) => c?.id === selectedCustomerId) || null;

  const add = () => {
    setData(d=>({...d,customers:[...(Array.isArray(d?.customers) ? d.customers : []),{id:`C${String((Array.isArray(d?.customers) ? d.customers.length : 0)+1).padStart(3,"0")}`, ...form}]}));
    setShowModal(false);
    setForm({name:"",contact:"",phone:"",email:"",address:"",notes:""});
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

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
      <div><RetroBtn onClick={()=>setShowModal(true)} color="#d0e0ff">👥 顧客追加</RetroBtn></div>
      <div style={{ ...inset3d, background:"#fff", overflow:"auto", maxHeight:"320px" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontFamily:"'MS Gothic','Noto Sans JP',monospace", fontSize:"11px" }}>
          <thead>
            <tr style={{ background:"#000080", position:"sticky", top:0 }}>
              {["ID","会社名","担当者","電話","案件数","累計売上"].map((h)=><th key={h} style={{ color:"#fff", padding:"3px 8px", textAlign:"left", fontWeight:"bold", whiteSpace:"nowrap", borderRight:"1px solid #4040a0" }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {customers.map((c, index) => {
              const ords = orders.filter((o)=>o?.customerId===c?.id);
              return (
                <tr key={c?.id || `customer-${index}`} onClick={()=>openCustomerDetail(c)} style={{ background:index%2===0?"#fff":"#f0f0f8", borderBottom:"1px solid #ddd", cursor:"pointer" }}>
                  <td style={{ padding:"3px 8px", borderRight:"1px solid #eee" }}><span style={{color:"#000080",fontWeight:"bold"}}>{c?.id||"—"}</span></td>
                  <td style={{ padding:"3px 8px", borderRight:"1px solid #eee" }}>{c?.name||""}</td>
                  <td style={{ padding:"3px 8px", borderRight:"1px solid #eee" }}>{c?.contact||""}</td>
                  <td style={{ padding:"3px 8px", borderRight:"1px solid #eee" }}>{c?.phone||""}</td>
                  <td style={{ padding:"3px 8px", borderRight:"1px solid #eee" }}>{ords.length}件</td>
                  <td style={{ padding:"3px 8px", borderRight:"1px solid #eee" }}>¥{ords.reduce((s,o)=>s+(Number(o?.amount)||0),0).toLocaleString()}</td>
                </tr>
              );
            })}
            {customers.length===0&&<tr><td colSpan={6} style={{ padding:"16px", textAlign:"center", color:"#808080" }}>データなし</td></tr>}
          </tbody>
        </table>
      </div>
      {showModal&&<Modal title="顧客追加" icon="👥" onClose={()=>setShowModal(false)}>
        <Fl label="会社名"><RetroInput value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></Fl>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 12px"}}>
          <Fl label="担当者"><RetroInput value={form.contact} onChange={e=>setForm(f=>({...f,contact:e.target.value}))}/></Fl>
          <Fl label="電話"><RetroInput value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/></Fl>
        </div>
        <Fl label="メール"><RetroInput value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></Fl>
        <Fl label="住所"><RetroInput value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))}/></Fl>
        <Fl label="メモ"><RetroTextarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></Fl>
        <div style={{display:"flex",justifyContent:"flex-end",gap:"6px",marginTop:"8px"}}>
          <RetroBtn onClick={()=>setShowModal(false)}>キャンセル</RetroBtn>
          <RetroBtn onClick={add} color="#d0e0ff">　登録する　</RetroBtn>
        </div>
      </Modal>}
      {selectedCustomer && (
        <Modal title={`顧客詳細 ${selectedCustomer?.id || ""}`} icon="👥" onClose={closeCustomerDetail} width={520}>
          {customerEditMode ? (
            <>
              <Fl label="会社名"><RetroInput value={customerDraft?.name || ""} onChange={(e)=>setCustomerDraft((prev)=>({ ...(prev||{}), name:e.target.value }))}/></Fl>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 12px"}}>
                <Fl label="担当者"><RetroInput value={customerDraft?.contact || ""} onChange={(e)=>setCustomerDraft((prev)=>({ ...(prev||{}), contact:e.target.value }))}/></Fl>
                <Fl label="電話"><RetroInput value={customerDraft?.phone || ""} onChange={(e)=>setCustomerDraft((prev)=>({ ...(prev||{}), phone:e.target.value }))}/></Fl>
              </div>
              <Fl label="メール"><RetroInput value={customerDraft?.email || ""} onChange={(e)=>setCustomerDraft((prev)=>({ ...(prev||{}), email:e.target.value }))}/></Fl>
              <Fl label="住所"><RetroInput value={customerDraft?.address || ""} onChange={(e)=>setCustomerDraft((prev)=>({ ...(prev||{}), address:e.target.value }))}/></Fl>
              <Fl label="メモ"><RetroTextarea value={customerDraft?.notes || ""} onChange={(e)=>setCustomerDraft((prev)=>({ ...(prev||{}), notes:e.target.value }))}/></Fl>
              <div style={{display:"flex",justifyContent:"flex-end",gap:"6px",marginTop:"8px"}}>
                <RetroBtn onClick={()=>{ setCustomerEditMode(false); setCustomerDraft(selectedCustomer ? { ...selectedCustomer } : null); }}>キャンセル</RetroBtn>
                <RetroBtn onClick={saveCustomer} color="#d0e0ff">保存</RetroBtn>
              </div>
            </>
          ) : (
            <>
              <Panel>
                <div style={{ display:"grid", gridTemplateColumns:"120px 1fr", rowGap:"6px", columnGap:"8px", fontFamily:"monospace", fontSize:"12px" }}>
                  <div>会社名</div><div>{selectedCustomer?.name || ""}</div>
                  <div>担当者</div><div>{selectedCustomer?.contact || ""}</div>
                  <div>電話</div><div>{selectedCustomer?.phone || ""}</div>
                  <div>メール</div><div>{selectedCustomer?.email || ""}</div>
                  <div>住所</div><div>{selectedCustomer?.address || "—"}</div>
                  <div>メモ</div><div>{selectedCustomer?.notes || "—"}</div>
                </div>
              </Panel>
              <div style={{display:"flex",justifyContent:"space-between",gap:"6px",marginTop:"8px"}}>
                <RetroBtn color="#ffd0d0" onClick={()=>deleteCustomer(selectedCustomer?.id)}>削除</RetroBtn>
                <div style={{ display:"flex", gap:"6px" }}>
                  <RetroBtn onClick={closeCustomerDetail}>閉じる</RetroBtn>
                  <RetroBtn onClick={()=>{ setCustomerDraft(selectedCustomer ? { ...selectedCustomer } : null); setCustomerEditMode(true); }} color="#d0e0ff">編集</RetroBtn>
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
  const deliveredNoInv = orders.filter(o=>o?.status==="delivered"&&!invoices.find(i=>i?.orderId===o?.id));
  const createInv = (o) => {
    const tax=Math.round((Number(o?.amount)||0)*0.1);
    const dueDate=`${y}-${String(mo+1).padStart(2,"0")}-${String(Math.min(today.getDate()+30,28)).padStart(2,"0")}`;
    const baseAmount = Number(o?.amount)||0;
    const inv={ id:`INV-${String(invoices.length+1).padStart(3,"0")}`, orderId:o?.id, customerId:o?.customerId, customerName:o?.customerName||"", issueDate:fmt(today.getDate()), dueDate, amount:baseAmount, tax, total:baseAmount+tax, status:"unpaid", bankRef:"", paidDate:null, note:"" };
    setData(d=>({...d, invoices:[inv,...(Array.isArray(d?.invoices) ? d.invoices : [])], events:[...(Array.isArray(d?.events) ? d.events : events),{id:`EV-INV${Date.now()}`,date:dueDate,type:"payment_due",title:`${inv.id} 入金期日：${o?.customerName||""}`,color:"#660099"}] }));
  };
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
      <div style={{ display:"flex", gap:"8px" }}>
        {[["請求総額","¥"+invoices.reduce((s,i)=>s+(Number(i?.total)||0),0).toLocaleString(),"#660099"],["入金済","¥"+invoices.filter(i=>i?.status==="paid").reduce((s,i)=>s+(Number(i?.total)||0),0).toLocaleString(),"#006600"],["未回収","¥"+invoices.filter(i=>i?.status!=="paid").reduce((s,i)=>s+(Number(i?.total)||0),0).toLocaleString(),"#cc0000"]].map(([l,v,c])=>(
          <div key={l} style={{ ...inset3d, background:"#fff", padding:"8px 12px", flex:1, textAlign:"center" }}>
            <div style={{ fontFamily:"monospace", fontSize:"10px", color:"#404040" }}>{l}</div>
            <div style={{ fontFamily:"monospace", fontSize:"18px", fontWeight:"bold", color:c }}>{v}</div>
          </div>
        ))}
      </div>
      {deliveredNoInv.length>0&&(
        <Panel style={{ border:"2px solid #cc6600", background:"#fff8e0" }}>
          <div style={{ fontFamily:"monospace", fontSize:"11px", fontWeight:"bold", color:"#cc6600", marginBottom:"6px" }}>⚠ 請求書未発行</div>
          {deliveredNoInv.map(o=>(
            <div key={o.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"4px 0" }}>
              <span style={{ fontFamily:"monospace", fontSize:"11px" }}>{o?.id||"—"} — {o?.customerName||""}（¥{(Number(o?.amount)||0).toLocaleString()}）</span>
              <RetroBtn small color="#ffe0a0" onClick={()=>createInv(o)}>📄 発行</RetroBtn>
            </div>
          ))}
        </Panel>
      )}
      <RetroTable
        headers={["請求書","顧客","期日","合計","状態","備考"]}
        rows={invoices.map(inv=>[
          <span style={{color:"#000080",fontWeight:"bold"}}>{inv?.id||"—"}</span>,
          inv?.customerName||"", inv?.dueDate||"",
          <span style={{fontWeight:"bold"}}>¥{(Number(inv?.total)||0).toLocaleString()}</span>,
          <StatusPill s={inv?.status}/>,
          <span style={{fontSize:"10px",color:"#808080"}}>{inv?.note||"—"}</span>
        ])}
      />
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

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
      <div>
        <RetroBtn onClick={openAdd} color="#d0e0ff">👤 ドライバー追加</RetroBtn>
      </div>
      <RetroTable
        headers={["ID","氏名","免許種別","免許更新日","電話","状態","メモ","操作"]}
        rows={drivers.map((driver)=>[
          <span style={{ color:"#000080", fontWeight:"bold" }}>{driver?.id || "—"}</span>,
          driver?.name || "",
          driver?.license || "",
          driver?.license_expiry || "",
          driver?.phone || "",
          <StatusPill s={driver?.status}/>,
          <span style={{ fontSize:"10px", color:"#808080" }}>{driver?.notes || "—"}</span>,
          <div style={{ display:"flex", gap:"4px" }}>
            <RetroBtn small onClick={()=>openEdit(driver)}>編集</RetroBtn>
            <RetroBtn small color="#ffd0d0" onClick={()=>deleteDriver(driver?.id)}>削除</RetroBtn>
          </div>
        ])}
      />
      {showModal && (
        <Modal title={editingId ? "ドライバー編集" : "ドライバー追加"} icon="👤" onClose={()=>setShowModal(false)} width={460}>
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
            <Fl label="免許更新日"><RetroInput type="date" value={form.license_expiry} onChange={e=>setForm(f=>({...f,license_expiry:e.target.value}))}/></Fl>
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
            <RetroBtn onClick={saveDriver} color="#d0e0ff">　保存する　</RetroBtn>
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

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
      <div>
        <RetroBtn onClick={openAdd} color="#d0e0ff">🚗 車両追加</RetroBtn>
      </div>
      <RetroTable
        headers={["ID","ナンバー","車種","車検日","状態","メモ","操作"]}
        rows={vehicles.map((vehicle)=>[
          <span style={{ color:"#000080", fontWeight:"bold" }}>{vehicle?.id || "—"}</span>,
          vehicle?.plate || "",
          vehicle?.type || "",
          vehicle?.nextInspection || "",
          <StatusPill s={vehicle?.status}/>,
          <span style={{ fontSize:"10px", color:"#808080" }}>{vehicle?.notes || "—"}</span>,
          <div style={{ display:"flex", gap:"4px" }}>
            <RetroBtn small onClick={()=>openEdit(vehicle)}>編集</RetroBtn>
            <RetroBtn small color="#ffd0d0" onClick={()=>deleteVehicle(vehicle?.id)}>削除</RetroBtn>
          </div>
        ])}
      />
      {showModal && (
        <Modal title={editingId ? "車両編集" : "車両追加"} icon="🚗" onClose={()=>setShowModal(false)} width={460}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 12px" }}>
            <Fl label="ナンバー"><RetroInput value={form.plate} onChange={e=>setForm(f=>({...f,plate:e.target.value}))}/></Fl>
            <Fl label="車種"><RetroInput value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}/></Fl>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 12px" }}>
            <Fl label="車検日"><RetroInput type="date" value={form.nextInspection} onChange={e=>setForm(f=>({...f,nextInspection:e.target.value}))}/></Fl>
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
            <RetroBtn onClick={saveVehicle} color="#d0e0ff">　保存する　</RetroBtn>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ===== MAIN =====
const MENU = [
  { id:"dashboard", icon:"🏠", label:"ダッシュボード" },
  { id:"calendar",  icon:"📅", label:"カレンダー" },
  { id:"orders",    icon:"📋", label:"受注管理" },
  { id:"dispatch",  icon:"🚛", label:"配車管理" },
  { id:"drivers",   icon:"👤", label:"ドライバー管理" },
  { id:"vehicles",  icon:"🚗", label:"車両管理" },
  { id:"customers", icon:"👥", label:"顧客管理" },
  { id:"invoices",  icon:"💴", label:"請求管理" },
  { id:"bank",      icon:"🏦", label:"口座・入金" },
];

const TABLE_CONFIG = [
  { key: "customers", table: "customers" },
  { key: "orders", table: "orders" },
  { key: "drivers", table: "drivers" },
  { key: "vehicles", table: "vehicles" },
  { key: "invoices", table: "invoices" },
  { key: "bankTransactions", table: "bank_transactions" },
  { key: "events", table: "events" },
  { key: "payables", table: "payables" },
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
});

const fetchDataFromSupabase = async () => {
  const nextData = createEmptyData();

  const results = await Promise.all(
    TABLE_CONFIG.map(async ({ key, table }) => {
      const { data: rows, error } = await supabase
        .from(table)
        .select("id,payload")
        .order("id", { ascending: true });
      return { key, rows, error };
    })
  );

  for (const result of results) {
    if (result.error) {
      throw result.error;
    }
    nextData[result.key] = (result.rows || [])
      .map((row) => row.payload)
      .filter(Boolean);
  }

  return nextData;
};

const saveDataToSupabase = async (nextData, prevData) => {
  const jobs = TABLE_CONFIG.map(async ({ key, table }) => {
    const currentRows = Array.isArray(nextData[key]) ? nextData[key] : [];
    const previousRows = Array.isArray(prevData[key]) ? prevData[key] : [];

    if (currentRows.length > 0) {
      const upsertRows = currentRows
        .filter((row) => row && row.id)
        .map((row) => ({ id: row.id, payload: row }));
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
  const [dn, setDn] = useState(false);
  return (
    <div style={{ position:"relative" }}>
      <button onMouseDown={()=>setDn(true)} onMouseUp={()=>setDn(false)} onMouseLeave={()=>setDn(false)} onClick={onClick}
        style={{ background:active?"#c0c0c0":winBg, fontFamily:"'MS Gothic','Noto Sans JP',monospace", fontSize:"11px", fontWeight:"bold", color:"#000",
          cursor:"pointer", padding:"8px 4px", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:"4px",
          width:"110px", height:"64px", userSelect:"none", ...(dn?pressed:raised) }}>
        <span style={{ fontSize:"22px", lineHeight:1 }}>{icon}</span>
        <span style={{ fontSize:"11px", whiteSpace:"nowrap" }}>{label}</span>
      </button>
      {badge>0&&<div style={{ position:"absolute", top:"-3px", right:"-3px", background:"#cc0000", color:"#fff", fontSize:"9px", fontWeight:"bold", padding:"1px 5px", border:"1px solid #800000", zIndex:1 }}>{badge}</div>}
    </div>
  );
};

export function DeliveryManagementApp({ onLogout, authRole, authEmail }) {
  const [page, setPage] = useState("dashboard");
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
        const hasRemoteData = TABLE_CONFIG.some(({ key }) => (remoteData[key] || []).length > 0);

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

  return (
    <div style={{ minHeight:"100vh", background:"#008080", display:"flex", alignItems:"flex-start", justifyContent:"center", padding:"12px", fontFamily:"'MS Gothic','ＭＳ ゴシック','Noto Sans JP',monospace" }}>
      <div style={{ background:winBg, ...raised, width:"100%", maxWidth:"1100px", boxShadow:"4px 4px 0 #404040" }}>
        {/* Title bar */}
        <div style={{ background:"linear-gradient(to right,#000080,#1084d0)", padding:"3px 8px", display:"flex", alignItems:"center", gap:"8px" }}>
          <span style={{ fontSize:"16px" }}>🚚</span>
          <span style={{ color:"#fff", fontFamily:"monospace", fontSize:"13px", fontWeight:"bold", flex:1 }}>配送管理システム</span>
          <span style={{ color:"#cce0ff", fontSize:"10px", marginRight:"6px", maxWidth:"200px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={authEmail || ""}>
            {authRole === "admin" ? "管理者" : authRole === "driver" ? "ドライバー" : ""}{authEmail ? ` · ${authEmail}` : ""}
          </span>
          <span style={{ color:"#cce0ff", fontSize:"11px", marginRight:"10px" }}>
            {now.getFullYear()}年{now.getMonth()+1}月{now.getDate()}日　{now.getHours()}:{String(now.getMinutes()).padStart(2,"0")}
          </span>
          {typeof onLogout === "function" && (
            <RetroBtn small onClick={onLogout} color="#ffcfcf" style={{ marginRight:"6px" }}>ログアウト</RetroBtn>
          )}
          {["－","□","✕"].map((c,i)=><div key={i} style={{ ...raised, background:winBg, width:"16px", height:"14px", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"9px", cursor:"pointer" }}>{c}</div>)}
        </div>

        {/* Menubar */}
        <div style={{ borderBottom:"2px solid #808080", padding:"1px 4px", display:"flex", gap:"2px", background:winBg }}>
          {["ファイル(F)","編集(E)","表示(V)","ヘルプ(H)"].map(m=>(
            <div key={m} style={{ padding:"2px 8px", fontSize:"11px", cursor:"pointer", fontFamily:"monospace" }}
              onMouseEnter={e=>{e.currentTarget.style.background="#000080";e.currentTarget.style.color="#fff";}}
              onMouseLeave={e=>{e.currentTarget.style.background="";e.currentTarget.style.color="";}}>{m}</div>
          ))}
        </div>

        <div style={{ display:"flex", minHeight:"580px" }}>
          {/* Sidebar */}
          <div style={{ width:"122px", borderRight:"2px solid #808080", padding:"6px", display:"flex", flexDirection:"column", gap:"3px", background:"#c0c0c0", flexShrink:0 }}>
            {MENU.map(m=>(
              <MenuBtn key={m.id} icon={m.icon} label={m.label} onClick={()=>setPageWithHistory(m.id)} active={page===m.id} badge={badges[m.id]||0}/>
            ))}
          </div>

          {/* Content */}
          <div style={{ flex:1, padding:"10px", overflow:"auto" }}>
            <div style={{ ...inset3d, background:"#fff", padding:"2px 8px", marginBottom:"8px", display:"flex", alignItems:"center", gap:"6px" }}>
              <span style={{ fontSize:"11px", color:"#404040" }}>現在：</span>
              <span style={{ fontSize:"11px", fontWeight:"bold", color:"#000080" }}>{MENU.find(m=>m.id===page)?.icon} {MENU.find(m=>m.id===page)?.label}</span>
            </div>
            {!isLoaded ? (
              <div style={{ ...inset3d, background:"#fff", padding:"24px", textAlign:"center", fontFamily:"monospace", fontSize:"12px", color:"#808080" }}>
                データを読み込んでいます...
              </div>
            ) : (
              <PageComponent data={data} setData={setData} setPage={setPageWithHistory}/>
            )}
          </div>
        </div>

        {/* Statusbar */}
        <div style={{ borderTop:"2px solid #808080", padding:"2px 8px", display:"flex", gap:"8px", background:winBg }}>
          <div style={{ ...inset3d, padding:"1px 8px", flex:1, fontSize:"11px" }}>
            稼働案件：{(Array.isArray(data?.orders) ? data.orders : []).filter(o=>o?.status==="in_transit").length}件　未配車：{pendingCount}件　ドライバー待機：{(Array.isArray(data?.drivers) ? data.drivers : []).filter(d=>d?.status==="available").length}名
          </div>
          {unmatchedCount>0&&<div style={{ ...inset3d, padding:"1px 8px", fontSize:"11px", color:"#cc6600", fontWeight:"bold" }}>未照合入金：{unmatchedCount}件</div>}
          {overdueCount>0&&<div style={{ ...inset3d, padding:"1px 8px", fontSize:"11px", color:"#cc0000", fontWeight:"bold" }}>延滞：{overdueCount}件</div>}
          <div style={{ ...inset3d, padding:"1px 8px", fontSize:"11px" }}>Ver.2.0</div>
        </div>
      </div>
    </div>
  );
}
