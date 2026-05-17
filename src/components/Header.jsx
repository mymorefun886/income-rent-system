import React from "react";
import { BellRing, Menu, Server, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const Header = ({ onMenuClick }) => {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="border-b border-[#dbe8ff] bg-white/82 backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <button className="rounded-2xl border border-slate-200 p-2 text-slate-600 lg:hidden" onClick={onMenuClick} type="button"><Menu className="h-5 w-5" /></button>
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">本地化收租管理</p>
            <h2 className="text-[1.05rem] font-semibold text-slate-900">收租佬系统控制台</h2>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="hidden items-center gap-2 rounded-full bg-[#eff6ff] px-3 py-2 text-xs text-[#1d4ed8] sm:flex"><Server className="h-3.5 w-3.5" /> NAS Docker 在线</div>
          <div className="hidden items-center gap-2 rounded-full bg-[#ecfeff] px-3 py-2 text-xs text-[#0e7490] sm:flex"><ShieldCheck className="h-3.5 w-3.5" /> 本地数据优先</div>
          <button className="rounded-full bg-[#eff6ff] p-2 text-[#1d4ed8] transition hover:bg-[#dbeafe]" type="button"><BellRing className="h-4 w-4" /></button>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-2"><div className="text-sm font-semibold text-slate-900">{user?.name || "房东管理员"}</div><div className="text-xs text-slate-500">{user?.portfolio || user?.role}</div></div>
        </div>
      </div>
    </header>
  );
};

export default Header;
