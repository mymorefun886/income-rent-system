import React, { useEffect, useMemo, useState } from "react";
import { Edit3, Plus, RefreshCw, Trash2, Users, UserX } from "lucide-react";
import {
  API_BASE_URL,
  apiEnabled,
  createTenant,
  deleteTenant,
  fetchProperties,
  fetchTenants,
  updateTenant,
  uploadFile,
} from "../lib/api";
import { properties as fallbackProperties, tenants as fallbackTenants } from "../lib/mock-data";
import { formatCurrency, formatDate, getStatusTone } from "../lib/format";

const quickLeaseButtons = [
  { label: "半年", months: 6 },
  { label: "一年", months: 12 },
  { label: "两年", months: 24 },
];
const unitOptions = ["元/度", "元/吨", "元/立方", "元/月", "元/次"];
const billingModes = ["抄表计算", "固定费用", "一次性费用"];
const feeNameOptions = ["电费", "水费", "物业管理费", "宽带费", "税费", "其他费用"];

// 深圳城中村出租屋水电价格参考标准（2024）
const SHENZHEN_ELECTRIC_PRICE = 0.80;
const SHENZHEN_WATER_PRICE = 5.50;

function defaultFeeItems() {
  return [
    { id: `fee-${Date.now()}-electric`, name: "电费", billingMode: "抄表计算", unitPrice: String(SHENZHEN_ELECTRIC_PRICE), unit: "元/度", initialReading: "0", hasMinimum: false, minimumCharge: "0" },
    { id: `fee-${Date.now()}-water`, name: "水费", billingMode: "抄表计算", unitPrice: String(SHENZHEN_WATER_PRICE), unit: "元/立方", initialReading: "0", hasMinimum: true, minimumCharge: String(SHENZHEN_WATER_PRICE) },
  ];
}

function validateChineseIdCard(idNumber) {
  const id = String(idNumber || "").trim();
  if (!id) return { valid: true, message: "" };
  if (!/^\d{17}[\dXx]$/.test(id)) return { valid: false, message: "身份证号必须为18位" };
  const birth = id.substring(6, 14);
  const year = parseInt(birth.substring(0, 4), 10);
  const month = parseInt(birth.substring(4, 6), 10);
  const day = parseInt(birth.substring(6, 8), 10);
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return { valid: false, message: "身份证号中的出生日期无效" };
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const checkChars = "10X98765432";
  const sum = id.substring(0, 17).split("").reduce((acc, d, i) => acc + parseInt(d, 10) * weights[i], 0);
  const expected = checkChars[sum % 11];
  if (id[17].toUpperCase() !== expected) return { valid: false, message: "身份证号校验位不正确" };
  return { valid: true, message: "" };
}

function applyFeePreset(item, name) {
  const next = { ...item, name };
  if (name === "电费") {
    next.billingMode = "抄表计算";
    next.unit = "元/度";
    next.unitPrice = String(SHENZHEN_ELECTRIC_PRICE);
    next.hasMinimum = false;
    next.minimumCharge = "0";
  }
  if (name === "水费") {
    next.billingMode = "抄表计算";
    next.unit = "元/立方";
    next.unitPrice = String(SHENZHEN_WATER_PRICE);
    next.hasMinimum = true;
    next.minimumCharge = String(SHENZHEN_WATER_PRICE);
  }
  return next;
}

function normalizeRoomKey(v) {
  return String(v || "").replace(/\s+/g, "").toUpperCase();
}

function makeTenantRoomKey(building, room) {
  return `${String(building || "").trim()}::${normalizeRoomKey(room)}`;
}

