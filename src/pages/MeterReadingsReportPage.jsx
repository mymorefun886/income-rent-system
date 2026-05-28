import React, { useEffect, useMemo, useState } from "react";
import { apiEnabled, fetchMeterReadings, fetchProperties, fetchRecords, fetchTenants } from "../lib/api";
import { makeRoomKey, parseRoomText } from "../lib/recordUtils";

export default function MeterReadingsReportPage() {
  const [cycles] = useState(() => { const a = []; for (let m = 1; m <= 6; m++) a.push("2026-" + String(m).padStart(2, "0")); return a; });
  const [readings, setReadings] = useState([]);
  const [records, setRecords] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  async function load() {
    if (!apiEnabled) return;
    setLoading(true);
    try {
      const [r, m, p, t] = await Promise.all([fetchRecords(), fetchMeterReadings(), fetchProperties(), fetchTenants()]);
      setRecords(Array.isArray(r) ? r : []); setReadings(Array.isArray(m) ? m : []);
      setProperties(Array.isArray(p) ? p : []); setTenants(Array.isArray(t) ? t : []);
    } catch (e) { setMsg(e.message || "加载失败"); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  const mergedData = useMemo(() => {
    const roomSet = new Map();
    (properties || []).forEach(p => { const k = makeRoomKey(p.building, p.room); if (!roomSet.has(k)) roomSet.set(k, { building: p.building || "", room: p.room || "", usageType: p.usageType || "" }); });
    (records || []).forEach(r => { const p2 = parseRoomText(r.room || ""); const k = makeRoomKey(p2.building, p2.room); if (!roomSet.has(k) && p2.building) roomSet.set(k, { building: p2.building, room: p2.room, usageType: "" }); });
    const dataMap = new Map();
    (readings || []).forEach(mr => { const k = makeRoomKey(mr.building, mr.room); if (!dataMap.has(k)) dataMap.set(k, {}); dataMap.get(k)[mr.cycle] = { electricNow: mr.electricNow || "", waterNow: mr.waterNow || "" }; });
    (records || []).forEach(r => { const c = String(r.cycle || "").trim(); if (!c) return; const p2 = parseRoomText(r.room || ""); const k = makeRoomKey(p2.building, p2.room); if (!dataMap.has(k)) dataMap.set(k, {}); if (!dataMap.get(k)[c]) dataMap.get(k)[c] = { electricNow: String(r.electricNow ?? ""), waterNow: String(r.waterNow ?? "") }; });
    const rooms = [];
    for (const [key, info] of roomSet) { const e = { ...info, readings: {} }; for (const c of cycles) e.readings[c] = dataMap.get(key)?.[c] || null; rooms.push(e); }
    rooms.sort((a, b) => { const bc = a.building.localeCompare(b.building, "zh"); if (bc) return bc; const na = parseInt((a.room || "").match(/d+/)?.[0] || "0"); const nb = parseInt((b.room || "").match(/d+/)?.[0] || "0"); return na - nb || (a.room || "").localeCompare(b.room || ""); });
    return { rooms };
  }, [readings, records, properties, cycles]);
  const isSelfUse = (building, room) => (properties || []).some(p => makeRoomKey(p.building, p.room) === makeRoomKey(building, room) && p.usageType === "自用（不出租）");
  if (loading) return React.createElement("div",{className:"flex items-center justify-center min-h-screen"},React.createElement("p",{className:"text-slate-500"},"加载中..."));
  return React.createElement("div",{className:"space-y-4 p-4"},
    React.createElement("div",{className:"flex items-center justify-between"},
      React.createElement("div",null,React.createElement("h1",{className:"text-2xl font-bold text-slate-900"},"水电对账"),React.createElement("p",{className:"text-sm text-slate-500"},"所有房间水电度数记录")),
      React.createElement("button",{className:"rounded-lg border border-sky-200 px-3 py-1.5 text-sm",onClick:load},"刷新")),
    msg ? React.createElement("div",{className:"rounded-xl bg-sky-50 px-4 py-2.5 text-sm text-sky-700"},msg) : null,
    React.createElement("div",{className:"overflow-x-auto rounded-2xl border border-slate-200 bg-white"},
      React.createElement("table",{className:"min-w-[1600px] text-xs md:text-sm"},
        React.createElement("thead",null,
          React.createElement("tr",{className:"bg-slate-50"},
            React.createElement("th",{className:"sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left",style:{minWidth:140}},"房号"),
            React.createElement("th",{className:"px-2 py-2 text-left text-slate-400 font-normal"},"类型"),
            cycles.map(c => React.createElement("th",{key:c,colSpan:2,className:"px-1 py-2 text-center border-l border-slate-100"},c.replace("2026-","").replace("0","")+"月"))),
          React.createElement("tr",{className:"bg-slate-50 text-[10px] text-slate-400"},
            React.createElement("th",null),React.createElement("th",null),
            cycles.map(c => React.createElement(React.Fragment,{key:c+"-sub"},React.createElement("th",{className:"px-1 py-1 text-center border-l border-slate-100 font-normal"},"电"),React.createElement("th",{className:"px-1 py-1 text-center font-normal"},"水"))))),
        React.createElement("tbody",null, mergedData.rooms.map(room => {
            const selfUse = isSelfUse(room.building, room.room);
            const tenant = (tenants || []).find(t => makeRoomKey(t.building, t.room) === makeRoomKey(room.building, room.room));
            return React.createElement("tr",{key:makeRoomKey(room.building,room.room),className:"border-t border-slate-100"+(selfUse?" bg-slate-50":"")},
              React.createElement("td",{className:"sticky left-0 z-10 bg-white px-3 py-1.5 whitespace-nowrap font-medium"},room.building+" "+room.room,selfUse?React.createElement("span",{className:"ml-1 text-[10px] text-slate-400 bg-slate-100 rounded px-1"},"自用"):null),
              React.createElement("td",{className:"px-2 py-1.5 text-xs text-slate-400"},selfUse?"自用":tenant?(tenant.archived?"已退租":"在租"):"空置"),
              cycles.map(c => { const rd = room.readings[c]; const hd = rd && (rd.electricNow || rd.waterNow); return React.createElement(React.Fragment,{key:c+"-"+room.room},React.createElement("td",{className:"px-1 py-1.5 text-center border-l border-slate-50"+(hd?" text-slate-800":" text-slate-300")},hd?rd.electricNow:"-"),React.createElement("td",{className:"px-1 py-1.5 text-center"+(hd?" text-slate-800":" text-slate-300")},hd?rd.waterNow:"-")); })
            );
          }))
      ))
  );
}