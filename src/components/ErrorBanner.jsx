import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

export default function ErrorBanner({ message, onRetry }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="flex-1">{message || "数据加载失败，请检查网络连接后重试"}</span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-200"
        >
          <RefreshCw className="h-3 w-3" />
          重试
        </button>
      ) : null}
    </div>
  );
}
