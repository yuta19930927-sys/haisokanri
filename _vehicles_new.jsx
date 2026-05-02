const VehiclesPage = ({ data, setData }) => {
  const vehicles = Array.isArray(data?.vehicles) ? data.vehicles : [];
  const drivers = Array.isArray(data?.drivers) ? data.drivers : [];
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);
  const [activeTab, setActiveTab] = useState("basic");
  const [form, setForm] = useState({
    plate:"", type:"", maker:"", year:"", maxLoad:"", vehicleWeight:"", grossWeight:"",
    nextInspection:"", inspectionHistory:[],
    accidentHistory:[], violationHistory:[], adminPenaltyHistory:[],
    insuranceExpiry:"", liabilityExpiry:"", vehicleInsurance:"", roadServicePhone:"",
    assignedDriverId:"",
    status:"available", notes:"",
  });
  const [newInspection, setNewInspection] = useState({ date:"", shop:"", content:"", issue:"", nextDate:"" });
  const [newAccident, setNewAccident] = useState({ datetime:"", place:"", opponent:"", repairStatus:"", insuranceUsed:false, note:"" });
  const [newViolation, setNewViolation] = useState({ date:"", content:"", penalty:"" });

  const selectedVehicle = vehicles.find(v => v?.id === selectedVehicleId) || null;

  const blankForm = {
    plate:"", type:"", maker:"", year:"", maxLoad:"", vehicleWeight:"", grossWeight:"",
    nextInspection:"", inspectionHistory:[],
    accidentHistory:[], violationHistory:[], adminPenaltyHistory:[],
    insuranceExpiry:"", liabilityExpiry:"", vehicleInsurance:"", roadServicePhone:"",
    assignedDriverId:"",
    status:"available", notes:"",
  };

  const openAdd = () => {
    setEditingId(null);
    setForm({ ...blankForm });
    setNewInspection({ date:"", shop:"", content:"", issue:"", nextDate:"" });
    setNewAccident({ datetime:"", place:"", opponent:"", repairStatus:"", insuranceUsed:false, note:"" });
    setNewViolation({ date:"", content:"", penalty:"" });
    setActiveTab("basic");
    setShowModal(true);
  };

  const openEdit = (vehicle) => {
    setEditingId(vehicle?.id || null);
    setForm({ ...blankForm, ...vehicle });
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
      if (editingId) {
        return { ...d, vehicles: current.map(v => v?.id === editingId ? { ...v, ...form } : v) };
      }
      const nextId = `V${String(current.length + 1).padStart(3, "0")}`;
      return { ...d, vehicles: [...current, { id: nextId, ...form }] };
    });
    setShowModal(false);
    setEditingId(null);
  };

  const deleteVehicle = (id) => {
    if (!window.confirm("この車両を削除しますか？")) return;
    setData((d) => ({ ...d, vehicles: (Array.isArray(d?.vehicles) ? d.vehicles : []).filter(v => v?.id !== id) }));
    setSelectedVehicleId(null);
  };

  const addInspection = () => {
    if (!newInspection.date) return;
    setForm(f => ({ ...f, inspectionHistory: [...(f.inspectionHistory||[]), { ...newInspection, id: Date.now() }] }));
    setNewInspection({ date:"", shop:"", content:"", issue:"", nextDate:"" });
  };

  const removeInspection = (id) => {
    setForm(f => ({ ...f, inspectionHistory: (f.inspectionHistory||[]).filter(x => x.id !== id) }));
  };

  const addAccident = () => {
    if (!newAccident.datetime) return;
    setForm(f => ({ ...f, accidentHistory: [...(f.accidentHistory||[]), { ...newAccident, id: Date.now() }] }));
    setNewAccident({ datetime:"", place:"", opponent:"", repairStatus:"", insuranceUsed:false, note:"" });
  };

  const removeAccident = (id) => {
    setForm(f => ({ ...f, accidentHistory: (f.accidentHistory||[]).filter(x => x.id !== id) }));
  };

  const addViolation = () => {
    if (!newViolation.date) return;
    setForm(f => ({ ...f, violationHistory: [...(f.violationHistory||[]), { ...newViolation, id: Date.now() }] }));
    setNewViolation({ date:"", content:"", penalty:"" });
  };

  const removeViolation = (id) => {
    setForm(f => ({ ...f, violationHistory: (f.violationHistory||[]).filter(x => x.id !== id) }));
  };

  const vehicleIcon = <Icon size={14}><rect x="3" y="9" width="18" height="7" rx="2"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></Icon>;
  const plusIcon = <Icon size={14}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></Icon>;
  const trashIcon = <Icon size={12}><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></Icon>;

  const tabs = [
    { id:"basic", label:"①基本情報" },
    { id:"inspection", label:"②定期点検" },
    { id:"inspection_cert", label:"③車検管理" },
    { id:"accident", label:"④事故・違反" },
    { id:"insurance", label:"⑤保険管理" },
    { id:"driver", label:"⑥使用ドライバー" },
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
          <Fl label="状態">
            <RetroSelect value={f.status||"available"} onChange={e=>setF(v=>({...v,status:e.target.value}))}>
              <option value="available">待機中</option>
              <option value="in_use">使用中</option>
              <option value="maintenance">整備中</option>
            </RetroSelect>
          </Fl>
        </div>
        <Fl label="メモ"><RetroTextarea value={f.notes||""} onChange={e=>setF(v=>({...v,notes:e.target.value}))}/></Fl>
      </>
    );
    if (tab === "inspection") return (
      <>
        <div style={{ fontSize:"12px", fontWeight:700, color:"#555", marginBottom:"8px" }}>3ヶ月点検 実施記録（1年間保存）</div>
        <div style={{ border:"1px solid #e8e8e8", borderRadius:"6px", padding:"10px", marginBottom:"10px", background:"#fafbfc" }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 12px" }}>
            <Fl label="実施日"><RetroInput type="date" value={newInspection.date} onChange={e=>setNewInspection(v=>({...v,date:e.target.value}))}/></Fl>
            <Fl label="実施工場"><RetroInput value={newInspection.shop} onChange={e=>setNewInspection(v=>({...v,shop:e.target.value}))}/></Fl>
            <Fl label="次回予定日"><RetroInput type="date" value={newInspection.nextDate} onChange={e=>setNewInspection(v=>({...v,nextDate:e.target.value}))}/></Fl>
          </div>
          <Fl label="整備内容"><RetroTextarea value={newInspection.content} onChange={e=>setNewInspection(v=>({...v,content:e.target.value}))} style={{ minHeight:"60px" }}/></Fl>
          <Fl label="不具合箇所"><RetroInput value={newInspection.issue} onChange={e=>setNewInspection(v=>({...v,issue:e.target.value}))}/></Fl>
          <RetroBtn onClick={addInspection} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>{plusIcon}記録を追加</RetroBtn>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:"6px", maxHeight:"200px", overflowY:"auto" }}>
          {(f.inspectionHistory||[]).length === 0 && <div style={{ fontSize:"12px", color:"#999" }}>記録なし</div>}
          {[...(f.inspectionHistory||[])].sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))).map(rec => (
            <div key={rec.id} style={{ border:"1px solid #e8e8e8", borderRadius:"6px", padding:"8px 10px", background:"#fff", fontSize:"12px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontWeight:700, color:"#007a74" }}>{rec.date}</span>
                <RetroBtn small onClick={()=>removeInspection(rec.id)} style={{ background:"#fff", color:"#e63946", borderColor:"#e63946" }}>{trashIcon}</RetroBtn>
              </div>
              <div style={{ color:"#555", marginTop:"2px" }}>工場：{rec.shop||"—"} / 次回：{rec.nextDate||"—"}</div>
              {rec.content && <div style={{ color:"#333", marginTop:"2px" }}>内容：{rec.content}</div>}
              {rec.issue && <div style={{ color:"#e65100", marginTop:"2px" }}>不具合：{rec.issue}</div>}
            </div>
          ))}
        </div>
      </>
    );
    if (tab === "inspection_cert") return (
      <>
        <Fl label="車検期限"><RetroInput type="date" value={f.nextInspection||""} onChange={e=>setF(v=>({...v,nextInspection:e.target.value}))}/></Fl>
      </>
    );
    if (tab === "accident") return (
      <>
        <div style={{ fontSize:"12px", fontWeight:700, color:"#555", marginBottom:"8px" }}>事故記録（3年間保存）</div>
        <div style={{ border:"1px solid #e8e8e8", borderRadius:"6px", padding:"10px", marginBottom:"10px", background:"#fafbfc" }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 12px" }}>
            <Fl label="事故日時"><RetroInput type="datetime-local" value={newAccident.datetime} onChange={e=>setNewAccident(v=>({...v,datetime:e.target.value}))}/></Fl>
            <Fl label="事故場所"><RetroInput value={newAccident.place} onChange={e=>setNewAccident(v=>({...v,place:e.target.value}))}/></Fl>
            <Fl label="相手情報"><RetroInput value={newAccident.opponent} onChange={e=>setNewAccident(v=>({...v,opponent:e.target.value}))}/></Fl>
            <Fl label="修理状況"><RetroInput value={newAccident.repairStatus} onChange={e=>setNewAccident(v=>({...v,repairStatus:e.target.value}))}/></Fl>
          </div>
          <Fl label="保険対応">
            <label style={{ display:"inline-flex", alignItems:"center", gap:"6px", fontSize:"12px", cursor:"pointer" }}>
              <input type="checkbox" checked={!!newAccident.insuranceUsed} onChange={e=>setNewAccident(v=>({...v,insuranceUsed:e.target.checked}))}/>
              保険対応あり
            </label>
          </Fl>
          <Fl label="備考"><RetroTextarea value={newAccident.note} onChange={e=>setNewAccident(v=>({...v,note:e.target.value}))} style={{ minHeight:"60px" }}/></Fl>
          <RetroBtn onClick={addAccident} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>{plusIcon}事故記録を追加</RetroBtn>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:"6px", maxHeight:"160px", overflowY:"auto" }}>
          {(f.accidentHistory||[]).length === 0 && <div style={{ fontSize:"12px", color:"#999" }}>記録なし</div>}
          {[...(f.accidentHistory||[])].sort((a,b)=>String(b.datetime||"").localeCompare(String(a.datetime||""))).map(rec => (
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
        <div style={{ marginTop:"12px", fontSize:"12px", fontWeight:700, color:"#555", marginBottom:"8px" }}>違反・行政処分記録</div>
        <div style={{ border:"1px solid #e8e8e8", borderRadius:"6px", padding:"10px", marginBottom:"10px", background:"#fafbfc" }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"6px 12px" }}>
            <Fl label="日付"><RetroInput type="date" value={newViolation.date} onChange={e=>setNewViolation(v=>({...v,date:e.target.value}))}/></Fl>
            <Fl label="違反内容"><RetroInput value={newViolation.content} onChange={e=>setNewViolation(v=>({...v,content:e.target.value}))}/></Fl>
            <Fl label="行政処分"><RetroInput value={newViolation.penalty} onChange={e=>setNewViolation(v=>({...v,penalty:e.target.value}))}/></Fl>
          </div>
          <RetroBtn onClick={addViolation} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>{plusIcon}違反記録を追加</RetroBtn>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:"6px", maxHeight:"120px", overflowY:"auto" }}>
          {(f.violationHistory||[]).length === 0 && <div style={{ fontSize:"12px", color:"#999" }}>記録なし</div>}
          {[...(f.violationHistory||[])].sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))).map(rec => (
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
        {f.assignedDriverId && (() => {
          const d = drivers.find(x=>x?.id===f.assignedDriverId);
          if (!d) return null;
          return (
            <div style={{ border:"1px solid #e8e8e8", borderRadius:"6px", padding:"10px", background:"#f9fcfc", fontSize:"12px", marginTop:"8px" }}>
              <div style={{ fontWeight:700, color:"#007a74", marginBottom:"4px" }}>{d.name}</div>
              <div>電話：{d.phone||"—"}</div>
              <div>免許：{d.license||"—"} / 有効期限：{d.license_expiry||"—"}</div>
            </div>
          );
        })()}
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
              {["ID","ナンバー","車種","車検期限","任意保険期限","状態","操作"].map(h => (
                <th key={h} style={{ color:"#666", fontSize:"11px", padding:"8px 10px", textAlign:"left", fontWeight:700, whiteSpace:"nowrap", borderBottom:cardBorder }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vehicles.map((vehicle) => (
              <tr key={vehicle?.id} style={{ background:"#fff", borderBottom:"1px solid #f0f0f0" }}
                onMouseEnter={e=>e.currentTarget.style.background="#f9fcfc"}
                onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
                <td style={{ padding:"8px 10px" }}>
                  <span style={{ color:"#007a74", fontWeight:700, cursor:"pointer", textDecoration:"underline" }}
                    onClick={()=>{ setSelectedVehicleId(vehicle?.id); setActiveTab("basic"); }}>{vehicle?.id||"—"}</span>
                </td>
                <td style={{ padding:"8px 10px" }}>
                  <span style={{ color:"#007a74", fontWeight:700, cursor:"pointer", textDecoration:"underline" }}
                    onClick={()=>{ setSelectedVehicleId(vehicle?.id); setActiveTab("basic"); }}>{vehicle?.plate||""}</span>
                </td>
                <td style={{ padding:"8px 10px" }}>{vehicle?.type||""}</td>
                <td style={{ padding:"8px 10px" }}>{vehicle?.nextInspection||"未設定"}</td>
                <td style={{ padding:"8px 10px" }}>{vehicle?.insuranceExpiry||"未設定"}</td>
                <td style={{ padding:"8px 10px" }}><StatusPill s={vehicle?.status}/></td>
                <td style={{ padding:"8px 10px" }}>
                  <div style={{ display:"flex", gap:"4px" }}>
                    <RetroBtn small onClick={()=>openEdit(vehicle)} style={{ background:"#fff", color:"#00a09a", borderColor:"#00a09a" }}>編集</RetroBtn>
                    <RetroBtn small onClick={()=>deleteVehicle(vehicle?.id)} style={{ background:"#fff", color:"#e63946", borderColor:"#e63946" }}>削除</RetroBtn>
                  </div>
                </td>
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
            {activeTab==="basic" && (
              <div style={{ display:"grid", gridTemplateColumns:"120px 1fr", rowGap:"6px", columnGap:"8px", fontSize:"12px", color:"#333" }}>
                <div style={{ color:"#888" }}>ナンバー</div><div>{selectedVehicle?.plate||"—"}</div>
                <div style={{ color:"#888" }}>車種</div><div>{selectedVehicle?.type||"—"}</div>
                <div style={{ color:"#888" }}>メーカー</div><div>{selectedVehicle?.maker||"—"}</div>
                <div style={{ color:"#888" }}>年式</div><div>{selectedVehicle?.year||"—"}</div>
                <div style={{ color:"#888" }}>最大積載量</div><div>{selectedVehicle?.maxLoad||"—"}</div>
                <div style={{ color:"#888" }}>車両重量</div><div>{selectedVehicle?.vehicleWeight||"—"}</div>
                <div style={{ color:"#888" }}>総重量</div><div>{selectedVehicle?.grossWeight||"—"}</div>
                <div style={{ color:"#888" }}>状態</div><div><StatusPill s={selectedVehicle?.status}/></div>
                <div style={{ color:"#888" }}>メモ</div><div>{selectedVehicle?.notes||"—"}</div>
              </div>
            )}
            {activeTab==="inspection" && (
              <div style={{ display:"flex", flexDirection:"column", gap:"6px", maxHeight:"340px", overflowY:"auto" }}>
                {(selectedVehicle?.inspectionHistory||[]).length === 0 && <div style={{ fontSize:"12px", color:"#999" }}>記録なし</div>}
                {[...(selectedVehicle?.inspectionHistory||[])].sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))).map(rec => (
                  <div key={rec.id} style={{ border:"1px solid #e8e8e8", borderRadius:"6px", padding:"10px", background:"#fff", fontSize:"12px" }}>
                    <div style={{ fontWeight:700, color:"#007a74" }}>{rec.date} — {rec.shop||"—"}</div>
                    <div style={{ marginTop:"4px" }}>次回予定：{rec.nextDate||"—"}</div>
                    {rec.content && <div style={{ marginTop:"2px" }}>内容：{rec.content}</div>}
                    {rec.issue && <div style={{ color:"#e65100", marginTop:"2px" }}>不具合：{rec.issue}</div>}
                  </div>
                ))}
              </div>
            )}
            {activeTab==="inspection_cert" && (
              <div style={{ display:"grid", gridTemplateColumns:"120px 1fr", rowGap:"6px", columnGap:"8px", fontSize:"12px", color:"#333" }}>
                <div style={{ color:"#888" }}>車検期限</div><div>{selectedVehicle?.nextInspection||"—"}</div>
              </div>
            )}
            {activeTab==="accident" && (
              <>
                <div style={{ fontSize:"12px", fontWeight:700, color:"#555", marginBottom:"6px" }}>事故記録</div>
                <div style={{ display:"flex", flexDirection:"column", gap:"6px", maxHeight:"180px", overflowY:"auto", marginBottom:"12px" }}>
                  {(selectedVehicle?.accidentHistory||[]).length === 0 && <div style={{ fontSize:"12px", color:"#999" }}>記録なし</div>}
                  {[...(selectedVehicle?.accidentHistory||[])].sort((a,b)=>String(b.datetime||"").localeCompare(String(a.datetime||""))).map(rec => (
                    <div key={rec.id} style={{ border:"1px solid #e8e8e8", borderRadius:"6px", padding:"8px 10px", background:"#fff", fontSize:"12px" }}>
                      <div style={{ fontWeight:700, color:"#e63946" }}>{rec.datetime?.slice(0,10)||"—"} {rec.place||""}</div>
                      <div>相手：{rec.opponent||"—"} / 修理：{rec.repairStatus||"—"} / 保険：{rec.insuranceUsed?"あり":"なし"}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize:"12px", fontWeight:700, color:"#555", marginBottom:"6px" }}>違反・処分記録</div>
                <div style={{ display:"flex", flexDirection:"column", gap:"6px", maxHeight:"120px", overflowY:"auto" }}>
                  {(selectedVehicle?.violationHistory||[]).length === 0 && <div style={{ fontSize:"12px", color:"#999" }}>記録なし</div>}
                  {[...(selectedVehicle?.violationHistory||[])].sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))).map(rec => (
                    <div key={rec.id} style={{ border:"1px solid #e8e8e8", borderRadius:"6px", padding:"8px 10px", background:"#fff", fontSize:"12px" }}>
                      <div style={{ fontWeight:700 }}>{rec.date||"—"}</div>
                      <div>違反：{rec.content||"—"} / 処分：{rec.penalty||"—"}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {activeTab==="insurance" && (
              <div style={{ display:"grid", gridTemplateColumns:"140px 1fr", rowGap:"6px", columnGap:"8px", fontSize:"12px", color:"#333" }}>
                <div style={{ color:"#888" }}>任意保険期限</div><div>{selectedVehicle?.insuranceExpiry||"—"}</div>
                <div style={{ color:"#888" }}>自賠責期限</div><div>{selectedVehicle?.liabilityExpiry||"—"}</div>
                <div style={{ color:"#888" }}>車両保険内容</div><div>{selectedVehicle?.vehicleInsurance||"—"}</div>
                <div style={{ color:"#888" }}>ロードサービス</div><div>{selectedVehicle?.roadServicePhone||"—"}</div>
              </div>
            )}
            {activeTab==="driver" && (
              <div style={{ fontSize:"12px", color:"#333" }}>
                {(() => {
                  const d = drivers.find(x=>x?.id===selectedVehicle?.assignedDriverId);
                  if (!d) return <div style={{ color:"#999" }}>使用ドライバー未割当</div>;
                  return (
                    <div style={{ border:"1px solid #e8e8e8", borderRadius:"6px", padding:"10px", background:"#f9fcfc" }}>
                      <div style={{ fontWeight:700, color:"#007a74", marginBottom:"4px" }}>{d.name}</div>
                      <div>電話：{d.phone||"—"}</div>
                      <div>免許：{d.license||"—"} / 有効期限：{d.license_expiry||"—"}</div>
                    </div>
                  );
                })()}
              </div>
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
          <div style={{ minHeight:"300px" }}>
            {renderFormTab(activeTab, form, setForm)}
          </div>
          <div style={{ display:"flex", justifyContent:"flex-end", gap:"6px", marginTop:"12px" }}>
            <RetroBtn onClick={()=>setShowModal(false)}>キャンセル</RetroBtn>
            <RetroBtn onClick={saveVehicle} style={{ background:"#00a09a", borderColor:"#00a09a", color:"#fff" }}>保存する</RetroBtn>
          </div>
        </Modal>
      )}
    </div>
  );
};
