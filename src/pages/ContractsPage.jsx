import React, { useEffect, useMemo, useState } from "react";
import { Bell, ClipboardSignature, Edit3, FileText, Plus, RefreshCw, Trash2 } from "lucide-react";
import {
  apiEnabled,
  createContract,
  createReminder,
  deleteContract,
  deleteReminder,
  fetchContractReminders,
  fetchContracts,
  fetchReminderAutoStatus,
  fetchReminders,
  fetchTenants,
  runDueReminders,
  updateContract,
  updateReminder,
} from "../lib/api";
import { formatCurrency, formatDate } from "../lib/format";
import ConfirmDialog from "../components/ConfirmDialog";

const CONTRACT_STATUS = [
  { value: "active", label: "生效中" },
  { value: "pending", label: "待生效" },
  { value: "expired", label: "已到期" },
  { value: "terminated", label: "已终止" },
];
const PAY_CYCLES = [
  { value: "monthly", label: "月付" },
  { value: "quarterly", label: "季付" },
  { value: "halfYear", label: "半年付" },
  { value: "yearly", label: "年付" },
];

function makeForm() {
  return {
    tenantId: "",
    rent: "0",
    deposit: "0",
    payCycle: "monthly",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().slice(0, 10),
    status: "active",
    attachmentUrl: "",
    renewalOf: "",
    notes: "",
    reminderEnabled: true,
    daysBefore: "30",
    remindTime: "09:00",
  };
}

function getStatusLabel(value) {
  return CONTRACT_STATUS.find((item) => item.value === value)?.label || value || "-";
}

function getPayCycleLabel(value) {
  return PAY_CYCLES.find((item) => item.value === value)?.label || value || "-";
}

function daysUntil(dateText) {
  const due = new Date(dateText);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / 86400000);
}

function makeRoomText(tenant = {}) {
  return `${tenant.building ? `${tenant.building} ` : ""}${tenant.room || ""}`.trim();
}

function getTenantById(tenants, id) {
  return (tenants || []).find((tenant) => String(tenant.id || "") === String(id || ""));
}

function buildReminderPayload(contract, tenant, form) {
  return {
    tenantId: contract.tenantId,
    room: makeRoomText(tenant),
    daysBefore: Number(form.daysBefore || 30),
    remindTime: form.remindTime || "09:00",
    dueDate: contract.endDate,
    enabled: Boolean(form.reminderEnabled),
  };
}

