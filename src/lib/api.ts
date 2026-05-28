// ---- Types ------------------------------------------------------------------

export interface ApiError extends Error {
  status?: number;
}

export interface User {
  id: string;
  username: string;
  name: string;
  role: string;
  portfolio: string;
}

export interface LoginResult {
  success: boolean;
  token?: string;
  user?: User;
  message?: string;
}

interface RequestOptions extends Omit<RequestInit, "headers"> {
  headers?: Record<string, string>;
}

// ---- Config -----------------------------------------------------------------

const envApiBaseUrl = (import.meta as Record<string, unknown>).env?.VITE_API_BASE_URL as string | undefined;
const apiBaseUrlRaw: string =
  envApiBaseUrl?.trim()?.replace(/\/$/, "") ||
  (typeof window !== "undefined" && window.location?.hostname
    ? `${window.location.protocol}//${window.location.hostname}:8788`
    : "");

export const API_BASE_URL: string = apiBaseUrlRaw;

export const apiEnabled: boolean = Boolean(apiBaseUrlRaw);

// ---- Token management -------------------------------------------------------

const TOKEN_KEY = "income-session-token";
let authToken: string = (() => {
  if (typeof sessionStorage !== "undefined") {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  }
  return "";
})();

export function setAuthToken(token: string): void {
  authToken = token || "";
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch { /* sessionStorage may be unavailable */ }
}

// ---- User storage -----------------------------------------------------------

const USER_KEY = "income-session-user";

export function getStoredUser(): User | null {
  try {
    if (typeof sessionStorage !== "undefined") {
      const raw = sessionStorage.getItem(USER_KEY);
      if (raw) return JSON.parse(raw) as User;
    }
  } catch { /* sessionStorage may be unavailable */ }
  return null;
}

export function setStoredUser(user: User | null): void {
  try {
    if (user) sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    else sessionStorage.removeItem(USER_KEY);
  } catch { /* sessionStorage may be unavailable */ }
}

// ---- Helpers ----------------------------------------------------------------

function getHeaders(extraHeaders?: Record<string, string>): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...extraHeaders,
  };
}

function clearAuth(): void {
  authToken = "";
  try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignored */ }
  try { sessionStorage.removeItem(USER_KEY); } catch { /* ignored */ }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("auth:expired"));
  }
}

function clearStorage(): void {
  authToken = "";
  try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignored */ }
  try { sessionStorage.removeItem(USER_KEY); } catch { /* ignored */ }
}

async function request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!apiEnabled) {
    throw new Error("未配置后端地址 VITE_API_BASE_URL");
  }

  const response = await fetch(`${apiBaseUrlRaw}${path}`, {
    ...options,
    headers: getHeaders(options.headers),
  });

  const payload: Record<string, unknown> = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    if (response.status === 401 && authToken) {
      clearAuth();
    }
    const error = new Error(String(payload.message || "请求失败")) as ApiError;
    error.status = response.status;
    throw error;
  }

  return (payload.data ?? payload) as T;
}

// ---- Auth -------------------------------------------------------------------

export async function apiLogin(username: string, password: string): Promise<LoginResult> {
  const result = await request<LoginResult>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  if (result.token) {
    setAuthToken(result.token);
  }
  return result;
}

export async function apiLogout(): Promise<void> {
  try {
    await request("/api/auth/logout", { method: "POST" });
  } catch { /* backend may not have this endpoint */ }
  clearStorage();
}

// ---- Data fetch helpers (typed generics) ------------------------------------

type IdParam = string;
type Payload = Record<string, unknown>;

function get<T>(path: string): Promise<T> { return request<T>(path); }
function post<T>(path: string, body: Payload): Promise<T> { return request<T>(path, { method: "POST", body: JSON.stringify(body) }); }
function put<T>(path: string, body: Payload): Promise<T> { return request<T>(path, { method: "PUT", body: JSON.stringify(body) }); }
function del<T>(path: string): Promise<T> { return request<T>(path, { method: "DELETE" }); }

// ---- Dashboard / Health -----------------------------------------------------

export const fetchDashboard = () => get("/api/dashboard");
export const fetchHealth = () => get("/api/health");
export const fetchMe = () => get("/api/auth/me");

// ---- Properties -------------------------------------------------------------

export const fetchProperties = () => get("/api/properties");
export const createProperty = (p: Payload) => post("/api/properties", p);
export const updateProperty = (id: IdParam, p: Payload) => put(`/api/properties/${id}`, p);
export const deleteProperty = (id: IdParam) => del(`/api/properties/${id}`);

// ---- Tenants ----------------------------------------------------------------

export const fetchTenants = () => get("/api/tenants");
export const createTenant = (p: Payload) => post("/api/tenants", p);
export const updateTenant = (id: IdParam, p: Payload) => put(`/api/tenants/${id}`, p);
export const deleteTenant = (id: IdParam) => del(`/api/tenants/${id}`);

// ---- Records (bills) --------------------------------------------------------

export const fetchRecords = () => get("/api/records");

export async function createRecord(payload: Payload) {
  try {
    return await post("/api/records", payload);
  } catch (error) {
    if ((error as ApiError)?.status === 404) {
      throw new Error("后端未开通新增账单接口 POST /api/records，请更新并重启后端服务");
    }
    throw error;
  }
}

export const updateRecord = (id: IdParam, p: Payload) => put(`/api/records/${id}`, p);
export const deleteRecord = (id: IdParam) => del(`/api/records/${id}`);
export const clearRecords = () => del("/api/records");

// ---- Contracts --------------------------------------------------------------

