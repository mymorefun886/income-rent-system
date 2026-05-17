import React, { useEffect, useMemo, useState } from "react";
import { Building2, Edit3, Home, Plus, Trash2 } from "lucide-react";
import { apiEnabled, createProperty, deleteProperty, fetchProperties, fetchRecords, fetchTenants, updateProperty } from "../lib/api";
import { properties as fallbackProperties, tenants as fallbackTenants } from "../lib/mock-data";
import { formatCurrency } from "../lib/format";
import ConfirmDialog from "../components/ConfirmDialog";

const PROPERTY_TYPES = ["小区住宅", "城中村/农民房", "公寓", "商铺/门面房", "写字楼/办公室", "厂房/车间", "仓库/车库/停车位"];
const BANK_ACCOUNTS = ["微信", "支付宝", "银行卡转账", "现金"];
const CYCLES = ["付一押一", "付一押二", "付二押一", "付三押一"];
const ROOM_CONFIG_OPTIONS = ["空调", "冰箱", "洗衣机", "热水器", "油烟机", "沙发", "椅子", "床", "衣柜", "梳妆台"];
const USAGE_TYPES = ["出租", "自用（不出租）"];

function normalizeRoomKey(value) {
  return String(value || "").replace(/\s+/g, "").toUpperCase();
}

function parseRoomText(roomText) {
  const text = String(roomText || "").trim();
  const idx = text.lastIndexOf(" ");
  if (idx < 0) return { building: "", room: text };
  return { building: text.slice(0, idx).trim(), room: text.slice(idx + 1).trim() };
}

function toNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getDefaultAddress(building, currentAddress) {
  if (String(currentAddress || "").trim()) return currentAddress;
  const b = String(building || "").replace(/\s+/g, "").toUpperCase();
  if (b.startsWith("西山东区17号") || b.startsWith("西山东区30号A")) return "深圳市宝安区松岗街道东方社区西山村";
  return "";
}

function getLayoutLabel(form) {
  if (form.layoutRoomType === "单间") return "单间";
  return `${form.layoutRoomType}${form.layoutHall}厅${form.layoutBath}卫`;
}

function buildTitle(building, room, layoutLabel) {
  return [String(building || "").trim(), String(room || "").trim(), String(layoutLabel || "").trim()].filter(Boolean).join(" ");
}

function parseLayoutToForm(layout) {
  const text = String(layout || "");
  if (!text || text.includes("单间")) return { layoutRoomType: "单间", layoutHall: "0", layoutBath: "1" };
  const roomMatch = text.match(/(\d+)\s*[室房]/);
  const hallMatch = text.match(/(\d+)\s*厅/);
  const bathMatch = text.match(/(\d+)\s*卫/);
  return {
    layoutRoomType: `${roomMatch?.[1] || "1"}室`,
    layoutHall: hallMatch?.[1] || "1",
    layoutBath: bathMatch?.[1] || "1",
  };
}

function makeForm() {
  return {
    building: "",
    address: "",
    propertyType: PROPERTY_TYPES[0],
    bankAccount: BANK_ACCOUNTS[0],
    room: "",
    floor: "1",
    totalFloor: "1",
    rent: "",
    layoutRoomType: "单间",
    layoutHall: "0",
    layoutBath: "1",
    cycle: CYCLES[0],
    usageType: USAGE_TYPES[0],
    noWaterMeter: false,
    elevator: "楼梯",
    roomConfigs: [],
    notes: "",
  };
}

