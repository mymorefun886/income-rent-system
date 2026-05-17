import React, { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Copy, FilePlus2, RefreshCw, Send } from "lucide-react";
import ConfirmDialog from "../components/ConfirmDialog";
import { apiEnabled, createRecord, fetchProperties, fetchRecords, fetchTenants, markBillsSentBatch, updateRecord } from "../lib/api";
import { formatCurrency, getStatusTone } from "../lib/format";
import { makeRoomKey } from "../lib/roomKey";

function currentCycle() { return new Date().toISOString().slice(0, 7); }

function parseRecordRoom(roomText = "") {
  const text = String(roomText || "").trim();
  if (!text) return { building: "", room: "" };
  // 兼容 "西山东区17号 - 101" 和 "西山东区17号 101" 两种格式
  const idxDash = text.indexOf(" - ");
  const idxSpace = text.lastIndexOf(" ");
  if (idxDash >= 0) {
    return { building: String(text.slice(0, idxDash) || "").trim(), room: String(text.slice(idxDash + 3) || "").trim() };
  }
  if (idxSpace >= 0) {
    return { building: String(text.slice(0, idxSpace) || "").trim(), room: String(text.slice(idxSpace + 1) || "").trim() };
  }
  return { building: "", room: text };
}

function paidAmount(record) {
  if (Array.isArray(record.payments) && record.payments.length) return record.payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  return Number(record.received || 0);
}

function deriveStatus(record) {
  const receivable = Number(record.receivable || 0);
  const received = paidAmount(record);
  if (received >= receivable && receivable > 0) return "已收";
  if (received > 0) return "部分收款";
  const due = new Date(record.dueDate || "");
  if (!Number.isNaN(due.getTime()) && due.getTime() < Date.now()) return "逾期";
  return "待收";
}

function fixedFeeTotal(tenant) {
  const feeItems = Array.isArray(tenant.feeItems) ? tenant.feeItems : [];
  return feeItems.reduce((sum, item) => {
    const mode = String(item.billingMode || "");
    const name = String(item.name || "");
    if (mode === "抄表计算" || /水|电/.test(name)) return sum;
    return sum + Number(item.unitPrice || 0);
  }, 0);
}

function buildBillText(record) {
  const unpaid = Math.max(0, Number(record.receivable || 0) - paidAmount(record));
  return ["【收租账单】", `账期：${record.cycle || "-"}`, `房号：${record.room || "-"}`, `租客：${record.tenant || "-"}`, `租金：¥${Math.round(Number(record.rentPart || 0))}`, `应收：¥${Math.round(Number(record.receivable || 0))}`, `已收：¥${Math.round(paidAmount(record))}`, `未收：¥${Math.round(unpaid)}`, `到期：${record.dueDate || "-"}`].join("\n");
}

