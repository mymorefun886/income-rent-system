import React from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { financialTrend } from "../lib/mock-data";
import { formatCurrency } from "../lib/format";

const RentChart = () => (
  <div className="rounded-[30px] bg-white p-6 shadow-sm ring-1 ring-[#ade8f4]">
    <div className="mb-6">
      <h3 className="text-lg font-semibold text-slate-900">年度财务收支走势</h3>
      <p className="mt-1 text-sm text-slate-500">
        对齐房东利器首页的趋势图表达，便于快速看收入、支出和利润。
      </p>
    </div>
    <div className="h-80">
      <ResponsiveContainer height="100%" width="100%">
        <LineChart data={financialTrend}>
          <CartesianGrid stroke="#d6eef7" strokeDasharray="4 4" />
          <XAxis dataKey="month" fontSize={12} stroke="#5b7a90" />
          <YAxis
            fontSize={12}
            stroke="#5b7a90"
            tickFormatter={(value) => `¥${Math.round(value / 1000)}k`}
          />
          <Tooltip
            contentStyle={{
              border: "1px solid #d6eef7",
              borderRadius: 16,
              boxShadow: "0 20px 45px rgba(15, 23, 42, 0.08)",
            }}
            formatter={(value, name) => [
              formatCurrency(value),
              name === "income" ? "收入" : name === "expenses" ? "支出" : "利润",
            ]}
          />
          <Legend />
          <Line dataKey="income" dot={false} name="收入" stroke="#0077b6" strokeWidth={3} type="monotone" />
          <Line dataKey="expenses" dot={false} name="支出" stroke="#48cae4" strokeWidth={3} type="monotone" />
          <Line dataKey="profit" dot={false} name="利润" stroke="#023e8a" strokeWidth={3} type="monotone" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  </div>
);

export default RentChart;
