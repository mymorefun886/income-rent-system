import React, { useState } from "react";
import { formatCurrency } from "../lib/format";

export default function QuickPayModal({ target, onClose, onConfirm }) {
  const paidTotal = Array.isArray(target.payments)
    ? target.payments.reduce((s, p) => s + Number(p.amount || 0), 0)
    : Number(target.received || 0);
  const unpaid = Math.max(0, Number(target.receivable || 0) - paidTotal);

  const [amount, setAmount] = useState(String(unpaid));
  const [method, setMethod] = useState("微信");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const historyPayments = Array.isArray(target.payments) ? target.payments : [];

  const handleConfirm = () => {
    const n = Number(amount || 0);
    if (!(n > 0)) {
      setError("请输入收款金额");
      return;
    }
    onConfirm({ amount: n, method, date, note: note || "快速收款" });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold">快速收款</h3>
        <p className="text-sm text-slate-500">{target.room} · {target.tenant} · {target.cycle}</p>
        {error ? <div className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
        <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
          <div className="flex justify-between"><span>应收</span><span className="font-bold">{formatCurrency(target.receivable || 0)}</span></div>
          <div className="flex justify-between"><span>已收</span><span>{formatCurrency(paidTotal)}</span></div>
          <div className="flex justify-between border-t border-slate-200 pt-1 mt-1"><span>未收</span><span className="font-bold text-rose-600">{formatCurrency(unpaid)}</span></div>
        </div>
        <div className="mt-3 flex items-end gap-2">
          <label className="flex-1 text-sm">本次收款金额
            <input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-lg font-bold" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </label>
          <button className="rounded-xl border border-emerald-300 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50" type="button" onClick={() => setAmount(String(unpaid))}>收全款</button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-sm">方式
            <select className="mt-1 w-full rounded-xl border border-slate-300 px-2 py-2" value={method} onChange={(e) => setMethod(e.target.value)}>
              {["微信", "支付宝", "银行转账", "现金"].map(m => <option key={m}>{m}</option>)}
            </select>
          </label>
          <label className="text-sm">日期
            <input className="mt-1 w-full rounded-xl border border-slate-300 px-2 py-2" type="date" value={date} onChange={(e) => setDate(e.target.value)} onBlur={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <label className="mt-2 block text-sm">备注
          <input className="mt-1 w-full rounded-xl border border-slate-300 px-2 py-2" value={note} onChange={(e) => setNote(e.target.value)} placeholder="可不填" />
        </label>
        {historyPayments.length > 0 ? (
          <div className="mt-3 rounded-xl border border-slate-100 p-2 text-xs">
            <div className="text-slate-500 mb-1">已收记录</div>
            {historyPayments.map((p, i) => (
              <div key={i} className="flex justify-between py-0.5"><span>{p.paidAt || "-"} · {p.method || "-"}</span><span className="font-semibold">{formatCurrency(p.amount || 0)}</span></div>
            ))}
          </div>
        ) : null}
        <div className="mt-4 flex gap-2">
          <button className="flex-1 rounded-xl border border-slate-300 py-2" type="button" onClick={onClose}>取消</button>
          <button className="flex-1 rounded-xl bg-emerald-600 py-2 text-white font-semibold" type="button" onClick={handleConfirm}>确认收款 ¥{Number(amount || 0).toFixed(0)}</button>
        </div>
      </div>
    </div>
  );
}
