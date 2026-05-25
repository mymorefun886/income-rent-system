import React from "react";
import { Plus, Trash2, ZoomIn } from "lucide-react";
import { API_BASE_URL } from "../lib/api";

function toPreviewUrl(url: string): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return API_BASE_URL ? `${API_BASE_URL}${url}` : url;
}

interface IdPhotoCardProps {
  label: string;
  side: "idCardFront" | "idCardBack";
  url: string;
  onUpload: (file: File, side: "idCardFront" | "idCardBack") => void;
  onPreview: (url: string) => void;
  onRemove: () => void;
  uploading: string | null;
  error: string;
}

export default function IdPhotoCard({ label, side, url, onUpload, onPreview, onRemove, uploading, error }: IdPhotoCardProps) {
  const sideLabel = side === "idCardFront" ? "正面" : "反面";
  const busy = uploading === side;

  const FileInput = ({ children, className }: { children: React.ReactNode; className: string }) => (
    <label className={className + " relative cursor-pointer"}>
      {children}
      <input className="absolute inset-0 opacity-0 cursor-pointer" type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) { onUpload(f, side); e.target.value = ""; } }} />
    </label>
  );

  return (
    <div className="rounded-xl border border-slate-300 overflow-hidden">
      {url ? (
        <div className="relative group cursor-pointer" onClick={() => onPreview && onPreview(toPreviewUrl(url))}>
          <img className="w-full h-40 object-contain bg-slate-100" src={toPreviewUrl(url)} alt={label} />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center pointer-events-none">
            <ZoomIn className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <button
            className="absolute top-1.5 right-1.5 rounded-full bg-white/90 hover:bg-rose-50 p-1.5 shadow transition"
            type="button"
            title="移除照片"
            onClick={(e) => { e.stopPropagation(); onRemove && onRemove(); }}
          >
            <Trash2 className="h-3.5 w-3.5 text-rose-600" />
          </button>
        </div>
      ) : busy ? (
        <div className="flex flex-col items-center justify-center h-40 text-slate-400">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
          <span className="text-xs mt-2">上传中...</span>
        </div>
      ) : (
        <FileInput className="flex flex-col items-center justify-center h-40 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors p-3">
          <Plus className="h-6 w-6 mb-1" />
          <span className="text-xs">{label}</span>
        </FileInput>
      )}
      {error ? <div className="px-3 py-1.5 text-xs text-rose-600 bg-rose-50">{error}</div> : null}
      {url && !busy ? (
        <FileInput className="flex items-center justify-center gap-1 py-2 text-xs text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors">
          <Plus className="h-3 w-3" /><span>更新{sideLabel}</span>
        </FileInput>
      ) : null}
      {url && busy ? (
        <div className="flex items-center justify-center gap-1 py-2 text-xs text-slate-400">
          <div className="h-3 w-3 animate-spin rounded-full border border-slate-300 border-t-blue-600" />
          <span>上传中...</span>
        </div>
      ) : null}
    </div>
  );
}
