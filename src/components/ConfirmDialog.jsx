import React from "react";

export default function ConfirmDialog({
  open,
  title = "请确认",
  message = "",
  confirmText = "确认",
  cancelText = "取消",
  tone = "danger",
  onConfirm,
  onCancel,
}) {
  if (!open) return null;
  const toneClass =
    tone === "danger"
      ? "border-rose-300 text-rose-700"
      : tone === "warn"
        ? "border-amber-300 text-amber-700"
        : "border-sky-300 text-sky-700";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{message || "请确认是否继续执行。"}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700" type="button" onClick={onCancel}>
            {cancelText}
          </button>
          <button className={`rounded-xl border px-4 py-2 text-sm ${toneClass}`} type="button" onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