export default function ContractsPage() {
  const [contracts, setContracts] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(apiEnabled);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dueFilter, setDueFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(makeForm());
  const [modalError, setModalError] = useState("");
  const [runResult, setRunResult] = useState(null);
  const [contractReminders, setContractReminders] = useState([]);
  const [autoReminderStatus, setAutoReminderStatus] = useState(null);
  const [confirmState, setConfirmState] = useState({ open: false, title: "", message: "", onConfirm: null });

  function openConfirm(title, message, onConfirm) {
    setConfirmState({ open: true, title, message, onConfirm });
  }
  function closeConfirm() {
    setConfirmState({ open: false, title: "", message: "", onConfirm: null });
  }

  async function load() {
    if (!apiEnabled) {
      setLoading(false);
      setError("未连接后端，合同管理需要后端服务");
      return;
    }
    setLoading(true);
    try {
      const [contractRows, tenantRows, reminderRows, dueRows] = await Promise.all([fetchContracts(), fetchTenants(), fetchReminders(), fetchContractReminders()]);
      const autoStatus = await fetchReminderAutoStatus().catch(() => null);
      setContracts(Array.isArray(contractRows) ? contractRows : []);
      setTenants(Array.isArray(tenantRows) ? tenantRows : []);
      setReminders(Array.isArray(reminderRows) ? reminderRows : []);
      setContractReminders(Array.isArray(dueRows) ? dueRows : []);
      setAutoReminderStatus(autoStatus);
      setError("");
    } catch (e) {
      setError(e.message || "读取合同数据失败，请检查后端服务");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const reminderByTenant = useMemo(() => {
    const map = new Map();
    for (const item of reminders || []) {
      if (!item.tenantId) continue;
      const prev = map.get(String(item.tenantId));
      if (!prev || String(item.updatedAt || item.createdAt || "") > String(prev.updatedAt || prev.createdAt || "")) {
        map.set(String(item.tenantId), item);
      }
    }
    return map;
  }, [reminders]);

  const dueByContract = useMemo(() => {
    const map = new Map();
    for (const row of contractReminders || []) {
      if (row.contractId) map.set(String(row.contractId), row);
    }
    return map;
  }, [contractReminders]);

  const enrichedContracts = useMemo(() => {
    return (contracts || []).map((contract) => {
      const tenant = getTenantById(tenants, contract.tenantId);
      const dueDays = daysUntil(contract.endDate);
      const reminder = reminderByTenant.get(String(contract.tenantId || "")) || null;
      const dueInfo = dueByContract.get(String(contract.id || "")) || null;
      return {
        ...contract,
        tenant,
        tenantName: tenant?.name || "未知租客",
        roomText: makeRoomText(tenant),
        dueDays: dueInfo?.daysLeft ?? dueDays,
        reminder,
        dueLevel: dueInfo?.level || "normal",
      };
    });
  }, [contracts, tenants, reminderByTenant, dueByContract]);

  const metrics = useMemo(() => {
    const active = enrichedContracts.filter((item) => item.status === "active").length;
    const due30 = enrichedContracts.filter((item) => item.dueDays != null && item.dueDays >= 0 && item.dueDays <= 30).length;
    const expired = enrichedContracts.filter((item) => item.dueDays != null && item.dueDays < 0).length;
    const reminderOn = reminders.filter((item) => item.enabled !== false).length;
    return { total: enrichedContracts.length, active, due30, expired, reminderOn };
  }, [enrichedContracts, reminders]);

  const list = useMemo(() => {
    const q = keyword.trim();
    return enrichedContracts
      .filter((item) => {
        if (statusFilter !== "all" && item.status !== statusFilter) return false;
        if (dueFilter === "due30" && !(item.dueDays != null && item.dueDays >= 0 && item.dueDays <= 30)) return false;
        if (dueFilter === "expired" && !(item.dueDays != null && item.dueDays < 0)) return false;
        if (!q) return true;
        return [item.tenantName, item.roomText, item.notes, item.attachmentUrl].some((value) => String(value || "").includes(q));
      })
      .sort((a, b) => String(a.endDate || "").localeCompare(String(b.endDate || ""), "zh-Hans-CN", { numeric: true }));
  }, [enrichedContracts, keyword, statusFilter, dueFilter]);

  function openCreate() {
    const next = makeForm();
    const firstTenant = tenants.find((tenant) => !tenant.archived) || tenants[0];
    if (firstTenant) {
      next.tenantId = firstTenant.id;
      next.rent = String(firstTenant.rent || 0);
      next.deposit = String(firstTenant.deposit || 0);
      next.startDate = firstTenant.leaseStart || next.startDate;
      next.endDate = firstTenant.leaseEnd || next.endDate;
    }
    setEditing(null);
    setForm(next);
    setModalError("");
    setModalOpen(true);
  }

  function openEdit(item) {
    const reminder = item.reminder || {};
    setEditing(item);
    setForm({
      tenantId: item.tenantId || "",
      rent: String(item.rent ?? 0),
      deposit: String(item.deposit ?? 0),
      payCycle: item.payCycle || "monthly",
      startDate: item.startDate || "",
      endDate: item.endDate || "",
      status: item.status || "active",
      attachmentUrl: item.attachmentUrl || "",
      renewalOf: item.renewalOf || "",
      notes: item.notes || "",
      reminderEnabled: reminder.enabled !== false,
      daysBefore: String(reminder.daysBefore ?? 30),
      remindTime: reminder.remindTime || "09:00",
    });
    setModalError("");
    setModalOpen(true);
  }

  function onTenantChange(tenantId) {
    const tenant = getTenantById(tenants, tenantId);
    setForm((prev) => ({
      ...prev,
      tenantId,
      rent: String(tenant?.rent ?? prev.rent ?? 0),
      deposit: String(tenant?.deposit ?? prev.deposit ?? 0),
      startDate: tenant?.leaseStart || prev.startDate,
      endDate: tenant?.leaseEnd || prev.endDate,
    }));
  }

  async function save() {
    try {
      if (!form.tenantId) {
        setModalError("请选择租客");
        return;
      }
      if (!form.startDate || !form.endDate) {
        setModalError("请填写合同起止日期");
        return;
      }
      if (String(form.endDate) < String(form.startDate)) {
        setModalError("合同结束日期不能早于开始日期");
        return;
      }
      const tenant = getTenantById(tenants, form.tenantId);
      const payload = {
        tenantId: form.tenantId,
        rent: Number(form.rent || 0),
        deposit: Number(form.deposit || 0),
        payCycle: form.payCycle,
        startDate: form.startDate,
        endDate: form.endDate,
        status: form.status,
        attachmentUrl: form.attachmentUrl.trim(),
        renewalOf: form.renewalOf.trim(),
        notes: form.notes.trim(),
      };
      const saved = editing ? await updateContract(editing.id, payload) : await createContract(payload);
      const reminderPayload = buildReminderPayload(saved, tenant, form);
      const existingReminder = editing?.reminder || reminderByTenant.get(String(saved.tenantId || ""));
      if (existingReminder) {
        const updated = await updateReminder(existingReminder.id, reminderPayload);
        setReminders((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      } else if (form.reminderEnabled) {
        const created = await createReminder(reminderPayload);
        setReminders((prev) => [created, ...prev]);
      }
      setContracts((prev) => (editing ? prev.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...prev]));
      setModalOpen(false);
      setEditing(null);
      setError("");
    } catch (e) {
      setModalError(e.message || "保存合同失败");
    }
  }

  async function removeContract(item) {
    openConfirm("删除合同", `确认删除合同：${item.tenantName} / ${formatDate(item.startDate)} ~ ${formatDate(item.endDate)}？`, async () => {
      closeConfirm();
      try {
        await deleteContract(item.id);
        setContracts((prev) => prev.filter((contract) => contract.id !== item.id));
        setError("");
      } catch (e) {
        setError(e.message || "删除合同失败");
      }
    });
  }

  async function toggleReminder(item) {
    try {
      const tenant = item.tenant;
      const reminder = item.reminder;
      if (reminder) {
        const updated = await updateReminder(reminder.id, { ...reminder, enabled: reminder.enabled === false });
        setReminders((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      } else {
        const created = await createReminder({ tenantId: item.tenantId, room: makeRoomText(tenant), daysBefore: 30, remindTime: "09:00", dueDate: item.endDate, enabled: true });
        setReminders((prev) => [created, ...prev]);
      }
      setError("");
    } catch (e) {
      setError(e.message || "更新提醒失败");
    }
  }

  async function removeReminder(item) {
    if (!item.reminder) return;
    openConfirm("删除到期提醒", "确认删除该合同到期提醒？", async () => {
      closeConfirm();
      try {
        await deleteReminder(item.reminder.id);
        setReminders((prev) => prev.filter((row) => row.id !== item.reminder.id));
        setError("");
      } catch (e) {
        setError(e.message || "删除提醒失败");
      }
    });
  }

  async function runTodayReminders() {
    try {
      const result = await runDueReminders();
      setRunResult(result);
      const reminderRows = await fetchReminders();
      setReminders(Array.isArray(reminderRows) ? reminderRows : []);
      setError("");
    } catch (e) {
      setError(e.message || "运行提醒失败");
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <div className="flex items-center gap-3 mb-3"><div className="rounded-xl bg-indigo-100 p-2.5 text-indigo-700"><ClipboardSignature className="h-5 w-5" /></div><div><h1 className="text-2xl font-bold text-slate-900">合同管理</h1><p className="text-sm text-slate-500">租约管理、到期提醒、续租跟踪</p></div></div>
            <h1 className="hidden">合同管理</h1>
            <p className="mt-1 text-sm text-slate-500">集中管理租约、续租记录、附件链接和到期提醒。</p>
          </div>
          <button className="ui-btn-primary ml-auto" type="button" onClick={openCreate}><Plus className="mr-1 inline h-4 w-4" />新增合同</button>
          <button className="ui-btn-secondary" type="button" onClick={load}><RefreshCw className="mr-1 inline h-4 w-4" />刷新</button>
          <button className="ui-btn-secondary" type="button" onClick={runTodayReminders}><Bell className="mr-1 inline h-4 w-4" />运行今日提醒</button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <button className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left" type="button" onClick={() => { setStatusFilter("all"); setDueFilter("all"); }}><div className="text-xs text-slate-500">合同总数</div><div className="mt-1 text-2xl font-semibold">{metrics.total}</div></button>
          <button className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-left" type="button" onClick={() => setStatusFilter("active")}><div className="text-xs text-emerald-700">生效中</div><div className="mt-1 text-2xl font-semibold text-emerald-700">{metrics.active}</div></button>
          <button className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left" type="button" onClick={() => setDueFilter("due30")}><div className="text-xs text-amber-700">30天内到期</div><div className="mt-1 text-2xl font-semibold text-amber-700">{metrics.due30}</div></button>
          <button className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-left" type="button" onClick={() => setDueFilter("expired")}><div className="text-xs text-rose-700">已过期</div><div className="mt-1 text-2xl font-semibold text-rose-700">{metrics.expired}</div></button>
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4"><div className="text-xs text-sky-700">启用提醒</div><div className="mt-1 text-2xl font-semibold text-sky-700">{metrics.reminderOn}</div></div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input className="ui-input w-full max-w-md border-slate-300" placeholder="搜索租客、房号、备注、附件" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          <select className="ui-input w-36 border-slate-300" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">全部状态</option>
            {CONTRACT_STATUS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <select className="ui-input w-40 border-slate-300" value={dueFilter} onChange={(e) => setDueFilter(e.target.value)}>
            <option value="all">全部到期</option>
            <option value="due30">30天内到期</option>
            <option value="expired">已过期</option>
          </select>
        </div>
        {loading ? <p className="mt-3 text-sm text-slate-500">正在读取合同数据...</p> : null}
        {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
        {runResult ? <p className="mt-3 text-sm text-sky-700">今日提醒检查：{runResult.date}，触发 {runResult.count || 0} 条。</p> : null}
        {autoReminderStatus ? <p className="mt-2 text-sm text-emerald-700">自动提醒任务：已启用（每日 {String(autoReminderStatus.runAtHour || 9).padStart(2, "0")}:00 后每小时检查一次）</p> : null}
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="ui-table min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-left">租客/房号</th>
                <th className="px-3 py-2 text-left">合同日期</th>
                <th className="px-3 py-2 text-left">租金/押金</th>
                <th className="px-3 py-2 text-left">状态</th>
                <th className="px-3 py-2 text-left">到期</th>
                <th className="px-3 py-2 text-left">提醒</th>
                <th className="px-3 py-2 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="px-3 py-2"><div className="font-medium text-slate-900">{item.tenantName}</div><div className="text-xs text-slate-500">{item.roomText || "-"}</div></td>
                  <td className="px-3 py-2"><div>{formatDate(item.startDate)} ~ {formatDate(item.endDate)}</div><div className="text-xs text-slate-500">{getPayCycleLabel(item.payCycle)}</div></td>
                  <td className="px-3 py-2"><div>{formatCurrency(item.rent || 0)}</div><div className="text-xs text-slate-500">押金 {formatCurrency(item.deposit || 0)}</div></td>
                  <td className="px-3 py-2">{getStatusLabel(item.status)}</td>
                  <td className="px-3 py-2"><span className={item.dueDays == null ? "text-slate-500" : item.dueDays < 0 ? "text-rose-700" : item.dueDays <= 30 ? "text-amber-700" : "text-slate-700"}>{item.dueDays == null ? "-" : item.dueDays < 0 ? `已过期 ${Math.abs(item.dueDays)} 天` : `${item.dueDays} 天后`}</span></td>
                  <td className="px-3 py-2"><div>{item.reminder ? (item.reminder.enabled === false ? "已停用" : "已启用") : "未设置"}</div>{item.reminder ? <div className="text-xs text-slate-500">提前 {item.reminder.daysBefore} 天 · {item.reminder.remindTime}</div> : null}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-700" type="button" onClick={() => openEdit(item)}><Edit3 className="mr-1 inline h-3.5 w-3.5" />编辑</button>
                      <button className="rounded-lg border border-sky-300 px-2 py-1 text-xs text-sky-700" type="button" onClick={() => toggleReminder(item)}>{item.reminder?.enabled === false ? "启用提醒" : item.reminder ? "停用提醒" : "创建提醒"}</button>
                      {item.reminder ? <button className="rounded-lg border border-amber-300 px-2 py-1 text-xs text-amber-700" type="button" onClick={() => removeReminder(item)}>删提醒</button> : null}
                      <button className="rounded-lg border border-rose-300 px-2 py-1 text-xs text-rose-700" type="button" onClick={() => removeContract(item)}><Trash2 className="mr-1 inline h-3.5 w-3.5" />删除</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!list.length ? <tr><td className="px-3 py-4 text-slate-500" colSpan={7}>暂无合同记录</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/35 p-4">
          <div className="my-4 w-full max-w-3xl rounded-2xl bg-white p-5 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-xl font-semibold">{editing ? "编辑合同" : "新增合同"}</h3>
              <button className="rounded-xl border border-slate-300 px-3 py-2 text-sm" type="button" onClick={() => setModalOpen(false)}>关闭</button>
            </div>
            {modalError ? <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{modalError}</div> : null}
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">租客
                <select className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 px-3" value={form.tenantId} onChange={(e) => onTenantChange(e.target.value)} disabled={Boolean(editing)}>
                  <option value="">请选择租客</option>
                  {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name || "未命名"} · {makeRoomText(tenant) || "无房号"}</option>)}
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-700">状态
                <select className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 px-3" value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}>{CONTRACT_STATUS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
              </label>
              <label className="text-sm font-semibold text-slate-700">开始日期<input type="date" className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 px-3" value={form.startDate} onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))} /></label>
              <label className="text-sm font-semibold text-slate-700">结束日期<input type="date" className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 px-3" value={form.endDate} onChange={(e) => setForm((prev) => ({ ...prev, endDate: e.target.value }))} /></label>
              <label className="text-sm font-semibold text-slate-700">租金<input className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 px-3" value={form.rent} onChange={(e) => setForm((prev) => ({ ...prev, rent: e.target.value }))} /></label>
              <label className="text-sm font-semibold text-slate-700">押金<input className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 px-3" value={form.deposit} onChange={(e) => setForm((prev) => ({ ...prev, deposit: e.target.value }))} /></label>
              <label className="text-sm font-semibold text-slate-700">付款周期<select className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 px-3" value={form.payCycle} onChange={(e) => setForm((prev) => ({ ...prev, payCycle: e.target.value }))}>{PAY_CYCLES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              <label className="text-sm font-semibold text-slate-700">续租来源合同ID<input className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 px-3" placeholder="可留空" value={form.renewalOf} onChange={(e) => setForm((prev) => ({ ...prev, renewalOf: e.target.value }))} /></label>
              <label className="text-sm font-semibold text-slate-700 md:col-span-2">合同附件链接<input className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 px-3" placeholder="可填写本地/NAS/网盘附件路径" value={form.attachmentUrl} onChange={(e) => setForm((prev) => ({ ...prev, attachmentUrl: e.target.value }))} /></label>
              <label className="text-sm font-semibold text-slate-700 md:col-span-2">备注<textarea className="mt-1.5 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2" value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} /></label>
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 md:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <div><div className="font-semibold text-slate-900">到期提醒</div><div className="mt-1 text-xs text-slate-500">保存合同时同步创建或更新该租客的合同到期提醒。</div></div>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.reminderEnabled} onChange={(e) => setForm((prev) => ({ ...prev, reminderEnabled: e.target.checked }))} />启用</label>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="text-sm font-semibold text-slate-700">提前天数<input className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 px-3" value={form.daysBefore} onChange={(e) => setForm((prev) => ({ ...prev, daysBefore: e.target.value.replace(/[^\d]/g, "") }))} /></label>
                  <label className="text-sm font-semibold text-slate-700">提醒时间<input type="time" className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 px-3" value={form.remindTime} onChange={(e) => setForm((prev) => ({ ...prev, remindTime: e.target.value }))} /></label>
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded-xl border border-slate-300 px-4 py-2 text-sm" type="button" onClick={() => setModalOpen(false)}>取消</button>
              <button className="ui-btn-primary" type="button" onClick={save}><FileText className="mr-1 inline h-4 w-4" />保存合同</button>
            </div>
          </div>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        tone="danger"
        onCancel={closeConfirm}
        onConfirm={() => {
          const fn = confirmState.onConfirm;
          if (typeof fn === "function") fn();
        }}
      />
    </div>
  );
}
