import { useQuery } from "@tanstack/react-query";
import {
  apiEnabled,
  fetchDashboard,
  fetchProperties,
  fetchRecords,
  fetchTenants,
  fetchExpenses,
  fetchContracts,
  fetchContractReminders,
  fetchWorkOrders,
  fetchSettings,
} from "../lib/api";

const DEFAULT_STALE_TIME = 30 * 1000; // 30s 内不重新请求

function useQueryIfEnabled(key, fetcher, options = {}) {
  return useQuery({
    queryKey: key,
    queryFn: fetcher,
    staleTime: options.staleTime ?? DEFAULT_STALE_TIME,
    enabled: apiEnabled && (options.enabled ?? true),
    ...options,
  });
}

/** 仪表盘汇总 */
export function useDashboard(options) {
  return useQueryIfEnabled(["dashboard"], fetchDashboard, options);
}

/** 房产列表 */
export function useProperties(options) {
  return useQueryIfEnabled(["properties"], fetchProperties, options);
}

/** 租客列表 */
export function useTenants(options) {
  return useQueryIfEnabled(["tenants"], fetchTenants, options);
}

/** 收租账单 */
export function useRecords(options) {
  return useQueryIfEnabled(["records"], fetchRecords, options);
}

/** 支出台账 */
export function useExpenses(options) {
  return useQueryIfEnabled(["expenses"], fetchExpenses, options);
}

/** 合同列表 */
export function useContracts(options) {
  return useQueryIfEnabled(["contracts"], fetchContracts, options);
}

/** 合同到期提醒 */
export function useContractReminders(options) {
  return useQueryIfEnabled(["contractReminders"], fetchContractReminders, options);
}

/** 维修工单 */
export function useWorkOrders(options) {
  return useQueryIfEnabled(["workOrders"], fetchWorkOrders, options);
}

/** 系统设置 */
export function useSettings(options) {
  return useQueryIfEnabled(["settings"], fetchSettings, options);
}
