import React from "react";
import { BarChart3, BookOpenText, Building2, CalendarDays, ClipboardSignature, Droplets, FileClock, LayoutDashboard, LogOut, Search, Settings, Users, Wallet, Wrench, X } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

const menuItems = [
  { path: "/dashboard", label: "仪表盘", description: "首页总览、提醒与收支趋势", icon: LayoutDashboard },
  { path: "/properties", label: "房产档案", description: "楼栋、房号、空置与到期", icon: Building2 },
  { path: "/tenants", label: "租客档案", description: "证件、租约、同住人与备注", icon: Users },
  { path: "/contracts", label: "合同管理", description: "租约、续租、附件与到期提醒", icon: ClipboardSignature },
  { path: "/records", label: "收租台账", description: "已收、待收、逾期与方式", icon: FileClock },
  { path: "/meter-input", label: "水电抄表", description: "手机录读数 · 一键同步", icon: Droplets },
  { path: "/monthly-rent", label: "月度收租", description: "生成、核对、收款与发送", icon: CalendarDays },
  { path: "/expenses", label: "支出台账", description: "水电、物业、税费与维修", icon: Wallet },
  { path: "/work-orders", label: "维修工单", description: "报修、处理、照片与费用联动", icon: Wrench },
  { path: "/reports/meter-readings", label: "水电对账", description: "1~6月全房水電度數表", icon: BarChart3 },
  { path: "/reports/vacant-rooms", label: "报表管理", description: "点击进入报表页", icon: BarChart3 },
  { path: "/help", label: "帮助文档", description: "本地化架构、部署与使用说明", icon: BookOpenText },
  { path: "/settings", label: "系统设置", description: "账号、安全、NAS 与域名配置", icon: Settings },
];

const Sidebar = ({ isOpen, onClose, onNavigate, currentPath }) => {
  const { logout } = useAuth();
  return (
    <>
      {isOpen ? <button aria-label="关闭菜单遮罩" className="fixed inset-0 z-40 bg-slate-950/45 lg:hidden" onClick={onClose} type="button" /> : null}
      <aside className={`fixed inset-y-0 left-0 z-50 w-80 border-r border-white/50 bg-[linear-gradient(180deg,#0b5ed7_0%,#2563eb_42%,#3b82f6_100%)] px-5 pb-5 pt-6 text-white shadow-2xl backdrop-blur-xl transition-transform duration-300 lg:static lg:translate-x-0 lg:shadow-none ${isOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="mb-8 flex items-start justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/18 px-3 py-1 text-xs font-medium text-white ring-1 ring-white/20"><Search className="h-3.5 w-3.5" /> income.ccwu.cc</div>
            <h1 className="mt-4 text-[1.55rem] font-semibold tracking-tight text-white">收租佬系统</h1>
          </div>
          <button className="rounded-full p-2 text-blue-100 transition hover:bg-white/10 hover:text-white lg:hidden" onClick={onClose} type="button"><X className="h-5 w-5" /></button>
        </div>
        <nav className="space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = currentPath === item.path;
            return (
              <button key={item.path} className={`w-full rounded-2xl px-4 py-3 text-left transition ${active ? "bg-white text-blue-700 shadow-lg shadow-blue-950/15" : "bg-transparent text-blue-50 hover:bg-white/14"}`} onClick={() => onNavigate(item.path)} type="button">
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 rounded-xl p-2 ${active ? "bg-blue-100" : "bg-white/15"}`}><Icon className={`h-4 w-4 ${active ? "text-blue-700" : "text-white"}`} /></div>
                  <div><div className="text-[14px] font-semibold leading-5">{item.label}</div><div className={`mt-1 text-[12px] leading-5 ${active ? "text-blue-600/90" : "text-blue-100/75"}`}>{item.description}</div></div>
                </div>
              </button>
            );
          })}
        </nav>
        <div className="mt-8 rounded-3xl bg-white/12 p-4 text-sm text-blue-50 ring-1 ring-white/15"><div className="font-semibold text-white">本地化重点</div><ul className="mt-3 space-y-2 leading-6"><li>账号密码登录</li><li>房源、租客、账单主流程</li><li>部署与运维文档可落地</li></ul></div>
        <button className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/16" onClick={() => { logout(); onNavigate("/login"); }} type="button"><LogOut className="h-4 w-4" /> 退出登录</button>
      </aside>
    </>
  );
};

export default Sidebar;
