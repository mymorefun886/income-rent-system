import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import ErrorBoundary from "./components/ErrorBoundary";
import { AuthProvider, useAuth } from "./contexts/AuthContext";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const ContractsPage = lazy(() => import("./pages/ContractsPage"));
const HelpPage = lazy(() => import("./pages/HelpPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const MeterInputPage = lazy(() => import("./pages/MeterInputPage"));
const MonthlyRentWorkbenchPage = lazy(() => import("./pages/MonthlyRentWorkbenchPage"));
const ExpensesPage = lazy(() => import("./pages/ExpensesPage"));
const PropertiesPage = lazy(() => import("./pages/PropertiesPage"));
const RentRecordsPage = lazy(() => import("./pages/RentRecordsPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const TenantsPage = lazy(() => import("./pages/TenantsPage"));
const VacantRoomsReportPage = lazy(() => import("./pages/VacantRoomsReportPage"));
const MeterReadingsReportPage = lazy(() => import("./pages/MeterReadingsReportPage"));
const WorkOrdersPage = lazy(() => import("./pages/WorkOrdersPage"));

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center bg-slate-100"><div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-300 border-t-slate-900" /></div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
};

const ProtectedLayoutRoute = ({ children }) => <ProtectedRoute><Layout>{children}</Layout></ProtectedRoute>;

const RouteSkeleton = () => <div className="min-h-[60vh] animate-pulse p-6"><div className="h-8 w-56 rounded bg-slate-200" /><div className="mt-4 h-4 w-80 rounded bg-slate-100" /><div className="mt-8 grid gap-4 md:grid-cols-2"><div className="h-28 rounded-2xl bg-slate-100" /><div className="h-28 rounded-2xl bg-slate-100" /></div></div>;

const allRoutes = [
  { path: "/dashboard", Page: Dashboard },
  { path: "/properties", Page: PropertiesPage },
  { path: "/tenants", Page: TenantsPage },
  { path: "/contracts", Page: ContractsPage },
  { path: "/records", Page: RentRecordsPage },
  { path: "/meter-input", Page: MeterInputPage },
  { path: "/monthly-rent", Page: MonthlyRentWorkbenchPage },
  { path: "/expenses", Page: ExpensesPage },
  { path: "/work-orders", Page: WorkOrdersPage },
  { path: "/reports/vacant-rooms", Page: VacantRoomsReportPage },
  { path: "/reports/meter-readings", Page: MeterReadingsReportPage },
  { path: "/help", Page: HelpPage },
  { path: "/settings", Page: SettingsPage },
];

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<Navigate to="/dashboard" replace />} />
    <Route path="/login" element={<LoginPage />} />
    {allRoutes.map(({ path, Page }) => (
      <Route key={path} path={path} element={<ProtectedLayoutRoute><Page /></ProtectedLayoutRoute>} />
    ))}
  </Routes>
);

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <HashRouter>
            <Suspense fallback={<RouteSkeleton />}>
              <AppRoutes />
            </Suspense>
          </HashRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
