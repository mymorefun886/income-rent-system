import React from "react";
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
import { formatCurrency } from "../lib/format";

const donutColors = ["#7da2ea", "#d1d5db"];

export function FinancialTrendChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
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
  );
}

export function DonutChartCard({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Tooltip />
        <Legend />
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} fill={donutColors[0]} label>
          {data.map((_, i) => (
            <Cell key={i} fill={donutColors[i % donutColors.length]} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
