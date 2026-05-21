import React, { useEffect, useMemo, useState } from "react";
import { Edit3, Plus, RefreshCw, Trash2, Users, UserX, X, ZoomIn } from "lucide-react";
import {
  API_BASE_URL,
  apiEnabled,
  createTenant,
  deleteTenant,
  fetchProperties,
  fetchRecords,
  fetchTenants,
  updateTenant,
  uploadFile,
} from "../lib/api";
import { properties as fallbackProperties, tenants as fallbackTenants } from "../lib/mock-data";
import { formatCurrency, formatDate, getStatusTone } from "../lib/format";
import ConfirmDialog from "../components/ConfirmDialog";

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

function IdPhotoCard({ label, side, url, onUpload, onPreview, onRemove, uploading, error }) {
  const sideLabel = side === "idCardFront" ? "正面" : "反面";
  const busy = uploading === side;
  const FileInput = ({ children, className }) => (
    <label className={className + " relative cursor-pointer"}>
      {children}
      <input className="absolute inset-0 opacity-0 cursor-pointer" type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) { onUpload(f, side); e.target.value = ""; } }} />
    </label>
  );
  return (
    <div className="rounded-xl border border-slate-300 overflow-hidden">
      {url ? (
        <div className="relative group">
          <img
            className="w-full h-40 object-contain bg-slate-100 cursor-pointer"
            src={toPreviewUrl(url)}
            alt={label}
            onClick={() => onPreview && onPreview(toPreviewUrl(url))}
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
            <ZoomIn className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
          </div>
          <button
            className="absolute top-1.5 right-1.5 rounded-full bg-white/90 hover:bg-rose-50 p-1.5 shadow transition"
            type="button"
            title="移除照片"
            onClick={(e) => { e.stopPropagation(); onRemove && onRemove(); }}
          >
            <Trash2 className="h-3.5 w-3.5 text-rose-600" />
          </button>
        </div>
      ) : busy ? (
        <div className="flex flex-col items-center justify-center h-40 text-slate-400">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
          <span className="text-xs mt-2">上传中...</span>
        </div>
      ) : (
        <FileInput className="flex flex-col items-center justify-center h-40 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors p-3">
          <Plus className="h-6 w-6 mb-1" />
          <span className="text-xs">{label}</span>
        </FileInput>
      )}
      {error && (
        <div className="px-3 py-1.5 text-xs text-rose-600 bg-rose-50">{error}</div>
      )}
      {url && !busy && (
        <FileInput className="flex items-center justify-center gap-1 py-2 text-xs text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors">
          <Plus className="h-3 w-3" />
          <span>更新{sideLabel}</span>
        </FileInput>
      )}
      {url && busy && (
        <div className="flex items-center justify-center gap-1 py-2 text-xs text-slate-400">
          <div className="h-3 w-3 animate-spin rounded-full border border-slate-300 border-t-blue-600" />
          <span>上传中...</span>
        </div>
      )}
    </div>
  );
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
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(apiEnabled);
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState(null);
  const [form, setForm] = useState(makeForm());

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [pendingRemoveSide, setPendingRemoveSide] = useState(null);
  const [pendingUpload, setPendingUpload] = useState(null);
  const [uploadingSide, setUploadingSide] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [checkoutTarget, setCheckoutTarget] = useState(null);
  const [checkoutDaily, setCheckoutDaily] = useState(false);
  const [checkoutElectric, setCheckoutElectric] = useState("");
  const [checkoutWater, setCheckoutWater] = useState("");
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
        const [t, p, r] = await Promise.all([fetchTenants(), fetchProperties(), fetchRecords()]);
        if (!cancelled) {
          setTenants(Array.isArray(t) ? t : []);
          setProperties(Array.isArray(p) ? p : []);
          setRecords(Array.isArray(r) ? r : []);
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
    setUploadingSide(null);
    setUploadError("");
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

  async function doUpload(file, side) {
    setPendingUpload(null);
    setUploadingSide(side);
    setUploadError("");
    try {
      const uploaded = await uploadFile(file);
      setForm((prev) => ({ ...prev, [side]: uploaded.url }));
      setUploadingSide(null);
      setError("");
    } catch (e) {
      setUploadingSide(null);
      setUploadError(e.message || "身份证上传失败");
      setError(e.message || "身份证上传失败");
    }
  }

  function handleTenantIdUpload(file, side) {
    if (form[side]) {
      // 已有照片 → 弹窗确认是否替换
      setPendingUpload({ file, side });
      return;
    }
    doUpload(file, side);
  }

  function confirmRemovePhoto() {
    if (!pendingRemoveSide) return;
    setForm((prev) => ({ ...prev, [pendingRemoveSide]: "" }));
    setPendingRemoveSide(null);
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
      const payload = { ...checkoutTarget, archived: true, status: "已退租", checkoutDate: checkoutDate || new Date().toISOString().slice(0, 10) };
      const saved = apiEnabled ? await updateTenant(checkoutTarget.id, payload) : payload;
      setTenants((prev) => prev.map((t) => (t.id === checkoutTarget.id ? saved : t)));
      setCheckoutTarget(null);
      setCheckoutDaily(false);
      setCheckoutElectric("");
      setCheckoutWater("");
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
                <div className="mb-2 font-medium">身份证照片</div>
                <div className="grid gap-3 md:grid-cols-2">
                  <IdPhotoCard
                    label="身份证正面"
                    side="idCardFront"
                    url={form.idCardFront}
                    onUpload={handleTenantIdUpload}
                    onPreview={setPreviewImage}
                    onRemove={() => setPendingRemoveSide("idCardFront")}
                    uploading={uploadingSide}
                    error={!uploadingSide ? uploadError : ""}
                  />
                  <IdPhotoCard
                    label="身份证反面"
                    side="idCardBack"
                    url={form.idCardBack}
                    onUpload={handleTenantIdUpload}
                    onPreview={setPreviewImage}
                    onRemove={() => setPendingRemoveSide("idCardBack")}
                    uploading={uploadingSide}
                    error={!uploadingSide ? uploadError : ""}
                  />
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

      {checkoutTarget ? (() => {
        const deposit = Number(checkoutTarget.deposit || 0);
        const rent = Number(checkoutTarget.rent || 0);
        const leaseEnd = checkoutTarget.leaseEnd || "";
        const bld = checkoutTarget.building || "";
        const rm = checkoutTarget.room || "";
        // 查未结账单
        const unpaidBills = (records || []).filter(r => {
          const rt = String(r.tenant || "").trim();
          const ct = String(checkoutTarget.name || "").trim();
          const rk = (r.building||"")+"::"+ (r.roomNo||r.room||"");
          const ck = bld+"::"+rm;
          return (r.tenantId === checkoutTarget.id || rt === ct || rk === ck) && Number(r.receivable||0) > (Array.isArray(r.payments)?r.payments.reduce((s,p)=>s+Number(p.amount||0),0):Number(r.received||0));
        });
        const unpaidTotal = unpaidBills.reduce((s,r) => s + Math.max(0, Number(r.receivable||0) - (Array.isArray(r.payments)?r.payments.reduce((a,p)=>a+Number(p.amount||0),0):Number(r.received||0))), 0);
        // 按天折算
        const checkoutD = checkoutDate ? new Date(checkoutDate+"T00:00:00") : new Date();
        const leaseEndD = leaseEnd ? new Date(leaseEnd+"T00:00:00") : checkoutD;
        const extraDays = Math.max(0, Math.ceil((checkoutD - leaseEndD)/(24*60*60*1000)));
        const daysInMonth = new Date(checkoutD.getFullYear(), checkoutD.getMonth()+1, 0).getDate();
        const dailyRent = daysInMonth > 0 ? rent / daysInMonth : 0;
        const useDaily = extraDays > 0 && checkoutDaily;
        const dailyRentAmount = useDaily ? Math.round(dailyRent * extraDays * 100) / 100 : 0;
        // 水电
        const lastRec = (records || []).filter(r => {
          const rk = (r.building||"")+"::"+ (r.roomNo||r.room||"");
          const ck = bld+"::"+rm;
          return (r.tenantId === checkoutTarget.id || String(r.tenant||"").trim() === String(checkoutTarget.name||"").trim() || rk === ck);
        }).sort((a,b) => String(b.cycle||"").localeCompare(String(a.cycle||"")))[0] || null;
        const ePrev = Number(lastRec?.electricNow || lastRec?.electricPrev || 0);
        const wPrev = Number(lastRec?.waterNow || lastRec?.waterPrev || 0);
        const eUsage = checkoutElectric ? Math.max(0, Number(checkoutElectric) - ePrev) : 0;
        const wUsage = checkoutWater ? Math.max(0, Number(checkoutWater) - wPrev) : 0;
        const elecAmt = useDaily ? Math.round(eUsage * 0.8 * 100) / 100 : 0;
        const waterAmt = useDaily ? Math.round(wUsage * 5.5 * 100) / 100 : 0;
        const totalDeduct = unpaidTotal + dailyRentAmount + elecAmt + waterAmt;
        const refund = Math.max(0, deposit - totalDeduct);
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 max-h-[92vh] overflow-y-auto">
            <h3 className="text-lg font-semibold">退租结算：{checkoutTarget.name}</h3>
            <p className="text-sm text-slate-500">{bld} {rm} · 租期至 {leaseEnd || "-"}</p>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><span>押金</span><span className="font-bold text-emerald-700">+¥{deposit.toFixed(2)}</span></div>
              {unpaidBills.length > 0 && unpaidBills.map(b => {
                const paid = Array.isArray(b.payments) ? b.payments.reduce((s,p)=>s+Number(p.amount||0),0) : Number(b.received||0);
                const u = Math.max(0, Number(b.receivable||0) - paid);
                return <div key={b.id} className="flex justify-between"><span className="text-rose-600 pl-3 text-xs">{b.cycle} {b.rentPart>0?'租金':'水电'} 未收</span><span className="text-rose-700">-¥{u.toFixed(2)}</span></div>;
              })}
              {extraDays > 0 && (
                <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
                  <input type="checkbox" checked={checkoutDaily} onChange={(e) => setCheckoutDaily(e.target.checked)} />
                  按天折算（多住 {extraDays} 天，{rent}÷{daysInMonth}×{extraDays}）
                </label>
              )}
              {useDaily && extraDays > 0 && (
                <div className="flex justify-between"><span className="text-rose-600 pl-3 text-xs">多住 {extraDays} 天租金</span><span className="text-rose-700">-¥{dailyRentAmount.toFixed(2)}</span></div>
              )}
              {useDaily && extraDays > 0 && (
                <div className="rounded-lg bg-slate-50 p-2 space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span>电</span><span className="text-slate-400">上期 {ePrev}</span>
                    <input className="ml-auto w-20 rounded border border-slate-300 px-2 py-1 text-xs" type="number" placeholder="最终读数" value={checkoutElectric} onChange={(e) => setCheckoutElectric(e.target.value)} />
                    {eUsage > 0 && <span className="text-rose-600">-¥{elecAmt.toFixed(2)}</span>}
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span>水</span><span className="text-slate-400">上期 {wPrev}</span>
                    <input className="ml-auto w-20 rounded border border-slate-300 px-2 py-1 text-xs" type="number" placeholder="最终读数" value={checkoutWater} onChange={(e) => setCheckoutWater(e.target.value)} />
                    {wUsage > 0 && <span className="text-rose-600">-¥{waterAmt.toFixed(2)}</span>}
                  </div>
                </div>
              )}
              <div className="border-t pt-2 flex justify-between font-bold text-base">
                <span>应退押金</span>
                <span className={refund >= 0 ? "text-emerald-700" : "text-rose-700"}>¥{refund.toFixed(2)}</span>
              </div>
            </div>
            <label className="mt-3 block text-sm">退租日期
              <input type="date" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={checkoutDate} onChange={(e) => setCheckoutDate(e.target.value)} />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded-xl border border-slate-300 px-3 py-2" type="button" onClick={() => { setCheckoutTarget(null); setCheckoutDaily(false); setCheckoutElectric(""); setCheckoutWater(""); }}>取消</button>
              <button className="rounded-xl bg-amber-600 px-3 py-2 text-white font-semibold" type="button" onClick={checkoutTenant}>确认退租</button>
            </div>
          </div>
        </div>
        );
      })() : null}

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

      {previewImage ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setPreviewImage(null)}>
          <button className="absolute top-4 right-4 rounded-full bg-white/20 p-2 text-white hover:bg-white/30 transition" type="button" onClick={() => setPreviewImage(null)}><X className="h-6 w-6" /></button>
          <img className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl" src={previewImage} alt="预览" onClick={(e) => e.stopPropagation()} />
        </div>
      ) : null}

      <ConfirmDialog
        open={!!pendingUpload}
        title="更新身份证照片"
        message={pendingUpload?.side === "idCardFront" ? "已存在身份证正面照片，是否用新照片替换？" : "已存在身份证反面照片，是否用新照片替换？"}
        tone="warning"
        onCancel={() => setPendingUpload(null)}
        onConfirm={() => { if (pendingUpload) doUpload(pendingUpload.file, pendingUpload.side); }}
      />

      <ConfirmDialog
        open={!!pendingRemoveSide}
        title="移除身份证照片"
        message={pendingRemoveSide === "idCardFront" ? "确认移除身份证正面照片？" : "确认移除身份证反面照片？"}
        tone="danger"
        onCancel={() => setPendingRemoveSide(null)}
        onConfirm={confirmRemovePhoto}
      />
    </div>
  );
}
