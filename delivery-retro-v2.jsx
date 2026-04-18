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
    { id:"C001", name:"株式会社田中商事", contact:"田中 太郎", phone:"03-1234-5678", email:"tanaka@tanakashoji.co.jp" },
    { id:"C002", name:"山田運輸有限会社", contact:"山田 花子", phone:"06-2345-6789", email:"yamada@yamada-unyu.co.jp" },
    { id:"C003", name:"鈴木食品株式会社", contact:"鈴木 次郎", phone:"052-3456-7890", email:"suzuki@suzukifood.co.jp" },
  ],
  orders: [
    { id:"ORD-001", customerId:"C001", customerName:"株式会社田中商事", deliveryDate:fmt(8), from:"東京都江東区", to:"東京都港区", cargo:"電子部品", weight:"500kg", status:"delivered", amount:45000 },
    { id:"ORD-002", customerId:"C002", customerName:"山田運輸有限会社", deliveryDate:fmt(12), from:"大阪府堺市", to:"大阪府豊中市", cargo:"食料品", weight:"1200kg", status:"in_transit", amount:68000 },
    { id:"ORD-003", customerId:"C003", customerName:"鈴木食品株式会社", deliveryDate:fmt(18), from:"名古屋市港区", to:"愛知県一宮市", cargo:"冷凍食品", weight:"800kg", status:"scheduled", amount:52000 },
    { id:"ORD-004", customerId:"C001", customerName:"株式会社田中商事", deliveryDate:fmt(22), from:"東京都品川区", to:"神奈川県横浜市", cargo:"精密機械", weight:"350kg", status:"pending", amount:38000 },
  ],
  drivers: [
    { id:"D001", name:"佐藤 健", license:"大型", status:"available" },
    { id:"D002", name:"伊藤 誠", license:"中型", status:"on_duty" },
    { id:"D003", name:"渡辺 勇", license:"大型", status:"available" },
  ],
  vehicles: [
    { id:"V001", plate:"品川300あ1234", type:"4tトラック", status:"available", nextInspection: fmt(20) },
    { id:"V002", plate:"なにわ400い5678", type:"10tトラック", status:"in_use", nextInspection: fmt(45) },
    { id:"V003", plate:"名古屋200う9012", type:"2tトラック", status:"available", nextInspection: fmt(35) },
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
    { id:"EV-001", date:fmt(8), type:"delivery", title:"ORD-001 配達完了", orderId:"ORD-001", color:"#006600" },
    { id:"EV-002", date:fmt(10), type:"payment_due", title:"INV-002 支払期日", invoiceId:"INV-002", color:"#cc0000" },
    { id:"EV-003", date:fmt(12), type:"delivery", title:"ORD-002 配達予定", orderId:"ORD-002", color:"#0000cc" },
    { id:"EV-004", date:fmt(15), type:"task", title:"車検：品川300あ1234", color:"#cc6600" },
    { id:"EV-005", date:fmt(18), type:"delivery", title:"ORD-003 配達予定", orderId:"ORD-003", color:"#0000cc" },
    { id:"EV-006", date:fmt(20), type:"payment_due", title:"INV-001 入金期日", invoiceId:"INV-001", color:"#660099" },
    { id:"EV-007", date:fmt(22), type:"delivery", title:"ORD-004 配達予定", orderId:"ORD-004", color:"#0000cc" },
    { id:"EV-008", date:fmt(25), type:"payment_due", title:"INV-003 入金期日", invoiceId:"INV-003", color:"#660099" },
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
      <TitleBar title={title} icon={icon} />
      <div style={{ padding:"14px" }}>{children}</div>
    </div>
  </div>
);

// ===== CALENDAR =====
const EVENT_TYPE_COLOR = {
  delivery:"#0000cc", payment_due:"#cc0000", payment_receive:"#006600",
  task:"#cc6600", bank_in:"#006600", bank_out:"#cc0000"
};
const EVENT_TYPE_LABEL = {
  delivery:"配送", payment_due:"支払期日", payment_receive:"入金予定",
  task:"タスク", bank_in:"入金", bank_out:"支出"
};

