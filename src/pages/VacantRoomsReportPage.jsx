import React, { useEffect, useMemo, useState } from "react";
import { BarChart3, Home, Table2 } from "lucide-react";
import { apiEnabled, fetchProperties, fetchTenants } from "../lib/api";
import { properties as fallbackProperties, tenants as fallbackTenants } from "../lib/mock-data";

function normalizeRoomKey(v) {
  return String(v || "").replace(/\s+/g, "").toUpperCase();
}

function makeRoomKey(building, room) {
  return `${String(building || "").trim()}::${normalizeRoomKey(room)}`;
}

function roomSortValue(room) {
  const text = String(room || "").trim().toUpperCase();
  const m = text.match(/([A-Z]*)(\d+)/);
  if (!m) return { prefix: text, num: Number.MAX_SAFE_INTEGER };
  return { prefix: m[1] || "", num: Number(m[2] || 0) };
}

function compareBuildingRoom(a, b) {
  const buildingCmp = String(a.building || "").localeCompare(String(b.building || ""), "zh-Hans-CN", {
    numeric: true,
    sensitivity: "base",
  });
  if (buildingCmp !== 0) return buildingCmp;
  const av = roomSortValue(a.room);
  const bv = roomSortValue(b.room);
  const prefixCmp = av.prefix.localeCompare(bv.prefix, "en", { sensitivity: "base" });
  if (prefixCmp !== 0) return prefixCmp;
  if (av.num !== bv.num) return av.num - bv.num;
  return String(a.room || "").localeCompare(String(b.room || ""), "zh-Hans-CN", { numeric: true });
}

function isTenantArchived(tenant) {
  const archived = tenant?.archived;
  const archivedText = String(archived ?? "").trim().toLowerCase();
  if (archived === true) return true;
  if (archivedText === "true" || archivedText === "1" || archivedText === "yes") return true;
  return String(tenant?.status ?? "").trim() === "历史租客";
}

function isActiveTenant(tenant) {
  if (isTenantArchived(tenant)) return false;
  const status = String(tenant?.status || "").trim();
  if (status === "已退租" || status === "退租") return false;
  return true;
}

