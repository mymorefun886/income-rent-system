import React, { useMemo, useState } from "react";
import { ChevronRight, Home } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import Header from "./Header";
import Sidebar from "./Sidebar";
import { useAuth } from "../contexts/AuthContext";

const breadcrumbMap = {
  "/dashboard": "仪表盘", "/properties": "房产档案", "/tenants": "租客档案",
  "/contracts": "合同管理", "/records": "收租台账", "/monthly-rent": "月度收租",
  "/expenses": "支出台账", "/work-orders": "维修工单", "/ops-center": "运营告警",
  "/reports/vacant-rooms": "报表管理", "/help": "帮助文档", "/settings": "系统设置",
};

const Layout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { isReadOnly } = useAuth();

  const breadcrumb = useMemo(() => {
    const label = breadcrumbMap[location.pathname];
    if (!label || location.pathname === "/" || location.pathname === "/login") return [];
    return [{ label: "首页", path: "/dashboard" }, { label, path: location.pathname }];
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen bg-[linear-gradient(180deg,#eff9ff_0%,#dff4fb_100%)] text-slate-900">
      <Sidebar currentPath={location.pathname} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} onNavigate={(path) => { navigate(path); setSidebarOpen(false); }} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
          {isReadOnly && <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">当前为只读账号：可查看数据，不可新增/修改/删除。</div>}
          {breadcrumb.length > 0 && (
            <nav className="mb-4 flex items-center gap-1 text-sm text-slate-500">
              {breadcrumb.map((item, i) => (
                <React.Fragment key={item.path}>
                  {i > 0 && <ChevronRight className="h-3.5 w-3.5" />}
                  {i === breadcrumb.length - 1 ? <span className="font-medium text-slate-900">{item.label}</span> : <button className="inline-flex items-center gap-1 hover:text-sky-700" onClick={() => navigate(item.path)} type="button">{i === 0 && <Home className="h-3.5 w-3.5" />}{item.label}</button>}
                </React.Fragment>
              ))}
            </nav>
          )}
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
