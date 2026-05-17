import { BarChart3, BookOpenText, Building2, FileClock, LayoutDashboard, Settings, UserRound } from "lucide-react";
import Dashboard from "./pages/Dashboard";
import HelpPage from "./pages/HelpPage";
import Index from "./pages/Index";
import LoginPage from "./pages/LoginPage";
import PropertiesPage from "./pages/PropertiesPage";
import RentRecordsPage from "./pages/RentRecordsPage";
import SettingsPage from "./pages/SettingsPage";
import TenantsPage from "./pages/TenantsPage";
import VacantRoomsReportPage from "./pages/VacantRoomsReportPage";

export const navItems = [
  {
    title: "首页",
    to: "/",
    icon: <LayoutDashboard className="h-4 w-4" />,
    page: <Index />,
  },
  {
    title: "仪表盘",
    to: "/dashboard",
    icon: <LayoutDashboard className="h-4 w-4" />,
    page: <Dashboard />,
  },
  {
    title: "房产档案",
    to: "/properties",
    icon: <Building2 className="h-4 w-4" />,
    page: <PropertiesPage />,
  },
  {
    title: "租客档案",
    to: "/tenants",
    icon: <UserRound className="h-4 w-4" />,
    page: <TenantsPage />,
  },
  {
    title: "收租台账",
    to: "/records",
    icon: <FileClock className="h-4 w-4" />,
    page: <RentRecordsPage />,
  },
  {
    title: "报表管理",
    to: "/reports/vacant-rooms",
    icon: <BarChart3 className="h-4 w-4" />,
    page: <VacantRoomsReportPage />,
  },
  {
    title: "帮助文档",
    to: "/help",
    icon: <BookOpenText className="h-4 w-4" />,
    page: <HelpPage />,
  },
  {
    title: "系统设置",
    to: "/settings",
    icon: <Settings className="h-4 w-4" />,
    page: <SettingsPage />,
  },
  {
    title: "登录",
    to: "/login",
    icon: <UserRound className="h-4 w-4" />,
    page: <LoginPage />,
  },
];
