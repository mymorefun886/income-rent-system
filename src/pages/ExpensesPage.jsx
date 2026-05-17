import React, { useEffect, useMemo, useState } from "react";
import { Download, Edit3, Plus, Trash2, Wallet } from "lucide-react";
import ConfirmDialog from "../components/ConfirmDialog";
import {
  apiEnabled,
  createWorkOrder,
  createExpense,
  deleteExpense,
  fetchExpenses,
  fetchProperties,
  updateExpense,
} from "../lib/api";

const CATEGORY_OPTIONS = ["水费", "电费", "充电桩", "燃气费", "宽带费", "物业管理费", "税费", "日常维修", "其他"];
const PAYMENT_METHODS = ["微信", "支付宝", "银行卡", "现金", "其他"];

function nowDate() {
  return new Date().toISOString().slice(0, 10);
}

function nowPeriod() {
  return new Date().toISOString().slice(0, 7);
}

function makeForm() {
  return {
    date: nowDate(),
    period: nowPeriod(),
    propertyId: "",
    propertyLabel: "",
    room: "",
    category: CATEGORY_OPTIONS[0],
    amount: "",
    payee: "",
    paymentMethod: PAYMENT_METHODS[0],
    allocationMode: "single",
    sharedByRoomsText: "",
    sourceBillId: "",
    workOrderId: "",
    invoiceNo: "",
    note: "",
  };
}

