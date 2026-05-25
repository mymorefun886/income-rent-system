export function formatCurrency(value: number | string | null | undefined): string {
  return `¥${Number(value || 0).toLocaleString("zh-CN")}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value || value === "-") return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("zh-CN");
}

export function getStatusTone(status: string): string {
  const s = String(status || "").trim();
  const map: Record<string, string> = {
    已出租: "bg-emerald-100 text-emerald-700",
    闲置: "bg-rose-100 text-rose-700",
    正常: "bg-emerald-100 text-emerald-700",
    即将到期: "bg-amber-100 text-amber-700",
    已退租: "bg-slate-200 text-slate-700",
    未收: "bg-red-100 text-red-700",
    已收: "bg-emerald-100 text-emerald-700",
    部份收取: "bg-amber-100 text-amber-700",
    逾期: "bg-rose-100 text-rose-700",
    待发: "bg-amber-100 text-amber-700",
    已发: "bg-emerald-100 text-emerald-700",
  };
  return map[s] || "bg-slate-100 text-slate-700";
}