function addMonths(dateString, months) {
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return dateString;
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function toPreviewUrl(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return API_BASE_URL ? `${API_BASE_URL}${url}` : url;
}

function makeForm() {
  const now = new Date();
  const end = new Date(now);
  end.setFullYear(end.getFullYear() + 1);
  return {
    name: "",
    phone: "",
    idNo: "",
    building: "",
    room: "",
    leaseStart: now.toISOString().slice(0, 10),
    leaseEnd: end.toISOString().slice(0, 10),
    rent: "0",
    deposit: "0",
    status: "正常",
    remind: true,
    wechatGroupName: "",
    wechatRemark: "",
    notes: "",
    idCardFront: "",
    idCardBack: "",
    feeItems: defaultFeeItems(),
  };
}

function toForm(tenant) {
  return {
    name: tenant.name || "",
    phone: tenant.phone || "",
    idNo: tenant.idNo || "",
    building: tenant.building || "",
    room: tenant.room || "",
    leaseStart: tenant.leaseStart || makeForm().leaseStart,
    leaseEnd: tenant.leaseEnd || makeForm().leaseEnd,
    rent: String(tenant.rent ?? 0),
    deposit: String(tenant.deposit ?? 0),
    status: tenant.status || "正常",
    remind: tenant.remind ?? true,
    wechatGroupName: tenant.wechatGroupName || "",
    wechatRemark: tenant.wechatRemark || "",
    notes: tenant.notes || "",
    idCardFront: tenant.idCardFront || "",
    idCardBack: tenant.idCardBack || "",
    feeItems: Array.isArray(tenant.feeItems) && tenant.feeItems.length
      ? tenant.feeItems.map((f, i) => ({
          id: f.id || `fee-${i + 1}`,
          name: f.name || "",
          billingMode: f.billingMode || "固定费用",
          unitPrice: String(f.unitPrice ?? 0),
          unit: f.unit || "元/月",
          initialReading: String(f.initialReading ?? 0),
          hasMinimum: Boolean(f.hasMinimum),
          minimumCharge: String(f.minimumCharge ?? 0),
        }))
      : defaultFeeItems(),
  };
}

export default function TenantsPage() {
  const [activeTab, setActiveTab] = useState("current");
  const [searchTerm, setSearchTerm] = useState("");
  const [tenants, setTenants] = useState(apiEnabled ? [] : fallbackTenants);
  const [properties, setProperties] = useState(apiEnabled ? [] : fallbackProperties);
  const [loading, setLoading] = useState(apiEnabled);
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState(null);
  const [form, setForm] = useState(makeForm());

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [checkoutTarget, setCheckoutTarget] = useState(null);
  const [renewTarget, setRenewTarget] = useState(null);
  const [renewLeaseEnd, setRenewLeaseEnd] = useState("");
  const [renewRent, setRenewRent] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!apiEnabled) {
        setLoading(false);
        return;
      }
      try {
        const [t, p] = await Promise.all([fetchTenants(), fetchProperties()]);
        if (!cancelled) {
          setTenants(Array.isArray(t) ? t : []);
          setProperties(Array.isArray(p) ? p : []);
          setError("");
        }
      } catch (e) {
        if (!cancelled) setError(e.message || "读取 NAS 数据失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const currentTenants = useMemo(() => tenants.filter((t) => !t.archived), [tenants]);
  const historyTenants = useMemo(() => tenants.filter((t) => t.archived), [tenants]);

  const vacantRoomOptions = useMemo(() => {
    const occupied = new Set(currentTenants.map((t) => makeTenantRoomKey(t.building || "", t.room || "")));
    return properties
      .map((p) => {
        const building = String(p.building || "").trim();
        const room = String(p.room || "").trim();
        return {
          building,
          room,
          key: makeTenantRoomKey(building, room),
        };
      })
      .filter((x) => x.room)
      .filter((x) => {
        if (editingTenant && makeTenantRoomKey(editingTenant.building || "", editingTenant.room || "") === x.key) return true;
        return !occupied.has(x.key);
      })
      .sort((a, b) => `${a.building}${a.room}`.localeCompare(`${b.building}${b.room}`, "zh-Hans-CN", { numeric: true }));
  }, [properties, currentTenants, editingTenant]);

  const list = useMemo(() => {
    const source = activeTab === "current" ? currentTenants : historyTenants;
    const q = searchTerm.trim();
    const filtered = q ? source.filter((t) => [t.name, t.room, t.phone, t.building].some((v) => String(v || "").includes(q))) : source;
    return [...filtered].sort((a, b) => {
      const buildingCmp = String(a.building || "").localeCompare(String(b.building || ""), "zh-Hans-CN", { numeric: true });
      if (buildingCmp !== 0) return buildingCmp;
      return String(a.room || "").localeCompare(String(b.room || ""), "zh-Hans-CN", { numeric: true });
    });
  }, [activeTab, currentTenants, historyTenants, searchTerm]);

  function openCreate() {
    setEditingTenant(null);
    setForm(makeForm());
    setModalOpen(true);
  }

  function openEdit(tenant) {
    setEditingTenant(tenant);
    setForm(toForm(tenant));
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingTenant(null);
  }

  function onRoomSelect(value) {
    const found = vacantRoomOptions.find((x) => `${x.building} ${x.room}` === value);
    if (!found) return;
    setForm((prev) => ({ ...prev, building: found.building, room: found.room }));
  }

  function addFeeItem() {
    setForm((prev) => ({
      ...prev,
      feeItems: [...(prev.feeItems || []), { id: `fee-${Date.now()}`, name: "其他费用", billingMode: "固定费用", unitPrice: "0", unit: "元/月", initialReading: "0", hasMinimum: false, minimumCharge: "0" }],
    }));
  }

  function updateFeeItem(id, patch) {
    setForm((prev) => ({
      ...prev,
      feeItems: (prev.feeItems || []).map((f) => {
        if (f.id !== id) return f;
        if (patch.name) return applyFeePreset({ ...f, ...patch }, patch.name);
        return { ...f, ...patch };
      }),
    }));
  }

  function removeFeeItem(id) {
    setForm((prev) => ({ ...prev, feeItems: (prev.feeItems || []).filter((f) => f.id !== id) }));
  }

  async function handleTenantIdUpload(file, side) {
    try {
      const uploaded = await uploadFile(file);
      setForm((prev) => ({ ...prev, [side]: uploaded.url }));
      setError("");
    } catch (e) {
      setError(e.message || "身份证上传失败");
    }
  }

  async function saveTenant() {
    try {
      const payload = {
        ...(editingTenant || {}),
        ...form,
        rent: Number(form.rent || 0),
        deposit: Number(form.deposit || 0),
        archived: false,
        feeItems: (form.feeItems || []).map((f) => ({
          ...f,
          unitPrice: Number(f.unitPrice || 0),
          initialReading: Number(f.initialReading || 0),
          minimumCharge: Number(f.minimumCharge || 0),
        })),
      };
      if (apiEnabled) {
        const saved = editingTenant ? await updateTenant(editingTenant.id, payload) : await createTenant(payload);
        setTenants((prev) => (editingTenant ? prev.map((t) => (t.id === editingTenant.id ? saved : t)) : [saved, ...prev]));
      } else {
        const saved = { ...payload, id: editingTenant?.id || `tenant-${Date.now()}` };
        setTenants((prev) => (editingTenant ? prev.map((t) => (t.id === editingTenant.id ? saved : t)) : [saved, ...prev]));
      }
      closeModal();
      setError("");
    } catch (e) {
      setError(e.message || "保存租客失败");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      if (apiEnabled) await deleteTenant(deleteTarget.id);
      setTenants((prev) => prev.filter((t) => t.id !== deleteTarget.id));
      setDeleteTarget(null);
      setError("");
    } catch (e) {
      setError(e.message || "删除租客失败");
    }
  }

  async function checkoutTenant() {
    if (!checkoutTarget) return;
    try {
      const payload = { ...checkoutTarget, archived: true, status: "已退租", checkoutDate: new Date().toISOString().slice(0, 10) };
      const saved = apiEnabled ? await updateTenant(checkoutTarget.id, payload) : payload;
      setTenants((prev) => prev.map((t) => (t.id === checkoutTarget.id ? saved : t)));
      setCheckoutTarget(null);
      setError("");
    } catch (e) {
      setError(e.message || "退租失败");
    }
  }

  async function renewTenant() {
    if (!renewTarget) return;
    try {
      const payload = {
        ...renewTarget,
        leaseEnd: renewLeaseEnd || renewTarget.leaseEnd,
        rent: Number(renewRent || renewTarget.rent || 0),
        archived: false,
        status: "正常",
      };
      const saved = apiEnabled ? await updateTenant(renewTarget.id, payload) : payload;
      setTenants((prev) => prev.map((t) => (t.id === renewTarget.id ? saved : t)));
      setRenewTarget(null);
      setError("");
    } catch (e) {
      setError(e.message || "续租失败");
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
        <div className="flex items-center gap-3 mb-3">
          <div className="rounded-xl bg-amber-100 p-2.5 text-amber-700"><Users className="h-5 w-5" /></div>
          <div><h1 className="text-2xl font-bold text-slate-900">租客档案</h1><p className="text-sm text-slate-500">管理租客信息、费用项、同住人</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700" type="button" onClick={openCreate}>
            <Plus className="mr-1 inline h-4 w-4" />新增租客
          </button>
          <button className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700" type="button" onClick={() => window.location.reload()}>
            <RefreshCw className="mr-1 inline h-4 w-4" />刷新
          </button>
          <input className="ml-auto rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="搜索租客/房号/电话" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <div className="mt-3 flex gap-2">
          <button className={`rounded-full px-3 py-1 text-sm ${activeTab === "current" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"}`} onClick={() => setActiveTab("current")} type="button">当前在租</button>
          <button className={`rounded-full px-3 py-1 text-sm ${activeTab === "history" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"}`} onClick={() => setActiveTab("history")} type="button">历史租客</button>
        </div>
        {loading ? <p className="mt-3 text-sm text-slate-500">正在读取 NAS 数据...</p> : null}
        {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
      </section>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((item) => (
            <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-lg font-semibold text-slate-900">{item.name || "-"}</div>
                  <div className="mt-1 text-sm text-slate-600">{item.building ? `${item.building} ` : ""}{item.room || "-"}</div>
                </div>
                <span className={`rounded px-2 py-1 text-xs ${getStatusTone(item.status || "正常")}`}>{item.status || "正常"}</span>
              </div>
              <div className="mt-3 space-y-1 text-sm text-slate-600">
                <div>电话：{item.phone || "-"}</div>
                <div>租期：{formatDate(item.leaseStart)} ~ {formatDate(item.leaseEnd)}</div>
                <div>月租：{formatCurrency(item.rent || 0)}　押金：{formatCurrency(item.deposit || 0)}</div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700" type="button" onClick={() => openEdit(item)}><Edit3 className="mr-1 inline h-4 w-4" />编辑</button>
                {!item.archived ? <button className="rounded-lg border border-amber-300 px-3 py-1.5 text-sm text-amber-700" type="button" onClick={() => setCheckoutTarget(item)}><UserX className="mr-1 inline h-4 w-4" />退租</button> : null}
                {item.archived ? <button className="rounded-lg border border-emerald-300 px-3 py-1.5 text-sm text-emerald-700" type="button" onClick={() => { setRenewTarget(item); setRenewLeaseEnd(item.leaseEnd || ""); setRenewRent(String(item.rent || 0)); }}>续租</button> : null}
                <button className="rounded-lg border border-rose-300 px-3 py-1.5 text-sm text-rose-700" type="button" onClick={() => setDeleteTarget(item)}><Trash2 className="mr-1 inline h-4 w-4" />删除</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/35 p-4">
          <div className="my-4 w-full max-w-3xl rounded-2xl bg-white p-5 max-h-[92vh] overflow-y-auto">
            <h3 className="text-xl font-semibold">{editingTenant ? "编辑租客" : "新增租客"}</h3>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="text-sm">租客姓名<input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></label>
              <label className="text-sm">电话号码<input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} /></label>
              <label className="text-sm">身份证<input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={form.idNo} onChange={(e) => setForm((p) => ({ ...p, idNo: e.target.value }))} /></label>
              <label className="text-sm">入住房号
                <select className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={form.room ? `${form.building} ${form.room}` : ""} onChange={(e) => onRoomSelect(e.target.value)}>
                  <option value="">请选择空置房号</option>
                  {vacantRoomOptions.map((x) => <option key={x.key} value={`${x.building} ${x.room}`}>{x.building} {x.room}</option>)}
                </select>
              </label>
              <div className="text-sm md:col-span-2">
                <div className="mb-2 font-medium">身份证照片（上传后自动识别）</div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700">
                    身份证正面上传
                    <input className="hidden" type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleTenantIdUpload(f, "idCardFront"); e.target.value = ""; }} />
                    {form.idCardFront ? <img className="mt-2 h-20 w-auto rounded border border-slate-200" src={toPreviewUrl(form.idCardFront)} alt="身份证正面" /> : null}
                  </label>
                  <label className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700">
                    身份证反面上传
                    <input className="hidden" type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleTenantIdUpload(f, "idCardBack"); e.target.value = ""; }} />
                    {form.idCardBack ? <img className="mt-2 h-20 w-auto rounded border border-slate-200" src={toPreviewUrl(form.idCardBack)} alt="身份证反面" /> : null}
                  </label>
                </div>
              </div>
              <label className="text-sm">租期开始<input type="date" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={form.leaseStart} onChange={(e) => setForm((p) => ({ ...p, leaseStart: e.target.value }))} /></label>
              <label className="text-sm">租期结束<input type="date" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={form.leaseEnd} onChange={(e) => setForm((p) => ({ ...p, leaseEnd: e.target.value }))} /></label>
              <div className="md:col-span-2 flex flex-wrap gap-2">{quickLeaseButtons.map((btn) => <button key={btn.label} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700" type="button" onClick={() => setForm((p) => ({ ...p, leaseEnd: addMonths(p.leaseStart, btn.months) }))}>{btn.label}</button>)}</div>
              <label className="text-sm">每期租金<input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={form.rent} onChange={(e) => setForm((p) => ({ ...p, rent: e.target.value }))} /></label>
              <label className="text-sm">押金<input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={form.deposit} onChange={(e) => setForm((p) => ({ ...p, deposit: e.target.value }))} /></label>
              <label className="text-sm">微信备注<input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={form.wechatRemark} onChange={(e) => setForm((p) => ({ ...p, wechatRemark: e.target.value }))} /></label>
              <label className="text-sm">微信群名<input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={form.wechatGroupName} onChange={(e) => setForm((p) => ({ ...p, wechatGroupName: e.target.value }))} /></label>
              <label className="text-sm md:col-span-2">备注<textarea className="mt-1 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} /></label>

              <div className="md:col-span-2">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-medium">费用项设置</div>
                  <button className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-700" type="button" onClick={addFeeItem}>新增费用项</button>
                </div>
                <div className="space-y-2">
                  {(form.feeItems || []).map((fee) => (
                    <div key={fee.id} className="grid gap-2 rounded-xl bg-slate-50 p-3 md:grid-cols-[1.1fr_1fr_1fr_1fr_1fr_auto]">
                      <select className="rounded-lg border border-slate-300 px-2 py-2 text-sm" value={fee.name} onChange={(e) => updateFeeItem(fee.id, { name: e.target.value })}>
                        {feeNameOptions.map((x) => <option key={x}>{x}</option>)}
                      </select>
                      <select className="rounded-lg border border-slate-300 px-2 py-2 text-sm" value={fee.billingMode} onChange={(e) => updateFeeItem(fee.id, { billingMode: e.target.value })}>
                        {billingModes.map((x) => <option key={x}>{x}</option>)}
                      </select>
                      <input className="rounded-lg border border-slate-300 px-2 py-2 text-sm" placeholder="单价" value={fee.unitPrice} onChange={(e) => updateFeeItem(fee.id, { unitPrice: e.target.value })} />
                      <select className="rounded-lg border border-slate-300 px-2 py-2 text-sm" value={fee.unit} onChange={(e) => updateFeeItem(fee.id, { unit: e.target.value })}>
                        {unitOptions.map((x) => <option key={x}>{x}</option>)}
                      </select>
                      <input className="rounded-lg border border-slate-300 px-2 py-2 text-sm" placeholder="初始读数/基数" value={fee.initialReading} onChange={(e) => updateFeeItem(fee.id, { initialReading: e.target.value })} />
                      <button className="rounded-lg border border-rose-300 px-2 py-2 text-sm text-rose-700" type="button" onClick={() => removeFeeItem(fee.id)}>删除</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded-xl border border-slate-300 px-3 py-2" type="button" onClick={closeModal}>取消</button>
              <button className="rounded-xl bg-blue-600 px-3 py-2 text-white" type="button" onClick={saveTenant}>保存</button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5">
            <h3 className="text-lg font-semibold">删除确认</h3>
            <p className="mt-2 text-sm text-slate-600">确认删除：{deleteTarget.name} / {deleteTarget.room}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded-xl border border-slate-300 px-3 py-2" type="button" onClick={() => setDeleteTarget(null)}>取消</button>
              <button className="rounded-xl bg-rose-600 px-3 py-2 text-white" type="button" onClick={confirmDelete}>删除</button>
            </div>
          </div>
        </div>
      ) : null}

      {checkoutTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5">
            <h3 className="text-lg font-semibold">退租确认</h3>
            <p className="mt-2 text-sm text-slate-600">确认将 {checkoutTarget.name} 标记为已退租？</p>
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded-xl border border-slate-300 px-3 py-2" type="button" onClick={() => setCheckoutTarget(null)}>取消</button>
              <button className="rounded-xl bg-amber-600 px-3 py-2 text-white" type="button" onClick={checkoutTenant}>确认退租</button>
            </div>
          </div>
        </div>
      ) : null}

      {renewTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5">
            <h3 className="text-lg font-semibold">续租</h3>
            <div className="mt-3 grid gap-3">
              <label className="text-sm">新到期日<input type="date" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={renewLeaseEnd} onChange={(e) => setRenewLeaseEnd(e.target.value)} /></label>
              <label className="text-sm">新租金<input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={renewRent} onChange={(e) => setRenewRent(e.target.value)} /></label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded-xl border border-slate-300 px-3 py-2" type="button" onClick={() => setRenewTarget(null)}>取消</button>
              <button className="rounded-xl bg-emerald-600 px-3 py-2 text-white" type="button" onClick={renewTenant}>确认续租</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