function formatMoney(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(apiEnabled);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(makeForm());
  const [workOrderForm, setWorkOrderForm] = useState({
    propertyId: "",
    propertyLabel: "",
    building: "",
    room: "",
    type: "维修",
    description: "",
    amount: "",
    status: "open",
  });
  const [bulkText, setBulkText] = useState("");
  const [confirmState, setConfirmState] = useState({ open: false, title: "", message: "", tone: "warn", onConfirm: null });

  function openConfirm(title, message, onConfirm, tone = "warn") {
    setConfirmState({ open: true, title, message, tone, onConfirm });
  }
  function closeConfirm() {
    setConfirmState({ open: false, title: "", message: "", tone: "warn", onConfirm: null });
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!apiEnabled) {
        setLoading(false);
        return;
      }
      try {
        const [e, p] = await Promise.all([fetchExpenses(), fetchProperties()]);
        if (cancelled) return;
        setExpenses(Array.isArray(e) ? e : []);
        setProperties(Array.isArray(p) ? p : []);
        setError("");
      } catch (err) {
        if (!cancelled) setError(err.message || "读取支出失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const propertyOptions = useMemo(() => {
    const rooms = (properties || []).map((p) => {
      const label = p.title || `${p.building || ""} ${p.room || ""}`.trim();
      return { id: p.id, label, room: String(p.room || ""), building: String(p.building || ""), kind: "room" };
    });
    // 去重提取整栋选项
    const buildingSet = new Map();
    rooms.forEach((r) => {
      if (r.building && !buildingSet.has(r.building)) buildingSet.set(r.building, { id: `building-${r.building}`, label: `${r.building}（整栋）`, room: "", building: r.building, kind: "building" });
    });
    return [...Array.from(buildingSet.values()), ...rooms];
  }, [properties]);

  const periodOptions = useMemo(() => {
    const set = new Set((expenses || []).map((x) => String(x.period || "").trim()).filter(Boolean));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [expenses]);

  const filtered = useMemo(() => {
    const q = search.trim();
    return (expenses || [])
      .filter((x) => (categoryFilter === "all" ? true : String(x.category || "") === categoryFilter))
      .filter((x) => (periodFilter === "all" ? true : String(x.period || "") === periodFilter))
      .filter((x) => {
        if (!q) return true;
        return [x.propertyLabel, x.room, x.category, x.payee, x.note, x.invoiceNo].some((v) => String(v || "").includes(q));
      })
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  }, [expenses, search, categoryFilter, periodFilter]);

  const totalAmount = useMemo(() => filtered.reduce((sum, x) => sum + Number(x.amount || 0), 0), [filtered]);

  function openCreate() {
    setEditing(null);
    setForm(makeForm());
    setOpen(true);
  }

  function openEdit(item) {
    setEditing(item);
    setForm({
      date: item.date || nowDate(),
      period: item.period || nowPeriod(),
      propertyId: item.propertyId || "",
      propertyLabel: item.propertyLabel || "",
      room: item.room || "",
      category: item.category || CATEGORY_OPTIONS[0],
      amount: String(item.amount ?? ""),
      payee: item.payee || "",
      paymentMethod: item.paymentMethod || PAYMENT_METHODS[0],
      allocationMode: item.allocationMode || "single",
      sharedByRoomsText: Array.isArray(item.sharedByRooms) ? item.sharedByRooms.join(",") : "",
      sourceBillId: item.sourceBillId || "",
      workOrderId: item.workOrderId || "",
      invoiceNo: item.invoiceNo || "",
      note: item.note || "",
    });
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setEditing(null);
  }

  function onPropertySelect(propertyId) {
    const found = propertyOptions.find((x) => x.id === propertyId);
    setForm((prev) => ({
      ...prev,
      propertyId,
      propertyLabel: found?.label || "",
      room: found?.room || prev.room,
    }));
  }

  function onWorkOrderPropertySelect(propertyId) {
    const found = propertyOptions.find((x) => x.id === propertyId);
    setWorkOrderForm((prev) => ({
      ...prev,
      propertyId,
      propertyLabel: found?.label || "",
      building: found?.label || "",
      room: found?.room || prev.room,
    }));
  }

  async function saveWorkOrder() {
    try {
      const order = await createWorkOrder({
        ...workOrderForm,
        amount: Number(workOrderForm.amount || 0),
        date: nowDate(),
        period: nowPeriod(),
      });
      if (order?.expenseId) {
        const latest = await fetchExpenses();
        setExpenses(Array.isArray(latest) ? latest : expenses);
      }
      setWorkOrderForm({ propertyId: "", propertyLabel: "", building: "", room: "", type: "维修", description: "", amount: "", status: "open" });
      setError(order?.expenseId ? "维修工单已创建，并已自动生成支出" : "维修工单已创建");
    } catch (err) {
      setError(err.message || "创建维修工单失败");
    }
  }

  async function save() {
    try {
      const payload = {
        ...form,
        amount: Number(form.amount || 0),
        sharedByRooms: String(form.sharedByRoomsText || "")
          .split(/[,\n，]/)
          .map((x) => x.trim())
          .filter(Boolean),
      };
      delete payload.sharedByRoomsText;
      const saved = editing ? await updateExpense(editing.id, payload) : await createExpense(payload);
      setExpenses((prev) => (editing ? prev.map((x) => (x.id === editing.id ? saved : x)) : [saved, ...prev]));
      setError("");
      closeModal();
    } catch (err) {
      setError(err.message || "保存支出失败");
    }
  }

  async function remove(item) {
    openConfirm(
      "删除支出",
      `确认删除支出：${item.category} / ${formatMoney(item.amount)} 元？`,
      async () => {
        closeConfirm();
        try {
          await deleteExpense(item.id);
          setExpenses((prev) => prev.filter((x) => x.id !== item.id));
          setError("");
        } catch (err) {
          setError(err.message || "删除支出失败");
        }
      },
      "danger",
    );
  }

  async function createBulkExpenses() {
    const lines = String(bulkText || "")
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (!lines.length) {
      setError("请先输入批量内容");
      return;
    }
    // format: 账期,楼栋,房号,分类,金额,收款方,支付方式,备注
    const parsed = lines.map((line, i) => {
      const parts = line.split(/[,\t，]/).map((x) => x.trim());
      const [period, building, room, category, amount, payee, paymentMethod, note] = parts;
      return { i: i + 1, period, building, room, category, amount, payee, paymentMethod, note };
    });
    const invalid = parsed.filter((x) => !x.period || !x.room || !x.category || !(Number(x.amount) > 0));
    if (invalid.length) {
      setError(`批量格式错误：第 ${invalid.slice(0, 5).map((x) => x.i).join(",")} 行。格式：账期,楼栋,房号,分类,金额,收款方,支付方式,备注`);
      return;
    }
    try {
      const created = [];
      for (const row of parsed) {
        const matched = (properties || []).find((p) => String(p.room || "") === String(row.room || "") && (!row.building || String(p.building || "") === String(row.building || "")));
        const payload = {
          date: `${row.period}-01`,
          period: row.period,
          propertyId: matched?.id || "",
          propertyLabel: matched?.title || `${row.building || ""} ${row.room || ""}`.trim(),
          room: row.room,
          category: row.category,
          amount: Number(row.amount || 0),
          payee: row.payee || "",
          paymentMethod: row.paymentMethod || PAYMENT_METHODS[0],
          allocationMode: "single",
          sharedByRooms: [],
          sourceBillId: "",
          workOrderId: "",
          invoiceNo: "",
          note: row.note || "",
        };
        created.push(await createExpense(payload));
      }
      setExpenses((prev) => [...created, ...prev]);
      setBulkText("");
      setError(`批量录入完成：${created.length} 条`);
    } catch (err) {
      setError(err.message || "批量录入失败");
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 mb-2"><div className="rounded-xl bg-rose-100 p-2.5 text-rose-700"><Wallet className="h-5 w-5" /></div><div><h1 className="text-2xl font-bold text-slate-900">支出台账</h1><p className="text-sm text-slate-500">水电、燃气、宽带、物业、税费等支出记录</p></div></div>
          <button className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700" type="button" onClick={openCreate}>
            <Plus className="mr-1 inline h-4 w-4" />新增支出
          </button>
          <button className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700" type="button" onClick={() => {
            const rows = [["日期", "账期", "房产", "分类", "金额", "收款方", "支付方式", "备注"]];
            filtered.forEach((e) => rows.push([e.date || "", e.period || "", e.propertyLabel || e.room || "", e.category || "", String(e.amount || 0), e.payee || "", e.paymentMethod || "", e.note || ""]));
            const csv = rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
            const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `expenses-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(a.href);
          }}>
            <Download className="mr-1 inline h-4 w-4" />导出 CSV
          </button>
          <input className="ml-auto rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="搜索房产/分类/收款方/备注" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <select className="rounded-xl border border-slate-300 px-3 py-2 text-sm" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="all">全部分类</option>
            {CATEGORY_OPTIONS.map((x) => (
              <option key={x} value={x}>{x}</option>
            ))}
          </select>
          <select className="rounded-xl border border-slate-300 px-3 py-2 text-sm" value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value)}>
            <option value="all">全部账期</option>
            {periodOptions.map((x) => (
              <option key={x} value={x}>{x}</option>
            ))}
          </select>
          <div className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700">筛选结果支出合计：¥ {formatMoney(totalAmount)}</div>
        </div>
        {loading ? <p className="mt-3 text-sm text-slate-500">正在读取支出数据...</p> : null}
        {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
      </section>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="text-lg font-semibold text-slate-900">批量录入（水费/电费/物业费/税费）</h2>
        <p className="mt-1 text-xs text-slate-500">每行格式：账期,楼栋,房号,分类,金额,收款方,支付方式,备注</p>
        <textarea
          className="mt-3 min-h-28 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          placeholder="示例：2026-05,西山东区17号,101,水费,55.5,水务,微信,5月水费"
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
        />
        <div className="mt-2 flex justify-end">
          <button className="rounded-xl border border-emerald-300 px-3 py-2 text-sm text-emerald-700" type="button" onClick={createBulkExpenses}>
            批量录入
          </button>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2">日期</th>
                <th className="px-3 py-2">账期</th>
                <th className="px-3 py-2">房产</th>
                <th className="px-3 py-2">房号</th>
                <th className="px-3 py-2">分类</th>
                <th className="px-3 py-2">金额</th>
                <th className="px-3 py-2">收款方</th>
                <th className="px-3 py-2">支付方式</th>
                <th className="px-3 py-2">发票号</th>
                <th className="px-3 py-2">备注</th>
                <th className="px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-2">{item.date || "-"}</td>
                  <td className="px-3 py-2">{item.period || "-"}</td>
                  <td className="px-3 py-2">{item.propertyLabel || "-"}</td>
                  <td className="px-3 py-2">{item.room || "-"}</td>
                  <td className="px-3 py-2">{item.category || "-"}</td>
                  <td className="px-3 py-2">¥ {formatMoney(item.amount)}</td>
                  <td className="px-3 py-2">{item.payee || "-"}</td>
                  <td className="px-3 py-2">{item.paymentMethod || "-"}</td>
                  <td className="px-3 py-2">{item.invoiceNo || "-"}</td>
                  <td className="px-3 py-2">{item.note || "-"}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button className="rounded-lg border border-slate-300 px-2 py-1 text-slate-700" type="button" onClick={() => openEdit(item)}><Edit3 className="h-4 w-4" /></button>
                      <button className="rounded-lg border border-rose-300 px-2 py-1 text-rose-700" type="button" onClick={() => remove(item)}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length ? (
                <tr>
                  <td className="px-3 py-8 text-center text-slate-500" colSpan={12}>暂无支出记录</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="text-lg font-semibold text-slate-900">维修工单快录</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <select className="rounded-xl border border-slate-300 px-3 py-2 text-sm" value={workOrderForm.propertyId} onChange={(e) => onWorkOrderPropertySelect(e.target.value)}>
            <option value="">选择房产</option>
            {propertyOptions.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
          <input className="rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="房号" value={workOrderForm.room} onChange={(e) => setWorkOrderForm((p) => ({ ...p, room: e.target.value }))} />
          <input className="rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="问题类型" value={workOrderForm.type} onChange={(e) => setWorkOrderForm((p) => ({ ...p, type: e.target.value }))} />
          <input className="rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="维修费用（可空）" value={workOrderForm.amount} onChange={(e) => setWorkOrderForm((p) => ({ ...p, amount: e.target.value }))} />
          <textarea className="min-h-16 rounded-xl border border-slate-300 px-3 py-2 text-sm md:col-span-3" placeholder="问题描述" value={workOrderForm.description} onChange={(e) => setWorkOrderForm((p) => ({ ...p, description: e.target.value }))} />
          <button className="rounded-xl border border-emerald-300 px-3 py-2 text-sm text-emerald-700" type="button" onClick={saveWorkOrder}>
            创建工单
          </button>
        </div>
      </section>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/35 p-4">
          <div className="my-4 w-full max-w-2xl rounded-2xl bg-white p-5">
            <h3 className="text-xl font-semibold">{editing ? "编辑支出" : "新增支出"}</h3>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="text-sm">支出日期<input type="date" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} /></label>
              <label className="text-sm">账期（YYYY-MM）<input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={form.period} onChange={(e) => setForm((p) => ({ ...p, period: e.target.value }))} /></label>
              <label className="text-sm">房产
                <select className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={form.propertyId} onChange={(e) => onPropertySelect(e.target.value)}>
                  <option value="">请选择</option>
                  {propertyOptions.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                </select>
              </label>
              <label className="text-sm">房号<input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={form.room} onChange={(e) => setForm((p) => ({ ...p, room: e.target.value }))} /></label>
              <label className="text-sm">分类
                <select className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}>
                  {CATEGORY_OPTIONS.map((x) => <option key={x}>{x}</option>)}
                </select>
              </label>
              <label className="text-sm">金额<input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} /></label>
              <label className="text-sm">收款方<input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={form.payee} onChange={(e) => setForm((p) => ({ ...p, payee: e.target.value }))} /></label>
              <label className="text-sm">支付方式
                <select className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={form.paymentMethod} onChange={(e) => setForm((p) => ({ ...p, paymentMethod: e.target.value }))}>
                  {PAYMENT_METHODS.map((x) => <option key={x}>{x}</option>)}
                </select>
              </label>
              <label className="text-sm">关联账单ID<input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={form.sourceBillId} onChange={(e) => setForm((p) => ({ ...p, sourceBillId: e.target.value }))} /></label>
              <label className="text-sm">关联维修单ID<input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={form.workOrderId} onChange={(e) => setForm((p) => ({ ...p, workOrderId: e.target.value }))} /></label>
              <label className="text-sm">发票号<input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={form.invoiceNo} onChange={(e) => setForm((p) => ({ ...p, invoiceNo: e.target.value }))} /></label>
              <label className="text-sm md:col-span-2">备注<textarea className="mt-1 min-h-20 w-full rounded-xl border border-slate-300 px-3 py-2" value={form.note} onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))} /></label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded-xl border border-slate-300 px-3 py-2" type="button" onClick={closeModal}>取消</button>
              <button className="rounded-xl bg-blue-600 px-3 py-2 text-white" type="button" onClick={save}>保存</button>
            </div>
          </div>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        tone={confirmState.tone}
        onCancel={closeConfirm}
        onConfirm={() => {
          const fn = confirmState.onConfirm;
          if (typeof fn === "function") fn();
        }}
      />
    </div>
  );
}


