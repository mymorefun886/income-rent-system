import React, { useEffect, useMemo, useState } from "react";
import { Edit3, ImagePlus, Plus, RefreshCw, Trash2, Wrench } from "lucide-react";
import {
  apiEnabled,
  createWorkOrder,
  deleteWorkOrder,
  fetchExpenses,
  fetchProperties,
  fetchTenants,
  fetchWorkOrders,
  updateWorkOrder,
  uploadFile,
} from "../lib/api";
import { formatCurrency, formatDate } from "../lib/format";
import ConfirmDialog from "../components/ConfirmDialog";

const STATUS_OPTIONS = [
  { value: "open", label: "待处理", tone: "bg-amber-100 text-amber-700" },
  { value: "in_progress", label: "处理中", tone: "bg-sky-100 text-sky-700" },
  { value: "done", label: "已完成", tone: "bg-emerald-100 text-emerald-700" },
  { value: "cancelled", label: "已取消", tone: "bg-slate-200 text-slate-700" },
];
const TYPE_OPTIONS = ["水电维修", "家电维修", "门窗锁具", "墙面地面", "管道漏水", "日常维修", "其他"];
const PAYMENT_METHODS = ["微信", "支付宝", "现金", "银行卡", "未支付"];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function getPeriod(dateText) {
  return String(dateText || today()).slice(0, 7);
}

function makeForm() {
  return {
    type: "日常维修",
    building: "",
    room: "",
    propertyId: "",
    propertyLabel: "",
    description: "",
    photos: [],
    photoInput: "",
    status: "open",
    amount: "0",
    date: today(),
    payee: "",
    paymentMethod: "微信",
    invoiceNo: "",
  };
}

function normalizeRoomKey(value) {
  return String(value || "").replace(/\s+/g, "").toUpperCase();
}

function makeRoomKey(building, room) {
  return `${String(building || "").trim()}::${normalizeRoomKey(room)}`;
}

function statusMeta(value) {
  return STATUS_OPTIONS.find((item) => item.value === value) || STATUS_OPTIONS[0];
}

function roomText(item = {}) {
  return `${item.building ? `${item.building} ` : ""}${item.room || ""}`.trim();
}

function toPreviewUrl(url) {
  return String(url || "");
}

