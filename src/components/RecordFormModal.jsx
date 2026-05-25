import React from "react";
import { normalizeKey } from "../lib/recordUtils";

export default function RecordFormModal({
  form, setForm, editing, roomOptions, onSave, onClose,
  onApplyRoom, onApplyMeterAuto, onApplyOtherFee, onRecalcReceivable,
}) {
  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleMeterChange = (key, value) => {
    setForm((prev) => onRecalcReceivable(onApplyMeterAuto({ ...prev, [key]: value })));
  };

  const handleFeeChange = (key, value) => {
    setForm((prev) => onRecalcReceivable(onApplyOtherFee({ ...prev, [key]: value })));
  };

  const hasRoomOption =
    roomOptions.some(x => x.tenantId === form.tenantId) ||
    roomOptions.some(x => normalizeKey(x.roomText) === normalizeKey(form.room));

  const selectedRoomKey =
    roomOptions.find((x) => x.tenantId === form.tenantId)?.key ||
    roomOptions.find((x) => normalizeKey(x.roomText) === normalizeKey(form.room))?.key || "";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/35 p-4">
      <div className="w-full max-w-3xl rounded-2xl bg-white p-5 my-4 max-h-[92vh] overflow-y-auto">
        <h3 className="text-xl font-semibold">{editing ? "编辑账单" : "新增账单"}</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-sm">房号
            {hasRoomOption ? (
              <select
                className="mt-1 w-full rounded border border-sky-200 px-2 py-2"
                value={selectedRoomKey}
                onChange={(e) => { if (e.target.value) onApplyRoom(e.target.value); }}
              >
                <option value="">选择房号</option>
                {roomOptions.map((x) => <option key={x.key} value={x.key}>{x.label || x.roomText}</option>)}
              </select>
            ) : (
              <input className="mt-1 w-full rounded border border-sky-200 bg-slate-50 px-2 py-2 text-sm text-slate-500" value={form.room + " (已退租)"} readOnly />
            )}
          </label>
          <label className="text-sm">租客姓名<input className="mt-1 w-full rounded border border-sky-200 bg-slate-50 px-2 py-2" value={form.tenant} readOnly /></label>
          <label className="text-sm">周期<input type="month" className="mt-1 w-full rounded border border-sky-200 px-2 py-2" value={form.cycle} onChange={(e) => handleChange("cycle", e.target.value)} /></label>
          <label className="text-sm">租金<input className="mt-1 w-full rounded border border-sky-200 px-2 py-2" value={form.rentPart} onChange={(e) => onRecalcReceivable({ ...form, rentPart: e.target.value }, setForm)} /></label>
          <label className="text-sm">应收<input className="mt-1 w-full rounded border border-sky-200 bg-slate-50 px-2 py-2" value={form.receivable} readOnly /></label>
          <label className="text-sm">已收<input className="mt-1 w-full rounded border border-sky-200 px-2 py-2" value={form.received} onChange={(e) => handleChange("received", e.target.value)} /></label>
          <label className="text-sm">状态
            <select className="mt-1 w-full rounded border border-sky-200 px-2 py-2" value={form.status} onChange={(e) => handleChange("status", e.target.value)}>
              <option value="未收">未收</option>
              <option value="部份收取">部份收取</option>
              <option value="已收">已收</option>
              <option value="逾期">逾期</option>
            </select>
          </label>
          <label className="text-sm">收款方式<input className="mt-1 w-full rounded border border-sky-200 px-2 py-2" value={form.method} onChange={(e) => handleChange("method", e.target.value || "微信")} /></label>
          <label className="text-sm">到期日<input type="date" className="mt-1 w-full rounded border border-sky-200 px-2 py-2" value={form.dueDate} onChange={(e) => handleChange("dueDate", e.target.value)} /></label>
          <label className="text-sm">收款日期<input type="date" className="mt-1 w-full rounded border border-sky-200 px-2 py-2" value={form.paidAt || ""} onChange={(e) => handleChange("paidAt", e.target.value)} /></label>
          <label className="text-sm">上月电表读数<input className="mt-1 w-full rounded border border-sky-200 px-2 py-2" value={form.electricPrev} onChange={(e) => handleMeterChange("electricPrev", e.target.value)} /></label>
          <label className="text-sm">本月电表读数<input className="mt-1 w-full rounded border border-sky-200 px-2 py-2" value={form.electricNow} onChange={(e) => handleMeterChange("electricNow", e.target.value)} /></label>
          <label className="text-sm">电费单价<input className="mt-1 w-full rounded border border-sky-200 px-2 py-2" value={form.electricPrice} onChange={(e) => handleChange("electricPrice", e.target.value)} /></label>
          <label className="text-sm">电表实用读数<input className="mt-1 w-full rounded border border-sky-200 bg-slate-50 px-2 py-2" value={form.electricUsage} readOnly /></label>
          <label className="text-sm">上月水表读数<input className="mt-1 w-full rounded border border-sky-200 px-2 py-2" value={form.waterPrev} onChange={(e) => handleMeterChange("waterPrev", e.target.value)} /></label>
          <label className="text-sm">本月水表读数<input className="mt-1 w-full rounded border border-sky-200 px-2 py-2" value={form.waterNow} onChange={(e) => handleMeterChange("waterNow", e.target.value)} /></label>
          <label className="text-sm">水费单价<input className="mt-1 w-full rounded border border-sky-200 px-2 py-2" value={form.waterPrice} onChange={(e) => handleChange("waterPrice", e.target.value)} /></label>
          <label className="text-sm">水表实用读数<input className="mt-1 w-full rounded border border-sky-200 bg-slate-50 px-2 py-2" value={form.waterUsage} readOnly /></label>
          <label className="text-sm">水费保底<input className="mt-1 w-full rounded border border-sky-200 px-2 py-2" value={form.waterMinimumCharge} onChange={(e) => handleChange("waterMinimumCharge", e.target.value)} /></label>
          <label className="text-sm">物业管理费<input className="mt-1 w-full rounded border border-sky-200 px-2 py-2" value={form.propertyFee} onChange={(e) => handleFeeChange("propertyFee", e.target.value)} /></label>
          <label className="text-sm">宽带费<input className="mt-1 w-full rounded border border-sky-200 px-2 py-2" value={form.networkFee} onChange={(e) => handleFeeChange("networkFee", e.target.value)} /></label>
          <label className="text-sm">税费<input className="mt-1 w-full rounded border border-sky-200 px-2 py-2" value={form.garbageFee} onChange={(e) => handleFeeChange("garbageFee", e.target.value)} /></label>
          <label className="text-sm">其他费用（明细）<input className="mt-1 w-full rounded border border-sky-200 px-2 py-2" value={form.miscFee} onChange={(e) => handleFeeChange("miscFee", e.target.value)} /></label>
          <label className="text-sm">其他费用（合计）<input className="mt-1 w-full rounded border border-sky-200 bg-slate-50 px-2 py-2" value={form.otherFee} readOnly /></label>
          <label className="text-sm">押金<input className="mt-1 w-full rounded border border-sky-200 px-2 py-2" value={form.depositAdjustment} onChange={(e) => handleChange("depositAdjustment", e.target.value)} /></label>
          <div className="md:col-span-2 rounded border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-slate-700">
            <div>导入分项：租金 {Number(editing?.rentPart || 0).toFixed(2)}，其他费 {Number(editing?.otherFee || 0).toFixed(2)}，押金调整 {Number(editing?.depositAdjustment || 0).toFixed(2)}</div>
            <div>水费保底（当月用水为 0 时）: {Number(editing?.waterMinimumCharge || 0).toFixed(2)}</div>
          </div>
          <label className="text-sm md:col-span-2">备注<textarea className="mt-1 w-full rounded border border-sky-200 px-2 py-2" value={form.note} onChange={(e) => handleChange("note", e.target.value)} /></label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="rounded border border-sky-200 px-3 py-2" type="button" onClick={onClose}>取消</button>
          <button className="rounded bg-sky-700 px-3 py-2 text-white" type="button" onClick={onSave}>保存</button>
        </div>
      </div>
    </div>
  );
}