const CalendarPage = ({ data, setData }) => {
  const [calYear, setCalYear] = useState(y);
  const [calMonth, setCalMonth] = useState(mo);
  const [selectedDate, setSelectedDate] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addDate, setAddDate] = useState("");
  const [newEvent, setNewEvent] = useState({ title:"", type:"task", note:"" });

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;

  const getDayStr = (d) => `${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;

  const getEventsForDay = (d) => {
    const ds = getDayStr(d);
    const evs = data.events.filter(e=>e.date===ds);
    // also show bank transactions
    const banks = data.bankTransactions.filter(t=>t.date===ds);
    return { evs, banks };
  };

  const selectedEvents = selectedDate ? data.events.filter(e=>e.date===selectedDate) : [];
  const selectedBanks = selectedDate ? data.bankTransactions.filter(t=>t.date===selectedDate) : [];
  const selectedPayables = selectedDate ? data.payables.filter(p=>p.dueDate===selectedDate) : [];
  const selectedInvoices = selectedDate ? data.invoices.filter(i=>i.dueDate===selectedDate) : [];

  const addEvent = () => {
    if (!newEvent.title||!addDate) return;
    const ev = {
      id:`EV-${String(data.events.length+1).padStart(3,"0")}`,
      date:addDate, type:newEvent.type, title:newEvent.title,
      color:EVENT_TYPE_COLOR[newEvent.type]||"#808080", note:newEvent.note
    };
    setData(d=>({...d, events:[...d.events, ev]}));
    setShowAddModal(false);
    setNewEvent({ title:"", type:"task", note:"" });
  };

  const prevMonth = () => { if(calMonth===0){setCalYear(y=>y-1);setCalMonth(11);}else setCalMonth(m=>m-1); };
  const nextMonth = () => { if(calMonth===11){setCalYear(y=>y+1);setCalMonth(0);}else setCalMonth(m=>m+1); };

  // Overdue invoices
  const overdueInvoices = data.invoices.filter(i=>i.status==="overdue"||(i.status==="unpaid"&&i.dueDate<todayStr));

  return (
    <div style={{ display:"flex", gap:"10px" }}>
      {/* Left: Calendar */}
      <div style={{ flex:"0 0 auto", width:"420px" }}>
        <Panel title={`${calYear}年${calMonth+1}月`} icon="📅" style={{ marginBottom:"8px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"6px", marginBottom:"8px" }}>
            <RetroBtn onClick={prevMonth}>◀</RetroBtn>
            <span style={{ fontFamily:"monospace", fontSize:"13px", fontWeight:"bold", flex:1, textAlign:"center" }}>{calYear}年 {calMonth+1}月</span>
            <RetroBtn onClick={nextMonth}>▶</RetroBtn>
            <RetroBtn onClick={()=>{setAddDate(todayStr);setShowAddModal(true);}} color="#d0e0ff">＋予定</RetroBtn>
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
              const {evs, banks} = getEventsForDay(d);
              const isToday = ds===todayStr;
              const isSelected = ds===selectedDate;
              const dow = (firstDay+i)%7;
              const hasPending = data.invoices.some(inv=>inv.dueDate===ds&&(inv.status==="unpaid"||inv.status==="overdue"));
              const hasBankUnmatched = banks.some(b=>b.status==="unmatched");
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
                    {hasPending&&<span style={{ color:"#cc0000", fontSize:"9px" }}>●</span>}
                    {hasBankUnmatched&&<span style={{ color:"#cc6600", fontSize:"9px" }}>★</span>}
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:"1px" }}>
                    {evs.slice(0,2).map(ev=>(
                      <div key={ev.id} style={{ background:ev.color, color:"#fff", fontSize:"9px", fontFamily:"monospace", padding:"1px 3px", overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis" }}>
                        {ev.title}
                      </div>
                    ))}
                    {evs.length>2&&<div style={{ fontSize:"9px", fontFamily:"monospace", color:"#808080" }}>+{evs.length-2}件</div>}
                    {banks.map(b=>(
                      <div key={b.id} style={{ background:b.status==="matched"?"#006600":"#cc6600", color:"#fff", fontSize:"9px", fontFamily:"monospace", padding:"1px 3px", overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis" }}>
                        💰¥{b.amount.toLocaleString()}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{ display:"flex", gap:"8px", marginTop:"6px", flexWrap:"wrap" }}>
            {Object.entries(EVENT_TYPE_LABEL).slice(0,5).map(([k,v])=>(
              <div key={k} style={{ display:"flex", alignItems:"center", gap:"3px" }}>
                <div style={{ width:"8px", height:"8px", background:EVENT_TYPE_COLOR[k] }}/>
                <span style={{ fontFamily:"monospace", fontSize:"9px" }}>{v}</span>
              </div>
            ))}
          </div>
        </Panel>

        {/* Overdue alert */}
        {overdueInvoices.length>0&&(
          <Panel style={{ border:"2px solid #cc0000", background:"#fff0f0" }}>
            <div style={{ fontFamily:"monospace", fontSize:"11px", fontWeight:"bold", color:"#cc0000", marginBottom:"6px" }}>
              ⚠ 延滞・期日超過 {overdueInvoices.length}件
            </div>
            {overdueInvoices.map(inv=>(
              <div key={inv.id} style={{ borderBottom:"1px solid #ffcccc", padding:"4px 0", fontFamily:"monospace", fontSize:"11px" }}>
                <div style={{ color:"#cc0000", fontWeight:"bold" }}>{inv.customerName}</div>
                <div>期日: {inv.dueDate}　¥{inv.total.toLocaleString()}</div>
                <div style={{ color:"#808080" }}>{inv.note}</div>
              </div>
            ))}
          </Panel>
        )}
      </div>

      {/* Right: Day detail */}
      <div style={{ flex:1 }}>
        {selectedDate ? (
          <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ fontFamily:"monospace", fontSize:"14px", fontWeight:"bold" }}>
                📅 {selectedDate} の予定・記録
              </div>
              <RetroBtn onClick={()=>{setAddDate(selectedDate);setShowAddModal(true);}} color="#d0e0ff">＋この日に予定追加</RetroBtn>
            </div>

            {/* Events */}
            {selectedEvents.length>0&&(
              <Panel title="スケジュール・タスク" icon="📋">
                {selectedEvents.map(ev=>(
                  <div key={ev.id} style={{ display:"flex", alignItems:"center", gap:"8px", padding:"5px 0", borderBottom:"1px solid #ddd" }}>
                    <div style={{ width:"10px", height:"10px", background:ev.color, flexShrink:0 }}/>
                    <div style={{ flex:1, fontFamily:"monospace", fontSize:"12px" }}>
                      <span style={{ background:ev.color, color:"#fff", padding:"1px 6px", fontSize:"10px", marginRight:"6px" }}>{EVENT_TYPE_LABEL[ev.type]||ev.type}</span>
                      {ev.title}
                    </div>
                    <RetroBtn small onClick={()=>setData(d=>({...d,events:d.events.filter(e=>e.id!==ev.id)}))}>削除</RetroBtn>
                  </div>
                ))}
              </Panel>
            )}

            {/* Bank transactions for selected day */}
            {selectedBanks.length>0&&(
              <Panel title="口座入出金（銀行連携）" icon="🏦">
                {selectedBanks.map(b=>(
                  <div key={b.id} style={{ ...inset3d, background:b.status==="matched"?"#f0fff0":"#fff8e1", padding:"8px 10px", marginBottom:"6px" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div>
                        <span style={{ fontFamily:"monospace", fontSize:"12px", fontWeight:"bold", color:"#006600" }}>
                          ¥{b.amount.toLocaleString()} 入金
                        </span>
                        <span style={{ fontFamily:"monospace", fontSize:"11px", color:"#404040", marginLeft:"8px" }}>{b.description}</span>
                      </div>
                      <StatusPill s={b.status}/>
                    </div>
                    {b.status==="unmatched"&&(
                      <div style={{ marginTop:"6px", display:"flex", gap:"6px", alignItems:"center" }}>
                        <span style={{ fontFamily:"monospace", fontSize:"11px", color:"#cc6600" }}>▶ 請求書と照合：</span>
                        <RetroSelect style={{ width:"200px" }} onChange={e=>{
                          if(!e.target.value) return;
                          setData(d=>({
                            ...d,
                            bankTransactions:d.bankTransactions.map(bt=>bt.id===b.id?{...bt,matchedInvoice:e.target.value,status:"matched"}:bt),
                            invoices:d.invoices.map(inv=>inv.id===e.target.value?{...inv,status:"paid",paidDate:b.date}:inv),
                            events:[...d.events,{id:`EV-B${Date.now()}`,date:b.date,type:"bank_in",title:`入金確認：${d.invoices.find(i=>i.id===e.target.value)?.customerName||""} ¥${b.amount.toLocaleString()}`,color:"#006600"}]
                          }));
                        }}>
                          <option value="">請求書を選択して照合...</option>
                          {data.invoices.filter(i=>i.status!=="paid").map(i=>(
                            <option key={i.id} value={i.id}>{i.id} - {i.customerName} ¥{i.total.toLocaleString()}</option>
                          ))}
                        </RetroSelect>
                      </div>
                    )}
                    {b.status==="matched"&&b.matchedInvoice&&(
                      <div style={{ marginTop:"4px", fontFamily:"monospace", fontSize:"11px", color:"#006600" }}>
                        ✓ {data.invoices.find(i=>i.id===b.matchedInvoice)?.customerName}　{b.matchedInvoice} と照合済み
                      </div>
                    )}
                  </div>
                ))}
              </Panel>
            )}

            {/* Invoices due on this day */}
            {selectedInvoices.length>0&&(
              <Panel title="入金期日（請求書）" icon="💴">
                {selectedInvoices.map(inv=>(
                  <div key={inv.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid #ddd" }}>
                    <div style={{ fontFamily:"monospace", fontSize:"12px" }}>
                      <div style={{ fontWeight:"bold" }}>{inv.customerName}</div>
                      <div style={{ color:"#404040" }}>{inv.id}　¥{inv.total.toLocaleString()}</div>
                    </div>
                    <StatusPill s={inv.status}/>
                  </div>
                ))}
              </Panel>
            )}

            {/* Payables due on this day */}
            {selectedPayables.length>0&&(
              <Panel title="支払期日（支払予定）" icon="💸">
                {selectedPayables.map(p=>(
                  <div key={p.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid #ddd" }}>
                    <div style={{ fontFamily:"monospace", fontSize:"12px" }}>
                      <div style={{ fontWeight:"bold" }}>{p.vendor}</div>
                      <div style={{ color:"#404040" }}>{p.category}　¥{p.amount.toLocaleString()}</div>
                    </div>
                    <div style={{ display:"flex", gap:"6px", alignItems:"center" }}>
                      <StatusPill s={p.status}/>
                      {p.status==="unpaid"&&(
                        <RetroBtn small color="#d0ffd0" onClick={()=>setData(d=>({...d,payables:d.payables.map(x=>x.id===p.id?{...x,status:"paid"}:x)}))}>支払済</RetroBtn>
                      )}
                    </div>
                  </div>
                ))}
              </Panel>
            )}

            {selectedEvents.length===0&&selectedBanks.length===0&&selectedInvoices.length===0&&selectedPayables.length===0&&(
              <div style={{ ...inset3d, background:"#fff", padding:"24px", textAlign:"center", fontFamily:"monospace", fontSize:"12px", color:"#808080" }}>
                この日の予定・記録はありません<br/>
                <RetroBtn onClick={()=>{setAddDate(selectedDate);setShowAddModal(true);}} color="#d0e0ff" style={{ marginTop:"10px" }}>＋予定を追加する</RetroBtn>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
            <Panel title="今月の入金予定（まとめ）" icon="💴">
              <RetroTable
                headers={["請求書","顧客","入金期日","金額","状態"]}
                rows={data.invoices.map(inv=>[
                  <span style={{ color:"#000080", fontWeight:"bold" }}>{inv.id}</span>,
                  inv.customerName, inv.dueDate,
                  <span style={{ fontWeight:"bold" }}>¥{inv.total.toLocaleString()}</span>,
                  <StatusPill s={inv.status}/>,
                ])}
              />
            </Panel>
            <Panel title="今月の支払予定" icon="💸">
              <RetroTable
                headers={["支払先","区分","支払期日","金額","状態"]}
                rows={data.payables.map(p=>[
                  p.vendor, p.category, p.dueDate,
                  "¥"+p.amount.toLocaleString(),
                  <StatusPill s={p.status}/>,
                ])}
              />
            </Panel>
            <div style={{ fontFamily:"monospace", fontSize:"11px", color:"#808080", textAlign:"center" }}>
              カレンダーの日付をクリックすると詳細が表示されます
            </div>
          </div>
        )}
      </div>

      {/* Add event modal */}
      {showAddModal&&(
        <Modal title="予定・タスク追加" icon="📅" onClose={()=>setShowAddModal(false)} width={400}>
          <Fl label="日付"><RetroInput type="date" value={addDate} onChange={e=>setAddDate(e.target.value)}/></Fl>
          <Fl label="種別">
            <RetroSelect value={newEvent.type} onChange={e=>setNewEvent(v=>({...v,type:e.target.value}))}>
              <option value="task">タスク</option>
              <option value="delivery">配送</option>
              <option value="payment_due">支払期日</option>
              <option value="payment_receive">入金予定</option>
            </RetroSelect>
          </Fl>
          <Fl label="タイトル"><RetroInput value={newEvent.title} onChange={e=>setNewEvent(v=>({...v,title:e.target.value}))} placeholder="例：車両点検、督促連絡"/></Fl>
          <Fl label="メモ"><RetroTextarea value={newEvent.note} onChange={e=>setNewEvent(v=>({...v,note:e.target.value}))}/></Fl>
          <div style={{ display:"flex", justifyContent:"flex-end", gap:"6px", marginTop:"10px" }}>
            <RetroBtn onClick={()=>setShowAddModal(false)}>キャンセル</RetroBtn>
            <RetroBtn onClick={addEvent} color="#d0e0ff">　追加する　</RetroBtn>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ===== BANK PAGE =====
const BankPage = ({ data, setData }) => {
  const [addTx, setAddTx] = useState(false);
  const [form, setForm] = useState({ date:todayStr, amount:"", description:"", direction:"in" });

  const todayStr2 = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
  const unmatchedBanks = data.bankTransactions.filter(b=>b.status==="unmatched");
  const totalUnmatched = unmatchedBanks.reduce((s,b)=>s+b.amount,0);
  const overdueTotal = data.invoices.filter(i=>i.status==="overdue"||(i.status==="unpaid"&&i.dueDate<todayStr2)).reduce((s,i)=>s+i.total,0);

  const addTxn = () => {
    const tx = { id:`BNK-${String(data.bankTransactions.length+1).padStart(3,"0")}`, date:form.date, amount:parseInt(form.amount)||0, description:form.description, matchedInvoice:null, status:"unmatched" };
    setData(d=>({...d, bankTransactions:[tx,...d.bankTransactions]}));
    setAddTx(false); setForm({ date:todayStr2, amount:"", description:"", direction:"in" });
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
      {/* Stats */}
      <div style={{ display:"flex", gap:"8px" }}>
        {[
          ["未照合入金", "¥"+totalUnmatched.toLocaleString(), "#cc6600"],
          ["未払い請求", "¥"+data.invoices.filter(i=>i.status!=="paid").reduce((s,i)=>s+i.total,0).toLocaleString(), "#0000cc"],
          ["延滞金額", "¥"+overdueTotal.toLocaleString(), "#cc0000"],
          ["入金済", "¥"+data.invoices.filter(i=>i.status==="paid").reduce((s,i)=>s+i.total,0).toLocaleString(), "#006600"],
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
                  const inv = data.invoices.find(i=>i.id===e.target.value);
                  setData(d=>({
                    ...d,
                    bankTransactions:d.bankTransactions.map(bt=>bt.id===b.id?{...bt,matchedInvoice:e.target.value,status:"matched"}:bt),
                    invoices:d.invoices.map(i=>i.id===e.target.value?{...i,status:"paid",paidDate:b.date}:i),
                    events:[...d.events,{id:`EV-B${Date.now()}`,date:b.date,type:"bank_in",title:`入金確認：${inv?.customerName||""} ¥${b.amount.toLocaleString()}`,color:"#006600"}]
                  }));
                }}>
                  <option value="">請求書を選択...</option>
                  {data.invoices.filter(i=>i.status!=="paid").map(i=>(
                    <option key={i.id} value={i.id}>{i.id} {i.customerName} ¥{i.total.toLocaleString()}</option>
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
          rows={data.bankTransactions.map(b=>[
            b.date,
            <span style={{ fontFamily:"monospace", fontSize:"11px" }}>{b.description}</span>,
            <span style={{ color:"#006600", fontWeight:"bold" }}>¥{b.amount.toLocaleString()}</span>,
            <StatusPill s={b.status}/>,
            b.matchedInvoice ? (
              <span style={{ color:"#006600", fontFamily:"monospace", fontSize:"11px" }}>
                {b.matchedInvoice} / {data.invoices.find(i=>i.id===b.matchedInvoice)?.customerName||""}
              </span>
            ) : "—",
          ])}
        />
      </Panel>

      {/* Invoices with status */}
      <Panel title="入金管理（請求書別）" icon="💴">
        <RetroTable
          headers={["請求書","顧客","発行日","期日","金額","状態","メモ"]}
          rows={data.invoices.map(inv=>[
            <span style={{ color:"#000080", fontWeight:"bold" }}>{inv.id}</span>,
            inv.customerName, inv.issueDate, inv.dueDate,
            <span style={{ fontWeight:"bold" }}>¥{inv.total.toLocaleString()}</span>,
            <StatusPill s={inv.status}/>,
            <span style={{ fontSize:"10px", color:"#808080" }}>{inv.note||"—"}</span>,
          ])}
        />
      </Panel>

      {/* Payables */}
      <Panel title="支払管理（支払予定一覧）" icon="💸">
        <RetroTable
          headers={["支払先","区分","期日","金額","状態","操作"]}
          rows={data.payables.map(p=>[
            p.vendor, p.category, p.dueDate,
            "¥"+p.amount.toLocaleString(),
            <StatusPill s={p.status}/>,
            p.status==="unpaid"
              ? <RetroBtn small color="#d0ffd0" onClick={()=>setData(d=>({...d,payables:d.payables.map(x=>x.id===p.id?{...x,status:"paid"}:x)}))}>✓ 支払済</RetroBtn>
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
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
  const todayEvents = data.events.filter(e=>e.date===todayStr);
  const todayBanks = data.bankTransactions.filter(b=>b.date===todayStr);
  const unmatchedCount = data.bankTransactions.filter(b=>b.status==="unmatched").length;
  const overdueCount = data.invoices.filter(i=>i.status==="overdue"||(i.status==="unpaid"&&i.dueDate<todayStr)).length;
  const activeOrders = data.orders.filter(o=>["pending","scheduled","in_transit"].includes(o.status)).length;
  const availableDrivers = data.drivers.filter(d=>d.status==="available").length;
  const totalRevenue = data.invoices.filter(i=>i.status==="paid").reduce((s,i)=>s+i.total,0);
  const unpaidTotal = data.invoices.filter(i=>i.status!=="paid").reduce((s,i)=>s+i.total,0);

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
              rows={[...data.orders].reverse().slice(0,5).map(o=>[
                <span style={{ color:"#000080", fontWeight:"bold" }}>{o.id}</span>,
                o.customerName, o.deliveryDate, <StatusPill s={o.status}/>
              ])}
            />
          </Panel>
        </div>
      </div>

      <div style={{ display:"flex", gap:"10px" }}>
        <Panel title="ドライバー状況" icon="👤" style={{ flex:1 }}>
          <RetroTable
            headers={["氏名","免許","状態"]}
            rows={data.drivers.map(d=>[d.name, d.license, <StatusPill s={d.status}/>])}
          />
        </Panel>
        <Panel title="口座照合が必要な入金" icon="🏦" style={{ flex:1 }}>
          <RetroTable
            headers={["日付","金額","摘要","状態"]}
            rows={data.bankTransactions.filter(b=>b.status==="unmatched").map(b=>[
              b.date,
              <span style={{ color:"#006600", fontWeight:"bold" }}>¥{b.amount.toLocaleString()}</span>,
              <span style={{ fontSize:"10px" }}>{b.description}</span>,
              <StatusPill s={b.status}/>
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
  const [form, setForm] = useState({ customerId:"", deliveryDate:"", from:"", to:"", cargo:"", weight:"", amount:"", notes:"" });
  const [search, setSearch] = useState("");
  const filtered = data.orders.filter(o=>o.customerName.includes(search)||o.id.includes(search)||o.cargo.includes(search));
  const handleAdd = () => {
    const c = data.customers.find(x=>x.id===form.customerId);
    const o = { id:`ORD-${String(data.orders.length+1).padStart(3,"0")}`, customerId:form.customerId, customerName:c?.name||"", date:fmt(today.getDate()), deliveryDate:form.deliveryDate, from:form.from, to:form.to, cargo:form.cargo, weight:form.weight, status:"pending", driverId:null, vehicleId:null, amount:parseInt(form.amount)||0, notes:form.notes };
    setData(d=>({ ...d, orders:[o,...d.orders], events:[...d.events,{id:`EV-O${Date.now()}`,date:form.deliveryDate,type:"delivery",title:`${o.id} 配達予定 ${c?.name||""}`,color:"#0000cc"}] }));
    setShowModal(false); setForm({ customerId:"", deliveryDate:"", from:"", to:"", cargo:"", weight:"", amount:"", notes:"" });
  };
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
      <div style={{ display:"flex", gap:"6px", alignItems:"center" }}>
        <RetroBtn onClick={()=>setShowModal(true)} color="#d0e0ff">📋 新規受注</RetroBtn>
        <span style={{ fontFamily:"monospace", fontSize:"11px" }}>検索：</span>
        <RetroInput value={search} onChange={e=>setSearch(e.target.value)} style={{ width:"200px" }}/>
      </div>
      <RetroTable
        headers={["ID","顧客","荷物","配達日","金額","状態","操作"]}
        rows={filtered.map(o=>[
          <span style={{ color:"#000080", fontWeight:"bold" }}>{o.id}</span>,
          o.customerName, o.cargo+"("+o.weight+")", o.deliveryDate,
          "¥"+o.amount.toLocaleString(), <StatusPill s={o.status}/>,
          o.status!=="delivered"&&<RetroBtn small onClick={()=>{ const next={pending:"scheduled",scheduled:"in_transit",in_transit:"delivered"}; if(next[o.status]) setData(d=>({...d,orders:d.orders.map(x=>x.id===o.id?{...x,status:next[o.status]}:x)})); }}>次へ→</RetroBtn>
        ])}
      />
      {showModal&&<Modal title="新規受注登録" icon="📋" onClose={()=>setShowModal(false)}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 12px" }}>
          <Fl label="顧客"><RetroSelect value={form.customerId} onChange={e=>setForm(f=>({...f,customerId:e.target.value}))}><option value="">選択</option>{data.customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</RetroSelect></Fl>
          <Fl label="配達日"><RetroInput type="date" value={form.deliveryDate} onChange={e=>setForm(f=>({...f,deliveryDate:e.target.value}))}/></Fl>
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
    </div>
  );
};

const DispatchPage = ({ data, setData }) => {
  const [sel, setSel] = useState(null);
  const [aD, setAD] = useState(""); const [aV, setAV] = useState("");
  const pending = data.orders.filter(o=>o.status==="pending");
  const scheduled = data.orders.filter(o=>o.status==="scheduled");
  const doAssign = () => {
    if(!sel||!aD||!aV) return;
    setData(d=>({...d,orders:d.orders.map(o=>o.id===sel?{...o,driverId:aD,vehicleId:aV,status:"scheduled"}:o)}));
    setSel(null); setAD(""); setAV("");
  };
  return (
    <div style={{ display:"flex", gap:"10px" }}>
      <div style={{ flex:1 }}>
        <Panel title={`未配車（${pending.length}件）`} icon="⚠">
          {pending.map(o=>(
            <div key={o.id} onClick={()=>setSel(o.id===sel?null:o.id)} style={{ ...inset3d, background:sel===o.id?"#cce0ff":"#fff", padding:"7px 10px", marginBottom:"5px", cursor:"pointer" }}>
              <div style={{ fontFamily:"monospace", fontSize:"11px", fontWeight:"bold", color:"#000080" }}>{o.id} — {o.customerName}</div>
              <div style={{ fontFamily:"monospace", fontSize:"11px", color:"#404040" }}>{o.cargo}（{o.weight}）配達日：{o.deliveryDate}</div>
            </div>
          ))}
        </Panel>
        {sel&&<Panel title="配車アサイン" icon="🚛" style={{ marginTop:"8px", border:"2px solid #000080" }}>
          <Fl label="ドライバー"><RetroSelect value={aD} onChange={e=>setAD(e.target.value)}><option value="">選択</option>{data.drivers.filter(d=>d.status==="available").map(d=><option key={d.id} value={d.id}>{d.name}（{d.license}）</option>)}</RetroSelect></Fl>
          <Fl label="車両"><RetroSelect value={aV} onChange={e=>setAV(e.target.value)}><option value="">選択</option>{data.vehicles.filter(v=>v.status==="available").map(v=><option key={v.id} value={v.id}>{v.plate}</option>)}</RetroSelect></Fl>
          <RetroBtn onClick={doAssign} color="#d0ffd0">🚛 配車確定</RetroBtn>
        </Panel>}
      </div>
      <div style={{ flex:1 }}>
        <Panel title={`配車済（${scheduled.length}件）`} icon="✓">
          {scheduled.map(o=>{
            const dr=data.drivers.find(d=>d.id===o.driverId); const vh=data.vehicles.find(v=>v.id===o.vehicleId);
            return <div key={o.id} style={{ ...inset3d, background:"#f0fff0", padding:"7px 10px", marginBottom:"5px" }}>
              <div style={{ fontFamily:"monospace", fontSize:"11px", fontWeight:"bold", color:"#000080" }}>{o.id} — {o.customerName}</div>
              <div style={{ display:"flex", gap:"6px", marginTop:"3px" }}>
                {dr&&<span style={{ background:"#000080", color:"#fff", fontFamily:"monospace", fontSize:"10px", padding:"1px 6px" }}>👤{dr.name}</span>}
                {vh&&<span style={{ background:"#006600", color:"#fff", fontFamily:"monospace", fontSize:"10px", padding:"1px 6px" }}>🚛{vh.plate}</span>}
              </div>
            </div>;
          })}
        </Panel>
      </div>
    </div>
  );
};

const CustomersPage = ({ data, setData }) => {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name:"", contact:"", phone:"", email:"" });
  const add = () => { setData(d=>({...d,customers:[...d.customers,{id:`C${String(d.customers.length+1).padStart(3,"0")}`, ...form}]})); setShowModal(false); setForm({name:"",contact:"",phone:"",email:""}); };
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
      <div><RetroBtn onClick={()=>setShowModal(true)} color="#d0e0ff">👥 顧客追加</RetroBtn></div>
      <RetroTable headers={["ID","会社名","担当者","電話","案件数","累計売上"]}
        rows={data.customers.map(c=>{ const ords=data.orders.filter(o=>o.customerId===c.id); return [<span style={{color:"#000080",fontWeight:"bold"}}>{c.id}</span>, c.name, c.contact, c.phone, ords.length+"件", "¥"+ords.reduce((s,o)=>s+o.amount,0).toLocaleString()]; })} />
      {showModal&&<Modal title="顧客追加" icon="👥" onClose={()=>setShowModal(false)}>
        <Fl label="会社名"><RetroInput value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></Fl>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 12px"}}>
          <Fl label="担当者"><RetroInput value={form.contact} onChange={e=>setForm(f=>({...f,contact:e.target.value}))}/></Fl>
          <Fl label="電話"><RetroInput value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/></Fl>
        </div>
        <Fl label="メール"><RetroInput value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></Fl>
        <div style={{display:"flex",justifyContent:"flex-end",gap:"6px",marginTop:"8px"}}>
          <RetroBtn onClick={()=>setShowModal(false)}>キャンセル</RetroBtn>
          <RetroBtn onClick={add} color="#d0e0ff">　登録する　</RetroBtn>
        </div>
      </Modal>}
    </div>
  );
};

const InvoicesPage = ({ data, setData }) => {
  const deliveredNoInv = data.orders.filter(o=>o.status==="delivered"&&!data.invoices.find(i=>i.orderId===o.id));
  const createInv = (o) => {
    const tax=Math.round(o.amount*0.1);
    const dueDate=`${y}-${String(mo+1).padStart(2,"0")}-${String(Math.min(today.getDate()+30,28)).padStart(2,"0")}`;
    const inv={ id:`INV-${String(data.invoices.length+1).padStart(3,"0")}`, orderId:o.id, customerId:o.customerId, customerName:o.customerName, issueDate:fmt(today.getDate()), dueDate, amount:o.amount, tax, total:o.amount+tax, status:"unpaid", bankRef:"", paidDate:null, note:"" };
    setData(d=>({...d, invoices:[inv,...d.invoices], events:[...d.events,{id:`EV-INV${Date.now()}`,date:dueDate,type:"payment_due",title:`${inv.id} 入金期日：${o.customerName}`,color:"#660099"}] }));
  };
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
      <div style={{ display:"flex", gap:"8px" }}>
        {[["請求総額","¥"+data.invoices.reduce((s,i)=>s+i.total,0).toLocaleString(),"#660099"],["入金済","¥"+data.invoices.filter(i=>i.status==="paid").reduce((s,i)=>s+i.total,0).toLocaleString(),"#006600"],["未回収","¥"+data.invoices.filter(i=>i.status!=="paid").reduce((s,i)=>s+i.total,0).toLocaleString(),"#cc0000"]].map(([l,v,c])=>(
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
              <span style={{ fontFamily:"monospace", fontSize:"11px" }}>{o.id} — {o.customerName}（¥{o.amount.toLocaleString()}）</span>
              <RetroBtn small color="#ffe0a0" onClick={()=>createInv(o)}>📄 発行</RetroBtn>
            </div>
          ))}
        </Panel>
      )}
      <RetroTable
        headers={["請求書","顧客","期日","合計","状態","備考"]}
        rows={data.invoices.map(inv=>[
          <span style={{color:"#000080",fontWeight:"bold"}}>{inv.id}</span>,
          inv.customerName, inv.dueDate,
          <span style={{fontWeight:"bold"}}>¥{inv.total.toLocaleString()}</span>,
          <StatusPill s={inv.status}/>,
          <span style={{fontSize:"10px",color:"#808080"}}>{inv.note||"—"}</span>
        ])}
      />
    </div>
  );
};

// ===== MAIN =====
const MENU = [
  { id:"dashboard", icon:"🏠", label:"ダッシュボード" },
  { id:"calendar",  icon:"📅", label:"カレンダー" },
  { id:"orders",    icon:"📋", label:"受注処理" },
  { id:"dispatch",  icon:"🚛", label:"配車管理" },
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

  const pendingCount = data.orders.filter(o=>o.status==="pending").length;
  const unmatchedCount = data.bankTransactions.filter(b=>b.status==="unmatched").length;
  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  const overdueCount = data.invoices.filter(i=>i.status==="overdue"||(i.status==="unpaid"&&i.dueDate<todayStr)).length;

  const badges = { dispatch:pendingCount, bank:unmatchedCount+overdueCount };

  const pages = { dashboard:DashboardPage, calendar:CalendarPage, orders:OrdersPage, dispatch:DispatchPage, customers:CustomersPage, invoices:InvoicesPage, bank:BankPage };
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
              <MenuBtn key={m.id} icon={m.icon} label={m.label} onClick={()=>setPage(m.id)} active={page===m.id} badge={badges[m.id]||0}/>
            ))}
          </div>

          {/* Content */}
          <div style={{ flex:1, padding:"10px", overflow:"auto" }}>
            <div style={{ ...inset3d, background:"#fff", padding:"2px 8px", marginBottom:"8px", display:"flex", alignItems:"center", gap:"6px" }}>
              <span style={{ fontSize:"11px", color:"#404040" }}>現在：</span>
              <span style={{ fontSize:"11px", fontWeight:"bold", color:"#000080" }}>{MENU.find(m=>m.id===page)?.icon} {MENU.find(m=>m.id===page)?.label}</span>
            </div>
            <PageComponent data={data} setData={setData} setPage={setPage}/>
          </div>
        </div>

        {/* Statusbar */}
        <div style={{ borderTop:"2px solid #808080", padding:"2px 8px", display:"flex", gap:"8px", background:winBg }}>
          <div style={{ ...inset3d, padding:"1px 8px", flex:1, fontSize:"11px" }}>
            稼働案件：{data.orders.filter(o=>o.status==="in_transit").length}件　未配車：{pendingCount}件　ドライバー待機：{data.drivers.filter(d=>d.status==="available").length}名
          </div>
          {unmatchedCount>0&&<div style={{ ...inset3d, padding:"1px 8px", fontSize:"11px", color:"#cc6600", fontWeight:"bold" }}>未照合入金：{unmatchedCount}件</div>}
          {overdueCount>0&&<div style={{ ...inset3d, padding:"1px 8px", fontSize:"11px", color:"#cc0000", fontWeight:"bold" }}>延滞：{overdueCount}件</div>}
          <div style={{ ...inset3d, padding:"1px 8px", fontSize:"11px" }}>Ver.2.0</div>
        </div>
      </div>
    </div>
  );
}