export default function WorkOrdersPage() {
  const [workOrders, setWorkOrders] = useState([]);
  const [properties, setProperties] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(apiEnabled);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(makeForm());
  const [modalError, setModalError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [photoManagerTarget, setPhotoManagerTarget] = useState(null);
  const [photoSelected, setPhotoSelected] = useState([]);
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
      setError("未连接后端，维修工单需要后端服务");
      return;
    }
    setLoading(true);
    try {
      const [orders, propertyRows, tenantRows, expenseRows] = await Promise.all([fetchWorkOrders(), fetchProperties(), fetchTenants(), fetchExpenses()]);
      setWorkOrders(Array.isArray(orders) ? orders : []);
      setProperties(Array.isArray(propertyRows) ? propertyRows : []);
      setTenants(Array.isArray(tenantRows) ? tenantRows : []);
      setExpenses(Array.isArray(expenseRows) ? expenseRows : []);
      setError("");
    } catch (e) {
      setError(e.message || "读取维修工单失败，请检查后端服务");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const tenantByRoom = useMemo(() => {
    const map = new Map();
    for (const tenant of tenants || []) {
      if (tenant.archived) continue;
      map.set(makeRoomKey(tenant.building, tenant.room), tenant);
    }
    return map;
  }, [tenants]);

  const expenseByWorkOrder = useMemo(() => {
    const map = new Map();
    for (const expense of expenses || []) {
      if (expense.workOrderId) map.set(String(expense.workOrderId), expense);
    }
    return map;
  }, [expenses]);

  const roomOptions = useMemo(() => {
    return (properties || [])
      .map((property) => ({
        id: property.id || "",
        building: property.building || "",
        room: property.room || "",
        label: `${property.building || ""} ${property.room || ""}`.trim(),
      }))
      .filter((item) => item.room)
      .sort((a, b) => `${a.building}${a.room}`.localeCompare(`${b.building}${b.room}`, "zh-Hans-CN", { numeric: true }));
  }, [properties]);

  const enrichedOrders = useMemo(() => {
    return (workOrders || []).map((item) => {
      const tenant = tenantByRoom.get(makeRoomKey(item.building, item.room));
      const linkedExpense = item.expenseId ? expenses.find((expense) => expense.id === item.expenseId) : expenseByWorkOrder.get(String(item.id || ""));
      return { ...item, tenant, linkedExpense };
    });
  }, [workOrders, tenantByRoom, expenseByWorkOrder, expenses]);

  const metrics = useMemo(() => {
    return {
      total: enrichedOrders.length,
      open: enrichedOrders.filter((item) => item.status === "open").length,
      inProgress: enrichedOrders.filter((item) => item.status === "in_progress").length,
      done: enrichedOrders.filter((item) => item.status === "done").length,
      linkedAmount: enrichedOrders.reduce((sum, item) => sum + Number(item.linkedExpense?.amount || 0), 0),
    };
  }, [enrichedOrders]);

  const list = useMemo(() => {
    const q = keyword.trim();
    return enrichedOrders
      .filter((item) => {
        if (statusFilter !== "all" && item.status !== statusFilter) return false;
        if (!q) return true;
        return [item.type, item.description, item.building, item.room, item.tenant?.name, item.payee, item.invoiceNo].some((value) => String(value || "").includes(q));
      })
      .sort((a, b) => String(b.createdAt || b.date || "").localeCompare(String(a.createdAt || a.date || ""), "zh-Hans-CN", { numeric: true }));
  }, [enrichedOrders, keyword, statusFilter]);

  function openCreate() {
    setEditing(null);
    setForm(makeForm());
    setModalError("");
    setModalOpen(true);
  }

  function openEdit(item) {
    setEditing(item);
    setForm({
      type: item.type || "日常维修",
      building: item.building || "",
      room: item.room || "",
      propertyId: item.propertyId || "",
      propertyLabel: item.propertyLabel || item.building || "",
      description: item.description || "",
      photos: Array.isArray(item.photos) ? item.photos : [],
      photoInput: "",
      status: item.status || "open",
      amount: String(item.amount ?? item.linkedExpense?.amount ?? 0),
      date: item.date || item.linkedExpense?.date || today(),
      payee: item.payee || item.linkedExpense?.payee || "",
      paymentMethod: item.paymentMethod || item.linkedExpense?.paymentMethod || "微信",
      invoiceNo: item.invoiceNo || item.linkedExpense?.invoiceNo || "",
    });
    setModalError("");
    setModalOpen(true);
  }

  function onRoomSelect(value) {
    const found = roomOptions.find((item) => item.label === value);
    if (!found) return;
    setForm((prev) => ({ ...prev, building: found.building, room: found.room, propertyId: found.id, propertyLabel: found.building }));
  }

  function addPhotoUrl() {
    const url = form.photoInput.trim();
    if (!url) return;
    setForm((prev) => ({ ...prev, photos: [...prev.photos, url], photoInput: "" }));
  }

  function removePhoto(index) {
    setForm((prev) => ({ ...prev, photos: prev.photos.filter((_, i) => i !== index) }));
  }

  async function handlePhotoUpload(files) {
    const selected = Array.from(files || []);
    if (!selected.length) return;
    setUploading(true);
    try {
      const uploaded = await Promise.all(selected.map((file) => uploadFile(file)));
      const urls = uploaded.map((item) => item.url).filter(Boolean);
      setForm((prev) => ({ ...prev, photos: [...prev.photos, ...urls] }));
      setModalError("");
    } catch (e) {
      setModalError(e.message || "照片上传失败");
    } finally {
      setUploading(false);
    }
  }

  function buildPayload(nextForm = form) {
    return {
      type: nextForm.type,
      building: nextForm.building,
      room: nextForm.room,
      propertyId: nextForm.propertyId,
      propertyLabel: nextForm.propertyLabel || nextForm.building,
      description: nextForm.description.trim(),
      photos: nextForm.photos,
      status: nextForm.status,
      amount: Number(nextForm.amount || 0),
      date: nextForm.date || today(),
      period: getPeriod(nextForm.date),
      payee: nextForm.payee.trim(),
      paymentMethod: nextForm.paymentMethod,
      invoiceNo: nextForm.invoiceNo.trim(),
    };
  }

  async function save() {
    try {
      if (!form.building || !form.room) {
        setModalError("请选择房号");
        return;
      }
      if (!form.type) {
        setModalError("请选择维修类型");
        return;
      }
      if (!form.description.trim()) {
        setModalError("请填写问题描述");
        return;
      }
      const payload = buildPayload();
      const saved = editing ? await updateWorkOrder(editing.id, payload) : await createWorkOrder(payload);
      setWorkOrders((prev) => (editing ? prev.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...prev]));
      const expenseRows = await fetchExpenses();
      setExpenses(Array.isArray(expenseRows) ? expenseRows : []);
      setModalOpen(false);
      setEditing(null);
      setError("");
    } catch (e) {
      setModalError(e.message || "保存维修工单失败");
    }
  }

  async function changeStatus(item, status) {
    try {
      const saved = await updateWorkOrder(item.id, { ...item, status });
      setWorkOrders((prev) => prev.map((row) => (row.id === saved.id ? saved : row)));
      setError("");
    } catch (e) {
      setError(e.message || "更新工单状态失败");
    }
  }

  async function removeItem(item) {
    openConfirm("删除维修工单", `确认删除维修工单：${roomText(item)} / ${item.type || "维修"}？关联支出也会同步删除。`, async () => {
      closeConfirm();
      try {
        await deleteWorkOrder(item.id);
        setWorkOrders((prev) => prev.filter((row) => row.id !== item.id));
        const expenseRows = await fetchExpenses();
        setExpenses(Array.isArray(expenseRows) ? expenseRows : []);
        setError("");
      } catch (e) {
        setError(e.message || "删除维修工单失败");
      }
    });
  }

  function openPhotoManager(item) {
    setPhotoManagerTarget(item);
    setPhotoSelected([]);
  }

  function togglePhotoSelected(url) {
    setPhotoSelected((prev) => (prev.includes(url) ? prev.filter((x) => x !== url) : [...prev, url]));
  }

  async function removeSelectedPhotos() {
    if (!photoManagerTarget) return;
    if (!photoSelected.length) return;
    openConfirm("删除照片", `确认删除已选 ${photoSelected.length} 张照片？`, async () => {
      closeConfirm();
      try {
        const nextPhotos = (photoManagerTarget.photos || []).filter((x) => !photoSelected.includes(x));
        const saved = await updateWorkOrder(photoManagerTarget.id, { ...photoManagerTarget, photos: nextPhotos });
        setWorkOrders((prev) => prev.map((row) => (row.id === saved.id ? saved : row)));
        setPhotoManagerTarget(saved);
        setPhotoSelected([]);
        setError("");
      } catch (e) {
        setError(e.message || "批量删除照片失败");
      }
    });
  }

  function downloadSelectedPhotos() {
    const list = photoSelected.length ? photoSelected : (photoManagerTarget?.photos || []);
    list.forEach((url) => {
      const a = document.createElement("a");
      a.href = toPreviewUrl(url);
      a.target = "_blank";
      a.rel = "noreferrer";
      a.click();
    });
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <div className="flex items-center gap-3 mb-3"><div className="rounded-xl bg-orange-100 p-2.5 text-orange-700"><Wrench className="h-5 w-5" /></div><div><h1 className="text-2xl font-bold text-slate-900">维修工单</h1><p className="text-sm text-slate-500">报修记录、费用联动、照片存档</p></div></div>
            <p className="mt-1 text-sm text-slate-500">记录维修问题、处理状态、照片凭证，并自动联动日常维修支出。</p>
          </div>
          <button className="ui-btn-primary ml-auto" type="button" onClick={openCreate}><Plus className="mr-1 inline h-4 w-4" />新增工单</button>
          <button className="ui-btn-secondary" type="button" onClick={load}><RefreshCw className="mr-1 inline h-4 w-4" />刷新</button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <button className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left" type="button" onClick={() => setStatusFilter("all")}><div className="text-xs text-slate-500">工单总数</div><div className="mt-1 text-2xl font-semibold">{metrics.total}</div></button>
          <button className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left" type="button" onClick={() => setStatusFilter("open")}><div className="text-xs text-amber-700">待处理</div><div className="mt-1 text-2xl font-semibold text-amber-700">{metrics.open}</div></button>
          <button className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-left" type="button" onClick={() => setStatusFilter("in_progress")}><div className="text-xs text-sky-700">处理中</div><div className="mt-1 text-2xl font-semibold text-sky-700">{metrics.inProgress}</div></button>
          <button className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-left" type="button" onClick={() => setStatusFilter("done")}><div className="text-xs text-emerald-700">已完成</div><div className="mt-1 text-2xl font-semibold text-emerald-700">{metrics.done}</div></button>
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4"><div className="text-xs text-rose-700">关联维修支出</div><div className="mt-1 text-2xl font-semibold text-rose-700">{formatCurrency(metrics.linkedAmount)}</div></div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input className="ui-input w-full max-w-md border-slate-300" placeholder="搜索房号、租客、类型、描述、收款方" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          <select className="ui-input w-36 border-slate-300" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">全部状态</option>
            {STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>
        {loading ? <p className="mt-3 text-sm text-slate-500">正在读取维修工单...</p> : null}
        {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="grid gap-4 xl:grid-cols-2">
          {list.map((item) => {
            const meta = statusMeta(item.status);
            return (
              <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-sky-700">{roomText(item) || "未填房号"}</div>
                    <h3 className="mt-1 text-lg font-semibold text-slate-900">{item.type || "维修"}</h3>
                    <p className="mt-1 text-sm text-slate-600">当前租客：{item.tenant?.name || "-"}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${meta.tone}`}>{meta.label}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-700">{item.description || "-"}</p>
                <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
                  <div>维修日期：{formatDate(item.date || item.createdAt)}</div>
                  <div>费用：{formatCurrency(item.amount || 0)}</div>
                  <div>收款方：{item.payee || "-"}</div>
                  <div>支付方式：{item.paymentMethod || "-"}</div>
                  <div>支出联动：{item.linkedExpense ? `已生成 ${formatCurrency(item.linkedExpense.amount || 0)}` : Number(item.amount || 0) > 0 ? "待同步" : "无费用"}</div>
                  <div>发票/单号：{item.invoiceNo || "-"}</div>
                </div>
                {Array.isArray(item.photos) && item.photos.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.photos.slice(0, 6).map((photo, index) => (
                      <a key={`${item.id}-${photo}-${index}`} className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-sky-700" href={toPreviewUrl(photo)} target="_blank" rel="noreferrer">照片 {index + 1}</a>
                    ))}
                    <button className="rounded-lg border border-indigo-300 px-2 py-1 text-xs text-indigo-700" type="button" onClick={() => openPhotoManager(item)}>照片管理</button>
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  {item.status !== "open" ? <button className="rounded-lg border border-amber-300 px-2.5 py-1.5 text-xs text-amber-700" type="button" onClick={() => changeStatus(item, "open")}>设为待处理</button> : null}
                  {item.status !== "in_progress" ? <button className="rounded-lg border border-sky-300 px-2.5 py-1.5 text-xs text-sky-700" type="button" onClick={() => changeStatus(item, "in_progress")}>处理中</button> : null}
                  {item.status !== "done" ? <button className="rounded-lg border border-emerald-300 px-2.5 py-1.5 text-xs text-emerald-700" type="button" onClick={() => changeStatus(item, "done")}>完成</button> : null}
                  <button className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-700" type="button" onClick={() => openEdit(item)}><Edit3 className="mr-1 inline h-3.5 w-3.5" />编辑</button>
                  <button className="rounded-lg border border-rose-300 px-2.5 py-1.5 text-xs text-rose-700" type="button" onClick={() => removeItem(item)}><Trash2 className="mr-1 inline h-3.5 w-3.5" />删除</button>
                </div>
              </article>
            );
          })}
          {!list.length ? <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">暂无维修工单</div> : null}
        </div>
      </section>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/35 p-4">
          <div className="my-4 w-full max-w-4xl rounded-2xl bg-white p-5 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-xl font-semibold">{editing ? "编辑维修工单" : "新增维修工单"}</h3>
              <button className="rounded-xl border border-slate-300 px-3 py-2 text-sm" type="button" onClick={() => setModalOpen(false)}>关闭</button>
            </div>
            {modalError ? <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{modalError}</div> : null}
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">房号
                <select className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 px-3" value={form.room ? `${form.building} ${form.room}` : ""} onChange={(e) => onRoomSelect(e.target.value)}>
                  <option value="">请选择房号</option>
                  {roomOptions.map((item) => <option key={`${item.id}-${item.label}`} value={item.label}>{item.label}</option>)}
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-700">维修类型
                <select className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 px-3" value={form.type} onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}>{TYPE_OPTIONS.map((item) => <option key={item}>{item}</option>)}</select>
              </label>
              <label className="text-sm font-semibold text-slate-700">状态
                <select className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 px-3" value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}>{STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
              </label>
              <label className="text-sm font-semibold text-slate-700">维修日期<input type="date" className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 px-3" value={form.date} onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))} /></label>
              <label className="text-sm font-semibold text-slate-700 md:col-span-2">问题描述<textarea className="mt-1.5 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2" value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="例如：卫生间水管漏水，需更换角阀" /></label>
              <label className="text-sm font-semibold text-slate-700">维修费用（元）<input className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 px-3" value={form.amount} onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value.replace(/[^\d.]/g, "") }))} /></label>
              <label className="text-sm font-semibold text-slate-700">收款方/师傅<input className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 px-3" value={form.payee} onChange={(e) => setForm((prev) => ({ ...prev, payee: e.target.value }))} /></label>
              <label className="text-sm font-semibold text-slate-700">支付方式<select className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 px-3" value={form.paymentMethod} onChange={(e) => setForm((prev) => ({ ...prev, paymentMethod: e.target.value }))}>{PAYMENT_METHODS.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="text-sm font-semibold text-slate-700">发票/单号<input className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 px-3" value={form.invoiceNo} onChange={(e) => setForm((prev) => ({ ...prev, invoiceNo: e.target.value }))} /></label>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><div className="font-semibold text-slate-900">照片凭证</div><div className="mt-1 text-xs text-slate-500">可上传图片或填写照片链接，保存后在工单卡片中查看。</div></div>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
                    <ImagePlus className="h-4 w-4" />{uploading ? "上传中..." : "上传照片"}
                    <input className="hidden" type="file" accept="image/*" multiple onChange={(e) => { handlePhotoUpload(e.target.files); e.target.value = ""; }} />
                  </label>
                </div>
                <div className="mt-3 flex gap-2">
                  <input className="ui-input flex-1 border-slate-300" placeholder="粘贴照片链接" value={form.photoInput} onChange={(e) => setForm((prev) => ({ ...prev, photoInput: e.target.value }))} />
                  <button className="ui-btn-secondary" type="button" onClick={addPhotoUrl}>添加链接</button>
                </div>
                {form.photos.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {form.photos.map((photo, index) => (
                      <div key={`${photo}-${index}`} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs">
                        <a className="text-sky-700" href={toPreviewUrl(photo)} target="_blank" rel="noreferrer">照片 {index + 1}</a>
                        <button className="text-rose-600" type="button" onClick={() => removePhoto(index)}>删除</button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-slate-700 md:col-span-2">
                费用联动规则：维修费用大于 0 时，保存后自动生成/更新一笔“日常维修”支出；费用改为 0 时，关联支出会同步删除。
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded-xl border border-slate-300 px-4 py-2 text-sm" type="button" onClick={() => setModalOpen(false)}>取消</button>
              <button className="ui-btn-primary" type="button" onClick={save}><Wrench className="mr-1 inline h-4 w-4" />保存工单</button>
            </div>
          </div>
        </div>
      ) : null}

      {photoManagerTarget ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/35 p-4">
          <div className="my-4 w-full max-w-3xl rounded-2xl bg-white p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">照片管理：{roomText(photoManagerTarget) || "-"}</h3>
              <button className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm" type="button" onClick={() => setPhotoManagerTarget(null)}>关闭</button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="rounded-lg border border-indigo-300 px-3 py-1.5 text-sm text-indigo-700" type="button" onClick={downloadSelectedPhotos}>{photoSelected.length ? `下载已选(${photoSelected.length})` : "下载全部"}</button>
              <button className="rounded-lg border border-rose-300 px-3 py-1.5 text-sm text-rose-700" type="button" onClick={removeSelectedPhotos} disabled={!photoSelected.length}>删除已选</button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {(photoManagerTarget.photos || []).map((url, idx) => (
                <label key={`${url}-${idx}`} className="rounded-xl border border-slate-200 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <input type="checkbox" checked={photoSelected.includes(url)} onChange={() => togglePhotoSelected(url)} />
                    <a className="text-xs text-sky-700" href={toPreviewUrl(url)} target="_blank" rel="noreferrer">预览</a>
                  </div>
                  <img src={toPreviewUrl(url)} alt={`workorder-${idx + 1}`} className="mt-2 h-28 w-full rounded object-cover" />
                </label>
              ))}
              {!(photoManagerTarget.photos || []).length ? <div className="text-sm text-slate-500">暂无照片</div> : null}
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
