import React, { useEffect, useMemo, useRef, useState } from "react";
import { Download, Printer, RefreshCw, Send, Upload } from "lucide-react";
import { apiEnabled, createRecord, fetchMeterDrafts, fetchProperties, fetchRecords, fetchTenants, saveMeterDraft, saveMeterReading, updateRecord } from "../lib/api";
import ConfirmDialog from "../components/ConfirmDialog";

function makeRoomKey(b, r) { return (b||"").trim()+"::"+(r||"").replace(/\s+/g,"").toUpperCase(); }

export default function MeterInputPage() {
  const [properties, setProperties] = useState([]);
  const [records, setRecords] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [cycle, setCycle] = useState(new Date().toISOString().slice(0,7));
  const STORAGE_KEY = "meter_input_" + new Date().toISOString().slice(0,7);
  const [readings, setReadings] = useState(() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}"); } catch { return {}; } });
  const [savedCount, setSavedCount] = useState(() => { try { const r=JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}"); return Object.keys(r).filter(k=>r[k]?.e||r[k]?.w).length; } catch { return 0; } });
  const [loading, setLoading] = useState(apiEnabled);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [csvPasteText, setCsvPasteText] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [afkTimer, setAfkTimer] = useState(null);

  // 方案二: 离开页面提醒
  useEffect(() => {
    const hasUnsynced = Object.values(readings).some(v => v.e || v.w);
    if (hasUnsynced) {
      const handler = (e) => { e.preventDefault(); e.returnValue = ""; };
      window.addEventListener("beforeunload", handler);
      return () => window.removeEventListener("beforeunload", handler);
    }
  }, [readings]);

  // 方案一/四: 自动防抖保存到后端
  const autoSaveTimerRef = useRef(null);
  useEffect(() => {
    if (!apiEnabled) return;
    if (afkTimer) clearTimeout(afkTimer);
    const t = setTimeout(() => {
      const entries = Object.entries(readings).filter(([,v]) => v.e || v.w);
      if (!entries.length) return;
      for (const [rid, vals] of entries) {
        const [bld, room] = rid.split("::");
        saveMeterDraft({ building: bld, room, cycle, electricNow: vals.e, waterNow: vals.w }).catch(() => {});
      }
    }, 1500); // 防抖 1.5s
    setAfkTimer(t);
    return () => { if (t) clearTimeout(t); };
  }, [readings, cycle, apiEnabled]);

  // 方案一: 加载远端草稿 + 合并本地
  useEffect(() => {
    if (!apiEnabled || !cycle) return;
    fetchMeterDrafts(cycle).then((drafts) => {
      if (!Array.isArray(drafts) || drafts.length === 0) return;
      setReadings((prev) => {
        const merged = { ...prev };
        let changed = false;
        for (const d of drafts) {
          const rid = makeRoomKey(d.building, d.room);
          const existing = merged[rid];
          if (d.electricNow || d.waterNow) {
            if (!existing || (!existing.e && !existing.w)) {
              merged[rid] = { e: d.electricNow || "", w: d.waterNow || "" };
              changed = true;
            }
          }
        }
        if (changed) {
          // no saveLocal since server is already source of truth
          setSavedCount(Object.keys(merged).filter(k => merged[k]?.e || merged[k]?.w).length);
        }
        return merged;
      });
    }).catch(() => {});
  }, [cycle, apiEnabled]);

  function saveLocal(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setSavedCount(Object.keys(data).filter(k => data[k]?.e || data[k]?.w).length);
  }

  function handleSyncClick() {
    const existingCount = records.filter(r => String(r.cycle || "").trim() === cycle).length;
    if (existingCount > 0) {
      setConfirmOpen(true);
    } else {
      syncToSystem();
    }
  }

  function applyCsvRows(rows) {
    const next = { ...readings };
    let count = 0;
    for (const row of rows) {
      const rid = makeRoomKey(row.building, row.room);
      const found = rooms.find(r => makeRoomKey(r.b, r.r) === rid);
      if (!found) continue;
      next[rid] = { e: row.electricNow || "", w: row.waterNow || "" };
      count++;
    }
    setReadings(next);
    saveLocal(next);
    // 方案一: CSV导入也自动存后端
    if (apiEnabled) {
      for (const row of rows) {
        const rid = makeRoomKey(row.building, row.room);
        if (rooms.find(r => makeRoomKey(r.b, r.r) === rid)) {
          saveMeterDraft({ building: row.building, room: row.room, cycle, electricNow: row.electricNow || "", waterNow: row.waterNow || "" }).catch(() => {});
        }
      }
    }
    setMsg(`CSV 导入完成：匹配 ${count} 间`);
  }

  function handleCsvFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target.result || "");
      const rows = parseCsvText(text);
      if (!rows.length) { setMsg("CSV 格式不正确或无有效数据"); return; }
      applyCsvRows(rows);
    };
    reader.readAsText(file);
  }

  function parseCsvText(text) {
    const lines = text.replace(/^﻿/, "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];
    const header = lines[0].split(",").map(h => h.trim());
    const bi = header.indexOf("building"), ri = header.indexOf("room"), ei = header.indexOf("electricNow"), wi = header.indexOf("waterNow");
    if (ri < 0) return [];
    return lines.slice(1).map(line => {
      const cols = line.split(",").map(c => c.trim());
      return {
        building: bi >= 0 ? cols[bi] : "",
        room: cols[ri],
        electricNow: ei >= 0 ? cols[ei] : "",
        waterNow: wi >= 0 ? cols[wi] : ""
      };
    }).filter(r => r.room && (r.electricNow || r.waterNow));
  }

  function handleCsvPaste() {
    const rows = parseCsvText(csvPasteText);
    if (!rows.length) { setMsg("CSV 格式不正确或无有效数据"); return; }
    applyCsvRows(rows);
    setCsvPasteText("");
  }

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
      // 修复: 如果 rm 仍包含空格（roomNo 被误写为完整地址），只取末段房号
      if (rm && rm.includes(" ")) { const parts=rm.trim().split(/\s+/); rm=parts[parts.length-1]; }
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
      const next = { ...prev, [rid]: { ...cur, [field]: val } };
      saveLocal(next);
      return next;
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
        else if (tenant) { await createRecord(payload); created++; }
      }
      // 同步成功后清理远端草稿
      if (apiEnabled) {
        try {
          const drafts = await fetchMeterDrafts(cycle);
          if (Array.isArray(drafts)) {
            await Promise.all(drafts.map(d => fetch(`/api/meter-drafts/${d.id}`, { method: "DELETE" }).catch(() => {})));
          }
        } catch (_) {}
      }
      setMsg(`同步完成：更新 ${updated} 条，新建 ${created} 条（自用/空置房跳过）`);
      // Sync meter readings to report
      if (apiEnabled) {
        try {
          for (const [rid, vals] of Object.entries(readings).filter(([,v]) => v.e || v.w)) {
            const [bld, room] = rid.split("::");
            await saveMeterReading({ building: bld, room, cycle, electricNow: vals.e, waterNow: vals.w, source: "meter_sync" });
          }
        } catch (_) {}
      }
      localStorage.removeItem(STORAGE_KEY);
      setReadings({});
      setSavedCount(0);
      load();
    } catch(e) { setMsg(e.message||"同步失败"); }
    finally { setSaving(false); }
  }

  function downloadMeterHtml() {
    const roomsForOffline = rooms.map(r => ({ b: r.b, r: r.r, ep: r.ep, wp: r.wp }));
    const dataJson = JSON.stringify(roomsForOffline);
    const html = '<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no"><title>抄表录入</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font:14px "Microsoft YaHei",sans-serif;background:#f0f4f8;color:#1e293b;padding:8px;max-width:480px;margin:0 auto}.h{background:#2563eb;color:#fff;padding:12px 16px;border-radius:12px;margin-bottom:10px}.h h1{font-size:18px}.h div{font-size:12px;opacity:.8;margin-top:2px}.bld{background:#dbeafe;padding:8px 12px;border-radius:8px;font-weight:bold;font-size:13px;margin:8px 0 4px;display:flex;justify-content:space-between}.row{background:#fff;border-radius:8px;padding:10px 12px;margin-bottom:4px;display:flex;align-items:center;gap:8px}.room{font-weight:bold;font-size:16px;min-width:36px}.inp{flex:1;display:flex;flex-direction:column}.inp label{font-size:10px;color:#64748b}.inp input{width:100%;border:1px solid #cbd5e1;border-radius:6px;padding:8px 6px;font-size:15px;text-align:center}.inp input:focus{outline:none;border-color:#2563eb;box-shadow:0 0 0 2px #bfdbfe}.prev{font-size:10px;color:#94a3b8;text-align:right;min-width:28px}.btns{position:sticky;bottom:8px;background:#fff;border-radius:12px;padding:12px;margin-top:12px;box-shadow:0 -2px 12px rgba(0,0,0,.08);display:flex;gap:8px}.btns button{flex:1;padding:12px;border:none;border-radius:10px;font-size:15px;font-weight:bold;cursor:pointer}.btn-save{background:#2563eb;color:#fff}.btn-export{background:#10b981;color:#fff}.btn-clear{background:#f1f5f9;color:#64748b}.toast{position:fixed;top:12px;left:50%;transform:translateX(-50%);background:#1e293b;color:#fff;padding:10px 20px;border-radius:20px;font-size:13px;z-index:99;opacity:0;transition:opacity .3s}.toast.show{opacity:1}</style></head><body><div class="h"><h1>抄表录入</h1><div>离线可用 · 数据存手机 · 回家导出 CSV</div></div><div id="app"></div><div class="btns"><button class="btn-clear" onclick="clearAll()">清空</button><button class="btn-save" onclick="saveData()">暂存</button><button class="btn-export" onclick="exportData()">导出 CSV</button></div><div class="toast" id="toast"></div><script>var ROOMS=' + dataJson + ';var CYCLE=new Date().toISOString().slice(0,7);var STORAGE_KEY="meter_"+CYCLE;function showToast(m){var t=document.getElementById("toast");t.textContent=m;t.classList.add("show");setTimeout(function(){t.classList.remove("show")},1500)}function loadData(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY))||{}}catch(e){return{}}}function saveData(){var d={};document.querySelectorAll(".row").forEach(function(r){var rid=r.dataset.rid;var e=r.querySelector(".e").value;var w=r.querySelector(".w").value;if(e||w)d[rid]=[e,w]});localStorage.setItem(STORAGE_KEY,JSON.stringify(d));showToast("已暂存 "+Object.keys(d).length+" 条")}function exportData(){saveData();var d=loadData();var lines=["building,room,electricNow,waterNow"];ROOMS.forEach(function(r){var v=d[r.b+"::"+r.r]||["",""];if(v[0]||v[1])lines.push(r.b+","+r.r+","+v[0]+","+v[1])});var csv="﻿"+lines.join("\n");var blob=new Blob([csv],{type:"text/csv"});var a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="meter_"+CYCLE+".csv";a.click();showToast("已导出 "+(lines.length-1)+" 条到 CSV")}function clearAll(){if(confirm("确定清空？")){localStorage.removeItem(STORAGE_KEY);render();showToast("已清空")}}function render(){var d=loadData();var groups={};ROOMS.forEach(function(r){var b=r.b||"其他";if(!groups[b])groups[b]=[];groups[b].push(r)});var h="";Object.keys(groups).forEach(function(b){var rs=groups[b];h+=\'<div class="bld">\'+b+\' <span>\'+rs.length+\'间</span></div>\';rs.forEach(function(r){var v=d[r.b+"::"+r.r]||["",""];h+=\'<div class="row" data-rid="\'+r.b+\'::\'+r.r+\'">\';h+=\'<div class="room">\'+r.r+\'</div>\';h+=\'<div class="inp"><label>电(度)</label><input class="e" type="number" step="1" inputmode="numeric" value="\'+v[0]+\'"></div>\';h+=\'<div class="prev">\'+(r.ep?"上"+r.ep:"")+\'</div>\';h+=\'<div class="inp"><label>水(方)</label><input class="w" type="number" step="0.1" inputmode="decimal" value="\'+v[1]+\'"></div>\';h+=\'<div class="prev">\'+(r.wp?"上"+r.wp:"")+\'</div>\';h+=\'</div>\'})});document.getElementById("app").innerHTML=h}render();</script></body></html>';
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "meter_" + cycle + ".html";
    a.click();
    URL.revokeObjectURL(a.href);
    setMsg("已下载 meter_" + cycle + ".html，可发送到手机离线使用");
  }

  function printMeterTemplate() {
    const groups = {};
    rooms.forEach(r => { const b = r.b||"其他"; if (!groups[b]) groups[b] = []; groups[b].push(r); });
    const now = new Date().toLocaleDateString("zh-CN");
    let allHtml = "";
    let total = 0;
    Object.entries(groups).forEach(([building, rs]) => {
      const half = Math.ceil(rs.length / 2);
      const left = rs.slice(0, half);
      const right = rs.slice(half);
      total += rs.length;
      let rows = "";
      const maxRows = Math.max(left.length, right.length);
      for (let i = 0; i < maxRows; i++) {
        const l = left[i];
        const r = right[i];
        rows += `<tr>
          <td style="text-align:center;">${l ? `<b>${l.r}</b>` : ""}</td>
          <td><div style="border-bottom:1px solid #94a3b8;min-height:20px;"></div></td>
          <td><div style="border-bottom:1px solid #94a3b8;min-height:20px;"></div></td>
          <td></td>
          <td style="text-align:center;">${r ? `<b>${r.r}</b>` : ""}</td>
          <td><div style="border-bottom:1px solid #94a3b8;min-height:20px;"></div></td>
          <td><div style="border-bottom:1px solid #94a3b8;min-height:20px;"></div></td>
        </tr>`;
      }
      allHtml += `<tr><td colspan="8" style="background:#dbeafe;font-weight:bold;padding:4px 8px;font-size:13px;">${building}（${rs.length}间）</td></tr>${rows}`;
    });
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>抄表 ${cycle}</title>
<style>@page{size:A4 portrait;margin:10mm;}body{font-family:'Microsoft YaHei',sans-serif;font-size:13px;color:#1e293b;margin:0;}h1{font-size:17px;margin:0 0 4px 0;}.info{color:#64748b;font-size:11px;margin-bottom:10px;}table{width:100%;border-collapse:collapse;}th{background:#f1f5f9;padding:4px 6px;font-size:11px;border-bottom:2px solid #94a3b8;}td{border-bottom:1px solid #e2e8f0;padding:3px 5px;}.noprint{display:none;}.col-label{font-size:9px;color:#94a3b8;text-align:center;}</style></head>
<body>
  <h1>抄表记录 ${cycle}</h1>
  <div class="info">打印日期：${now} &nbsp;|&nbsp; 共 ${total} 间 &nbsp;|&nbsp; 请在空白格内填写本月表底读数 <button onclick="window.print()" style="margin-left:16px;font-size:12px;padding:3px 14px;">🖨 打印</button></div>
  <table>
    <thead>
      <tr><th style="width:30px;"></th><th style="width:70px;"><div class="col-label">电表(度)</div></th><th style="width:70px;"><div class="col-label">水表(方)</div></th><th style="width:24px;"></th><th style="width:30px;"></th><th style="width:70px;"><div class="col-label">电表(度)</div></th><th style="width:70px;"><div class="col-label">水表(方)</div></th></tr>
    </thead>
    <tbody>${allHtml}</tbody>
  </table>
</body></html>`;
    const w = window.open("about:blank", "_blank", "width=700,height=900");
    if (!w) { setMsg("打印窗口被拦截，请允许弹窗"); return; }
    w.document.open(); w.document.write(html); w.document.close(); w.focus();
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen"><p className="text-slate-500">加载中...</p></div>;

  const groups = {};
  rooms.forEach(r => { const b = r.b||"其他"; if (!groups[b]) groups[b] = []; groups[b].push(r); });

  return (
    <div className="max-w-lg mx-auto p-3 space-y-3">
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-2xl p-4 text-white">
        <h1 className="text-lg font-bold">📱 手机抄表</h1>
        <p className="text-xs opacity-80 mt-1">{savedCount > 0 ? `已暂存 ${savedCount} 间 · ` : ""}填数自动存云端 · 不怕丢</p>
        <div className="mt-2 flex items-center gap-2">
          <input className="rounded-lg px-3 py-1.5 text-sm text-slate-900" type="month" value={cycle} onChange={e => setCycle(e.target.value)} />
          <button className="rounded-lg bg-white/20 px-3 py-1.5 text-xs" onClick={load}><RefreshCw className="inline h-3 w-3 mr-1" />刷新</button>
        </div>
      </div>

      {msg && <div className="rounded-xl bg-sky-50 px-4 py-2.5 text-sm text-sky-700">{msg}</div>}

      <details className="rounded-2xl bg-white ring-1 ring-slate-200 overflow-hidden">
        <summary className="px-4 py-2.5 text-sm font-semibold text-slate-600 cursor-pointer bg-slate-50">📋 CSV 导入读数</summary>
        <div className="p-3 space-y-2">
          <label className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 px-3 py-2 text-sm text-emerald-700 cursor-pointer w-full justify-center">
            <Upload className="h-4 w-4" /> 上传 CSV 文件
            <input className="hidden" type="file" accept=".csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); e.target.value = ''; }} />
          </label>
          <textarea
            className="w-full rounded-xl border border-slate-300 p-3 text-xs font-mono"
            rows={4}
            placeholder="building,room,electricNow,waterNow
西山东区17号,101,6910,268
西山东区17号,102,7220,272"
            value={csvPasteText}
            onChange={(e) => setCsvPasteText(e.target.value)}
          />
          <button
            className="w-full rounded-xl bg-emerald-600 py-2 text-sm text-white font-medium disabled:opacity-50"
            type="button"
            disabled={!csvPasteText.trim()}
            onClick={handleCsvPaste}
          >⚡ 一键填入</button>
        </div>
      </details>

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

      <div className="sticky bottom-2 bg-white rounded-2xl p-3 shadow-lg ring-1 ring-slate-200 space-y-2">
        <div className="flex gap-2">
          <button className="flex-1 rounded-xl bg-slate-100 py-3 text-sm font-medium" onClick={() => { setReadings({}); localStorage.removeItem(STORAGE_KEY); setSavedCount(0); }}>清空读数</button>
          <button className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white disabled:opacity-50" disabled={saving || !Object.values(readings).some(v=>v.e||v.w)} onClick={handleSyncClick}><Send className="inline h-4 w-4 mr-1" />{saving?"同步中...":"一键同步"}</button>
        </div>
        <div className="flex gap-2">
          <button className="flex-1 rounded-xl bg-emerald-50 border border-emerald-200 py-2.5 text-sm font-medium text-emerald-700" onClick={downloadMeterHtml}><Download className="inline h-4 w-4 mr-1" />下载离线页</button>
          <button className="flex-1 rounded-xl bg-amber-50 border border-amber-200 py-2.5 text-sm font-medium text-amber-700" onClick={printMeterTemplate}><Printer className="inline h-4 w-4 mr-1" />打印抄表模板</button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="该账期已有账单记录"
        message={`该账期已有 ${records.filter(r => String(r.cycle || "").trim() === cycle).length} 条账单，同步将覆盖现有电费/水费数据。`}
        confirmText="确认同步"
        cancelText="取消"
        tone="warn"
        onConfirm={() => { setConfirmOpen(false); syncToSystem(); }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
