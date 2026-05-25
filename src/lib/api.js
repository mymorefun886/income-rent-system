const envApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()?.replace(/\/$/, "");
const runtimeApiBaseUrl =
  typeof window !== "undefined" && window.location?.hostname
    ? `${window.location.protocol}//${window.location.hostname}:8788`
    : "";
const apiBaseUrl = envApiBaseUrl || runtimeApiBaseUrl || "";
export const API_BASE_URL = apiBaseUrl;

export const apiEnabled = Boolean(apiBaseUrl);

// P1-3: 讀取 HttpOnly Cookie 中的 session token
function getCookieToken() {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)income-session=([^;]*)/);
  return match ? match[1] : "";
}

function getHeaders(extraHeaders = {}) {
  // 從 HttpOnly Cookie 讀取 token
  const token = getCookieToken() || "";

  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extraHeaders,
  };
}

async function request(path, options = {}) {
  if (!apiEnabled) {
    throw new Error("未配置后端地址 VITE_API_BASE_URL");
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: getHeaders(options.headers),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    const error = new Error(payload.message || "请求失败");
    error.status = response.status;
    throw error;
  }

  return payload.data ?? payload;
}

export async function apiLogin(username, password) {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function fetchDashboard() {
  return request("/api/dashboard");
}

export async function fetchProperties() {
  return request("/api/properties");
}

export async function createProperty(payload) {
  return request("/api/properties", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateProperty(id, payload) {
  return request(`/api/properties/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteProperty(id) {
  return request(`/api/properties/${id}`, {
    method: "DELETE",
  });
}

export async function fetchTenants() {
  return request("/api/tenants");
}

export async function createTenant(payload) {
  return request("/api/tenants", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateTenant(id, payload) {
  return request(`/api/tenants/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteTenant(id) {
  return request(`/api/tenants/${id}`, {
    method: "DELETE",
  });
}

export async function fetchRecords() {
  return request("/api/records");
}

export async function createRecord(payload) {
  try {
    return await request("/api/records", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch (error) {
    if (error?.status === 404) {
      throw new Error("后端未开通新增账单接口 POST /api/records，请更新并重启后端服务");
    }
    throw error;
  }
}

export async function updateRecord(id, payload) {
  return request(`/api/records/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteRecord(id) {
  return request(`/api/records/${id}`, {
    method: "DELETE",
  });
}

export async function clearRecords() {
  return request("/api/records", {
    method: "DELETE",
  });
}

export async function fetchHealth() {
  return request("/api/health");
}

export async function uploadFile(file) {
  const contentBase64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  return request("/api/uploads", {
    method: "POST",
    body: JSON.stringify({
      filename: file.name,
      contentBase64,
    }),
  });
}

export async function markBillSent(recordId, payload = {}) {
  return request(`/api/bills/${recordId}/mark-sent`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function importCsvData(payload) {
  return request("/api/import/csv", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function importValidate(payload) {
  return request("/api/import/validate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function importPreview(payload) {
  return request("/api/import/preview", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function importExecute(payload) {
  return request("/api/import/execute", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchImportReports() {
  return request("/api/import/report");
}

export async function fetchContracts() {
  return request("/api/contracts");
}

export async function createContract(payload) {
  return request("/api/contracts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateContract(id, payload) {
  return request(`/api/contracts/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteContract(id) {
  return request(`/api/contracts/${id}`, {
    method: "DELETE",
  });
}

export async function fetchReminders() {
  return request("/api/reminders");
}

export async function createReminder(payload) {
  return request("/api/reminders", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function runDueReminders() {
  return request("/api/reminders/run-due", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function fetchRoomInventory() {
  return request("/api/room-inventory");
}

export async function saveRoomInventory(payload) {
  return request("/api/room-inventory", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function saveRoomInventorySnapshot(payload) {
  return request("/api/room-inventory/snapshot", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createBackup() {
  return request("/api/backup/create", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function restoreBackup(file) {
  return request("/api/backup/restore", {
    method: "POST",
    body: JSON.stringify({ file }),
  });
}

export async function fetchAuditLogs() {
  return request("/api/audit-logs");
}

export async function fetchWorkOrders() {
  return request("/api/work-orders");
}

export async function createWorkOrder(payload) {
  return request("/api/work-orders", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function reportClientError(payload = {}) {
  return request("/api/logs/client-error", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchRuntimeLogs() {
  return request("/api/logs/runtime");
}

export async function fetchContractReminders() {
  return request("/api/contracts/reminders");
}

export async function fetchReminderAutoStatus() {
  return request("/api/reminders/auto-status");
}

export async function updateReminder(id, payload) {
  return request(`/api/reminders/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}

export async function deleteReminder(id) {
  return request(`/api/reminders/${id}`, { method: "DELETE" });
}

export async function fetchExpenses() {
  return request("/api/expenses");
}

export async function createExpense(payload) {
  return request("/api/expenses", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateExpense(id, payload) {
  return request(`/api/expenses/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}

export async function deleteExpense(id) {
  return request(`/api/expenses/${id}`, { method: "DELETE" });
}

export async function updateWorkOrder(id, payload) {
  return request(`/api/work-orders/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}

export async function deleteWorkOrder(id) {
  return request(`/api/work-orders/${id}`, { method: "DELETE" });
}

export async function fetchProfitReport() {
  return request("/api/reports/profit");
}

export async function fetchProfitAlerts() {
  return request("/api/profit-alerts");
}

export async function markProfitAlert(payload) {
  return request("/api/profit-alerts/mark", { method: "POST", body: JSON.stringify(payload || {}) });
}

export async function markBillsSentBatch(payload = {}) {
  return request("/api/bills/mark-sent-batch", { method: "POST", body: JSON.stringify(payload) });
}

export async function fetchAuditLogsQuery(params = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request(`/api/audit-logs${suffix}`);
}

export async function createTenantSnapshot(reason = "manual") {
  return request("/api/tenants/snapshot", { method: "POST", body: JSON.stringify({ reason }) });
}

export async function rollbackTenantLatestSnapshot() {
  return request("/api/tenants/rollback-latest", { method: "POST", body: JSON.stringify({}) });
}

export async function fetchSettings() {
  return request("/api/settings");
}

export async function updateSettings(payload) {
  return request("/api/settings", {
    method: "PUT",
    body: JSON.stringify(payload || {}),
  });
}

// P1-3: 從 HttpOnly Cookie 恢復 session
export async function fetchMe() {
  return request("/api/auth/me");
}

// 待實現的 API（功能預留接口，調用後端對應端點）
export async function createMeterTask(payload) {
  return request("/api/meter-tasks", { method: "POST", body: JSON.stringify(payload) });
}
export async function confirmMeterTask(taskId, payload) {
  return request(`/api/meter-tasks/${taskId}/confirm`, { method: "POST", body: JSON.stringify(payload) });
}
export async function generateBillsFromReadings(payload) {
  return request("/api/bills/generate-from-readings", { method: "POST", body: JSON.stringify(payload) });
}
export async function fetchWechatMessages(cycle) {
  return request(`/api/wechat/messages?cycle=${encodeURIComponent(cycle)}`);
}
