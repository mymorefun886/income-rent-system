import React, { useEffect, useState } from "react";
import { Download, HardDrive, QrCode, RefreshCw, Upload } from "lucide-react";
import { API_BASE_URL, apiEnabled, importCsvData, fetchSettings, updateSettings, uploadFile } from "../lib/api";

const csvTemplates = {
  properties: "building,room,title,address,area,layout,rent,status\n西山东区17号,101,西山东区17号 101,深圳市宝安区,20,单间,900,闲置",
  tenants: "name,phone,building,room,leaseStart,leaseEnd,rent,deposit\n张三,13800000000,西山东区17号,101,2026-06-01,2027-05-31,900,900",
  records: "tenant,room,cycle,receivable,received,status,method,dueDate\n张三,西山东区17号 101,2026-06,950,0,未收,微信,2026-06-10",
};

export default function SettingsPage() {
  const [entity, setEntity] = useState("tenants");
  const [overwrite, setOverwrite] = useState(false);
  const [importing, setImporting] = useState(false);
  const [resultText, setResultText] = useState("");
  const [error, setError] = useState("");
  const [qrUploading, setQrUploading] = useState(false);
  const [payQrUrl, setPayQrUrl] = useState(() => localStorage.getItem("income-print-pay-qr") || "");

  useEffect(() => {
    if (!apiEnabled) return;
    fetchSettings().then(s => {
      const qr = String(s?.printPayQrUrl || "").trim();
      if (qr) { localStorage.setItem("income-print-pay-qr", qr); setPayQrUrl(qr); }
    }).catch(() => {});
  }, []);

  async function handleImport(file) {
    if (!file) return;
    if (!apiEnabled) { setError("未连接后端"); return; }
    setImporting(true); setError("");
    try {
      const csvText = await file.text();
      const result = await importCsvData({ entity, overwrite, csvText });
      setResultText(`导入完成：${result.entity}，总 ${result.totalRows} 行，成功 ${result.imported}，跳过 ${result.skipped}`);
    } catch (e) { setError(e.message || "导入失败"); }
    finally { setImporting(false); }
  }

  async function handleQrUpload(file) {
    if (!file) return;
    setQrUploading(true); setError("");
    try {
      const uploaded = await uploadFile(file);
      const fullUrl = API_BASE_URL + (uploaded?.url || "");
      await updateSettings({ printPayQrUrl: fullUrl });
      localStorage.setItem("income-print-pay-qr", fullUrl);
      setPayQrUrl(fullUrl);
    } catch (e) { setError(e.message || "上传失败"); }
    finally { setQrUploading(false); }
  }

  function downloadCsvTemplate() {
    const csv = "﻿" + (csvTemplates[entity] || "");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${entity}-template.csv`;
    a.click();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-slate-100 p-2.5 text-slate-600"><HardDrive className="h-5 w-5" /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">系统设置</h1>
            <p className="text-sm text-slate-500">数据导入与管理</p>
          </div>
        </div>
      </section>

      {/* 打印收款码 */}
      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <div className="flex items-center gap-2 mb-3"><QrCode className="h-4 w-4 text-slate-600" /><h2 className="font-semibold text-slate-900">打印账单收款码</h2></div>
        <p className="text-sm text-slate-500 mb-3">上传后将显示在账单打印页的右下角。</p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-xl border border-blue-200 px-4 py-2 text-sm text-blue-700 hover:bg-blue-50">
            <Upload className="mr-1 inline h-4 w-4" />{qrUploading ? "上传中..." : "上传收款码"}
            <input className="hidden" type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) handleQrUpload(f); e.target.value = ""; }} />
          </label>
          {payQrUrl && (
            <button className="rounded-xl border border-rose-200 px-4 py-2 text-sm text-rose-700" onClick={() => { updateSettings({ printPayQrUrl: "" }).catch(()=>{}); localStorage.removeItem("income-print-pay-qr"); setPayQrUrl(""); }}>清除</button>
          )}
        </div>
        {payQrUrl && <img src={payQrUrl} alt="收款码" className="mt-3 h-24 w-24 rounded-lg border object-cover" />}
      </section>

      {/* CSV 导入 */}
      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <div className="flex items-center gap-2 mb-3"><Download className="h-4 w-4 text-slate-600" /><h2 className="font-semibold text-slate-900">CSV 数据导入</h2></div>
        <p className="text-sm text-slate-500 mb-3">从旧系统迁移数据，支持房源、租客、账单。</p>
        <div className="flex flex-wrap gap-3 mb-3">
          <select className="rounded-xl border border-slate-300 px-3 py-2 text-sm" value={entity} onChange={e => setEntity(e.target.value)}>
            <option value="tenants">租客</option>
            <option value="properties">房源</option>
            <option value="records">账单</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={overwrite} onChange={e => setOverwrite(e.target.checked)} /> 覆盖已有数据
          </label>
          <button className="rounded-xl border border-slate-300 px-3 py-2 text-sm" onClick={downloadCsvTemplate}>📥 下载模板</button>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100">
          <Upload className="h-4 w-4" />{importing ? "导入中..." : "选择 CSV 文件导入"}
          <input className="hidden" type="file" accept=".csv" onChange={e => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = ""; }} />
        </label>
        {resultText && <div className="mt-3 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">{resultText}</div>}
        {error && <div className="mt-3 rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{error}</div>}
      </section>
    </div>
  );
}
