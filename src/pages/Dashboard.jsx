import React, { useEffect, useMemo, useState } from "react";
import { ClipboardList, DoorClosed, FileClock, Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiEnabled, fetchDashboard, fetchExpenses, fetchProperties, fetchRecords, fetchTenants } from "../lib/api";
import { formatCurrency } from "../lib/format";

const donutColors = ["#7da2ea", "#d1d5db"];

function isExpiringWithin30Days(dateString) {
  const end = new Date(dateString);
  if (Number.isNaN(end.getTime())) return false;
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  return diff >= 0 && diff <= 30 * 24 * 60 * 60 * 1000;
}

function getCurrentCycle() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function aggregateTrend(records, expenses) {
  const map = new Map();
  const ensure = (key) => {
    if (!map.has(key)) map.set(key, { month: key, income: 0, expenses: 0, profit: 0 });
    return map.get(key);
  };
  records.forEach((r) => {
    const m = String(r.cycle || "").match(/^(\d{4})-(\d{2})$/);
    if (!m) return;
    ensure(`${m[1]}-${m[2]}`).income += Number(r.received || 0);
  });
  expenses.forEach((e) => {
    const m = String(e.period || "").match(/^(\d{4})-(\d{2})$/);
    if (!m) return;
    ensure(`${m[1]}-${m[2]}`).expenses += Number(e.amount || 0);
  });
  return Array.from(map.values()).map(r => ({ ...r, profit: r.income - r.expenses })).sort((a, b) => String(a.month).localeCompare(String(b.month)));
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(apiEnabled);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [properties, setProperties] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [records, setRecords] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [showAudit, setShowAudit] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!apiEnabled) {
        setLoading(false);
        return;
      }
      try {
        const [dashboard, p, t, r, e] = await Promise.all([
          fetchDashboard(),
          fetchProperties(),
          fetchTenants(),
          fetchRecords(),
          fetchExpenses(),
        ]);
        if (!cancelled) {
          setDashboardStats(dashboard || null);
          setProperties(Array.isArray(p) ? p : []);
          setTenants(Array.isArray(t) ? t : []);
          setRecords(Array.isArray(r) ? r : []);
          setExpenses(Array.isArray(e) ? e : []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeTenants = useMemo(() => tenants.filter((item) => !item.archived), [tenants]);
  const occupiedRooms = useMemo(() => new Set(activeTenants.map((item) => String(item.room || ""))), [activeTenants]);
  const currentCycle = useMemo(() => getCurrentCycle(), []);

  const monthRecords = useMemo(
    () => records.filter((r) => String(r.cycle || "").trim() === currentCycle),
    [records, currentCycle],
  );
  const monthExpenses = useMemo(
    () => expenses.filter((e) => String(e.period || "").trim() === currentCycle),
    [expenses, currentCycle],
  );

  const derivedStats = useMemo(() => {
    const receivableAll = records.reduce((sum, item) => sum + Number(item.receivable || 0), 0);
    const receivedAll = records.reduce((sum, item) => sum + Number(item.received || 0), 0);
    const expensesAll = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const receivableMonth = monthRecords.reduce((sum, item) => sum + Number(item.receivable || 0), 0);
    const receivedMonth = monthRecords.reduce((sum, item) => sum + Number(item.received || 0), 0);
    const expenseMonth = monthExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const unpaidCount = records.filter((item) => Number(item.receivable || 0) > Number(item.received || 0)).length;
    const overdueCount = records.filter((item) => {
      const due = new Date(item.dueDate);
      if (Number.isNaN(due.getTime())) return false;
      return due.getTime() < Date.now() && Number(item.receivable || 0) > Number(item.received || 0);
    }).length;
    const selfUseCount = properties.filter((item) => String(item.usageType || "") === "自用（不出租）").length;
    const vacantCount = Math.max(0, properties.length - activeTenants.length - selfUseCount);
    const expiring = activeTenants.filter((item) => isExpiringWithin30Days(item.leaseEnd)).length;

    return {
      unpaid30Days: unpaidCount,
      expiringLeases: expiring,
      ownerPending: overdueCount,
      vacantRooms: vacantCount,
      monthlyReceivable: receivableMonth,
      monthlyReceived: receivedMonth,
      monthlyPayable: expenseMonth,
      monthlyPaid: expenseMonth,
      actualProfit: receivedMonth - expenseMonth,
      bookedProfit: receivableMonth - expenseMonth,
      collectionRate: receivableMonth > 0 ? Math.round((receivedMonth / receivableMonth) * 100) : 100,
      totalReceivable: receivableAll,
      totalReceived: receivedAll,
      totalExpenses: expensesAll,
      totalProfit: receivedAll - expensesAll,
    };
  }, [records, monthRecords, monthExpenses, expenses, properties, occupiedRooms, activeTenants]);

  const summary = { ...(dashboardStats || {}), ...derivedStats };

  const summaryCards = useMemo(
    () => [
      {
        title: "30天内未收",
        value: summary.unpaid30Days || 0,
        route: "/records",
        icon: ClipboardList,
        dotClass: "bg-rose-500",
        valueClass: "text-rose-500",
      },
      {
        title: "租约到期",
        value: summary.expiringLeases || 0,
        route: "/tenants",
        icon: FileClock,
        dotClass: "bg-amber-400",
        valueClass: "text-amber-500",
      },
      {
        title: "30天内逾期",
        value: summary.ownerPending || 0,
        route: "/records",
        icon: Wallet,
        dotClass: "bg-orange-500",
        valueClass: "text-orange-500",
      },
      {
        title: "空置房号",
        value: summary.vacantRooms || 0,
        route: "/reports/vacant-rooms",
        icon: DoorClosed,
        dotClass: "bg-blue-400",
        valueClass: "text-blue-500",
      },
    ],
    [summary],
  );

  const quickEntries = useMemo(
    () => [
      { title: "房产", value: `${properties.length} 套`, route: "/properties", hint: "楼栋与房号" },
      { title: "租客", value: `${activeTenants.length} 人`, route: "/tenants", hint: "当前在租" },
      { title: "账单", value: `${records.length} 笔`, route: "/records", hint: "收租台账" },
      { title: "到期提醒", value: `${summary.expiringLeases || 0} 条`, route: "/tenants", hint: "近期到期" },
    ],
    [properties.length, activeTenants.length, records.length, summary.expiringLeases],
  );

  const occupancyData = useMemo(
    () => [
      { name: "已租", value: occupiedRooms.size },
      { name: "空置", value: Math.max(0, properties.length - occupiedRooms.size) },
    ],
    [occupiedRooms, properties.length],
  );

  const paymentData = useMemo(() => {
    const paid = records.filter((r) => Number(r.received || 0) >= Number(r.receivable || 0)).length;
    const unpaid = Math.max(0, records.length - paid);
    return [
      { name: "已交租", value: paid },
      { name: "未交租", value: unpaid },
    ];
  }, [records]);

  const incomeExpenseData = useMemo(
    () => [
      { name: "本月收入", value: Number(summary.monthlyReceived || 0) },
      { name: "本月支出", value: Number(summary.monthlyPaid || 0).toFixed(2) },
    ],
    [summary],
  );

  const financialTrend = useMemo(() => aggregateTrend(records, expenses), [records, expenses]);
  const auditRows = useMemo(
    () => [
      { name: "房产总数", value: properties.length, formula: "properties.length" },
      { name: "当前在租租客", value: activeTenants.length, formula: "tenants.filter(!archived).length" },
      { name: "账单总笔数", value: records.length, formula: "records.length" },
      { name: "空置房号", value: summary.vacantRooms || 0, formula: "房产总数 - 已占用房号数" },
      { name: "30天内未收", value: summary.unpaid30Days || 0, formula: "receivable > received 的账单数" },
      { name: "30天内逾期", value: summary.ownerPending || 0, formula: "dueDate < 今天 且 receivable > received" },
      { name: "租约到期", value: summary.expiringLeases || 0, formula: "leaseEnd 在30天内的在租租客数" },
      { name: `本月应收(${currentCycle})`, value: Number(summary.monthlyReceivable || 0).toFixed(2), formula: "sum(records[cycle=本月].receivable)" },
      { name: `本月已收(${currentCycle})`, value: Number(summary.monthlyReceived || 0).toFixed(2), formula: "sum(records[cycle=本月].received)" },
      { name: "累计应收", value: Number(summary.totalReceivable || 0).toFixed(2), formula: "sum(records.receivable)" },
      { name: "累计已收", value: Number(summary.totalReceived || 0).toFixed(2), formula: "sum(records.received)" },
    ],
    [properties.length, activeTenants.length, records.length, summary, currentCycle],
  );

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
        <h1 className="text-3xl font-semibold text-slate-900">首页工作台</h1>
        <p className="mt-2 text-sm text-slate-500">核心指标与快捷入口</p>
        {loading ? <p className="mt-2 text-sm text-slate-500">正在同步最新数据...</p> : null}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((item) => (
          <button
            key={item.title}
            className="rounded-[20px] bg-white p-4 text-left ring-1 ring-sky-100 transition hover:bg-slate-50"
            onClick={() => navigate(item.route)}
            type="button"
          >
            <div className="flex items-center gap-3">
              <div className={`flex h-12 w-12 items-center justify-center rounded-full text-white ${item.dotClass}`}>
                <item.icon className="h-6 w-6" />
              </div>
              <div>
                <div className={`text-2xl font-semibold leading-none ${item.valueClass}`}>{item.value}</div>
                <p className="mt-1 text-lg font-medium text-slate-800">{item.title}</p>
              </div>
            </div>
          </button>
        ))}
      </section>

      <section className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
        <h2 className="text-xl font-semibold text-slate-900">快捷入口</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {quickEntries.map((item) => (
            <article key={item.title} className="rounded-[20px] bg-slate-50 p-4 ring-1 ring-slate-200">
              <p className="text-sm text-slate-600">{item.title}</p>
              <button
                className="mt-2 text-2xl font-semibold text-slate-800 transition hover:text-sky-900"
                onClick={() => navigate(item.route)}
                type="button"
              >
                {item.value}
              </button>
              <p className="mt-1 text-xs text-slate-500">{item.hint}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <article className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <h3 className="text-xl font-semibold text-slate-900">年度财务收支走势</h3>
          <div className="mt-4 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={financialTrend}>
                <CartesianGrid stroke="#dbeafe" strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(v) => formatCurrency(Number(v) || 0)} />
                <Legend />
                <Line type="monotone" dataKey="income" name="收入(已收)" stroke="#ef4444" strokeWidth={2} />
                <Line type="monotone" dataKey="expenses" name="支出" stroke="#22c55e" strokeWidth={2} />
                <Line type="monotone" dataKey="profit" name="利润" stroke="#60a5fa" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <h3 className="text-xl font-semibold text-slate-900">本月资产总览（{currentCycle}）</h3>
          <div className="mt-4 space-y-4 text-xl">
            <div>
              <div className="text-slate-500">应收 {Number(summary.monthlyReceivable || 0).toFixed(2)}</div>
              <div className="mt-2 h-4 rounded bg-slate-100" />
              <div className="mt-2 flex justify-between">
                <span className="text-red-500">已收 {Number(summary.monthlyReceived || 0).toFixed(2)}</span>
                <span className="text-slate-700">
                  {Math.max(0, Number(summary.monthlyReceivable || 0) - Number(summary.monthlyReceived || 0)).toFixed(2)} 待收
                </span>
              </div>
            </div>
            <div>
              <div className="text-slate-500">应付 {Number(summary.monthlyPayable || 0).toFixed(2)}</div>
              <div className="mt-2 h-4 rounded bg-slate-100" />
              <div className="mt-2 flex justify-between">
                <span className="text-green-500">已付 {Number(summary.monthlyPaid || 0).toFixed(2)}</span>
                <span className="text-slate-700">来自支出台账</span>
              </div>
            </div>
            <div>
              <div className="text-slate-500">实际利润 {Number(summary.actualProfit || 0).toFixed(2)}</div>
              <div className="mt-2 h-4 rounded bg-slate-100" />
              <div className="mt-2 flex justify-between">
                <span className="text-slate-800">累计应收 {Number(summary.totalReceivable || 0).toFixed(2)}</span>
                <span className="text-slate-700">累计已收 {Number(summary.totalReceived || 0).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <article className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <h3 className="text-xl font-semibold text-slate-900">入住率</h3>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip />
                <Legend />
                <Pie data={occupancyData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} fill={donutColors[0]} label>
                  {occupancyData.map((_, i) => (
                    <Cell key={i} fill={donutColors[i % donutColors.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <h3 className="text-xl font-semibold text-slate-900">交租状态</h3>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip />
                <Legend />
                <Pie data={paymentData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} fill={donutColors[0]} label>
                  {paymentData.map((_, i) => (
                    <Cell key={i} fill={donutColors[i % donutColors.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <h3 className="text-xl font-semibold text-slate-900">收支统计</h3>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip />
                <Legend />
                <Pie data={incomeExpenseData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} fill={donutColors[0]} label>
                  {incomeExpenseData.map((_, i) => (
                    <Cell key={i} fill={donutColors[i % donutColors.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </article>
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">数据对账明细</h3>
          <button
            className="rounded-lg border border-sky-200 px-3 py-1.5 text-sm text-sky-700 hover:bg-slate-50"
            onClick={() => setShowAudit((v) => !v)}
            type="button"
          >
            {showAudit ? "收起" : "展开"}
          </button>
        </div>
        {showAudit ? (
          <div className="mt-3 overflow-auto rounded-xl border border-slate-100">
            <table className="min-w-full text-sm">
              <thead className="bg-sky-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left">指标</th>
                  <th className="px-3 py-2 text-left">当前值</th>
                  <th className="px-3 py-2 text-left">计算方式</th>
                </tr>
              </thead>
              <tbody>
                {auditRows.map((row) => (
                  <tr key={row.name} className="border-t border-slate-100">
                    <td className="px-3 py-2">{row.name}</td>
                    <td className="px-3 py-2 font-medium text-slate-900">{row.value}</td>
                    <td className="px-3 py-2 text-slate-500">{row.formula}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}

