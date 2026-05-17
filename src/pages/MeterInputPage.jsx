import React, { useEffect, useMemo, useState } from "react";
import { RefreshCw, Save, Send } from "lucide-react";
import { apiEnabled, createRecord, fetchProperties, fetchRecords, fetchTenants, updateRecord } from "../lib/api";

function makeRoomKey(b, r) { return (b||"").trim()+"::"+(r||"").replace(/\s+/g,"").toUpperCase(); }

export default function MeterInputPage() {
  const [properties, setProperties] = useState([]);
  const [records, setRecords] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [cycle, setCycle] = useState(new Date().toISOString().slice(0,7));
  const [readings, setReadings] = useState({});
  const [loading, setLoading] = useState(apiEnabled);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    if (!apiEnabled) { setLoading(false); return; }
    setLoading(true);
    try {
      const [p, r, t] = await Promise.all([fetchProperties(), fetchRecords(), fetchTenants()]);
      setProperties(Array.isArray(p) ? p : []);
      setRecords(Array.isArray(r) ? r : []);
      setTenants(Array.isArray(t) ? t : []);
      setMsg("");
    } catch(e) { setMsg(e.message||"加载失败"); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const rooms = useMemo(() => {
    const usageMap = new Map(properties.map(p => [makeRoomKey(p.building,p.room), String(p.usageType||"")]));
    const lastMap = new Map();
    records.forEach(r => {
      const rt = String(r.room||"");
      const di = rt.indexOf(" - ");
      const si = rt.lastIndexOf(" ");
      let bld = r.building||"", rm = r.roomNo||"";
      if (!bld && di>=0) { bld = rt.slice(0,di).trim(); rm = rm||rt.slice(di+3).trim(); }
      else if (!bld && si>=0) { bld = rt.slice(0,si).trim(); rm = rm||rt.slice(si+1).trim(); }
      else if (!rm) { rm = rt; }
      if (!bld && rm.includes(" ")) { const ls=rm.lastIndexOf(" "); bld=rm.slice(0,ls).trim(); rm=rm.slice(ls+1).trim(); }
      if (bld && rm.includes(" ") && rm.indexOf(bld)===0) { rm=rm.slice(bld.length).trim(); }
      const key = makeRoomKey(bld, rm);
      const p = lastMap.get(key);
      if (!p || String(r.cycle||"") > String(p.cycle||"")) lastMap.set(key, { e: r.electricNow||"", w: r.waterNow||"" });
    });
    return properties
      .filter(p => usageMap.get(makeRoomKey(p.building,p.room)) !== "自用（不出租）")
      .sort((a,b) => {
        const bc = String(a.building||"").localeCompare(String(b.building||""),"zh-Hans-CN");
        if (bc) return bc;
        const na = parseInt(String(a.room||"").match(/\d+/)||"0");
        const nb = parseInt(String(b.room||"").match(/\d+/)||"0");
        return na - nb || String(a.room||"").localeCompare(String(b.room||""));
      })
      .map(p => {
        const key = makeRoomKey(p.building, p.room);
        const last = lastMap.get(key)||{};
        const isSelf = usageMap.get(key)==="自用（不出租）";
        return { b: p.building, r: p.room, ep: last.e||(isSelf?p.lastElectricReading||"":""), wp: last.w||(isSelf?p.lastWaterReading||"":""), self: isSelf };
      });
  }, [properties, records]);

  function setReading(rid, field, val) {
    setReadings(prev => {
      const cur = prev[rid] || { e: "", w: "" };
      return { ...prev, [rid]: { ...cur, [field]: val } };
    });
  }

  async function syncToSystem() {
    const entries = Object.entries(readings).filter(([,v]) => v.e || v.w);
    if (!entries.length) { setMsg("没有填写任何读数"); return; }
    setSaving(true);
    try {
      let updated = 0, created = 0;
      for (const [rid, vals] of entries) {
        const [bld, room] = rid.split("::");
        const roomText = bld + " " + room;
        const tenant = tenants.find(t => !t.archived && makeRoomKey(t.building,t.room) === rid);
        const existing = records.find(r => {
          const rt = String(r.room||"");
          return (rt === roomText || rt.includes(room)) && String(r.cycle||"").trim() === cycle;
        });
        const lastRec = records.filter(r => {
          const rt = String(r.room||"");
          return (rt === roomText || rt.includes(room)) && String(r.cycle||"") < cycle;
        }).sort((a,b) => String(b.cycle||"").localeCompare(String(a.cycle||"")))[0] || null;

        const fees = Array.isArray(tenant?.feeItems) ? tenant.feeItems : [];
        const elecPrice = lastRec?.electricPrice || fees.find(f=>(f.name||"").includes("电"))?.unitPrice || "0.8";
        const waterPrice = lastRec?.waterPrice || fees.find(f=>(f.name||"").includes("水"))?.unitPrice || "5.5";
        const elecPrev = lastRec?.electricNow || "";
        const waterPrev = lastRec?.waterNow || "";
        const eUsage = Math.max(0, Number(vals.e||0) - Number(elecPrev||0));
        const wUsage = Math.max(0, Number(vals.w||0) - Number(waterPrev||0));
        const prop = properties.find(p => makeRoomKey(p.building,p.room) === rid);
        const noWM = Boolean(prop?.noWaterMeter);
        const wMin = noWM ? 0 : (wUsage < 1 ? Math.round(((1-wUsage)*Number(waterPrice||0))*100)/100 : 0);
        const rent = Number(tenant?.rent||0);
        const tax = fees.find(f=>(f.name||"").includes("税费"))?.unitPrice || "0";
        const otherFee = Number(tax||0);
        const receivable = Math.round(rent + eUsage*Number(elecPrice) + wUsage*Number(waterPrice) + wMin + otherFee);
        const payload = {
          tenant: tenant?.name||"", tenantId: tenant?.id||"", room: roomText, building: bld, cycle,
          rentPart: rent, receivable: String(receivable), received: existing ? (existing.received||0) : 0,
          payments: existing?.payments || [],
          status: existing?.status || "未收", method: "微信",
          dueDate: cycle+"-10", paidAt: existing?.paidAt||"-",
          note: "手机抄表同步",
          electricPrev: String(elecPrev), electricNow: String(vals.e||""), electricUsage: String(eUsage), electricPrice: String(elecPrice),
          waterPrev: String(waterPrev), waterNow: String(vals.w||""), waterUsage: String(wUsage), waterPrice: String(waterPrice),
          waterMinimumCharge: String(wMin), noWaterMeter: noWM,
          propertyFee: "0", networkFee: "0", garbageFee: tax, otherFee: String(otherFee), depositAdjustment: "0",
        };
        if (Number(payload.receivable)>0 && Number(payload.received)>=Number(payload.receivable)) payload.status = "已收";
        else if (Number(payload.received)>0) payload.status = "部份收取";
        else payload.status = "未收";

        if (existing) { await updateRecord(existing.id, { ...existing, ...payload, id: existing.id }); updated++; }
        else { await createRecord(payload); created++; }
      }
      setMsg(`同步完成：更新 ${updated} 条，新建 ${created} 条`);
      setReadings({});
      load();
    } catch(e) { setMsg(e.message||"同步失败"); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen"><p className="text-slate-500">加载中...</p></div>;

  const groups = {};
  rooms.forEach(r => { const b = r.b||"其他"; if (!groups[b]) groups[b] = []; groups[b].push(r); });

  return (
    <div className="max-w-lg mx-auto p-3 space-y-3">
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-2xl p-4 text-white">
        <h1 className="text-lg font-bold">📱 手机抄表</h1>
        <p className="text-xs opacity-80 mt-1">需联网 · 同步到云端</p>
        <div className="mt-2 flex items-center gap-2">
          <input className="rounded-lg px-3 py-1.5 text-sm text-slate-900" type="month" value={cycle} onChange={e => setCycle(e.target.value)} />
          <button className="rounded-lg bg-white/20 px-3 py-1.5 text-xs" onClick={load}><RefreshCw className="inline h-3 w-3 mr-1" />刷新</button>
        </div>
      </div>

      {msg && <div className="rounded-xl bg-sky-50 px-4 py-2.5 text-sm text-sky-700">{msg}</div>}

      {Object.entries(groups).map(([bld, rs]) => (
        <div key={bld} className="rounded-2xl bg-white ring-1 ring-slate-200 overflow-hidden">
          <div className="bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700">{bld} · {rs.length}间</div>
          {rs.map(r => {
            const rid = r.b+"::"+r.r;
            const val = readings[rid] || {e:"", w:""};
            return (
              <div key={rid} className={`flex items-center gap-2 px-4 py-2.5 border-t border-slate-50 ${r.self ? "bg-slate-50 opacity-70" : ""}`}>
                <div className="w-10 font-bold text-sm">{r.r}{r.self ? <span className="text-[9px] text-slate-400 block">自用</span>:""}</div>
                <div className="flex-1">
                  <input className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" type="number" step="1" inputMode="numeric" placeholder={r.ep?"电 上"+r.ep:"电"} value={val.e} onChange={e => setReading(rid,"e",e.target.value)} />
                </div>
                <div className="flex-1">
                  <input className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" type="number" step="0.1" inputMode="decimal" placeholder={r.wp?"水 上"+r.wp:"水"} value={val.w} onChange={e => setReading(rid,"w",e.target.value)} />
                </div>
              </div>
            );
          })}
        </div>
      ))}

      <div className="sticky bottom-2 flex gap-2 bg-white rounded-2xl p-3 shadow-lg ring-1 ring-slate-200">
        <button className="flex-1 rounded-xl bg-slate-100 py-3 text-sm font-medium" onClick={() => setReadings({})}>清空</button>
        <button className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white disabled:opacity-50" disabled={saving || !Object.values(readings).some(v=>v.e||v.w)} onClick={syncToSystem}><Send className="inline h-4 w-4 mr-1" />{saving?"同步中...":"一键同步"}</button>
      </div>
    </div>
  );
}