export default function PropertiesPage() {
  const [properties, setProperties] = useState(apiEnabled ? [] : fallbackProperties);
  const [tenants, setTenants] = useState(apiEnabled ? [] : fallbackTenants);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(apiEnabled);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(makeForm());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!apiEnabled) {
        setLoading(false);
        return;
      }
      try {
        const [p, t, r] = await Promise.all([fetchProperties(), fetchTenants(), fetchRecords()]);
        if (cancelled) return;
        setProperties(Array.isArray(p) ? p : []);
        setTenants(Array.isArray(t) ? t : []);
        setRecords(Array.isArray(r) ? r : []);
        setError("");
      } catch (e) {
        if (!cancelled) setError(e.message || "读取房产失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const tenantMap = useMemo(() => {
    const m = new Map();
    (tenants || [])
      .filter((t) => !t.archived)
      .forEach((t) => m.set(`${String(t.building || "").trim()}::${normalizeRoomKey(t.room)}`, t));
    return m;
  }, [tenants]);

  const metrics = useMemo(() => {
    const total = properties.length;
    const selfUse = properties.filter((p) => String(p.usageType || "") === "自用（不出租）").length;
    const rentable = Math.max(0, total - selfUse);
    const rented = properties.filter((p) => String(p.usageType || "") !== "自用（不出租）" && tenantMap.has(`${String(p.building || "").trim()}::${normalizeRoomKey(p.room)}`)).length;
    return { total, rented, vacant: Math.max(0, rentable - rented), selfUse };
  }, [properties, tenantMap]);

  const list = useMemo(() => {
    return (properties || [])
      .map((p) => {
        const key = `${String(p.building || "").trim()}::${normalizeRoomKey(p.room)}`;
        const tenant = tenantMap.get(key);
        const usageType = String(p.usageType || USAGE_TYPES[0]);
        const isSelfUse = usageType === "自用（不出租）";
        // 当月收租状态
        const curCycle = new Date().toISOString().slice(0, 7);
        const monthRec = (records || []).find((r) => {
          const parsed = parseRoomText(r.room || "");
          const rKey = `${parsed.building}::${normalizeRoomKey(parsed.room)}`;
          return rKey === key && String(r.cycle || "").trim() === curCycle;
        });
        let payStatus = null;
        if (monthRec && !isSelfUse) {
          const paid = Array.isArray(monthRec.payments) ? monthRec.payments.reduce((s, p) => s + Number(p.amount || 0), 0) : Number(monthRec.received || 0);
          const due = Number(monthRec.receivable || 0);
          if (paid >= due && due > 0) payStatus = { label: "已收", cls: "text-emerald-600" };
          else if (paid > 0) payStatus = { label: `部分 ¥${paid.toFixed(0)}/¥${due.toFixed(0)}`, cls: "text-amber-600" };
          else payStatus = { label: "待收", cls: "text-rose-600" };
        }
        return {
          ...p,
          usageType,
          status: isSelfUse ? "自用" : tenant ? "已出租" : "闲置",
          tenantName: tenant?.name || "",
          tenantPhone: tenant?.phone || "",
          displayRent: isSelfUse ? 0 : tenant?.rent ?? p.rent ?? 0,
          payStatus,
        };
      })
      .filter((p) => {
        const kw = search.trim();
        const matchedKeyword = !kw || [p.building, p.room, p.title, p.address, p.tenantName].some((x) => String(x || "").includes(kw));
        if (p.status === "自用") return false;
        if (!matchedKeyword) return false;
        if (statusFilter === "rented") return p.status === "已出租";
        if (statusFilter === "vacant") return p.status === "闲置";
        return true;
      })
      .sort((a, b) => `${a.building || ""}${a.room || ""}`.localeCompare(`${b.building || ""}${b.room || ""}`, "zh-Hans-CN"));
  }, [properties, tenantMap, records, search, statusFilter]);

  function openCreate() {
    setEditing(null);
    setForm(makeForm());
    setOpen(true);
  }

  function openEdit(item) {
    const roomConfigs = Array.isArray(item.roomConfigs) ? item.roomConfigs : Array.isArray(item.roomInventory) ? item.roomInventory : [];
    const layoutParsed = parseLayoutToForm(item.layout);
    const tags = Array.isArray(item.tags) ? item.tags : [];
    const tenantKey = `${String(item.building || "").trim()}::${normalizeRoomKey(item.room)}`;
    const matchedTenant = tenantMap.get(tenantKey);
    setEditing(item);
    setForm({
      building: item.building || "",
      address: item.address || "",
      propertyType: item.propertyType || PROPERTY_TYPES[0],
      bankAccount: item.bankAccount || BANK_ACCOUNTS[0],
      room: item.room || "",
      floor: String(item.floor || "1"),
      totalFloor: String(item.totalFloor || "1"),
      rent: String(matchedTenant?.rent ?? item.rent ?? ""),
      cycle: CYCLES.find((x) => tags.includes(x)) || CYCLES[0],
      usageType: item.usageType || USAGE_TYPES[0],
      noWaterMeter: Boolean(item.noWaterMeter),
      elevator: tags.includes("电梯") ? "电梯" : "楼梯",
      roomConfigs,
      notes: item.notes || "",
      ...layoutParsed,
    });
    setOpen(true);
  }

  function toggleRoomConfig(name) {
    setForm((prev) => {
      const has = prev.roomConfigs.includes(name);
      return { ...prev, roomConfigs: has ? prev.roomConfigs.filter((x) => x !== name) : [...prev.roomConfigs, name] };
    });
  }

  async function save() {
    try {
      const layoutLabel = getLayoutLabel(form);
      const payload = {
        ...(editing || {}),
        building: String(form.building || "").trim(),
        room: String(form.room || "").trim(),
        floor: toNum(form.floor, 1),
        totalFloor: toNum(form.totalFloor, 1),
        layout: layoutLabel,
        title: buildTitle(form.building, form.room, layoutLabel),
        address: getDefaultAddress(form.building, form.address),
        rent: toNum(form.rent, 0),
        usageType: form.usageType || USAGE_TYPES[0],
        noWaterMeter: Boolean(form.noWaterMeter),
        propertyType: form.propertyType,
        bankAccount: form.bankAccount,
        roomConfigs: form.roomConfigs,
        roomInventory: form.roomConfigs,
        notes: String(form.notes || "").trim(),
        tags: [form.cycle, form.elevator, form.bankAccount, ...form.roomConfigs].filter(Boolean),
      };
      if (apiEnabled) {
        const saved = editing ? await updateProperty(editing.id, payload) : await createProperty(payload);
        setProperties((prev) => (editing ? prev.map((x) => (x.id === editing.id ? saved : x)) : [saved, ...prev]));
      } else {
        const local = { ...payload, id: editing?.id || `prop-local-${Date.now()}` };
        setProperties((prev) => (editing ? prev.map((x) => (x.id === editing.id ? local : x)) : [local, ...prev]));
      }
      setOpen(false);
      setEditing(null);
      setError("");
    } catch (e) {
      setError(e.message || "保存房产失败");
    }
  }

  const [confirmState, setConfirmState] = useState({ open: false, title: "", message: "", tone: "danger", onConfirm: null });
  function openConfirm(title, message, onConfirm) { setConfirmState({ open: true, title, message, tone: "danger", onConfirm }); }
  function closeConfirm() { setConfirmState({ open: false, title: "", message: "", tone: "danger", onConfirm: null }); }

  async function removeItem(item) {
    openConfirm("删除房产", `确认删除：${item.title || `${item.building} ${item.room}`}`, async () => {
      closeConfirm();
      try {
        if (apiEnabled) await deleteProperty(item.id);
        setProperties((prev) => prev.filter((x) => x.id !== item.id));
      } catch (e) { setError(e.message || "删除失败"); }
    });
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">房产管理</h1>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <button type="button" onClick={() => setStatusFilter("all")} className={`rounded-2xl border p-4 text-left ${statusFilter === "all" ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"}`}>
            <div className="flex items-center gap-3"><span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-blue-500 text-white"><Building2 className="h-4 w-4" /></span><div><div className="text-2xl font-semibold text-blue-600">{metrics.total}</div><div className="text-sm text-slate-700">房产总数</div></div></div>
          </button>
          <button type="button" onClick={() => setStatusFilter("rented")} className={`rounded-2xl border p-4 text-left ${statusFilter === "rented" ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"}`}>
            <div className="flex items-center gap-3"><span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white"><Home className="h-4 w-4" /></span><div><div className="text-2xl font-semibold text-emerald-600">{metrics.rented}</div><div className="text-sm text-slate-700">已出租</div></div></div>
          </button>
          <button type="button" onClick={() => setStatusFilter("vacant")} className={`rounded-2xl border p-4 text-left ${statusFilter === "vacant" ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-white"}`}>
            <div className="flex items-center gap-3"><span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-rose-500 text-white"><Home className="h-4 w-4" /></span><div><div className="text-2xl font-semibold text-rose-600">{metrics.vacant}</div><div className="text-sm text-slate-700">闲置</div><div className="text-xs text-slate-500">自用 {metrics.selfUse}（不计空置）</div></div></div>
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input className="h-11 w-full max-w-md rounded-xl border border-slate-200 bg-white px-4 text-sm" placeholder="搜索房号、楼栋、地址、租客" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700" type="button" onClick={openCreate}><Plus className="h-4 w-4" />新增</button>
        </div>
        {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
        {loading ? <p className="mt-2 text-sm text-slate-500">加载中...</p> : null}
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        {(() => {
          const groups = new Map();
          list.forEach((item) => {
            const bld = item.building || "其他";
            if (!groups.has(bld)) groups.set(bld, []);
            groups.get(bld).push(item);
          });
          return Array.from(groups.entries()).map(([building, items]) => (
            <div key={building} className="mb-5 last:mb-0">
              <div className="mb-3 flex items-center gap-2">
                <span className="inline-block h-5 w-1 rounded-full bg-sky-500" />
                <h3 className="text-sm font-bold text-slate-800">{building}</h3>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{items.length} 间</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {items.map((item) => (
                  <article key={item.id} className={`rounded-xl border p-3 ${item.status === "已出租" ? "border-emerald-200 bg-white" : item.status === "自用" ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white"}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-sm font-bold text-sky-700">{item.building || "-"}</div>
                        <div className="text-2xl font-bold tracking-tight text-slate-900">{item.room || "-"}</div>
                      </div>
                      <span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-semibold ${item.status === "已出租" ? "bg-emerald-100 text-emerald-700" : item.status === "自用" ? "bg-slate-200 text-slate-500" : "bg-rose-100 text-rose-700"}`}>{item.status}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      {item.status !== "自用" && item.displayRent > 0 ? (
                        <span className="text-lg font-bold text-emerald-700">{formatCurrency(item.displayRent || 0)}<span className="text-xs font-normal text-slate-400">/月</span></span>
                      ) : null}
                      {item.payStatus && (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${item.payStatus.label === "已收" ? "bg-emerald-100 text-emerald-700" : item.payStatus.label.includes("部分") ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"}`}>
                          {item.payStatus.label}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-sm">
                      {item.status === "已出租" ? (
                        <>
                          <span className="font-semibold text-slate-800 truncate">{item.tenantName || "-"}</span>
                          <span className="text-xs text-slate-400 truncate">{item.tenantPhone || ""}</span>
                        </>
                      ) : item.status === "自用" ? (
                        <span className="text-xs text-slate-400">不出租</span>
                      ) : (
                        <span className="text-xs text-rose-500">待出租</span>
                      )}
                    </div>
                    {Array.isArray(item.roomConfigs) && item.roomConfigs.length ? (
                      <div className="mt-2 flex flex-wrap gap-1">{item.roomConfigs.slice(0, 4).map((cfg) => <span key={`${item.id}-${cfg}`} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{cfg}</span>)}</div>
                    ) : null}
                    <div className="mt-2.5 flex gap-1.5">
                      <button className="flex-1 rounded-lg border border-slate-200 py-1.5 text-xs text-slate-600 hover:bg-slate-50" type="button" onClick={() => openEdit(item)}>修改</button>
                      <button className="flex-1 rounded-lg border border-rose-200 py-1.5 text-xs text-rose-600 hover:bg-rose-50" type="button" onClick={() => removeItem(item)}>删除</button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ));
        })()}
      </section>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/35 p-4">
          <div className="my-4 w-full max-w-4xl rounded-2xl bg-white p-5 max-h-[92vh] overflow-y-auto">
            <h3 className="text-lg font-semibold">{editing ? "修改房产" : "新增房产"}</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">房产名<input className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3" value={form.building} onChange={(e) => setForm((p) => ({ ...p, building: e.target.value }))} /></label>
              <label className="text-sm font-semibold text-slate-700">详细地址<input className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3" value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} /></label>
              <label className="text-sm font-semibold text-slate-700">房产类型<select className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3" value={form.propertyType} onChange={(e) => setForm((p) => ({ ...p, propertyType: e.target.value }))}>{PROPERTY_TYPES.map((x) => <option key={x}>{x}</option>)}</select></label>
              <label className="text-sm font-semibold text-slate-700">收款账号<select className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3" value={form.bankAccount} onChange={(e) => setForm((p) => ({ ...p, bankAccount: e.target.value }))}>{BANK_ACCOUNTS.map((x) => <option key={x}>{x}</option>)}</select></label>
              <label className="text-sm font-semibold text-slate-700">用途<select className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3" value={form.usageType} onChange={(e) => setForm((p) => ({ ...p, usageType: e.target.value }))}>{USAGE_TYPES.map((x) => <option key={x}>{x}</option>)}</select></label>
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={Boolean(form.noWaterMeter)} onChange={(e) => setForm((p) => ({ ...p, noWaterMeter: e.target.checked }))} />
                无用水（跳过水费保底）
              </label>
              <label className="text-sm font-semibold text-slate-700">房号<input className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3" value={form.room} onChange={(e) => setForm((p) => ({ ...p, room: e.target.value }))} /></label>
              <label className="text-sm font-semibold text-slate-700">楼层<input className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3" value={form.floor} onChange={(e) => setForm((p) => ({ ...p, floor: e.target.value }))} /></label>
              <label className="text-sm font-semibold text-slate-700">总楼层<input className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3" value={form.totalFloor} onChange={(e) => setForm((p) => ({ ...p, totalFloor: e.target.value }))} /></label>
              <label className="text-sm font-semibold text-slate-700">每期租金<input className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3" value={form.rent} onChange={(e) => setForm((p) => ({ ...p, rent: e.target.value }))} disabled={form.usageType === "自用（不出租）"} /></label>

              <div className="md:col-span-2 grid grid-cols-3 gap-3">
                <label className="text-sm font-semibold text-slate-700">户型<select className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3" value={form.layoutRoomType} onChange={(e) => setForm((p) => e.target.value === "单间" ? { ...p, layoutRoomType: "单间", layoutHall: "0", layoutBath: "1" } : { ...p, layoutRoomType: e.target.value })}><option value="单间">单间</option>{Array.from({ length: 9 }).map((_, i) => <option key={`${i + 1}室`} value={`${i + 1}室`}>{`${i + 1}室`}</option>)}</select></label>
                <label className="text-sm font-semibold text-slate-700">厅<select className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3" value={form.layoutHall} onChange={(e) => setForm((p) => ({ ...p, layoutHall: e.target.value }))} disabled={form.layoutRoomType === "单间"}>{Array.from({ length: 10 }).map((_, i) => <option key={`${i}厅`} value={`${i}`}>{`${i}厅`}</option>)}</select></label>
                <label className="text-sm font-semibold text-slate-700">卫<select className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3" value={form.layoutBath} onChange={(e) => setForm((p) => ({ ...p, layoutBath: e.target.value }))} disabled={form.layoutRoomType === "单间"}>{Array.from({ length: 10 }).map((_, i) => <option key={`${i}卫`} value={`${i}`}>{`${i}卫`}</option>)}</select></label>
              </div>

              <label className="text-sm font-semibold text-slate-700 md:col-span-2">收租周期<select className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3" value={form.cycle} onChange={(e) => setForm((p) => ({ ...p, cycle: e.target.value }))}>{CYCLES.map((x) => <option key={x}>{x}</option>)}</select></label>

              <div className="md:col-span-2">
                <div className="text-sm font-semibold text-slate-700">房号配置</div>
                <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-3 md:grid-cols-5">
                  {ROOM_CONFIG_OPTIONS.map((name) => (
                    <label key={name} className="inline-flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.roomConfigs.includes(name)} onChange={() => toggleRoomConfig(name)} />{name}</label>
                  ))}
                </div>
              </div>
              <label className="text-sm font-semibold text-slate-700 md:col-span-2">备注
                <textarea
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2"
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded-xl border border-slate-300 px-4 py-2 text-sm" type="button" onClick={() => setOpen(false)}>取消</button>
              <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={save}>保存</button>
            </div>
          </div>
        </div>
      ) : null}
      <ConfirmDialog open={confirmState.open} title={confirmState.title} message={confirmState.message} tone={confirmState.tone} onCancel={closeConfirm} onConfirm={() => { const fn = confirmState.onConfirm; if (typeof fn === "function") fn(); }} />
    </div>
  );
}