export default function MonthlyRentWorkbenchPage() {
  const [cycle, setCycle] = useState(currentCycle());
  const [records, setRecords] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [properties, setProperties] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(apiEnabled);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmState, setConfirmState] = useState({ open: false, title: "", message: "", tone: "warn", resolve: null });

  function closeConfirm(result = false) { const resolver = confirmState.resolve; setConfirmState({ open: false, title: "", message: "", tone: "warn", resolve: null }); if (typeof resolver === "function") resolver(result); }
  function askConfirm(title, message, tone = "warn") { return new Promise((resolve) => { setConfirmState({ open: true, title, message, tone, resolve }); }); }

  async function load() {
    if (!apiEnabled) { setLoading(false); setMessage("未连接后端 API"); return; }
    setLoading(true);
    try {
      const [r, t, p] = await Promise.all([fetchRecords(), fetchTenants(), fetchProperties()]);
      setRecords(Array.isArray(r) ? r : []);
      setTenants((Array.isArray(t) ? t : []).filter((x) => !x.archived));
      setProperties(Array.isArray(p) ? p : []);
      setMessage("");
    } catch (e) { setMessage(e.message || "读取失败"); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const cycleRecords = useMemo(() => records.filter((r) => String(r.cycle || "").trim() === cycle), [records, cycle]);

  const existingKeys = useMemo(() => {
    const set = new Set();
    cycleRecords.forEach((r) => {
      const parsed = parseRecordRoom(r.room);
      set.add(makeRoomKey(parsed.building, parsed.room));
    });
    return set;
  }, [cycleRecords]);

  const missingBills = useMemo(() => tenants.filter((t) => String(t.room || "").trim()).filter((t) => !existingKeys.has(makeRoomKey(t.building, t.room))).map((t) => {
    const rent = Number(t.rent || 0);
    const fixed = fixedFeeTotal(t);
    return { tenant: t, roomText: `${t.building ? `${t.building} ` : ""}${t.room || ""}`, rent, fixed, receivable: rent + fixed };
  }).sort((a, b) => a.roomText.localeCompare(b.roomText, "zh-Hans-CN", { numeric: true })), [tenants, existingKeys]);

  const summary = useMemo(() => {
    const receivable = cycleRecords.reduce((sum, r) => sum + Number(r.receivable || 0), 0);
    const received = cycleRecords.reduce((sum, r) => sum + paidAmount(r), 0);
    const sent = cycleRecords.filter((r) => String(r.sentStatus || "") === "sent").length;
    return { total: cycleRecords.length, receivable, received, unpaid: Math.max(0, receivable - received), sent };
  }, [cycleRecords]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  function toggleSelect(id) { setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])); }
  function toggleSelectAll() { const ids = cycleRecords.map((r) => r.id); setSelectedIds(ids.length && ids.every((id) => selectedSet.has(id)) ? [] : ids); }

  async function createMissingBills() {
    if (!missingBills.length) { setMessage("当前账期没有缺失账单"); return; }
    const ok = await askConfirm("生成缺失账单", `确认生成 ${missingBills.length} 条 ${cycle} 账单？`, "warn");
    if (!ok) return;
    setWorking(true);
    try {
      const dueDate = `${cycle}-05`;
      const created = [];
      for (const item of missingBills) {
        const roomKey = makeRoomKey(item.tenant.building, item.tenant.room);
        const lastRecord = records.filter((r) => makeRoomKey(r.building || "", r.roomNo || r.room || "") === roomKey).sort((a, b) => String(b.cycle || "").localeCompare(String(a.cycle || "")))[0];
        const prop = properties.find((p) => makeRoomKey(p.building, p.room) === roomKey);
        const noWaterMeter = Boolean(prop?.noWaterMeter);
        const feeItems = Array.isArray(item.tenant.feeItems) ? item.tenant.feeItems : [];
        const elecPrice = lastRecord?.electricPrice || feeItems.find((f) => String(f.name || "").includes("电"))?.unitPrice || "0.8";
        const waterPrice = lastRecord?.waterPrice || feeItems.find((f) => String(f.name || "").includes("水"))?.unitPrice || "5.5";
        const payload = {
          tenant: item.tenant.name || "", tenantId: item.tenant.id || "", room: item.roomText, building: item.tenant.building || "", roomNo: item.tenant.room || "", roomKey, cycle, rentPart: item.rent, receivable: item.receivable, received: 0, payments: [], status: "待收", method: "微信", dueDate, paidAt: "-",
          note: item.fixed ? `月度工作台生成，含固定费用 ${item.fixed}` : "月度工作台生成",
          electricPrev: String(lastRecord?.electricNow ?? ""), electricPrice: String(elecPrice),
          waterPrev: String(lastRecord?.waterNow ?? ""), waterPrice: String(waterPrice), noWaterMeter,
          propertyFee: String(lastRecord?.propertyFee ?? feeItems.find((f) => String(f.name || "").includes("物业"))?.unitPrice ?? "0"),
          networkFee: String(lastRecord?.networkFee ?? feeItems.find((f) => String(f.name || "").includes("网络") || String(f.name || "").includes("宽带"))?.unitPrice ?? "0"),
          garbageFee: String(lastRecord?.garbageFee ?? feeItems.find((f) => String(f.name || "").includes("税费") || String(f.name || "").includes("垃圾"))?.unitPrice ?? "0"),
        };
        created.push(await createRecord(payload));
      }
      setRecords((prev) => [...created, ...prev]);
      setMessage(`已生成 ${created.length} 条账单`);
    } catch (e) { setMessage(e.message || "生成失败"); }
    finally { setWorking(false); }
  }

  async function markSelectedPaid() {
    if (!cycleRecords.filter((r) => selectedSet.has(r.id)).length) { setMessage("请先勾选账单"); return; }
    const records = cycleRecords.filter((r) => selectedSet.has(r.id));
    const ok = await askConfirm("批量标记已收", `确认将 ${records.length} 条账单标记为已收？`, "warn");
    if (!ok) return;
    setWorking(true);
    try {
      const paidAt = new Date().toISOString().slice(0, 10);
      for (const record of records) {
        const amount = Number(record.receivable || 0);
        await updateRecord(record.id, { ...record, received: amount, payments: [{ id: `pay-${Date.now()}-${record.id}`, amount, paidAt, method: record.method || "微信", note: "月度工作台批量标记" }], status: "已收", paidAt });
      }
      await load();
      setSelectedIds([]);
      setMessage(`已标记 ${records.length} 条为已收`);
    } catch (e) { setMessage(e.message || "标记失败"); }
    finally { setWorking(false); }
  }

  function copySelectedBills() {
    const records = cycleRecords.filter((r) => selectedSet.has(r.id));
    if (!records.length) { setMessage("请先勾选账单"); return; }
    navigator.clipboard.writeText(records.map(buildBillText).join("\n\n----------------\n\n")).then(() => setMessage(`已复制 ${records.length} 条账单文本`)).catch((e) => setMessage(e.message || "复制失败"));
  }

  async function markSelectedSent() {
    const ids = cycleRecords.filter((r) => selectedSet.has(r.id)).map((r) => r.id);
    if (!ids.length) { setMessage("请先勾选账单"); return; }
    setWorking(true);
    try {
      await markBillsSentBatch({ recordIds: ids, status: "sent" });
      setRecords((prev) => prev.map((r) => ids.includes(r.id) ? { ...r, sentStatus: "sent", sentAt: new Date().toISOString() } : r));
      setMessage("已标记已发");
    } catch (e) { setMessage(e.message || "标记失败"); }
    finally { setWorking(false); }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 mb-1"><div className="rounded-xl bg-emerald-100 p-2.5 text-emerald-700"><CalendarDays className="h-5 w-5" /></div><div><h1 className="text-2xl font-bold text-slate-900">月度收租工作台</h1><p className="text-sm text-slate-500">生成、核对、标记已收、标记已发</p></div></div>
          <input className="ui-input border-slate-300" type="month" value={cycle} onChange={(e) => { setCycle(e.target.value); setSelectedIds([]); }} />
          <button className="ui-btn border-slate-300" type="button" onClick={load} disabled={loading || working}><RefreshCw className="mr-1 h-4 w-4" />刷新</button>
        </div>
        <p className="mt-2 text-sm text-slate-500">一个页面完成本月账单生成、核对、收款、发送。</p>
        {message && <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">{message}</div>}
      </section>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <div className="grid gap-3 md:grid-cols-5">
          <div className="rounded-xl border border-slate-200 p-3"><div className="text-xs text-slate-500">账单数</div><div className="mt-1 text-xl font-semibold">{summary.total}</div></div>
          <div className="rounded-xl border border-slate-200 p-3"><div className="text-xs text-slate-500">应收</div><div className="mt-1 text-xl font-semibold">{formatCurrency(summary.receivable)}</div></div>
          <div className="rounded-xl border border-slate-200 p-3"><div className="text-xs text-slate-500">已收</div><div className="mt-1 text-xl font-semibold text-emerald-700">{formatCurrency(summary.received)}</div></div>
          <div className="rounded-xl border border-slate-200 p-3"><div className="text-xs text-slate-500">未收</div><div className="mt-1 text-xl font-semibold text-rose-700">{formatCurrency(summary.unpaid)}</div></div>
          <div className="rounded-xl border border-slate-200 p-3"><div className="text-xs text-slate-500">已发送</div><div className="mt-1 text-xl font-semibold text-sky-700">{summary.sent}</div></div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="rounded-lg border border-emerald-400 px-3 py-1.5 text-sm text-emerald-800" type="button" onClick={createMissingBills} disabled={working || loading}><FilePlus2 className="mr-1 inline h-4 w-4" />生成缺失账单（{missingBills.length}）</button>
          <button className="rounded-lg border border-blue-400 px-3 py-1.5 text-sm text-blue-800" type="button" onClick={markSelectedPaid} disabled={working || loading}><CheckCircle2 className="mr-1 inline h-4 w-4" />批量标记已收</button>
          <button className="rounded-lg border border-amber-400 px-3 py-1.5 text-sm text-amber-800" type="button" onClick={copySelectedBills}><Copy className="mr-1 inline h-4 w-4" />复制账单文本</button>
          <button className="rounded-lg border border-sky-400 px-3 py-1.5 text-sm text-sky-800" type="button" onClick={markSelectedSent} disabled={working || loading}><Send className="mr-1 inline h-4 w-4" />批量标记已发</button>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{cycle} 账单列表</h2>
          <button className="ui-btn border-slate-300" type="button" onClick={toggleSelectAll}>{cycleRecords.length && cycleRecords.every((r) => selectedSet.has(r.id)) ? "取消全选" : "全选"}</button>
        </div>
        <div className="overflow-auto rounded-xl border border-slate-100">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-2 py-2 text-left w-8"><input type="checkbox" checked={cycleRecords.length > 0 && cycleRecords.every((r) => selectedSet.has(r.id))} onChange={toggleSelectAll} /></th>
                <th className="px-2 py-2 text-left">房号</th><th className="px-2 py-2 text-left">租客</th><th className="px-2 py-2 text-left">应收</th><th className="px-2 py-2 text-left">已收</th><th className="px-2 py-2 text-left">状态</th><th className="px-2 py-2 text-left">发送</th>
              </tr>
            </thead>
            <tbody>
              {cycleRecords.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-2 py-2"><input type="checkbox" checked={selectedSet.has(r.id)} onChange={() => toggleSelect(r.id)} /></td>
                  <td className="px-2 py-2">{r.room || "-"}</td><td className="px-2 py-2">{r.tenant || "-"}</td><td className="px-2 py-2">{formatCurrency(r.receivable)}</td><td className="px-2 py-2">{formatCurrency(paidAmount(r))}</td><td className="px-2 py-2"><span className={`rounded px-1.5 py-0.5 text-xs ${getStatusTone(deriveStatus(r))}`}>{deriveStatus(r)}</span></td><td className="px-2 py-2">{r.sentStatus === "sent" ? "已发" : "待发"}</td>
                </tr>
              ))}
              {!cycleRecords.length && <tr><td className="px-2 py-3 text-slate-500 text-center" colSpan={7}>暂无账单</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <ConfirmDialog open={confirmState.open} title={confirmState.title} message={confirmState.message} tone={confirmState.tone} onCancel={() => closeConfirm(false)} onConfirm={() => closeConfirm(true)} />
    </div>
  );
}