export const fetchContracts = () => get("/api/contracts");
export const createContract = (p: Payload) => post("/api/contracts", p);
export const updateContract = (id: IdParam, p: Payload) => put(`/api/contracts/${id}`, p);
export const deleteContract = (id: IdParam) => del(`/api/contracts/${id}`);
export const fetchContractReminders = () => get("/api/contracts/reminders");

// ---- Expenses ---------------------------------------------------------------

export const fetchExpenses = () => get("/api/expenses");
export const createExpense = (p: Payload) => post("/api/expenses", p);
export const updateExpense = (id: IdParam, p: Payload) => put(`/api/expenses/${id}`, p);
export const deleteExpense = (id: IdParam) => del(`/api/expenses/${id}`);

// ---- Work Orders ------------------------------------------------------------

export const fetchWorkOrders = () => get("/api/work-orders");
export const createWorkOrder = (p: Payload) => post("/api/work-orders", p);
export const updateWorkOrder = (id: IdParam, p: Payload) => put(`/api/work-orders/${id}`, p);
export const deleteWorkOrder = (id: IdParam) => del(`/api/work-orders/${id}`);

// ---- Reminders --------------------------------------------------------------

export const fetchReminders = () => get("/api/reminders");
export const createReminder = (p: Payload) => post("/api/reminders", p);
export const updateReminder = (id: IdParam, p: Payload) => put(`/api/reminders/${id}`, p);
export const deleteReminder = (id: IdParam) => del(`/api/reminders/${id}`);
export const runDueReminders = () => post("/api/reminders/run-due", {});
export const fetchReminderAutoStatus = () => get("/api/reminders/auto-status");

// ---- Room Inventory ---------------------------------------------------------

export const fetchRoomInventory = () => get("/api/room-inventory");
export const saveRoomInventory = (p: Payload) => post("/api/room-inventory", p);
export const saveRoomInventorySnapshot = (p: Payload) => post("/api/room-inventory/snapshot", p);

// ---- Backup -----------------------------------------------------------------

export const createBackup = () => post("/api/backup/create", {});
export const restoreBackup = (file: string) => post("/api/backup/restore", { file });

// ---- Audit Logs -------------------------------------------------------------

export const fetchAuditLogs = () => get("/api/audit-logs");
export const fetchAuditLogsQuery = (params: { page?: number; pageSize?: number } = {}) => {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return get(`/api/audit-logs${suffix}`);
};

// ---- Import -----------------------------------------------------------------

export const importCsvData = (p: Payload) => post("/api/import/csv", p);
export const importValidate = (p: Payload) => post("/api/import/validate", p);
export const importPreview = (p: Payload) => post("/api/import/preview", p);
export const importExecute = (p: Payload) => post("/api/import/execute", p);
export const fetchImportReports = () => get("/api/import/report");

// ---- Bills / Meter ----------------------------------------------------------

export const markBillSent = (recordId: IdParam, payload: Payload = {}) =>
  post(`/api/bills/${recordId}/mark-sent`, payload);
export const markBillsSentBatch = (payload: Payload = {}) =>
  post("/api/bills/mark-sent-batch", payload);
export const createMeterTask = (p: Payload) => post("/api/meter-tasks", p);
export const confirmMeterTask = (taskId: IdParam, p: Payload) =>
  post(`/api/meter-tasks/${taskId}/confirm`, p);
export const generateBillsFromReadings = (p: Payload) =>
  post("/api/bills/generate-from-readings", p);
export const fetchWechatMessages = (cycle: string) =>
  get(`/api/wechat/messages?cycle=${encodeURIComponent(cycle)}`);

// ---- Meter Drafts (方案一/四: 自动存抄表草稿) ----

export const fetchMeterDrafts = (cycle: string) =>
  get<Array<Record<string, unknown>>>(`/api/meter-drafts?cycle=${encodeURIComponent(cycle)}`);
export const saveMeterDraft = (p: Payload) =>
  put("/api/meter-drafts", p);
export const deleteMeterDraft = (id: string) =>
  del(`/api/meter-drafts/${id}`);

// ---- Meter Readings (水电对账报表) ----

export const fetchMeterReadings = (cycle?: string) => {
  const qs = cycle ? `?cycle=${encodeURIComponent(cycle)}` : "/all";
  return get<Array<Record<string, unknown>>>(`/api/meter-readings${qs}`);
};
export const saveMeterReading = (p: Payload) =>
  post("/api/meter-readings", p);

// ---- Upload -----------------------------------------------------------------

export async function uploadFile(file: File) {
  const contentBase64: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  return post("/api/uploads", { filename: file.name, contentBase64 });
}

// ---- Settings ---------------------------------------------------------------

export const fetchSettings = () => get("/api/settings");
export const updateSettings = (p: Payload) => put("/api/settings", p || {});

// ---- Profit -----------------------------------------------------------------

export const fetchProfitReport = () => get("/api/reports/profit");
export const fetchProfitAlerts = () => get("/api/profit-alerts");
export const markProfitAlert = (p: Payload) => post("/api/profit-alerts/mark", p || {});

// ---- Tenants snapshot -------------------------------------------------------

export const createTenantSnapshot = (reason = "manual") =>
  post("/api/tenants/snapshot", { reason });
export const rollbackTenantLatestSnapshot = () =>
  post("/api/tenants/rollback-latest", {});

// ---- Runtime logs / client errors -------------------------------------------

export const fetchRuntimeLogs = () => get("/api/logs/runtime");
export const reportClientError = (p: Payload = {}) =>
  post("/api/logs/client-error", p);