function toDateMs(value) {
  const d = new Date(String(value || "").trim());
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function calcVacantDays(lastOccupiedMs) {
  const now = Date.now();
  if (!lastOccupiedMs || lastOccupiedMs > now) return 1;
  return Math.max(1, Math.ceil((now - lastOccupiedMs) / (24 * 60 * 60 * 1000)));
}

function buildVacantRows(properties, tenants) {
  const activeOccupied = new Set();
  const lastOccupiedByRoom = new Map();

  tenants.forEach((t) => {
    const building = String(t.building || "").trim();
    const room = String(t.room || "").trim();
    if (!building || !room) return;
    const key = makeRoomKey(building, room);

    const candidateMs =
      toDateMs(t.checkoutDate) ||
      toDateMs(t.updatedAt) ||
      toDateMs(t.leaseEnd) ||
      toDateMs(t.createdAt) ||
      0;
    const prev = lastOccupiedByRoom.get(key) || 0;
    if (candidateMs > prev) lastOccupiedByRoom.set(key, candidateMs);

    if (isActiveTenant(t)) activeOccupied.add(key);
  });

  return properties
    .filter((p) => String(p.usageType || "") !== "自用（不出租）")
    .map((p) => {
      const building = String(p.building || "").trim() || "未分组";
      const room = String(p.room || "").trim();
      const key = makeRoomKey(building, room);
      const occupied = activeOccupied.has(key);
      const lastOccupiedMs = lastOccupiedByRoom.get(key) || 0;
      const vacantDays = occupied ? 0 : calcVacantDays(lastOccupiedMs);
      return { building, room, vacant: !occupied, vacantDays };
    })
    .sort(compareBuildingRoom);
}

export default function VacantRoomsReportPage() {
  const [tab, setTab] = useState("vacant");
  const [properties, setProperties] = useState(fallbackProperties);
  const [tenants, setTenants] = useState(fallbackTenants);
  const [loading, setLoading] = useState(apiEnabled);
  const [error, setError] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [buildingFilter, setBuildingFilter] = useState("全部房产");
  const [showAudit, setShowAudit] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!apiEnabled) {
        setLoading(false);
        return;
      }
      try {
        const [p, t] = await Promise.all([fetchProperties(), fetchTenants()]);
        if (!cancelled) {
          setProperties(Array.isArray(p) ? p : []);
          setTenants(Array.isArray(t) ? t : []);
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

  const allRows = useMemo(() => buildVacantRows(properties, tenants), [properties, tenants]);

  const grouped = useMemo(() => {
    const map = new Map();
    allRows.forEach((row) => {
      if (!map.has(row.building)) map.set(row.building, []);
      map.get(row.building).push(row);
    });
    return Array.from(map.entries())
      .map(([building, rows]) => ({ building, rows }))
      .sort((a, b) =>
        String(a.building || "").localeCompare(String(b.building || ""), "zh-Hans-CN", {
          numeric: true,
          sensitivity: "base",
        }),
      );
  }, [allRows]);

  const buildingOptions = useMemo(() => ["全部房产", ...grouped.map((g) => g.building)], [grouped]);

  const filteredGrouped = useMemo(
    () => (buildingFilter === "全部房产" ? grouped : grouped.filter((g) => g.building === buildingFilter)),
    [grouped, buildingFilter],
  );

  const vacantRows = useMemo(
    () => filteredGrouped.flatMap((g) => g.rows.filter((r) => r.vacant)).sort(compareBuildingRoom),
    [filteredGrouped],
  );

  const totalRooms = useMemo(() => filteredGrouped.reduce((sum, g) => sum + g.rows.length, 0), [filteredGrouped]);
  const totalVacant = vacantRows.length;
  const vacantRate = totalRooms > 0 ? ((totalVacant / totalRooms) * 100).toFixed(2) : "0.00";
  const avgVacantDays = vacantRows.length
    ? (vacantRows.reduce((s, r) => s + Number(r.vacantDays || 0), 0) / vacantRows.length).toFixed(1)
    : "0.0";

  const monthlyRateRows = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const rate = month === new Date().getMonth() + 1 ? Number(vacantRate) : 0;
      return { month: `${month}月`, rate: `${rate.toFixed(2)}%`, newTenants: 0, checkoutTenants: 0 };
    })
      .reverse()
      .slice(0, 5);
  }, [vacantRate]);

  const yearlyRateRows = useMemo(
    () => [{ year: `${year}年`, rate: `${vacantRate}%`, newTenants: 0, checkoutTenants: 0 }],
    [year, vacantRate],
  );
  const auditRows = useMemo(
    () => [
      { name: "筛选范围房间总数", value: totalRooms, formula: "filteredGrouped.rows.length 求和" },
      { name: "筛选范围空置房间数", value: totalVacant, formula: "filteredGrouped 中 vacant=true 的房间数" },
      { name: "空置率", value: `${vacantRate}%`, formula: "空置房间数 / 房间总数 * 100%" },
      { name: "平均空置天数", value: `${avgVacantDays} 天`, formula: "sum(空置房间 vacantDays) / 空置房间数" },
      { name: "空置天数", value: "每行单独计算", formula: "今天 - 最近退租/租约结束/更新日期，最少 1 天" },
    ],
    [totalRooms, totalVacant, vacantRate, avgVacantDays],
  );

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] bg-white p-6 shadow-sm ring-1 ring-[#ade8f4]">
        <div className="flex items-center gap-3 mb-1"><div className="rounded-xl bg-blue-100 p-2.5 text-blue-700"><BarChart3 className="h-5 w-5" /></div><div><h1 className="text-2xl font-bold text-slate-900">报表管理</h1><p className="text-sm text-slate-500">空置房号、入住率、经营分析</p></div></div>
        <p className="mt-2 text-sm text-slate-500">空置房号报表与空置率统计（与房产管理口径一致）。</p>
        {loading ? <p className="mt-2 text-sm text-slate-500">正在读取 NAS 数据...</p> : null}
        {error ? <p className="mt-2 text-sm text-amber-600">{error}</p> : null}
      </section>

      <section className="rounded-[30px] bg-white p-5 ring-1 ring-[#ade8f4]">
        <div className="mb-4 rounded-2xl bg-[#f8fdff] p-4 ring-1 ring-[#d8f1f8]">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">报表口径对账明细</div>
            <button
              className="rounded-lg border border-[#ade8f4] bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-sky-50"
              onClick={() => setShowAudit((v) => !v)}
              type="button"
            >
              {showAudit ? "收起" : "展开"}
            </button>
          </div>
          {showAudit ? (
            <div className="mt-3 overflow-auto rounded-xl border border-slate-100 bg-white">
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
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className={`rounded-xl px-4 py-2 text-sm ${tab === "vacant" ? "bg-[#0077b6] text-white" : "bg-[#f3fcff] text-slate-700"}`}
            onClick={() => setTab("vacant")}
            type="button"
          >
            空置报表
          </button>
          <button
            className={`rounded-xl px-4 py-2 text-sm ${tab === "rate" ? "bg-[#0077b6] text-white" : "bg-[#f3fcff] text-slate-700"}`}
            onClick={() => setTab("rate")}
            type="button"
          >
            空置率
          </button>
        </div>

        {tab === "vacant" ? (
          <div className="mt-4 grid gap-4 xl:grid-cols-[360px_1fr]">
            <div className="rounded-2xl bg-[#f8fdff] p-4 ring-1 ring-[#d8f1f8]">
              <div className="text-sm font-semibold text-slate-900">汇总</div>
              <div className="mt-3 space-y-3">
                <div className="rounded-xl bg-white p-3 ring-1 ring-[#e6f6fb]">
                  <div className="text-xs text-slate-500">房间数</div>
                  <div className="mt-1 text-xl font-semibold">{totalRooms} 间</div>
                  <div className="text-xs text-slate-500">空置率 {vacantRate}%</div>
                  <div className="text-xs text-slate-500">平均空置天数 {avgVacantDays} 天</div>
                </div>
                {filteredGrouped.map((g) => {
                  const vacant = g.rows.filter((r) => r.vacant).length;
                  const rate = g.rows.length ? ((vacant / g.rows.length) * 100).toFixed(2) : "0.00";
                  return (
                    <div key={g.building} className="rounded-xl bg-white p-3 ring-1 ring-[#e6f6fb]">
                      <div className="text-sm font-semibold">{g.building}</div>
                      <div className="text-xs text-slate-500">{vacant}/{g.rows.length} 间</div>
                      <div className="text-sm text-slate-700">{rate}%</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl ring-1 ring-[#d8f1f8]">
              <table className="min-w-full text-sm">
                <thead className="bg-[#f3fcff] text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-left">房产</th>
                    <th className="px-4 py-3 text-left">房号</th>
                    <th className="px-4 py-3 text-left">空置天数</th>
                    <th className="px-4 py-3 text-left">累计空置</th>
                    <th className="px-4 py-3 text-left">统计天数</th>
                    <th className="px-4 py-3 text-left">空置时长比</th>
                  </tr>
                </thead>
                <tbody>
                  {vacantRows.map((row, idx) => (
                    <tr key={`${row.building}-${row.room}-${idx}`} className="border-t border-slate-100">
                      <td className="px-4 py-3">{row.building}</td>
                      <td className="px-4 py-3">{row.room}</td>
                      <td className="px-4 py-3">{row.vacantDays}</td>
                      <td className="px-4 py-3">{row.vacantDays}</td>
                      <td className="px-4 py-3">{row.vacantDays}</td>
                      <td className="px-4 py-3">100.00%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-[#f8fdff] px-3 py-3 ring-1 ring-[#d8f1f8]">
              <button className="rounded-lg bg-[#0077b6] px-3 py-2 text-sm text-white" type="button">
                月
              </button>
              <button className="rounded-lg border border-[#ade8f4] px-3 py-2 text-sm text-slate-700" type="button">
                年
              </button>
              <input
                className="w-28 rounded-lg border border-[#ade8f4] px-3 py-2 text-sm"
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value || new Date().getFullYear()))}
              />
              <select
                className="rounded-lg border border-[#ade8f4] px-3 py-2 text-sm"
                value={buildingFilter}
                onChange={(e) => setBuildingFilter(e.target.value)}
              >
                {buildingOptions.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
              <div className="rounded-2xl bg-white p-4 ring-1 ring-[#d8f1f8]">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <Home className="h-4 w-4 text-[#0077b6]" />
                  空置率趋势（当前筛选）
                </div>
                <div className="text-3xl font-semibold text-slate-900">{vacantRate}%</div>
                <div className="mt-2 text-xs text-slate-500">
                  口径：空置房间 / 房间总数，当前筛选房间 {totalRooms} 间，空置 {totalVacant} 间。
                </div>
              </div>

              <div className="rounded-2xl bg-white p-4 ring-1 ring-[#d8f1f8]">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <Table2 className="h-4 w-4 text-[#0077b6]" />
                  指标说明
                </div>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li>1. 空置天数：按最近退租/租约结束时间推算至今（最少 1 天）。</li>
                  <li>2. 累计空置、统计天数、空置时长比：当前先做同值占位，下一步按你业务规则细化。</li>
                </ul>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl ring-1 ring-[#d8f1f8]">
              <table className="min-w-full text-sm">
                <thead className="bg-[#f3fcff] text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-left">月份</th>
                    <th className="px-4 py-3 text-left">空置率</th>
                    <th className="px-4 py-3 text-left">新增租客数</th>
                    <th className="px-4 py-3 text-left">退租数</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyRateRows.map((row) => (
                    <tr key={row.month} className="border-t border-slate-100">
                      <td className="px-4 py-3">{row.month}</td>
                      <td className="px-4 py-3">{row.rate}</td>
                      <td className="px-4 py-3">{row.newTenants}</td>
                      <td className="px-4 py-3">{row.checkoutTenants}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="overflow-hidden rounded-2xl ring-1 ring-[#d8f1f8]">
              <table className="min-w-full text-sm">
                <thead className="bg-[#f3fcff] text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-left">年份</th>
                    <th className="px-4 py-3 text-left">空置率</th>
                    <th className="px-4 py-3 text-left">新增租客数</th>
                    <th className="px-4 py-3 text-left">退租数</th>
                  </tr>
                </thead>
                <tbody>
                  {yearlyRateRows.map((row) => (
                    <tr key={row.year} className="border-t border-slate-100">
                      <td className="px-4 py-3">{row.year}</td>
                      <td className="px-4 py-3">{row.rate}</td>
                      <td className="px-4 py-3">{row.newTenants}</td>
                      <td className="px-4 py-3">{row.checkoutTenants}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
