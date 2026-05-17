import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiEnabled, fetchContracts, fetchProfitReport, fetchRecords, fetchSettings, fetchWorkOrders } from "../lib/api";
import { formatCurrency } from "../lib/format";

function paidAmount(record = {}) {
  if (Array.isArray(record.payments) && record.payments.length) {
    return record.payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  }
  return Number(record.received || 0);
}

export default function OpsCenterPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(apiEnabled);
  const [error, setError] = useState("");
  const [records, setRecords] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [profitReport, setProfitReport] = useState({ byRoom: [] });
  const [opsRules, setOpsRules] = useState({ contractDueDays: 30, unpaidHighAmount: 1000, lowProfitThreshold: 0 });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!apiEnabled) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const [r, c, w, p, s] = await Promise.all([
          fetchRecords(),
          fetchContracts(),
          fetchWorkOrders(),
          fetchProfitReport(),
          fetchSettings(),
        ]);
        if (cancelled) return;
        setRecords(Array.isArray(r) ? r : []);
        setContracts(Array.isArray(c) ? c : []);
        setWorkOrders(Array.isArray(w) ? w : []);
        setProfitReport(p || { byRoom: [] });
        setOpsRules({
          contractDueDays: Number(s?.opsRules?.contractDueDays || 30),
          unpaidHighAmount: Number(s?.opsRules?.unpaidHighAmount || 1000),
          lowProfitThreshold: Number(s?.opsRules?.lowProfitThreshold || 0),
        });
        setError("");
      } catch (e) {
        if (!cancelled) setError(e.message || "读取运营告警失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const alerts = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const unpaidRows = (records || [])
      .map((x) => {
        const due = Number(x.receivable || 0);
        const paid = paidAmount(x);
        const unpaid = Math.max(0, due - paid);
        return { ...x, unpaid };
      })
      .filter((x) => x.unpaid >= Number(opsRules.unpaidHighAmount || 0))
      .sort((a, b) => Number(b.unpaid || 0) - Number(a.unpaid || 0));

    const dueContracts = (contracts || [])
      .map((x) => {
        const end = new Date(String(x.endDate || ""));
        const days = Number.isNaN(end.getTime()) ? null : Math.ceil((end.getTime() - today.getTime()) / 86400000);
        return { ...x, days };
      })
      .filter((x) => x.days != null && x.days >= 0 && x.days <= Number(opsRules.contractDueDays || 30))
      .sort((a, b) => Number(a.days || 0) - Number(b.days || 0));

    const activeWorkOrders = (workOrders || [])
      .filter((x) => String(x.status || "") !== "done" && String(x.status || "") !== "cancelled")
      .sort((a, b) => String(a.date || "").localeCompare(String(b.date || ""), "zh-Hans-CN", { numeric: true }));

    const lowProfit = (profitReport.byRoom || [])
      .filter((x) => Boolean(x.lowProfit) && Number(x.profit || 0) <= Number(opsRules.lowProfitThreshold || 0))
      .sort((a, b) => Number(a.profit || 0) - Number(b.profit || 0));

    return { unpaidRows, dueContracts, activeWorkOrders, lowProfit };
  }, [records, contracts, workOrders, profitReport, opsRules]);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-2xl font-semibold text-slate-900">运营告警中心</h1>
        <p className="mt-1 text-sm text-slate-500">
          规则：到期≤{opsRules.contractDueDays}天，未收≥{formatCurrency(opsRules.unpaidHighAmount)}，低收益≤{formatCurrency(opsRules.lowProfitThreshold)}。
        </p>
        {loading ? <p className="mt-2 text-sm text-slate-500">正在同步告警数据...</p> : null}
        {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <button className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-left" type="button" onClick={() => navigate("/records")}>
          <div className="text-xs text-rose-700">高额未收账单</div>
          <div className="mt-1 text-2xl font-semibold text-rose-700">{alerts.unpaidRows.length}</div>
        </button>
        <button className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left" type="button" onClick={() => navigate("/contracts")}>
          <div className="text-xs text-amber-700">{opsRules.contractDueDays}天内到期合同</div>
          <div className="mt-1 text-2xl font-semibold text-amber-700">{alerts.dueContracts.length}</div>
        </button>
        <button className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-left" type="button" onClick={() => navigate("/work-orders")}>
          <div className="text-xs text-sky-700">未完成工单</div>
          <div className="mt-1 text-2xl font-semibold text-sky-700">{alerts.activeWorkOrders.length}</div>
        </button>
        <button className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-left" type="button" onClick={() => navigate("/reports/vacant-rooms?tab=operating")}>
          <div className="text-xs text-violet-700">低收益房号</div>
          <div className="mt-1 text-2xl font-semibold text-violet-700">{alerts.lowProfit.length}</div>
        </button>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">高优先级未收（Top 20）</h2>
          <button className="rounded border border-slate-300 px-2 py-1 text-xs" type="button" onClick={() => navigate("/records")}>去收租台账</button>
        </div>
        <div className="overflow-x-auto">
          <table className="ui-table min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-left">账期</th>
                <th className="px-3 py-2 text-left">房号</th>
                <th className="px-3 py-2 text-left">租客</th>
                <th className="px-3 py-2 text-left">未收</th>
              </tr>
            </thead>
            <tbody>
              {alerts.unpaidRows.slice(0, 20).map((x) => (
                <tr key={x.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{x.cycle || "-"}</td>
                  <td className="px-3 py-2">{x.room || "-"}</td>
                  <td className="px-3 py-2">{x.tenant || "-"}</td>
                  <td className="px-3 py-2 text-rose-700">{formatCurrency(x.unpaid || 0)}</td>
                </tr>
              ))}
              {!alerts.unpaidRows.length ? (
                <tr>
                  <td className="px-3 py-4 text-slate-500" colSpan={4}>当前无高额未收账单</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
