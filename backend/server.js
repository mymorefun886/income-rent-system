import { createHash, createHmac, pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const storageDir = path.join(__dirname, "storage");
const uploadsDir = path.join(storageDir, "uploads");
const logsDir = path.join(storageDir, "logs");
const logsArchiveDir = path.join(logsDir, "archive");
const dbPath = path.join(storageDir, "db.json");

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 8788);
const username = process.env.ADMIN_USERNAME || "morefun886";
const password = process.env.ADMIN_PASSWORD || "Mf848886#";
const appOrigin = process.env.APP_ORIGIN || "";
const apiAllowedOrigins = String(process.env.API_ALLOWED_ORIGINS || appOrigin || (process.env.NODE_ENV === "development" ? "http://localhost:8080" : ""))
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);
// 开发环境下允许本地，生产环境必须配置
if (!apiAllowedOrigins.length && !process.env.NODE_ENV) {
  console.warn("[安全] 未配置 APP_ORIGIN / API_ALLOWED_ORIGINS，API 将拒绝跨域请求。部署时请设置环境变量。");
}
// JWT Secret: 优先用环境变量，否则从文件读，再否则自动生成并保存
const jwtSecretFile = path.join(storageDir, ".jwt_secret");
let jwtSecret = process.env.JWT_SECRET || "";
if (!jwtSecret) {
  try { jwtSecret = readFileSync(jwtSecretFile, "utf8").trim(); } catch {}
}
if (!jwtSecret) {
  jwtSecret = randomBytes(32).toString("hex");
  try { writeFileSync(jwtSecretFile, jwtSecret, "utf8"); } catch {}
  writeRuntimeLog("warn", "jwt_secret_generated", { msg: "自动生成了 JWT Secret，已保存到 .jwt_secret" });
}
const uploadMaxMb = Number(process.env.UPLOAD_MAX_MB || 10);
const backupDir = process.env.BACKUP_DIR || path.join(storageDir, "backups");
const loginMaxAttempts = Number(process.env.LOGIN_MAX_ATTEMPTS || 8);
const loginLockMinutes = Number(process.env.LOGIN_LOCK_MINUTES || 15);
const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH || "";

// 启动安全自检
console.log("=== 收租系统后端启动 ===");
if (username === "19020967028" && password === "M848886#" && !adminPasswordHash) {
  console.warn("⚠️  安全警告：使用默认账号密码，部署到公网前必须修改！");
  console.warn("   设置 ADMIN_PASSWORD_HASH 环境变量以使用安全密码。");
  console.warn("   生成方法: node scripts/gen-password-hash.mjs <你的密码>");
}
if (!process.env.JWT_SECRET) {
  console.log("🔐 JWT Secret 已自动生成并保存（未设置 JWT_SECRET 环境变量）");
}
if (!apiAllowedOrigins.length) {
  console.warn("⚠️  未配置 API_ALLOWED_ORIGINS，跨域请求将被拒绝。");
  console.warn("   设置 APP_ORIGIN 环境变量为你的前端域名。");
}
// 自动清理 90 天前的归档日志
try { const files=readdirSync(logsArchiveDir,{withFileTypes:true}); const cutoff=Date.now()-90*24*60*60*1000; let n=0; files.forEach(f=>{if(!f.isFile())return; try{if(statSync(path.join(logsArchiveDir,f.name)).mtimeMs<cutoff){unlinkSync(path.join(logsArchiveDir,f.name));n++;}}catch{}}); if(n)console.log("📦 已清理",n,"个过期归档日志（>90天）"); }catch{}
console.log("================================\n");

const authSessions = new Map();
const loginAttempts = new Map();

function ensureStorage() {
  if (!existsSync(storageDir)) mkdirSync(storageDir, { recursive: true });
  if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });
  if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });
  if (!existsSync(logsArchiveDir)) mkdirSync(logsArchiveDir, { recursive: true });
  if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
  if (!existsSync(dbPath)) {
    writeFileSync(
      dbPath,
      JSON.stringify(
        {
          user: {
            id: "u-001",
            username,
            name: "本地房产管理员",
            role: "房东管理员",
            portfolio: "绿联云 NAS Docker 实例",
          },
          properties: [],
          tenants: [],
          records: [],
          expenses: [],
          uploads: [],
          meterTasks: [],
          messageLogs: [],
          contracts: [],
          reminders: [],
          roomInventories: [],
          roomInventorySnapshots: [],
          auditLogs: [],
          entityVersions: [],
          importReports: [],
          runtimeLogs: [],
          workOrders: [],
          profitAlerts: [],
          settings: {
            printPayQrUrl: "",
          },
        },
        null,
        2,
      ),
    );
  }
}

function readDb() {
  const raw = readFileSync(dbPath, "utf8");
  const safe = typeof raw === "string" ? raw.replace(/^\uFEFF/, "") : raw;
  return JSON.parse(safe);
}

function writeDb(data) {
  writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

function runtimeLogFilePath(date = new Date()) {
  const day = date.toISOString().slice(0, 10);
  return path.join(logsDir, `runtime-${day}.log`);
}

function writeRuntimeLog(level, action, detail = {}) {
  const row = {
    ts: new Date().toISOString(),
    level: String(level || "info"),
    action: String(action || "runtime"),
    detail,
  };
  try {
    appendFileSync(runtimeLogFilePath(), `${JSON.stringify(row)}\n`, "utf8");
  } catch {}
}

function sendJson(response, statusCode, payload) {
  const reqOrigin = String(response.req?.headers?.origin || "");
  const originAllowed =
    apiAllowedOrigins.includes("*") ||
    (reqOrigin && apiAllowedOrigins.some((allowed) => reqOrigin === allowed || reqOrigin.endsWith(allowed)));
  const finalOrigin = originAllowed ? reqOrigin || appOrigin : appOrigin;
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": finalOrigin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function parseBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk.toString();
    });
    request.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    request.on("error", reject);
  });
}

function ok(data) {
  return { success: true, data };
}

function createToken(value) {
  return createHash("sha256").update(value).digest("hex");
}

function toMaskedIp(raw = "") {
  const ip = String(raw || "").split(",")[0].trim();
  if (!ip.includes(".")) return ip;
  const parts = ip.split(".");
  if (parts.length !== 4) return ip;
  return `${parts[0]}.${parts[1]}.x.x`;
}

function normalizePhone(value = "") {
  return String(value || "").replace(/\s+/g, "");
}

function isValidCnPhone(value = "") {
  return /^1\d{10}$/.test(normalizePhone(value));
}

function normalizeRoomKey(value = "") {
  return String(value || "").replace(/\s+/g, "").toUpperCase();
}

function makeTenantRoomKey(building = "", room = "") {
  return `${String(building || "").trim()}::${normalizeRoomKey(room)}`;
}

function makePropertyRoomKey(building = "", room = "") {
  return `${String(building || "").trim()}::${normalizeRoomKey(room)}`;
}

function syncPropertyStatusByRoom(db, building, room) {
  const propKey = makePropertyRoomKey(building, room);
  const propIndex = (db.properties || []).findIndex(
    (p) => makePropertyRoomKey(p.building, p.room) === propKey,
  );
  if (propIndex < 0) return;
  const hasActiveTenant = (db.tenants || []).some(
    (t) => !t.archived && makeTenantRoomKey(t.building, t.room) === propKey,
  );
  const currentStatus = db.properties[propIndex].status || "";
  const newStatus = hasActiveTenant ? "已出租" : "空置";
  if (currentStatus !== newStatus) {
    db.properties[propIndex] = { ...db.properties[propIndex], status: newStatus };
    addAuditLog(db, "property.status_synced", { building, room, from: currentStatus, to: newStatus }, "system");
  }
}

function tenantSnapshotLatestPath() {
  return path.join(backupDir, "tenants.snapshot.latest.json");
}

function billSendSnapshotLatestPath() {
  return path.join(backupDir, "bills.send.snapshot.latest.json");
}

function createTenantSnapshot(db, operator = "admin", reason = "manual") {
  ensureDbCollections(db);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const payload = {
    createdAt: new Date().toISOString(),
    operator,
    reason,
    total: db.tenants.length,
    tenants: db.tenants,
  };
  const historyPath = path.join(backupDir, `tenants.snapshot.${stamp}.json`);
  writeFileSync(historyPath, JSON.stringify(payload, null, 2), "utf8");
  writeFileSync(tenantSnapshotLatestPath(), JSON.stringify(payload, null, 2), "utf8");
  return { historyPath, latestPath: tenantSnapshotLatestPath(), total: payload.total };
}

function createBillSendSnapshot(db, operator = "admin", reason = "manual") {
  ensureDbCollections(db);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const payload = {
    createdAt: new Date().toISOString(),
    operator,
    reason,
    records: (db.records || []).map((r) => ({
      id: r.id,
      sentStatus: r.sentStatus || "",
      sentAt: r.sentAt || "",
    })),
  };
  const historyPath = path.join(backupDir, `bills.send.snapshot.${stamp}.json`);
  writeFileSync(historyPath, JSON.stringify(payload, null, 2), "utf8");
  writeFileSync(billSendSnapshotLatestPath(), JSON.stringify(payload, null, 2), "utf8");
  return { historyPath, latestPath: billSendSnapshotLatestPath(), total: payload.records.length };
}

function getClientIp(request) {
  return String(request.headers["x-forwarded-for"] || request.socket?.remoteAddress || "");
}

function isLoginLocked(ip) {
  const row = loginAttempts.get(ip);
  if (!row) return false;
  if (row.lockUntil && row.lockUntil > Date.now()) return true;
  if (row.lockUntil && row.lockUntil <= Date.now()) loginAttempts.delete(ip);
  return false;
}

function registerLoginFailure(ip) {
  const now = Date.now();
  const row = loginAttempts.get(ip) || { count: 0, lockUntil: 0 };
  const next = { ...row, count: row.count + 1 };
  if (next.count >= loginMaxAttempts) {
    next.lockUntil = now + loginLockMinutes * 60 * 1000;
    next.count = 0;
  }
  loginAttempts.set(ip, next);
}

function clearLoginFailures(ip) {
  loginAttempts.delete(ip);
}

function hashPassword(password, salt) {
  return pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
}

function verifyPassword(raw) {
  if (!adminPasswordHash) return raw === password;
  const [algo, iterStr, salt, hashed] = String(adminPasswordHash).split("$");
  if (algo !== "pbkdf2-sha256" || !iterStr || !salt || !hashed) return false;
  const iterations = Number(iterStr || 0);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;
  const got = pbkdf2Sync(raw, salt, iterations, 32, "sha256").toString("hex");
  try {
    return timingSafeEqual(Buffer.from(got, "hex"), Buffer.from(hashed, "hex"));
  } catch {
    return false;
  }
}

function mintSessionToken(userName) {
  const token = createHash("sha256")
    .update(`${userName}:${Date.now()}:${randomBytes(16).toString("hex")}:${jwtSecret}`)
    .digest("hex");
  authSessions.set(token, {
    username: userName,
    createdAt: Date.now(),
    expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7,
  });
  return token;
}

function getAuthToken(request) {
  const header = String(request.headers.authorization || "");
  if (!header.startsWith("Bearer ")) return "";
  return header.replace("Bearer ", "").trim();
}

function isAuthed(request) {
  const token = getAuthToken(request);
  if (!token) return false;
  const session = authSessions.get(token);
  if (!session) return false;
  if (session.expiresAt < Date.now()) {
    authSessions.delete(token);
    return false;
  }
  return true;
}

function safeFilename(filename = "") {
  return String(filename || "")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\.\.+/g, ".")
    .trim();
}

function ensureDbCollections(db) {
  if (!Array.isArray(db.properties)) db.properties = [];
  if (!Array.isArray(db.tenants)) db.tenants = [];
  if (!Array.isArray(db.records)) db.records = [];
  if (!Array.isArray(db.expenses)) db.expenses = [];
  if (!Array.isArray(db.meterTasks)) db.meterTasks = [];
  if (!Array.isArray(db.messageLogs)) db.messageLogs = [];
  if (!Array.isArray(db.uploads)) db.uploads = [];
  if (!Array.isArray(db.contracts)) db.contracts = [];
  if (!Array.isArray(db.reminders)) db.reminders = [];
  if (!Array.isArray(db.roomInventories)) db.roomInventories = [];
  if (!Array.isArray(db.roomInventorySnapshots)) db.roomInventorySnapshots = [];
  if (!Array.isArray(db.auditLogs)) db.auditLogs = [];
  if (!Array.isArray(db.entityVersions)) db.entityVersions = [];
  if (!Array.isArray(db.importReports)) db.importReports = [];
  if (!Array.isArray(db.runtimeLogs)) db.runtimeLogs = [];
  if (!Array.isArray(db.workOrders)) db.workOrders = [];
  if (!Array.isArray(db.profitAlerts)) db.profitAlerts = [];
  if (!db.settings || typeof db.settings !== "object") db.settings = {};
  if (typeof db.settings.printPayQrUrl !== "string") db.settings.printPayQrUrl = "";
  if (!db.settings.automationTasks || typeof db.settings.automationTasks !== "object") db.settings.automationTasks = {};
  const at = db.settings.automationTasks;
  if (!at.contractReminder || typeof at.contractReminder !== "object") at.contractReminder = {};
  if (!at.monthlyBillGenerate || typeof at.monthlyBillGenerate !== "object") at.monthlyBillGenerate = {};
  if (!at.dailyBackup || typeof at.dailyBackup !== "object") at.dailyBackup = {};
  if (!at.anomalyPush || typeof at.anomalyPush !== "object") at.anomalyPush = {};
  if (typeof at.contractReminder.enabled !== "boolean") at.contractReminder.enabled = true;
  if (typeof at.contractReminder.runHour !== "number") at.contractReminder.runHour = 9;
  if (typeof at.monthlyBillGenerate.enabled !== "boolean") at.monthlyBillGenerate.enabled = false;
  if (typeof at.monthlyBillGenerate.runHour !== "number") at.monthlyBillGenerate.runHour = 9;
  if (typeof at.dailyBackup.enabled !== "boolean") at.dailyBackup.enabled = true;
  if (typeof at.dailyBackup.runHour !== "number") at.dailyBackup.runHour = 6;
  if (typeof at.dailyBackup.keepDays !== "number") at.dailyBackup.keepDays = 60;
  if (typeof at.anomalyPush.enabled !== "boolean") at.anomalyPush.enabled = false;
  if (typeof at.anomalyPush.runHour !== "number") at.anomalyPush.runHour = 10;
  if (typeof at.anomalyPush.webhook !== "string") at.anomalyPush.webhook = "";
  if (!at.lastRuns || typeof at.lastRuns !== "object") at.lastRuns = {};
  if (!db.settings.opsRules || typeof db.settings.opsRules !== "object") {
    db.settings.opsRules = {};
  }
  if (!Number.isFinite(Number(db.settings.opsRules.contractDueDays))) db.settings.opsRules.contractDueDays = 30;
  if (!Number.isFinite(Number(db.settings.opsRules.unpaidHighAmount))) db.settings.opsRules.unpaidHighAmount = 1000;
  if (!Number.isFinite(Number(db.settings.opsRules.lowProfitThreshold))) db.settings.opsRules.lowProfitThreshold = 0;
}

function getProfitAlertKey(row = {}) {
  return String(row.roomKey || "").trim() || makeTenantRoomKey(row.building || "", row.room || "");
}

function isProfitAlertSuppressed(row = {}, nowTs = Date.now()) {
  if (!row || typeof row !== "object") return false;
  if (row.resolvedAt) return true;
  const ignoreUntilTs = row.ignoreUntil ? new Date(String(row.ignoreUntil)).getTime() : 0;
  return Number.isFinite(ignoreUntilTs) && ignoreUntilTs > nowTs;
}

function addAuditLog(db, action, detail, operator = "system") {
  ensureDbCollections(db);
  db.auditLogs.unshift({
    id: `audit-${randomUUID()}`,
    action,
    detail,
    operator,
    createdAt: new Date().toISOString(),
  });
  if (db.auditLogs.length > 3000) db.auditLogs.length = 3000;
}

function normalizeVersionEntity(entity = "") {
  const v = String(entity || "").trim().toLowerCase();
  if (["tenant", "tenants", "租客"].includes(v)) return "tenants";
  if (["record", "records", "bill", "bills", "账单"].includes(v)) return "records";
  if (["expense", "expenses", "支出"].includes(v)) return "expenses";
  if (["contract", "contracts", "合同"].includes(v)) return "contracts";
  return "";
}

function getCollectionByVersionEntity(db, entity = "") {
  const normalized = normalizeVersionEntity(entity);
  if (!normalized) return null;
  ensureDbCollections(db);
  return db[normalized];
}

function createEntityVersion(db, entity, entityId, beforeValue, afterValue, action, operator = "system", note = "") {
  ensureDbCollections(db);
  const normalized = normalizeVersionEntity(entity);
  if (!normalized || !entityId) return null;
  const row = {
    id: `ver-${randomUUID()}`,
    entity: normalized,
    entityId: String(entityId),
    action: String(action || "update"),
    before: beforeValue == null ? null : beforeValue,
    after: afterValue == null ? null : afterValue,
    note: String(note || ""),
    operator: String(operator || "system"),
    createdAt: new Date().toISOString(),
  };
  db.entityVersions.unshift(row);
  if (db.entityVersions.length > 20000) db.entityVersions.length = 20000;
  return row;
}

function addRuntimeLog(db, level, action, detail) {
  ensureDbCollections(db);
  const row = {
    id: `rt-${randomUUID()}`,
    level: String(level || "info"),
    action: String(action || "runtime"),
    detail: detail || {},
    createdAt: new Date().toISOString(),
  };
  db.runtimeLogs.unshift(row);
  if (db.runtimeLogs.length > 3000) db.runtimeLogs.length = 3000;
  writeRuntimeLog(row.level, row.action, row.detail);
}

function parseDateLike(value) {
  const v = String(value || "").trim();
  if (!v) return "";
  const normalized = v.replace(/\./g, "-").replace(/\//g, "-");
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function toPositiveInt(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const int = Math.floor(num);
  return int > 0 ? int : fallback;
}

function parseLogDateFromFilename(filename = "") {
  const m = String(filename).match(/^runtime-(\d{4}-\d{2}-\d{2})\.log$/);
  if (!m) return null;
  const d = new Date(`${m[1]}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseCycleLike(value) {
  const v = String(value || "").trim();
  if (!v) return "";
  const m = v.match(/(\d{4})[-/\.](\d{1,2})/);
  if (!m) return "";
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!year || month < 1 || month > 12) return "";
  return `${year}-${String(month).padStart(2, "0")}`;
}

function archiveRuntimeLogsOlderThan(days = 30) {
  const safeDays = Math.min(3650, Math.max(1, Number(days || 30)));
  const cutoffMs = Date.now() - safeDays * 24 * 60 * 60 * 1000;
  if (!existsSync(logsDir)) return { archivedFiles: 0, archivedRows: 0, bytesSaved: 0 };
  const files = readdirSync(logsDir).filter((name) => /^runtime-\d{4}-\d{2}-\d{2}\.log$/.test(String(name)));
  let archivedFiles = 0;
  let archivedRows = 0;
  let bytesSaved = 0;
  for (const name of files) {
    const full = path.join(logsDir, name);
    const stat = statSync(full);
    const mtimeMs = stat.mtime.getTime();
    if (!(mtimeMs < cutoffMs)) continue;
    const buf = readFileSync(full);
    const gz = gzipSync(buf);
    const target = path.join(logsArchiveDir, `${name}.gz`);
    writeFileSync(target, gz);
    unlinkSync(full);
    archivedFiles += 1;
    archivedRows += String(buf.toString("utf8") || "").split("\n").filter(Boolean).length;
    bytesSaved += Math.max(0, Number(buf.length || 0) - Number(gz.length || 0));
  }
  return { archivedFiles, archivedRows, bytesSaved };
}

function filterRecordsByQuery(records = [], query = {}) {
  const status = String(query.status || "all").trim();
  const cycle = String(query.cycle || "all").trim();
  const building = String(query.building || "all").trim();
  const keyword = String(query.keyword || "").trim();
  const send = String(query.send || "all").trim();
  const workflow = String(query.workflow || "all").trim();
  const paymentMethod = String(query.paymentMethod || "all").trim();
  const receipt = String(query.receipt || "all").trim();
  const paidDateFrom = String(query.paidDateFrom || "").trim();
  const paidDateTo = String(query.paidDateTo || "").trim();
  const sortByUnpaidDesc = String(query.sortByUnpaidDesc || "false") === "true";
  const exceptionFirst = String(query.exceptionFirst || "false") === "true";
  let rows = (Array.isArray(records) ? records : []).map((row) => normalizeRecordRow(row));
  if (status !== "all") rows = rows.filter((r) => String(r.status || "") === status);
  if (cycle !== "all") rows = rows.filter((r) => String(r.cycle || "") === cycle);
  if (building !== "all") rows = rows.filter((r) => String(r.building || "") === building || String(r.room || "").includes(building));
  if (keyword) rows = rows.filter((r) => `${r.tenant || ""} ${r.room || ""} ${r.note || ""}`.includes(keyword));
  if (send !== "all") rows = rows.filter((r) => (String(r.sentStatus || "") === "sent" ? "sent" : "pending") === send);
  if (workflow !== "all") rows = rows.filter((r) => String(getWorkflowStatus(r) || "") === workflow);
  if (receipt !== "all") rows = rows.filter((r) => (receipt === "with" ? hasPaymentReceipt(r) : !hasPaymentReceipt(r)));
  if (paymentMethod !== "all") {
    rows = rows.filter((r) => {
      const methods = getPaymentMethods(r).join("|");
      if (paymentMethod === "wechat") return /微信/i.test(methods);
      if (paymentMethod === "bank") return /银行|转账|银行卡/i.test(methods);
      if (paymentMethod === "cash") return /现金/i.test(methods);
      if (paymentMethod === "other") return !/微信|银行|转账|银行卡|现金/i.test(methods);
      return true;
    });
  }
  if (paidDateFrom || paidDateTo) {
    rows = rows.filter((r) => {
      const paidAt = getLastPaidAt(r);
      if (!paidAt) return false;
      if (paidDateFrom && String(paidAt) < paidDateFrom) return false;
      if (paidDateTo && String(paidAt) > paidDateTo) return false;
      return true;
    });
  }
  if (sortByUnpaidDesc) rows = rows.slice().sort((a, b) => (Number(b.receivable || 0) - getRecordPaidAmount(b)) - (Number(a.receivable || 0) - getRecordPaidAmount(a)));
  if (exceptionFirst) rows = rows.slice().sort((a, b) => getExceptionScore(b) - getExceptionScore(a));
  return rows;
}

function getCurrentCycle(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function generateMonthStartBillsInternal(db, operator = "system") {
  ensureDbCollections(db);
  const cycle = getCurrentCycle(new Date());
  const existing = new Set((db.records || []).map((r) => `${String(r.tenantId || "").trim()}::${String(r.cycle || "").trim()}`));
  const created = [];
  for (const t of db.tenants || []) {
    if (t.archived) continue;
    const tenantId = String(t.id || "").trim();
    if (!tenantId) continue;
    const key = `${tenantId}::${cycle}`;
    if (existing.has(key)) continue;
    const receivable = Number(t.rent || 0);
    if (!(receivable >= 0)) continue;
    const row = normalizeRecordRow({
      id: `rec-${randomUUID()}`,
      tenantId,
      tenant: String(t.name || "").trim(),
      building: String(t.building || "").trim(),
      room: `${String(t.building || "").trim()} - ${String(t.room || "").trim()}`,
      roomNo: String(t.room || "").trim(),
      roomKey: makeTenantRoomKey(t.building || "", t.room || ""),
      cycle,
      receivable,
      received: 0,
      status: "待收",
      dueDate: `${cycle}-05`,
      deposit: Number(t.deposit || 0),
      rent: receivable,
      electricPrev: 0,
      electricNow: 0,
      electricUsage: 0,
      electricUnitPrice: 0,
      waterPrev: 0,
      waterNow: 0,
      waterUsage: 0,
      waterUnitPrice: 0,
    });
    db.records.unshift(row);
    createEntityVersion(db, "records", row.id, null, row, "create", operator, "automation:monthlyBillGenerate");
    created.push(row);
  }
  if (created.length) addAuditLog(db, "automation.monthly_bill.generated", { cycle, count: created.length }, operator);
  return { cycle, count: created.length };
}

async function pushAnomalySummaryInternal(db, webhook = "") {
  const targetWebhook = String(webhook || "").trim();
  if (!targetWebhook) return { sent: false, reason: "webhook_missing" };
  const dashboard = computeDashboard(db);
  const profit = computeProfitReport(db);
  const content = [
    "【租房系统异常告警】",
    `时间：${new Date().toLocaleString("zh-CN", { hour12: false })}`,
    `逾期账单：${Number(dashboard.overdueCount || 0)}`,
    `高额未收：${Number(dashboard.unpaid30Days || 0)}`,
    `低收益房号：${Array.isArray(profit.lowProfitTop) ? profit.lowProfitTop.length : 0}`,
  ].join("\n");
  const resp = await fetch(targetWebhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ msgtype: "text", text: { content } }),
  });
  return { sent: resp.ok, status: resp.status };
}

async function runAutomationTaskByKey(db, key, trigger = "auto", operator = "system") {
  ensureDbCollections(db);
  const runs = db.settings.automationTasks.lastRuns || {};
  let result = { key, trigger, ok: true };
  if (key === "contractReminder") {
    const ret = runDueRemindersInternal(db, operator, trigger);
    result = { ...result, count: Number(ret.count || 0), date: ret.date };
  } else if (key === "monthlyBillGenerate") {
    const ret = generateMonthStartBillsInternal(db, operator);
    result = { ...result, cycle: ret.cycle, count: ret.count };
  } else if (key === "dailyBackup") {
    const backupPath = makeDataBackup("auto-daily");
    result = { ...result, backupPath };
    cleanupOldBackups(at.dailyBackup?.keepDays ?? 60);
  } else if (key === "anomalyPush") {
    const webhook = ""; // WeCom disabled
    const ret = await pushAnomalySummaryInternal(db, webhook);
    result = { ...result, ...ret };
  } else {
    return { key, trigger, ok: false, message: "未知任务类型" };
  }
  runs[key] = new Date().toISOString();
  db.settings.automationTasks.lastRuns = runs;
  addAuditLog(db, "automation.task.run", result, operator);
  return result;
}

function startOfUtcDay(value) {
  const parsed = parseDateLike(value);
  if (!parsed) return null;
  const dt = new Date(`${parsed}T00:00:00.000Z`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function diffDaysUtcInclusive(fromDate, toDate) {
  if (!(fromDate instanceof Date) || Number.isNaN(fromDate.getTime())) return 0;
  if (!(toDate instanceof Date) || Number.isNaN(toDate.getTime())) return 0;
  const ms = toDate.getTime() - fromDate.getTime();
  if (ms < 0) return 0;
  return Math.floor(ms / 86400000) + 1;
}

const PROPERTY_STATUS_MAP = new Map([
  ["空置", "空置"],
  ["闲置", "空置"],
  ["vacant", "空置"],
  ["已出租", "已出租"],
  ["出租", "已出租"],
  ["rented", "已出租"],
  ["自用", "自用"],
  ["自用（不出租）", "自用"],
]);

const RECORD_STATUS_MAP = new Map([
  ["待收", "待收"],
  ["未收", "待收"],
  ["pending", "待收"],
  ["已收", "已收"],
  ["paid", "已收"],
  ["逾期", "逾期"],
  ["overdue", "逾期"],
  ["部分收", "部分收"],
  ["部分已收", "部分收"],
  ["partial", "部分收"],
]);

const SEND_STATUS_MAP = new Map([
  ["pending", "待发送"],
  ["待发送", "待发送"],
  ["sent", "已发送"],
  ["已发送", "已发送"],
  ["failed", "失败"],
  ["失败", "失败"],
  ["rollback", "已回滚"],
  ["已回滚", "已回滚"],
]);

const TEXT_NORMALIZE_MAP = new Map([
  ["閫炬湡", "逾期"],
  ["寰呮敹", "待收"],
  ["宸叉敹", "已收"],
  ["绌虹疆", "空置"],
  ["宸插嚭绉?", "已出租"],
  ["寰俊", "微信"],
  ["鍗曢棿", "单间"],
  ["绌鸿皟", "空调"],
  ["鐑按鍣?", "热水器"],
]);

function normalizeMappedValue(value, map) {
  const raw = String(value ?? "").trim();
  if (!raw) return raw;
  return map.get(raw) || raw;
}

function normalizeTextValue(value) {
  if (typeof value !== "string") return value;
  let next = value;
  for (const [from, to] of TEXT_NORMALIZE_MAP.entries()) {
    next = next.split(from).join(to);
  }
  return next;
}

function looksMojibake(value) {
  const text = String(value ?? "");
  if (!text) return false;
  return /�|[锛銆鎴妤绉璐搴寰宸鍛鐑绌]/.test(text);
}

function currentCycle() {
  return new Date().toISOString().slice(0, 7);
}

function makeDataBackup(reason = "data-health") {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(backupDir, `db.${reason}.${stamp}.json`);
  writeFileSync(target, readFileSync(dbPath, "utf8"));
  return target;
}

function cleanupOldBackups(keepDays = 60) {
  if (!existsSync(backupDir)) return 0;
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  let cleaned = 0;
  try {
    const files = readdirSync(backupDir);
    for (const name of files) {
      if (!/^db\.auto-(daily|weekly|backup)\..+\.json$/.test(name)) continue;
      const fullPath = path.join(backupDir, name);
      try {
        if (statSync(fullPath).mtimeMs < cutoff) {
          unlinkSync(fullPath);
          cleaned++;
        }
      } catch {}
    }
  } catch {}
  if (cleaned > 0) console.log(`📦 已清理 ${cleaned} 个过期备份（>${keepDays}天）`);
  return cleaned;
}

function getRecordPaidAmount(record = {}) {
  if (Array.isArray(record.payments) && record.payments.length) {
    return record.payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  }
  return Number(record.received || 0);
}

function getRoomKeyFromRecord(record = {}) {
  const fields = deriveRecordRoomFields(record);
  return fields.roomKey;
}

function parseRecordRoomLabel(roomText = "") {
  const raw = String(roomText || "").trim();
  if (!raw) return { building: "", roomNo: "" };
  const m = raw.match(/^(.+?)\s*-\s*(.+)$/);
  if (m) return { building: String(m[1] || "").trim(), roomNo: String(m[2] || "").trim() };
  return { building: "", roomNo: raw };
}

function deriveRecordRoomFields(record = {}) {
  const roomText = String(record.room || "").trim();
  const parsed = parseRecordRoomLabel(roomText);
  const building = String(record.building || "").trim() || parsed.building;
  const roomNo = String(record.roomNo || record.room_number || "").trim() || parsed.roomNo;
  const roomKey = String(record.roomKey || "").trim() || makeTenantRoomKey(building, roomNo);
  const room = roomText || (building && roomNo ? `${building} - ${roomNo}` : roomNo || "");
  return { building, roomNo, roomKey, room };
}

function normalizeRecordRow(record = {}) {
  const fields = deriveRecordRoomFields(record);
  return {
    ...record,
    ...fields,
  };
}

function computeRecordStatusByAmount(record = {}) {
  const receivable = Number(record.receivable || 0);
  const paid = Number(getRecordPaidAmount(record) || 0);
  if (receivable > 0 && paid >= receivable) return "已收";
  if (paid > 0 && paid < receivable) return "部分收款";
  const due = new Date(String(record.dueDate || ""));
  if (!Number.isNaN(due.getTime()) && due.getTime() < Date.now()) return "逾期";
  return "待收";
}

function hasPaymentReceipt(record = {}) {
  return (Array.isArray(record.payments) ? record.payments : []).some((item) => String(item.receiptUrl || "").trim());
}

function getPaymentMethods(record = {}) {
  const list = Array.isArray(record.payments) ? record.payments : [];
  if (list.length) return list.map((x) => String(x.method || "").trim()).filter(Boolean);
  return [String(record.method || "").trim()].filter(Boolean);
}

function getLastPaidAt(record = {}) {
  const list = Array.isArray(record.payments) ? record.payments : [];
  if (list.length) {
    const sorted = list.map((x) => String(x.paidAt || "").trim()).filter(Boolean).sort((a, b) => String(b).localeCompare(String(a), "zh-Hans-CN", { numeric: true }));
    return sorted[0] || "";
  }
  return String(record.paidAt || "").trim();
}

function getWorkflowStatus(record = {}) {
  if (record.archivedAt) return "已归档";
  const paid = getRecordPaidAmount(record);
  const due = Number(record.receivable || 0);
  if (due > 0 && paid >= due) return "已收齐";
  if (String(record.sentStatus || "") === "sent") return "已发送";
  if (record.reviewedAt) return "已核对";
  return "未核对";
}

function getExceptionScore(record = {}) {
  const paid = getRecordPaidAmount(record);
  const due = Number(record.receivable || 0);
  const status = deriveRecordStatus({ receivable: due, received: paid, dueDate: record.dueDate });
  let score = 0;
  if (record.archivedAt) score -= 100;
  if (status === "逾期") score += 80;
  if (paid > 0 && paid < due) score += 65;
  if (paid < due) score += 45;
  if (due > 0 && paid >= due && !hasPaymentReceipt(record)) score += 30;
  if (Number(record.receivable || 0) <= 0) score += 25;
  if (Number(record.electricNow || 0) < Number(record.electricPrev || 0)) score += 20;
  if (Number(record.waterNow || 0) < Number(record.waterPrev || 0)) score += 20;
  if (!record.reviewedAt) score += 10;
  return score;
}

function isReadOnlyRole(role = "") {
  const v = String(role || "").trim().toLowerCase();
  return v === "viewer" || v === "readonly";
}

function computeProfitReport(db) {
  ensureDbCollections(db);
  const records = db.records.map((row) => normalizeRecordRow(row));
  const monthly = new Map();
  const byCategory = new Map();
  const byRoom = new Map();
  const activeTenantRoom = new Set((db.tenants || []).filter((t) => !t.archived).map((t) => makeTenantRoomKey(t.building, t.room)));
  const lastOccupyEndByRoom = new Map();
  const roomRentMap = new Map((db.properties || []).map((p) => [makeTenantRoomKey(p.building, p.room), Number(p.rent || 0)]));
  const todayUtc = startOfUtcDay(new Date().toISOString().slice(0, 10)) || new Date();
  for (const tenant of db.tenants || []) {
    const key = makeTenantRoomKey(tenant.building || "", tenant.room || "");
    if (!key) continue;
    const endDate =
      startOfUtcDay(tenant.checkoutDate || "") ||
      startOfUtcDay(tenant.leaseEnd || "") ||
      null;
    if (!endDate) continue;
    const prev = lastOccupyEndByRoom.get(key);
    if (!prev || endDate.getTime() > prev.getTime()) lastOccupyEndByRoom.set(key, endDate);
  }
  for (const r of records) {
    const cycle = parseCycleLike(r.cycle) || "";
    if (!cycle) continue;
    const paid = getRecordPaidAmount(r);
    const row = monthly.get(cycle) || { cycle, receivable: 0, received: 0, expense: 0, profit: 0, collectionRate: 0 };
    row.receivable += Number(r.receivable || 0);
    row.received += Number(paid || 0);
    monthly.set(cycle, row);

    const key = r.roomKey || makeTenantRoomKey(r.building, r.roomNo);
    if (key) {
      const roomRow = byRoom.get(key) || {
        roomKey: key,
        building: r.building || "",
        room: r.roomNo || "",
        receivable: 0,
        received: 0,
        expense: 0,
        maintenanceCost: 0,
        vacancyDays: 0,
        vacancyLoss: 0,
        profit: 0,
        collectionRate: 0,
      };
      roomRow.receivable += Number(r.receivable || 0);
      roomRow.received += Number(paid || 0);
      byRoom.set(key, roomRow);
    }
  }
  for (const e of db.expenses) {
    const cycle = parseCycleLike(e.period || e.date) || "";
    if (!cycle) continue;
    const row = monthly.get(cycle) || { cycle, receivable: 0, received: 0, expense: 0, profit: 0, collectionRate: 0 };
    row.expense += Number(e.amount || 0);
    monthly.set(cycle, row);

    const cat = String(e.category || "未分类");
    const catRow = byCategory.get(cat) || { category: cat, amount: 0, count: 0 };
    catRow.amount += Number(e.amount || 0);
    catRow.count += 1;
    byCategory.set(cat, catRow);

    const building = String(e.building || parseRecordRoomLabel(e.propertyLabel || "").building || "").trim();
    const roomNo = String(e.room || "").trim();
    const key = building && roomNo ? makeTenantRoomKey(building, roomNo) : "";
    if (key) {
      const roomRow = byRoom.get(key) || {
        roomKey: key,
        building,
        room: roomNo,
        receivable: 0,
        received: 0,
        expense: 0,
        maintenanceCost: 0,
        vacancyDays: 0,
        vacancyLoss: 0,
        profit: 0,
        collectionRate: 0,
      };
      const amount = Number(e.amount || 0);
      roomRow.expense += amount;
      if (/维修|maint/i.test(String(e.category || ""))) roomRow.maintenanceCost += amount;
      byRoom.set(key, roomRow);
    }
  }
  const monthlyRows = [...monthly.values()]
    .map((x) => ({
      ...x,
      profit: x.received - x.expense,
      collectionRate: x.receivable > 0 ? Math.round((x.received / x.receivable) * 10000) / 100 : 0,
    }))
    .sort((a, b) => String(b.cycle).localeCompare(String(a.cycle), "zh-Hans-CN", { numeric: true }));

  const buildingRows = new Map();
  for (const r of records) {
    const b = String(r.building || parseRecordRoomLabel(r.room || "").building || "").trim() || "未分配";
    const row = buildingRows.get(b) || { building: b, receivable: 0, received: 0, expense: 0, profit: 0, collectionRate: 0 };
    row.receivable += Number(r.receivable || 0);
    row.received += Number(getRecordPaidAmount(r) || 0);
    buildingRows.set(b, row);
  }
  for (const e of db.expenses) {
    const b = String(e.building || parseRecordRoomLabel(e.propertyLabel || "").building || "").trim() || "未分配";
    const row = buildingRows.get(b) || { building: b, receivable: 0, received: 0, expense: 0, profit: 0, collectionRate: 0 };
    row.expense += Number(e.amount || 0);
    buildingRows.set(b, row);
  }
  const byBuilding = [...buildingRows.values()]
    .map((x) => ({
      ...x,
      profit: x.received - x.expense,
      collectionRate: x.receivable > 0 ? Math.round((x.received / x.receivable) * 10000) / 100 : 0,
    }))
    .sort((a, b) => a.building.localeCompare(b.building, "zh-Hans-CN", { numeric: true }));

  const byRoomRows = [...byRoom.values()].map((x) => {
    const isVacant = !activeTenantRoom.has(x.roomKey);
    const monthlyRent = roomRentMap.get(x.roomKey) || 0;
    const lastEnd = lastOccupyEndByRoom.get(x.roomKey) || null;
    const vacancyStart = lastEnd ? new Date(lastEnd.getTime() + 86400000) : todayUtc;
    const vacancyDays = isVacant ? diffDaysUtcInclusive(vacancyStart, todayUtc) : 0;
    const dailyRent = monthlyRent > 0 ? monthlyRent / 30 : 0;
    const vacancyLoss = isVacant && dailyRent > 0 ? Number((vacancyDays * dailyRent).toFixed(2)) : 0;
    const profit = x.received - x.expense - vacancyLoss;
    const collectionRate = x.receivable > 0 ? Math.round((x.received / x.receivable) * 10000) / 100 : 0;
    const riskScore = Number(x.maintenanceCost || 0) + Number(vacancyLoss || 0);
    const lowProfit = profit <= 0 || collectionRate < 95 || riskScore >= monthlyRent;
    return {
      ...x,
      vacancyDays,
      vacancyLoss,
      profit,
      collectionRate,
      riskScore,
      lowProfit,
      lowProfitReason: [
        profit <= 0 ? "利润<=0" : "",
        collectionRate < 95 ? "收缴率<95%" : "",
        riskScore >= monthlyRent && monthlyRent > 0 ? "风险分>=月租金" : "",
      ]
        .filter(Boolean)
        .join("，"),
    };
  })
    .sort((a, b) => (b.profit - a.profit) || a.building.localeCompare(b.building, "zh-Hans-CN", { numeric: true }) || a.room.localeCompare(b.room, "zh-Hans-CN", { numeric: true }));

  const byCategoryRows = [...byCategory.values()].sort((a, b) => b.amount - a.amount);

  return {
    generatedAt: new Date().toISOString(),
    monthly: monthlyRows,
    byBuilding,
    byRoom: byRoomRows,
    byCategory: byCategoryRows,
  };
}

function buildDataHealthFixes(db) {
  ensureDbCollections(db);
  const fixes = [];
  const issues = [];
  const addIssue = (severity, code, title, detail, fixable = false, ref = {}) => {
    issues.push({ id: `issue-${issues.length + 1}`, severity, code, title, detail, fixable, ref });
  };
  const addFix = (collection, id, field, before, after, label) => {
    if (before === after) return;
    fixes.push({ collection, id, field, before, after, label });
  };

  const propertyRoomSeen = new Map();
  for (const p of db.properties) {
    const key = makeTenantRoomKey(p.building, p.room);
    if (key && propertyRoomSeen.has(key)) {
      addIssue("error", "DUPLICATE_PROPERTY_ROOM", "房源房号重复", `${p.building || "-"} - ${p.room || "-"} 与另一条房源重复`, false, { collection: "properties", id: p.id });
    }
    if (key) propertyRoomSeen.set(key, p.id);
    if (!String(p.room || "").trim()) addIssue("error", "PROPERTY_ROOM_MISSING", "房源缺少房号", p.title || p.id || "-", false, { collection: "properties", id: p.id });
    const normalizedStatus = normalizeMappedValue(p.status, PROPERTY_STATUS_MAP);
    if (String(p.status || "").trim() && normalizedStatus !== String(p.status || "").trim()) {
      addIssue("warn", "PROPERTY_STATUS_ALIAS", "房源状态需归一", `${p.status} -> ${normalizedStatus}`, true, { collection: "properties", id: p.id });
      addFix("properties", p.id, "status", p.status, normalizedStatus, "归一房源状态");
    }
    for (const field of ["building", "title", "address", "layout", "status", "tenantName", "bankAccount"]) {
      const after = normalizeTextValue(p[field]);
      if (after !== p[field]) {
        addIssue("warn", "PROPERTY_TEXT_MOJIBAKE", "房源文字疑似乱码", `${field}: ${p[field]} -> ${after}`, true, { collection: "properties", id: p.id, field });
        addFix("properties", p.id, field, p[field], after, "修复房源文字");
      } else if (looksMojibake(p[field])) {
        addIssue("warn", "PROPERTY_TEXT_MOJIBAKE", "房源文字疑似乱码", `${field}: ${p[field]}`, false, { collection: "properties", id: p.id, field });
      }
    }
  }

  const activeTenantRooms = new Map();
  for (const t of db.tenants) {
    if (!String(t.room || "").trim() || !String(t.building || "").trim()) {
      addIssue("error", "TENANT_ROOM_MISSING", "租客缺少入住房号", `${t.name || t.id || "-"} 缺少楼栋或房号`, false, { collection: "tenants", id: t.id });
    }
    if (!t.archived) {
      const key = makeTenantRoomKey(t.building, t.room);
      if (key && activeTenantRooms.has(key)) {
        addIssue("error", "DUPLICATE_ACTIVE_TENANT_ROOM", "同一房号存在多个在租租客", `${t.building || "-"} - ${t.room || "-"}`, false, { collection: "tenants", id: t.id });
      }
      if (key) activeTenantRooms.set(key, t.id);
    }
    for (const field of ["name", "building", "room", "status", "wechatGroupName", "wechatRemark", "notes"]) {
      const after = normalizeTextValue(t[field]);
      if (after !== t[field]) {
        addIssue("warn", "TENANT_TEXT_MOJIBAKE", "租客文字疑似乱码", `${field}: ${t[field]} -> ${after}`, true, { collection: "tenants", id: t.id, field });
        addFix("tenants", t.id, field, t[field], after, "修复租客文字");
      } else if (looksMojibake(t[field])) {
        addIssue("warn", "TENANT_TEXT_MOJIBAKE", "租客文字疑似乱码", `${field}: ${t[field]}`, false, { collection: "tenants", id: t.id, field });
      }
    }
  }

  for (const r of db.records) {
    const roomFields = deriveRecordRoomFields(r);
    if (!roomFields.roomKey) {
      addIssue("error", "RECORD_ROOM_KEY_MISSING", "账单缺少标准房号键", `${r.tenant || "-"} / ${r.room || "-"}`, false, { collection: "records", id: r.id });
    } else {
      if (String(r.building || "").trim() !== roomFields.building) {
        addIssue("warn", "RECORD_BUILDING_MISSING", "账单缺少楼栋标准字段", `${r.room || "-"} -> ${roomFields.building}`, true, { collection: "records", id: r.id, field: "building" });
        addFix("records", r.id, "building", r.building, roomFields.building, "补全账单楼栋");
      }
      if (String(r.roomNo || "").trim() !== roomFields.roomNo) {
        addIssue("warn", "RECORD_ROOMNO_MISSING", "账单缺少房号标准字段", `${r.room || "-"} -> ${roomFields.roomNo}`, true, { collection: "records", id: r.id, field: "roomNo" });
        addFix("records", r.id, "roomNo", r.roomNo, roomFields.roomNo, "补全账单房号");
      }
      if (String(r.roomKey || "").trim() !== roomFields.roomKey) {
        addIssue("warn", "RECORD_ROOMKEY_MISSING", "账单缺少房号键字段", `${r.room || "-"} -> ${roomFields.roomKey}`, true, { collection: "records", id: r.id, field: "roomKey" });
        addFix("records", r.id, "roomKey", r.roomKey, roomFields.roomKey, "补全账单房号键");
      }
      if (String(r.room || "").trim() !== roomFields.room) {
        addIssue("warn", "RECORD_ROOM_LABEL_NORMALIZE", "账单房号展示格式归一", `${r.room || "-"} -> ${roomFields.room}`, true, { collection: "records", id: r.id, field: "room" });
        addFix("records", r.id, "room", r.room, roomFields.room, "归一账单房号展示");
      }
    }
    if (!String(r.tenantId || "").trim()) {
      addIssue("warn", "RECORD_TENANT_ID_MISSING", "账单缺少租客ID", `${r.tenant || "-"} / ${r.room || "-"} / ${r.cycle || "-"}`, false, { collection: "records", id: r.id });
    }
    if (!parseCycleLike(r.cycle) || parseCycleLike(r.cycle) !== String(r.cycle || "").trim()) {
      addIssue("error", "RECORD_CYCLE_INVALID", "账期格式不正确", `${r.tenant || "-"} / ${r.cycle || "-"}`, Boolean(parseCycleLike(r.cycle)), { collection: "records", id: r.id });
      if (parseCycleLike(r.cycle)) addFix("records", r.id, "cycle", r.cycle, parseCycleLike(r.cycle), "归一账期格式");
    }
    const normalizedStatus = normalizeMappedValue(r.status, RECORD_STATUS_MAP);
    if (String(r.status || "").trim() && normalizedStatus !== String(r.status || "").trim()) {
      addIssue("warn", "RECORD_STATUS_ALIAS", "账单状态需归一", `${r.status} -> ${normalizedStatus}`, true, { collection: "records", id: r.id });
      addFix("records", r.id, "status", r.status, normalizedStatus, "归一账单状态");
    }
    const normalizedSend = normalizeMappedValue(r.sentStatus, SEND_STATUS_MAP);
    if (String(r.sentStatus || "").trim() && normalizedSend !== String(r.sentStatus || "").trim()) {
      addIssue("warn", "SEND_STATUS_ALIAS", "发送状态需归一", `${r.sentStatus} -> ${normalizedSend}`, true, { collection: "records", id: r.id });
      addFix("records", r.id, "sentStatus", r.sentStatus, normalizedSend, "归一发送状态");
    }
    const ePrev = Number(r.electricPrev ?? r.meter?.electricPrev ?? 0);
    const eNow = Number(r.electricNow ?? r.meter?.electricNow ?? 0);
    const wPrev = Number(r.waterPrev ?? r.meter?.waterPrev ?? 0);
    const wNow = Number(r.waterNow ?? r.meter?.waterNow ?? 0);
    if (eNow && ePrev && eNow < ePrev) addIssue("error", "ELECTRIC_READING_INVERTED", "电表读数倒挂", `${r.room || "-"} / ${r.cycle || "-"}：${ePrev} -> ${eNow}`, false, { collection: "records", id: r.id });
    if (wNow && wPrev && wNow < wPrev) addIssue("error", "WATER_READING_INVERTED", "水表读数倒挂", `${r.room || "-"} / ${r.cycle || "-"}：${wPrev} -> ${wNow}`, false, { collection: "records", id: r.id });
    for (const field of ["tenant", "room", "status", "method", "note"]) {
      const after = normalizeTextValue(r[field]);
      if (after !== r[field]) {
        addIssue("warn", "RECORD_TEXT_MOJIBAKE", "账单文字疑似乱码", `${field}: ${r[field]} -> ${after}`, true, { collection: "records", id: r.id, field });
        addFix("records", r.id, field, r[field], after, "修复账单文字");
      } else if (looksMojibake(r[field])) {
        addIssue("warn", "RECORD_TEXT_MOJIBAKE", "账单文字疑似乱码", `${field}: ${r[field]}`, false, { collection: "records", id: r.id, field });
      }
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    summary: {
      total: issues.length,
      error: issues.filter((x) => x.severity === "error").length,
      warn: issues.filter((x) => x.severity === "warn").length,
      fixable: fixes.length,
    },
    issues,
    fixes,
  };
}

function applyDataHealthFixes(db, fixes = []) {
  ensureDbCollections(db);
  let applied = 0;
  for (const fix of fixes) {
    const collection = String(fix.collection || "");
    const id = String(fix.id || "");
    const field = String(fix.field || "");
    if (!collection || !id || !field || !Array.isArray(db[collection])) continue;
    const row = db[collection].find((x) => String(x.id || "") === id);
    if (!row) continue;
    if (row[field] !== fix.before) continue;
    row[field] = fix.after;
    applied += 1;
  }
  return applied;
}

function extractLegacyTenantAndCycle(raw = "") {
  const text = String(raw || "").trim();
  if (!text) return { tenant: "", cycle: "" };
  const m = text.match(/^(.*?)(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})$/);
  if (!m) return { tenant: text, cycle: "" };
  return {
    tenant: String(m[1] || "").trim(),
    cycle: parseCycleLike(m[2] || ""),
  };
}

function isWithinDays(dateString, days) {
  const target = new Date(dateString);
  if (Number.isNaN(target.getTime())) return false;
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  return diff >= 0 && diff <= days * 24 * 60 * 60 * 1000;
}

function computeDashboard(db) {
  ensureDbCollections(db);
  const activeTenants = db.tenants.filter((tenant) => !tenant.archived);
  const currentMonth = currentCycle();
  const currentMonthRecords = db.records.filter((record) => record.cycle === currentMonth);
  const currentMonthExpenses = db.expenses.filter((expense) => String(expense.period || "").trim() === currentMonth);
  const receivable = currentMonthRecords.reduce((sum, item) => sum + Number(item.receivable || 0), 0);
  const received = currentMonthRecords.reduce((sum, item) => sum + getRecordPaidAmount(item), 0);
  const payable = currentMonthExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const overdueCount = db.records.filter((record) => {
    const due = new Date(record.dueDate);
    if (Number.isNaN(due.getTime())) return normalizeMappedValue(record.status, RECORD_STATUS_MAP) === "逾期";
    return due.getTime() < Date.now() && Number(record.receivable || 0) > getRecordPaidAmount(record);
  }).length;
  const totalReceivable = db.records.reduce((sum, item) => sum + Number(item.receivable || 0), 0);
  const totalReceived = db.records.reduce((sum, item) => sum + getRecordPaidAmount(item), 0);
  const totalExpenses = db.expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const rentableProperties = db.properties.filter((property) => normalizeMappedValue(property.status, PROPERTY_STATUS_MAP) !== "自用");
  const occupiedRoomKeys = new Set(activeTenants.map((tenant) => makeTenantRoomKey(tenant.building, tenant.room)));
  const vacantRooms = rentableProperties.filter((property) => !occupiedRoomKeys.has(makeTenantRoomKey(property.building, property.room))).length;
  const collectionRate = receivable > 0 ? Math.round((received / receivable) * 10000) / 100 : 0;
  const vacancyRate = rentableProperties.length > 0 ? Math.round((vacantRooms / rentableProperties.length) * 10000) / 100 : 0;

  return {
    currentCycle: currentMonth,
    unpaid30Days: db.records.filter((record) => Number(record.receivable || 0) > getRecordPaidAmount(record)).length,
    expiringLeases: activeTenants.filter((tenant) => isWithinDays(tenant.leaseEnd, 30)).length,
    ownerPending: overdueCount,
    vacantRooms,
    monthlyReceivable: receivable,
    monthlyReceived: received,
    monthlyPayable: payable,
    monthlyPaid: payable,
    monthlyProfit: received - payable,
    actualProfit: received - payable,
    bookedProfit: receivable - payable,
    totalReceivable,
    totalReceived,
    totalExpenses,
    totalProfit: totalReceived - totalExpenses,
    collectionRate,
    vacancyRate,
  };
}

function computeSystemHealth(db) {
  ensureDbCollections(db);
  const nowTs = Date.now();
  const oneDayAgoTs = nowTs - 24 * 60 * 60 * 1000;
  const runtimeRows = Array.isArray(db.runtimeLogs) ? db.runtimeLogs : [];
  const runtimeErrors24h = runtimeRows.filter((row) => {
    const ts = new Date(String(row.createdAt || "")).getTime();
    return Number.isFinite(ts) && ts >= oneDayAgoTs && String(row.level || "").toLowerCase() === "error";
  }).length;

  const backupFiles = existsSync(backupDir)
    ? readdirSync(backupDir)
        .filter((name) => /^db\.(backup|manual|rollback)\..+\.json$/.test(String(name)))
        .sort((a, b) => b.localeCompare(a, "en"))
    : [];

  const latestBackup = backupFiles[0] ? path.join(backupDir, backupFiles[0]) : "";
  const latestRuntimeLog = runtimeLogFilePath();

  return {
    status: "ok",
    timestamp: new Date().toISOString(),
    apiBaseUrl: `http://${host}:${port}`,
    storage: {
      dbPath,
      backupDir,
      logsDir,
      uploadsDir,
    },
    backups: {
      total: backupFiles.length,
      latest: latestBackup,
    },
    runtime: {
      totalRows: runtimeRows.length,
      errors24h: runtimeErrors24h,
      latestLogFile: latestRuntimeLog,
    },
    user: {
      username: String(db.user?.username || ""),
      role: String(db.user?.role || ""),
    },
  };
}

function runDueRemindersInternal(db, operator = "system", trigger = "manual") {
  ensureDbCollections(db);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const triggered = [];
  db.reminders = db.reminders.map((item) => {
    if (!item.enabled || !item.dueDate) return item;
    const due = new Date(item.dueDate);
    if (Number.isNaN(due.getTime())) return item;
    due.setDate(due.getDate() - Number(item.daysBefore || 0));
    const triggerDate = due.toISOString().slice(0, 10);
    if (triggerDate === today) {
      if (String(item.lastTriggeredAt || "").slice(0, 10) === today) return item;
      triggered.push(item);
      return { ...item, lastTriggeredAt: now.toISOString(), updatedAt: now.toISOString() };
    }
    return item;
  });
  if (triggered.length) {
    addAuditLog(db, "reminder.triggered", { count: triggered.length, trigger }, operator);
  }
  writeDb(db);
  return { date: today, count: triggered.length, reminders: triggered, trigger };
}

function getReminderAutoStatus() {
  return {
    enabled: true,
    intervalMinutes: 60,
    runAtHour: 9,
  };
}

function sha256Hex(str) {
  return createHash("sha256").update(str).digest("hex");
}

function hmacSha256(key, str, encoding) {
  return createHmac("sha256", key).update(str).digest(encoding);
}

function tryExtractIdNo(text = "") {
  const source = String(text || "").replace(/[\s:锛歕-]/g, "").toUpperCase();
  const strict = source.match(/[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[0-9X]/);
  if (strict) return strict[0];
  const loose = source.match(/[1-9]\d{16}[0-9X]/);
  if (loose) return loose[0];
  const hkMacauTaiwan = source.match(/(81|82|83)\d{16}/);
  return hkMacauTaiwan ? hkMacauTaiwan[0] : "";
}

function tryExtractName(text = "") {
  const source = String(text || "");
  const nameByLabel =
    source.match(/(?:姓名|Name)\s*[:：]?\s*([^\s\n]{2,20})/)?.[1] ||
    "";
  if (nameByLabel) return nameByLabel;
  const roughName =
    source
      .match(/[\u4e00-\u9fa5]{2,4}/g)
      ?.find((x) => !["中华人民共和国", "居民身份证", "港澳居民", "居住证", "签发机关"].includes(x)) || "";
  return roughName;
}

function getMimeByFilename(filename = "") {
  const lower = String(filename).toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".bmp")) return "image/bmp";
  return "image/jpeg";
}

async function runOcrSpace(buffer, filename) {
  const base64 = buffer.toString("base64");
  const mime = getMimeByFilename(filename);
  const form = new FormData();
  form.append("apikey", "");
  form.append("language", "chs");
  form.append("isOverlayRequired", "false");
  form.append("scale", "true");
  form.append("OCREngine", "2");
  form.append("base64Image", `data:${mime};base64,${base64}`);

  const response = await fetch("https://api.ocr.space/parse/image", {
    method: "POST",
    body: form,
  });
  const payload = await response.json().catch(() => ({}));
  const parsedText = payload?.ParsedResults?.map((x) => x?.ParsedText || "").join("\n") || "";
  return {
    name: tryExtractName(parsedText),
    idNo: tryExtractIdNo(parsedText),
    parsedText,
  };
}

async function runTencentIdCardOcr(buffer, cardSide = "FRONT") {
  if (!"" || !"") {
    throw new Error("Tencent OCR credentials missing");
  }

  const service = "ocr";
  const hostName = "ocr.tencentcloudapi.com";
  const endpoint = `https://${hostName}`;
  const action = "IDCardOCR";
  const version = "2018-11-19";
  const algorithm = "TC3-HMAC-SHA256";
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);

  const payloadObj = {
    ImageBase64: buffer.toString("base64"),
    CardSide: cardSide,
  };
  const payload = JSON.stringify(payloadObj);
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${hostName}\n`;
  const signedHeaders = "content-type;host";
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    sha256Hex(payload),
  ].join("\n");
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = [algorithm, String(timestamp), credentialScope, sha256Hex(canonicalRequest)].join("\n");

  const secretDate = hmacSha256(`TC3${""}`, date);
  const secretService = hmacSha256(secretDate, service);
  const secretSigning = hmacSha256(secretService, "tc3_request");
  const signature = hmacSha256(secretSigning, stringToSign, "hex");
  const authorization = `${algorithm} Credential=${""}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json; charset=utf-8",
      Host: hostName,
      "X-TC-Action": action,
      "X-TC-Version": version,
      "X-TC-Region": "",
      "X-TC-Timestamp": String(timestamp),
    },
    body: payload,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.Response?.Error) {
    const err = data?.Response?.Error?.Message || `Tencent OCR HTTP ${response.status}`;
    throw new Error(err);
  }
  const r = data?.Response || {};
  return {
    name: r.Name || "",
    idNo: r.IdNum || "",
    parsedText: "",
  };
}

async function runTencentGeneralOcr(buffer) {
  if (!"" || !"") throw new Error("Tencent OCR credentials missing");
  const service = "ocr";
  const hostName = "ocr.tencentcloudapi.com";
  const endpoint = `https://${hostName}`;
  const action = "GeneralBasicOCR";
  const version = "2018-11-19";
  const algorithm = "TC3-HMAC-SHA256";
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);

  const payload = JSON.stringify({ ImageBase64: buffer.toString("base64"), IsPdf: false });
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${hostName}\n`;
  const signedHeaders = "content-type;host";
  const canonicalRequest = ["POST", "/", "", canonicalHeaders, signedHeaders, sha256Hex(payload)].join("\n");
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = [algorithm, String(timestamp), credentialScope, sha256Hex(canonicalRequest)].join("\n");
  const secretDate = hmacSha256(`TC3${""}`, date);
  const secretService = hmacSha256(secretDate, service);
  const secretSigning = hmacSha256(secretService, "tc3_request");
  const signature = hmacSha256(secretSigning, stringToSign, "hex");
  const authorization = `${algorithm} Credential=${""}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json; charset=utf-8",
      Host: hostName,
      "X-TC-Action": action,
      "X-TC-Version": version,
      "X-TC-Region": "",
      "X-TC-Timestamp": String(timestamp),
    },
    body: payload,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.Response?.Error) {
    const err = data?.Response?.Error?.Message || `Tencent General OCR HTTP ${response.status}`;
    throw new Error(err);
  }
  const detections = data?.Response?.TextDetections || [];
  const parsedText = detections.map((x) => x?.DetectedText || "").join("\n");
  return { parsedText };
}

function normalizeRoomText(v = "") {
  return String(v || "")
    .replace(/[鉁揬/]/g, "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

function parseMeterReadingsFromText(text = "", defaultBuilding = "") {
  const rows = [];
  let currentBuilding = String(defaultBuilding || "").trim();
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  for (const line of lines) {
    const buildingMatch = line.match(/(瑗垮北[^姘寸數]{0,30})姘寸數鎶勮〃/);
    if (buildingMatch) {
      currentBuilding = buildingMatch[1].trim();
      continue;
    }
    const m = line.match(/([A-Za-z]?\d{3}|宸ュ満)\s+(\d{1,6})\s+(\d{1,6})/i);
    if (!m) continue;
    rows.push({
      building: currentBuilding,
      room: normalizeRoomText(m[1]),
      waterNow: Number(m[2]),
      electricNow: Number(m[3]),
    });
  }

  const unique = new Map();
  rows.forEach((r) => {
    const key = `${r.building || ""}::${r.room}`;
    if (!unique.has(key)) unique.set(key, r);
  });
  return Array.from(unique.values());
}

function calcFeeByItem(item, usage) {
  const unitPrice = Number(item?.unitPrice || 0);
  const base = usage * unitPrice;
  if (item?.hasMinimum) {
    const minCharge = Number(item?.minimumCharge || 0);
    return Math.max(base, minCharge);
  }
  return base;
}

function toSafeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeBuildingText(v = "") {
  return String(v || "").trim();
}

function buildTenantMeterIndex(tenant = {}) {
  const feeItems = Array.isArray(tenant.feeItems) ? tenant.feeItems : [];
  const electricItem = feeItems.find((x) => /电|electric/i.test(String(x.name || "")));
  const waterItem = feeItems.find((x) => /水|water/i.test(String(x.name || "")));
  return {
    electricItem,
    waterItem,
    electricPrev: toSafeNumber(electricItem?.initialReading || 0, 0),
    waterPrev: toSafeNumber(waterItem?.initialReading || 0, 0),
  };
}

function detectReadingIssue(reading, tenant, meterIndex) {
  const electricNow = toSafeNumber(reading?.electricNow || 0, 0);
  const waterNow = toSafeNumber(reading?.waterNow || 0, 0);
  const electricPrev = meterIndex.electricPrev;
  const waterPrev = meterIndex.waterPrev;
  const electricDelta = electricNow - electricPrev;
  const waterDelta = waterNow - waterPrev;
  const issue = [];

  if (!tenant) issue.push("TENANT_NOT_FOUND");
  if (electricDelta < 0 || waterDelta < 0) issue.push("METER_ROLLBACK");
  if (electricDelta > 2000 || waterDelta > 300) issue.push("METER_SPIKE");

  return {
    issue,
    electricNow,
    waterNow,
    electricPrev,
    waterPrev,
    electricDelta,
    waterDelta,
  };
}

function upsertTenantWechatFields(tenant = {}) {
  return {
    ...tenant,
    wechatGroupName: String(tenant.wechatGroupName || "").trim(),
    wechatRemark: String(tenant.wechatRemark || "").trim(),
    balance: typeof tenant.balance === "number" ? tenant.balance : Number(tenant.balance || 0),
  };
}

function parseCsvLine(line = "") {
  const out = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === "," && !inQuote) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function parseCsvRows(text = "") {
  const lines = String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (!lines.length) return { header: [], rows: [] };
  const header = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => parseCsvLine(line));
  return { header, rows };
}

function getValueByHeader(header = [], row = [], names = []) {
  for (const name of names) {
    const idx = header.findIndex((h) => String(h || "").trim().toLowerCase() === String(name || "").trim().toLowerCase());
    if (idx >= 0) return row[idx];
  }
  return "";
}

function sanitizeCsvText(csvText = "") {
  let text = String(csvText || "");
  text = text.replace(/^\uFEFF/, "");
  if (text.includes("\uFFFD")) {
    // try latin1 -> utf8 recovery when mojibake appears
    text = Buffer.from(text, "latin1").toString("utf8");
  }
  return text;
}

function normalizeImportedEntity(entity = "") {
  const e = String(entity || "").trim().toLowerCase();
  if (["property", "properties", "room", "rooms", "鎴挎簮"].includes(e)) return "properties";
  if (["tenant", "tenants", "租客", "绉熷"].includes(e)) return "tenants";
  if (["record", "records", "bill", "bills", "璐﹀崟"].includes(e)) return "records";
  return "";
}

function normalizeRoomToken(value = "") {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/[－–—_]/g, "-")
    .toUpperCase();
}

function normalizeBuildingToken(value = "") {
  return String(value || "").replace(/\s+/g, "").toUpperCase();
}

function parseImportRoomText(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return { building: "", room: "" };
  const m = raw.match(/^(.*?)\s*[-－]\s*(.+)$/);
  if (m) return { building: String(m[1] || "").trim(), room: String(m[2] || "").trim() };
  return { building: "", room: raw };
}

function buildRoomCandidateMap(properties = []) {
  const map = new Map();
  for (const p of properties || []) {
    const building = String(p.building || "").trim();
    const room = String(p.room || "").trim();
    if (!room) continue;
    const token = normalizeRoomToken(room);
    if (!token) continue;
    const list = map.get(token) || [];
    if (!list.some((x) => normalizeBuildingToken(x.building) === normalizeBuildingToken(building))) {
      list.push({ building, room });
      map.set(token, list);
    }
  }
  return map;
}

function validatePhone(phone = "") {
  const value = String(phone || "").trim();
  if (!value) return true;
  return /^[0-9+\-\s()]{6,20}$/.test(value);
}

function validateIdNo(idNo = "") {
  const value = String(idNo || "").trim().toUpperCase();
  if (!value) return true;
  return /^[1-9]\d{16}[0-9X]$/.test(value) || /^(81|82|83)\d{16}$/.test(value);
}

function importError(rowNo, code, message, hint) {
  return { rowNo, code, message, hint };
}

function buildImportPreview({ db, entity, csvText, overwrite = false }) {
  const fixed = sanitizeCsvText(csvText);
  const { header, rows } = parseCsvRows(fixed);
  const normalized = normalizeImportedEntity(entity);
  if (!normalized) throw new Error("entity unsupported");
  if (!header.length) throw new Error("CSV header empty");

  const errors = [];
  const duplicates = [];
  const staged = [];
  let skipped = 0;
  const propertyBase = Array.isArray(db.properties) ? db.properties : [];
  const roomCandidates = buildRoomCandidateMap(propertyBase);

  if (normalized === "properties") {
    const existing = new Set((overwrite ? [] : db.properties).map((p) => `${String(p.building || "").trim()}::${String(p.room || "").trim()}`));
    rows.forEach((row, idx) => {
      const rowNo = idx + 2;
      let building = String(getValueByHeader(header, row, ["building", "buildingname", "楼栋", "妤兼爧"]) || "").trim();
      const room = String(getValueByHeader(header, row, ["room", "房号", "鎴垮彿"]) || "").trim();
      const rent = toSafeNumber(getValueByHeader(header, row, ["rent", "租金", "绉熼噾"]) || 0, 0);
      if (!room) {
        errors.push(importError(rowNo, "REQUIRED_ROOM", "缺少房号（room）", "请补充房号列，示例：101 或 30号A - 101"));
        skipped += 1;
        return;
      }
      if (!building) {
        const candidates = roomCandidates.get(normalizeRoomToken(room)) || [];
        if (candidates.length === 1) {
          building = String(candidates[0].building || "").trim();
        } else if (candidates.length > 1) {
          errors.push(importError(rowNo, "AMBIGUOUS_ROOM", `房号歧义：${room}`, "该房号在多个楼栋存在，请补充 building（楼栋）列"));
          skipped += 1;
          return;
        }
      }
      if (rent < 0) {
        errors.push(importError(rowNo, "INVALID_RENT", "租金必须大于等于 0", "请检查 rent（租金）列是否有负数或非法字符"));
        skipped += 1;
        return;
      }
      const key = `${building}::${room}`;
      if (existing.has(key)) {
        duplicates.push({ rowNo, key });
        skipped += 1;
        return;
      }
      staged.push({
        id: `prop-${randomUUID()}`,
        building,
        room,
        title: String(getValueByHeader(header, row, ["title", "标题", "鏍囬"]) || `${building ? `${building} - ` : ""}${room}`),
        address: String(getValueByHeader(header, row, ["address", "地址", "鍦板潃"]) || ""),
        area: toSafeNumber(getValueByHeader(header, row, ["area", "面积", "闈㈢Н"]) || 0, 0),
        layout: String(getValueByHeader(header, row, ["layout", "户型", "鎴峰瀷"]) || ""),
        rent,
        status: String(getValueByHeader(header, row, ["status", "state"]) || "vacant"),
        tenantName: String(getValueByHeader(header, row, ["tenantname", "租客", "绉熷"]) || ""),
        contractEnd: parseDateLike(getValueByHeader(header, row, ["contractend", "合同到期", "鍚堝悓鍒版湡"]) || ""),
        tags: [],
      });
      existing.add(key);
    });
  }

  if (normalized === "tenants") {
    const existing = new Set((overwrite ? [] : db.tenants).map((t) => `${String(t.name || "").trim()}::${String(t.phone || "").trim()}`));
    rows.forEach((row, idx) => {
      const rowNo = idx + 2;
      const name = String(getValueByHeader(header, row, ["name", "tenant", "租客", "绉熷"]) || "").trim();
      const phone = String(getValueByHeader(header, row, ["phone", "mobile", "电话", "手机号", "鐢佃瘽"]) || "").trim();
      const idNo = String(getValueByHeader(header, row, ["idno", "id", "idcard"]) || "").trim();
      if (!name) {
        errors.push(importError(rowNo, "REQUIRED_NAME", "缺少租客姓名（name）", "请补充 name 列，且不能为空"));
        skipped += 1;
        return;
      }
      if (!validatePhone(phone)) {
        errors.push(importError(rowNo, "INVALID_PHONE", "手机号格式不正确", "请填写11位手机号（1开头），示例：13800138000"));
        skipped += 1;
        return;
      }
      if (!validateIdNo(idNo)) {
        errors.push(importError(rowNo, "INVALID_IDNO", "身份证号格式不正确", "请检查 idNo 列，18位身份证示例：4401xxxxxxxxxxxx"));
        skipped += 1;
        return;
      }
      const key = `${name}::${phone}`;
      if (existing.has(key)) {
        duplicates.push({ rowNo, key });
        skipped += 1;
        return;
      }
      let room = String(getValueByHeader(header, row, ["room", "房号", "鎴垮彿"]) || "").trim();
      let building = String(getValueByHeader(header, row, ["building", "楼栋", "妤兼爧"]) || "").trim();
      if (room && !building) {
        const parsedRoom = parseImportRoomText(room);
        if (parsedRoom.building && parsedRoom.room) {
          building = parsedRoom.building;
          room = parsedRoom.room;
        } else {
          const candidates = roomCandidates.get(normalizeRoomToken(parsedRoom.room || room)) || [];
          if (candidates.length === 1) {
            building = String(candidates[0].building || "").trim();
            room = String(candidates[0].room || room).trim();
          } else if (candidates.length > 1) {
            errors.push(importError(rowNo, "AMBIGUOUS_ROOM", `租客房号歧义：${room}`, "该房号在多个楼栋存在，请补充 building（楼栋）列"));
            skipped += 1;
            return;
          }
        }
      }
      staged.push(
        upsertTenantWechatFields({
          id: `tenant-${randomUUID()}`,
          name,
          phone,
          room,
          building,
          leaseStart: parseDateLike(getValueByHeader(header, row, ["leasestart", "lease_start"]) || ""),
          leaseEnd: parseDateLike(getValueByHeader(header, row, ["leaseend", "lease_end"]) || ""),
          rent: toSafeNumber(getValueByHeader(header, row, ["rent", "租金", "绉熼噾"]) || 0, 0),
          deposit: toSafeNumber(getValueByHeader(header, row, ["deposit", "鎶奸噾"]) || 0, 0),
          status: String(getValueByHeader(header, row, ["status", "state"]) || "active"),
          archived: false,
          idNo,
          notes: String(getValueByHeader(header, row, ["notes", "备注", "澶囨敞"]) || ""),
          wechatGroupName: String(getValueByHeader(header, row, ["wechatgroupname", "微信群名", "寰俊缇ゅ悕"]) || ""),
          wechatRemark: String(getValueByHeader(header, row, ["wechatremark", "微信备注", "寰俊澶囨敞"]) || ""),
          feeItems: [],
        }),
      );
      existing.add(key);
    });
  }

  if (normalized === "records") {
    const existing = new Set((overwrite ? [] : db.records).map((r) => `${String(r.tenant || "").trim()}::${String(r.room || "").trim()}::${String(r.cycle || "").trim()}`));
    rows.forEach((row, idx) => {
      const rowNo = idx + 2;
      const tenantStd = String(getValueByHeader(header, row, ["tenant", "tenantname", "租客", "绉熷"]) || "").trim();
      const roomStd = String(getValueByHeader(header, row, ["room", "address", "房号", "鎴垮彿"]) || "").trim();
      const cycleStd = parseCycleLike(getValueByHeader(header, row, ["cycle", "period", "周期", "账期", "鍛ㄦ湡", "璐︽湡"]) || "");

      // Legacy fallback by position from old wide bill table
      const tenantLegacyRaw = String(row[2] || "").trim();
      const roomLegacy = String(row[1] || "").trim();
      const parsedLegacy = extractLegacyTenantAndCycle(tenantLegacyRaw);
      const tenantLegacy = parsedLegacy.tenant || tenantLegacyRaw;
      const cycleLegacy =
        parsedLegacy.cycle ||
        parseCycleLike(String(row[3] || "").trim()) ||
        parseCycleLike(String(row[4] || "").trim()) ||
        parseCycleLike(String(row[27] || "").trim());

      const tenant = tenantStd || tenantLegacy;
      let room = roomStd || roomLegacy;
      const parsedRoom = parseImportRoomText(room);
      if (!parsedRoom.building && parsedRoom.room) {
        const candidates = roomCandidates.get(normalizeRoomToken(parsedRoom.room)) || [];
        if (candidates.length === 1) {
          room = `${String(candidates[0].building || "").trim()} - ${String(candidates[0].room || parsedRoom.room).trim()}`;
        } else if (candidates.length > 1) {
          errors.push(importError(rowNo, "AMBIGUOUS_ROOM", `账单房号歧义：${room}`, "该房号在多个楼栋存在，请补充 room 为“楼栋 - 房号”"));
          skipped += 1;
          return;
        }
      } else if (parsedRoom.building && parsedRoom.room) {
        room = `${parsedRoom.building} - ${parsedRoom.room}`;
      }
      const cycle = cycleStd || cycleLegacy;
      if (!tenant || !cycle) {
        errors.push(importError(rowNo, "REQUIRED_FIELDS", "缺少必要字段 tenant/cycle", "请补充租客名与账期（YYYY-MM）"));
        skipped += 1;
        return;
      }
      const key = `${tenant}::${room}::${cycle}`;
      if (existing.has(key)) {
        duplicates.push({ rowNo, key });
        skipped += 1;
        return;
      }
      const receivable = toSafeNumber(
        getValueByHeader(header, row, ["receivable", "total", "应收", "搴旀敹"]) || Number(row[23] || row[24] || row[22] || 0),
        0,
      );
      const received = toSafeNumber(
        getValueByHeader(header, row, ["received", "已收", "宸叉敹"]) || Number(row[23] || row[24] || row[22] || 0),
        0,
      );

      const electricNow = toSafeNumber(
        getValueByHeader(header, row, ["electricnow", "electric_now", "electricreading"]) || Number(row[7] || 0),
        0,
      );
      const electricUsage = toSafeNumber(
        getValueByHeader(header, row, ["electricusage", "electric_usage"]) || Number(row[8] || 0),
        0,
      );
      const electricPrev = toSafeNumber(
        getValueByHeader(header, row, ["electricprev", "electric_prev"]) || electricNow - electricUsage,
        0,
      );
      const electricPrice = toSafeNumber(
        getValueByHeader(header, row, ["electricprice", "electric_price"]) || Number(row[12] || 0),
        0,
      );

      const waterNow = toSafeNumber(
        getValueByHeader(header, row, ["waternow", "water_now", "waterreading"]) || Number(row[5] || 0),
        0,
      );
      const waterUsage = toSafeNumber(
        getValueByHeader(header, row, ["waterusage", "water_usage"]) || Number(row[6] || 0),
        0,
      );
      const waterPrev = toSafeNumber(
        getValueByHeader(header, row, ["waterprev", "water_prev"]) || waterNow - waterUsage,
        0,
      );
      const waterPrice = toSafeNumber(
        getValueByHeader(header, row, ["waterprice", "water_price"]) || Number(row[11] || 0),
        0,
      );

      // Legacy wide-table breakdown (when present)
      const rentPart = toSafeNumber(getValueByHeader(header, row, ["rentpart", "rent_part"]) || Number(row[17] || 0), 0);
      const hygieneFee = toSafeNumber(Number(row[18] || 0), 0);
      const tvFee = toSafeNumber(Number(row[19] || 0), 0);
      const manageFee = toSafeNumber(Number(row[20] || 0), 0);
      const networkFee = toSafeNumber(Number(row[21] || 0), 0);
      const otherFeeRaw = toSafeNumber(getValueByHeader(header, row, ["otherfee", "other_fee"]) || Number(row[22] || 0), 0);

      // Heuristic: large positive/negative in otherFee is often deposit adjust.
      const depositAdjustment = Math.abs(otherFeeRaw) >= 50 ? otherFeeRaw : 0;
      const otherFee = Math.abs(otherFeeRaw) >= 50 ? 0 : otherFeeRaw;
      const waterMinimumCharge =
        waterUsage === 0 && otherFee > 0 ? otherFee : 0;

      staged.push({
        id: `rec-${randomUUID()}`,
        tenant,
        room,
        cycle,
        receivable,
        received,
        status:
          String(getValueByHeader(header, row, ["status", "state"]) || "").trim() ||
          (received >= receivable && receivable > 0 ? "已收" : "待收"),
        method: String(getValueByHeader(header, row, ["method", "收款方式", "鏀舵鏂瑰紡"]) || "微信"),
        dueDate:
          parseDateLike(getValueByHeader(header, row, ["duedate", "due_date"]) || "") ||
          parseDateLike(String(row[4] || "").trim()) ||
          "",
        paidAt:
          parseDateLike(getValueByHeader(header, row, ["paidat", "paid_at"]) || "") ||
          parseDateLike(String(row[27] || "").trim()) ||
          "-",
        note: String(getValueByHeader(header, row, ["note", "remark", "澶囨敞"]) || "legacy import"),
        electricPrev,
        electricNow,
        electricUsage,
        electricPrice,
        waterPrev,
        waterNow,
        waterUsage,
        waterPrice,
        rentPart,
        hygieneFee,
        tvFee,
        manageFee,
        networkFee,
        otherFee,
        depositAdjustment,
        waterMinimumCharge,
      });
      existing.add(key);
    });
  }

  return {
    entity: normalized,
    header,
    totalRows: rows.length,
    imported: staged.length,
    skipped,
    errors,
    duplicates,
    sample: staged.slice(0, 10),
    staged,
  };
}

function applyImportToDb(db, preview, overwrite = false) {
  if (preview.entity === "properties") {
    if (overwrite) db.properties = [];
    db.properties = [...preview.staged, ...db.properties];
  } else if (preview.entity === "tenants") {
    if (overwrite) db.tenants = [];
    db.tenants = [...preview.staged, ...db.tenants];
  } else if (preview.entity === "records") {
    if (overwrite) db.records = [];
    db.records = [...preview.staged.map((row) => normalizeRecordRow(row)), ...db.records.map((row) => normalizeRecordRow(row))];
  }
}

ensureStorage();

const server = http.createServer(async (request, response) => {
  if (!request.url) return sendJson(response, 404, { success: false, message: "Not Found" });
  const reqStart = Date.now();

  if (request.method === "OPTIONS") {
    const reqOrigin = String(request.headers.origin || "");
    const originAllowed =
      apiAllowedOrigins.includes("*") ||
      (reqOrigin && apiAllowedOrigins.some((allowed) => reqOrigin === allowed || reqOrigin.endsWith(allowed)));
    const finalOrigin = originAllowed ? reqOrigin || appOrigin : appOrigin;
    response.writeHead(204, {
      "Access-Control-Allow-Origin": finalOrigin,
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    });
    response.end();
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host}`);
  let pathname = url.pathname;

  // /api/v1/* → /api/* 兼容路由（为未来版本留空间）
  if (pathname.startsWith("/api/v1/")) {
    pathname = pathname.replace("/v1", "");
  }
  const db = readDb();
  ensureDbCollections(db);
  db.tenants = db.tenants.map(upsertTenantWechatFields);

  response.on("finish", () => {
    writeRuntimeLog("info", "api.request", {
      method: request.method || "",
      path: pathname,
      status: response.statusCode,
      costMs: Date.now() - reqStart,
      ip: toMaskedIp(getClientIp(request)),
    });
  });

  // 公开抄表数据接口（无需认证，给手机抄表页用）
  if (request.method === "GET" && pathname === "/api/meter-data") {
    const usageMap = new Map(db.properties.map((p) => [(p.building || "") + "::" + p.room, String(p.usageType || "")]));
    const lastMap = new Map();
    db.records.forEach((r) => {
      // 从 room 字段解析楼栋和房号，兼容 "西山东区17号 101" 和 "西山东区17号 - 101"
      // 优先用 building/roomNo，否则从 room 字段解析，再否则从 roomNo 字段解析（部分记录 roomNo 存了完整地址）
      const roomText = String(r.room || "");
      const dashIdx = roomText.indexOf(" - ");
      const spaceIdx = roomText.lastIndexOf(" ");
      let bld = String(r.building || "").trim();
      let rm = String(r.roomNo || "").trim();
      // 从 room 字段补充
      if (!bld && dashIdx >= 0) { bld = roomText.slice(0, dashIdx).trim(); rm = rm || roomText.slice(dashIdx + 3).trim(); }
      else if (!bld && spaceIdx >= 0) { bld = roomText.slice(0, spaceIdx).trim(); rm = rm || roomText.slice(spaceIdx + 1).trim(); }
      else if (!rm) { rm = roomText; }
      // 如果 rm 存了完整地址（如 "西山东区17号 101"），从中提取楼栋
      if (!bld && rm.includes(" ")) {
        const rmSpace = rm.lastIndexOf(" ");
        bld = rm.slice(0, rmSpace).trim();
        rm = rm.slice(rmSpace + 1).trim();
      }
      // 如果 rm 还是完整地址（从 roomNo 继承），强制拆分
      if (bld && rm.includes(" ") && rm.indexOf(bld) === 0) {
        rm = rm.slice(bld.length).trim();
      }
      const key = (bld || "") + "::" + (rm || "");
      const p = lastMap.get(key);
      if (!p || String(r.cycle || "") > String(p.cycle || "")) lastMap.set(key, { e: r.electricNow || "", w: r.waterNow || "" });
    });
    const rooms = db.properties
      .sort((a, b) => { const bc = String(a.building || "").localeCompare(String(b.building || ""), "zh-Hans-CN"); if (bc) return bc; const na = parseInt(String(a.room || "").match(/d+/) || "0"); const nb = parseInt(String(b.room || "").match(/d+/) || "0"); return na - nb || String(a.room || "").localeCompare(String(b.room || "")); })
      .map((p) => {
        const isSelf = usageMap.get((p.building || "") + "::" + p.room) === "自用（不出租）";
        const last = lastMap.get((p.building || "") + "::" + p.room) || {};
        // 优先用账单读数，否则用房产档案的 lastReading
        const ep = last.e || (isSelf ? (p.lastElectricReading || "") : "") || "";
        const wp = last.w || (isSelf ? (p.lastWaterReading || "") : "") || "";
        return { b: p.building, r: p.room, ep, wp, self: isSelf };
      });
    return sendJson(response, 200, ok(rooms));
  }

  if (request.method === "GET" && pathname === "/api/health") {
    return sendJson(
      response,
      200,
      ok({
        status: "ok",
        timestamp: new Date().toISOString(),
        apiBaseUrl: `http://${host}:${port}`,
      }),
    );
  }
  if (request.method === "GET" && pathname === "/api/system/health") {
    return sendJson(response, 200, ok(computeSystemHealth(db)));
  }

  if (request.method === "POST" && pathname === "/api/logs/client-error") {
    try {
      const body = await parseBody(request);
      addRuntimeLog(db, "error", "client.error", {
        message: String(body.message || "unknown"),
        stack: String(body.stack || ""),
        page: String(body.page || ""),
        meta: body.meta || {},
        ua: String(request.headers["user-agent"] || ""),
        ip: toMaskedIp(getClientIp(request)),
      });
      writeDb(db);
      return sendJson(response, 200, ok({ accepted: true }));
    } catch (e) {
      writeRuntimeLog("error", "client.error.failed", { message: String(e?.message || e || "") });
      return sendJson(response, 400, { success: false, message: "客户端错误日志上报失败" });
    }
  }

  if (request.method === "POST" && pathname === "/api/auth/login") {
    try {
      const ip = getClientIp(request);
      if (isLoginLocked(ip)) return sendJson(response, 429, { success: false, message: "登录失败次数过多，请稍后再试" });
      const body = await parseBody(request);
      if (body.username !== username || !verifyPassword(String(body.password || ""))) {
        registerLoginFailure(ip);
        addAuditLog(db, "auth.login.failed", { username: body.username || "", ip: toMaskedIp(ip) }, "anonymous");
        writeDb(db);
        return sendJson(response, 401, { success: false, message: "用户名或密码错误" });
      }
      clearLoginFailures(ip);
      const token = mintSessionToken(body.username);
      addAuditLog(db, "auth.login.success", { username: body.username || "", ip: toMaskedIp(ip) }, body.username || "admin");
      writeDb(db);
      return sendJson(response, 200, {
        success: true,
        token,
        user: db.user,
      });
    } catch {
      return sendJson(response, 400, { success: false, message: "请求体格式错误" });
    }
  }

  if (pathname.startsWith("/api/") && pathname !== "/api/health" && pathname !== "/api/auth/login" && pathname !== "/api/meter-data") {
    if (!isAuthed(request)) return sendJson(response, 401, { success: false, message: "未登录或登录已过期" });
    if (request.method !== "GET" && pathname !== "/api/security/role-switch" && isReadOnlyRole(db.user?.role || "")) {
      return sendJson(response, 403, { success: false, message: "当前账号为只读权限，禁止修改数据" });
    }
  }
  if (request.method === "GET" && pathname === "/api/security/status") {
    const role = String(db.user?.role || "");
    return sendJson(
      response,
      200,
      ok({
        username: String(db.user?.username || ""),
        role,
        readOnly: isReadOnlyRole(role),
      }),
    );
  }
  if (request.method === "POST" && pathname === "/api/security/role-switch") {
    try {
      const body = await parseBody(request);
      const targetRole = String(body.role || "").trim().toLowerCase();
      const confirmText = String(body.confirmText || "").trim().toUpperCase();
      const passwordRaw = String(body.password || "");
      if (!(targetRole === "readonly" || targetRole === "admin")) {
        return sendJson(response, 400, { success: false, message: "role 仅支持 admin 或 readonly" });
      }
      if (confirmText !== "CONFIRM") {
        return sendJson(response, 400, { success: false, message: "请填写 CONFIRM 作为二次确认" });
      }
      if (!verifyPassword(passwordRaw)) {
        return sendJson(response, 401, { success: false, message: "密码验证失败" });
      }
      db.user = {
        ...(db.user || {}),
        role: targetRole === "readonly" ? "readonly" : "admin",
      };
      addAuditLog(db, "security.role_switched", { role: db.user.role }, db.user?.username || "admin");
      writeDb(db);
      return sendJson(response, 200, ok({ role: db.user.role, readOnly: isReadOnlyRole(db.user.role) }));
    } catch (e) {
      return sendJson(response, 400, { success: false, message: `角色切换失败: ${String(e?.message || e || "")}` });
    }
  }
  if (request.method === "GET" && pathname === "/api/data-health") {
    return sendJson(response, 200, ok(buildDataHealthFixes(db)));
  }
  if (request.method === "POST" && pathname === "/api/data-health/fix-preview") {
    return sendJson(response, 200, ok(buildDataHealthFixes(db)));
  }
  if (request.method === "POST" && pathname === "/api/data-health/fix-apply") {
    try {
      const preview = buildDataHealthFixes(db);
      const backupPath = makeDataBackup("before-data-health-fix");
      const applied = applyDataHealthFixes(db, preview.fixes);
      addAuditLog(db, "data_health.fixed", { applied, backupPath }, db.user?.username || "admin");
      writeDb(db);
      return sendJson(response, 200, ok({ applied, backupPath, before: preview.summary, after: buildDataHealthFixes(db).summary }));
    } catch (e) {
      return sendJson(response, 400, { success: false, message: `数据健康修复失败: ${String(e?.message || e || "")}` });
    }
  }
  if (request.method === "GET" && pathname === "/api/settings") {
    return sendJson(response, 200, ok(db.settings || { printPayQrUrl: "", opsRules: { contractDueDays: 30, unpaidHighAmount: 1000, lowProfitThreshold: 0 } }));
  }
  if (request.method === "PUT" && pathname === "/api/settings") {
    try {
      const body = await parseBody(request);
      const prevOpsRules = db.settings?.opsRules || {};
      const bodyOpsRules = body.opsRules || {};
      db.settings = {
        ...(db.settings || {}),
        printPayQrUrl: String(body.printPayQrUrl || "").trim(),
        opsRules: {
          contractDueDays: Number.isFinite(Number(bodyOpsRules.contractDueDays)) ? Math.max(1, Number(bodyOpsRules.contractDueDays)) : Number(prevOpsRules.contractDueDays || 30),
          unpaidHighAmount: Number.isFinite(Number(bodyOpsRules.unpaidHighAmount)) ? Math.max(0, Number(bodyOpsRules.unpaidHighAmount)) : Number(prevOpsRules.unpaidHighAmount || 1000),
          lowProfitThreshold: Number.isFinite(Number(bodyOpsRules.lowProfitThreshold)) ? Number(bodyOpsRules.lowProfitThreshold) : Number(prevOpsRules.lowProfitThreshold || 0),
        },
      };
      addAuditLog(db, "settings.updated", { keys: ["printPayQrUrl", "opsRules"] }, db.user?.username || "admin");
      writeDb(db);
      return sendJson(response, 200, ok(db.settings));
    } catch {
      return sendJson(response, 400, { success: false, message: "设置保存失败" });
    }
  }
  if (request.method === "GET" && pathname === "/api/automation-tasks") {
    ensureDbCollections(db);
    return sendJson(response, 200, ok(db.settings.automationTasks || {}));
  }
  if (request.method === "PUT" && pathname === "/api/automation-tasks") {
    try {
      const body = await parseBody(request);
      ensureDbCollections(db);
      const current = db.settings.automationTasks || {};
      db.settings.automationTasks = {
        ...current,
        contractReminder: {
          ...(current.contractReminder || {}),
          ...(body.contractReminder || {}),
          runHour: Math.max(0, Math.min(23, Number((body.contractReminder || {}).runHour ?? (current.contractReminder || {}).runHour ?? 9))),
          enabled: Boolean((body.contractReminder || {}).enabled ?? (current.contractReminder || {}).enabled),
        },
        monthlyBillGenerate: {
          ...(current.monthlyBillGenerate || {}),
          ...(body.monthlyBillGenerate || {}),
          runHour: Math.max(0, Math.min(23, Number((body.monthlyBillGenerate || {}).runHour ?? (current.monthlyBillGenerate || {}).runHour ?? 9))),
          enabled: Boolean((body.monthlyBillGenerate || {}).enabled ?? (current.monthlyBillGenerate || {}).enabled),
        },
        dailyBackup: {
          ...(current.dailyBackup || {}),
          ...(body.dailyBackup || {}),
          runHour: Math.max(0, Math.min(23, Number((body.dailyBackup || {}).runHour ?? (current.dailyBackup || {}).runHour ?? 6))),
          keepDays: Math.max(1, Math.min(365, Number((body.dailyBackup || {}).keepDays ?? (current.dailyBackup || {}).keepDays ?? 60))),
          enabled: Boolean((body.dailyBackup || {}).enabled ?? (current.dailyBackup || {}).enabled),
        },
        anomalyPush: {
          ...(current.anomalyPush || {}),
          ...(body.anomalyPush || {}),
          webhook: String((body.anomalyPush || {}).webhook ?? (current.anomalyPush || {}).webhook ?? "").trim(),
          runHour: Math.max(0, Math.min(23, Number((body.anomalyPush || {}).runHour ?? (current.anomalyPush || {}).runHour ?? 10))),
          enabled: Boolean((body.anomalyPush || {}).enabled ?? (current.anomalyPush || {}).enabled),
        },
        lastRuns: current.lastRuns || {},
      };
      addAuditLog(db, "automation.settings.updated", { keys: Object.keys(body || {}) }, db.user?.username || "admin");
      writeDb(db);
      return sendJson(response, 200, ok(db.settings.automationTasks));
    } catch (e) {
      return sendJson(response, 400, { success: false, message: `自动化任务配置保存失败: ${String(e?.message || e || "")}` });
    }
  }
  if (request.method === "POST" && pathname === "/api/automation-tasks/run") {
    try {
      const body = await parseBody(request);
      const task = String(body.task || "").trim();
      if (!task) return sendJson(response, 400, { success: false, message: "task 必填" });
      const result = await runAutomationTaskByKey(db, task, "manual", db.user?.username || "admin");
      writeDb(db);
      return sendJson(response, result.ok === false ? 400 : 200, ok(result));
    } catch (e) {
      return sendJson(response, 400, { success: false, message: `手动执行自动化任务失败: ${String(e?.message || e || "")}` });
    }
  }
  if (request.method === "GET" && pathname === "/api/entity-versions") {
    const entity = normalizeVersionEntity(url.searchParams.get("entity") || "");
    const entityId = String(url.searchParams.get("entityId") || "").trim();
    const limit = Math.min(500, toPositiveInt(url.searchParams.get("limit"), 100));
    if (!entity) return sendJson(response, 400, { success: false, message: "entity 无效，仅支持 tenants/records/expenses/contracts" });
    let rows = (db.entityVersions || []).filter((x) => String(x.entity || "") === entity);
    if (entityId) rows = rows.filter((x) => String(x.entityId || "") === entityId);
    return sendJson(response, 200, ok(rows.slice(0, limit)));
  }
  if (request.method === "POST" && pathname === "/api/entity-versions/rollback") {
    try {
      const body = await parseBody(request);
      const versionId = String(body.versionId || "").trim();
      const target = (db.entityVersions || []).find((x) => String(x.id || "") === versionId);
      if (!target) return sendJson(response, 404, { success: false, message: "未找到指定版本" });
      const collection = getCollectionByVersionEntity(db, target.entity);
      if (!collection) return sendJson(response, 400, { success: false, message: "版本实体类型无效" });
      const entityId = String(target.entityId || "");
      const idx = collection.findIndex((x) => String(x.id || "") === entityId);
      const beforeRollback = idx >= 0 ? { ...collection[idx] } : null;
      if (target.after == null) {
        if (idx >= 0) collection.splice(idx, 1);
      } else if (idx >= 0) {
        collection[idx] = { ...target.after, id: entityId };
      } else {
        collection.unshift({ ...target.after, id: entityId });
      }
      const operator = String(db.user?.username || "admin");
      createEntityVersion(db, target.entity, entityId, beforeRollback, target.after, "rollback", operator, `rollback_to:${versionId}`);
      addAuditLog(db, "entity.version.rolled_back", { versionId, entity: target.entity, entityId }, operator);
      writeDb(db);
      return sendJson(response, 200, ok({ rolledBack: true, versionId, entity: target.entity, entityId }));
    } catch (e) {
      return sendJson(response, 400, { success: false, message: `版本回滚失败: ${String(e?.message || e || "")}` });
    }
  }
  if (request.method === "GET" && pathname === "/api/dashboard") return sendJson(response, 200, ok(computeDashboard(db)));
  if (request.method === "GET" && pathname === "/api/properties") return sendJson(response, 200, ok(db.properties));
  if (request.method === "GET" && pathname === "/api/tenants") return sendJson(response, 200, ok(db.tenants));
  if (request.method === "POST" && pathname === "/api/tenants/snapshot") {
    try {
      const body = await parseBody(request);
      const operator = String(db.user?.username || "admin");
      const reason = String(body.reason || "manual");
      const result = createTenantSnapshot(db, operator, reason);
      addAuditLog(db, "tenant.snapshot.created", { reason, total: result.total, latestPath: result.latestPath }, operator);
      writeDb(db);
      return sendJson(response, 200, ok(result));
    } catch (e) {
      return sendJson(response, 400, { success: false, message: `租客快照失败: ${String(e?.message || e || "")}` });
    }
  }
  if (request.method === "POST" && pathname === "/api/tenants/rollback-latest") {
    try {
      const latest = tenantSnapshotLatestPath();
      if (!existsSync(latest)) return sendJson(response, 404, { success: false, message: "未找到最近租客快照" });
      const snap = JSON.parse(readFileSync(latest, "utf8"));
      if (!Array.isArray(snap.tenants)) return sendJson(response, 400, { success: false, message: "快照格式无效" });
      db.tenants = snap.tenants.map(upsertTenantWechatFields);
      const operator = String(db.user?.username || "admin");
      addAuditLog(db, "tenant.snapshot.rolled_back", { snapshotAt: snap.createdAt || "", total: db.tenants.length, latestPath: latest }, operator);
      writeDb(db);
      return sendJson(response, 200, ok({ restoredAt: new Date().toISOString(), snapshotAt: snap.createdAt || "", total: db.tenants.length }));
    } catch (e) {
      return sendJson(response, 400, { success: false, message: `租客回滚失败: ${String(e?.message || e || "")}` });
    }
  }
  if (request.method === "GET" && pathname === "/api/records") {
    const page = toPositiveInt(url.searchParams.get("page"), 0);
    const pageSize = Math.min(500, toPositiveInt(url.searchParams.get("pageSize"), 100));
    const rows = filterRecordsByQuery(db.records, Object.fromEntries(url.searchParams.entries()));
    if (!url.searchParams.has("page")) return sendJson(response, 200, ok(rows));
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const start = (safePage - 1) * pageSize;
    const items = rows.slice(start, start + pageSize);
    return sendJson(response, 200, ok({ items, total, page: safePage, pageSize, totalPages }));
  }
  if (request.method === "GET" && pathname === "/api/records/export.csv") {
    const rows = filterRecordsByQuery(db.records, Object.fromEntries(url.searchParams.entries()));
    const head = ["账期", "房号", "租客", "应收", "已收", "未收", "状态", "收款方式", "最后收款日", "是否有截图"];
    const body = rows.map((item) => {
      const paid = getRecordPaidAmount(item);
      const due = Number(item.receivable || 0);
      const unpaid = Math.max(0, due - paid);
      const status = deriveRecordStatus({ receivable: due, received: paid, dueDate: item.dueDate || "" });
      const methods = getPaymentMethods(item).join(" / ");
      const paidAt = getLastPaidAt(item);
      const receipt = hasPaymentReceipt(item) ? "是" : "否";
      return [item.cycle || "", item.room || "", item.tenant || "", due, paid, unpaid, status, methods, paidAt, receipt];
    });
    const csv = [head, ...body].map((line) => line.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const reqOrigin = String(request.headers.origin || "");
    const originAllowed = apiAllowedOrigins.includes("*") || (reqOrigin && apiAllowedOrigins.some((allowed) => reqOrigin === allowed || reqOrigin.endsWith(allowed)));
    const finalOrigin = originAllowed ? reqOrigin || appOrigin : appOrigin;
    response.writeHead(200, {
      "Access-Control-Allow-Origin": finalOrigin,
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="records-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    });
    response.end(`\uFEFF${csv}`);
    return;
  }
  if (request.method === "GET" && pathname === "/api/expenses") return sendJson(response, 200, ok(db.expenses));
  if (request.method === "POST" && pathname === "/api/records") {
    try {
      const body = await parseBody(request);
      const nextItem = normalizeRecordRow({ ...body, id: body.id || `rec-${randomUUID()}` });
      db.records.unshift(nextItem);
      createEntityVersion(db, "records", nextItem.id, null, nextItem, "create", db.user?.username || "admin");
      writeDb(db);
      return sendJson(response, 200, ok(nextItem));
    } catch {
      return sendJson(response, 400, { success: false, message: "新增账单失败" });
    }
  }
  if (request.method === "DELETE" && pathname === "/api/records") {
    const clearedCount = db.records.length;
    db.records = [];
    writeDb(db);
    return sendJson(response, 200, ok({ cleared: true, count: clearedCount }));
  }
  if (pathname.startsWith("/api/records/")) {
    const recordId = pathname.replace("/api/records/", "");
    const index = db.records.findIndex((item) => item.id === recordId);
    if (index === -1) return sendJson(response, 404, { success: false, message: "未找到该账单记录" });
    if (request.method === "PUT") {
      try {
        const body = await parseBody(request);
        const before = normalizeRecordRow(db.records[index]);
        db.records[index] = normalizeRecordRow({ ...db.records[index], ...body, id: recordId });
        createEntityVersion(db, "records", recordId, before, db.records[index], "update", db.user?.username || "admin");
        writeDb(db);
        return sendJson(response, 200, ok(db.records[index]));
      } catch {
        return sendJson(response, 400, { success: false, message: "修改账单失败" });
      }
    }
    if (request.method === "DELETE") {
      const removed = db.records.splice(index, 1)[0];
      createEntityVersion(db, "records", recordId, normalizeRecordRow(removed), null, "delete", db.user?.username || "admin");
      writeDb(db);
      return sendJson(response, 200, ok(removed));
    }
  }

  if (request.method === "POST" && pathname === "/api/expenses") {
    try {
      const body = await parseBody(request);
      const amount = Number(body.amount || 0);
      if (!String(body.date || "").trim()) return sendJson(response, 400, { success: false, message: "支出日期必填" });
      if (!String(body.category || "").trim()) return sendJson(response, 400, { success: false, message: "支出分类必填" });
      if (!Number.isFinite(amount) || amount <= 0) return sendJson(response, 400, { success: false, message: "支出金额必须大于 0" });
      const next = {
        id: `exp-${randomUUID()}`,
        date: String(body.date || "").trim(),
        period: String(body.period || "").trim(),
        propertyId: String(body.propertyId || "").trim(),
        propertyLabel: String(body.propertyLabel || "").trim(),
        room: String(body.room || "").trim(),
        category: String(body.category || "").trim(),
        amount,
        payee: String(body.payee || "").trim(),
        paymentMethod: String(body.paymentMethod || "").trim(),
        allocationMode: String(body.allocationMode || "single").trim(),
        sharedByRooms: Array.isArray(body.sharedByRooms) ? body.sharedByRooms.map((x) => String(x || "").trim()).filter(Boolean) : [],
        sourceBillId: String(body.sourceBillId || "").trim(),
        workOrderId: String(body.workOrderId || "").trim(),
        invoiceNo: String(body.invoiceNo || "").trim(),
        note: String(body.note || "").trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.expenses.unshift(next);
      createEntityVersion(db, "expenses", next.id, null, next, "create", db.user?.username || "admin");
      addAuditLog(db, "expense.created", { expenseId: next.id, category: next.category, amount: next.amount }, db.user?.username || "admin");
      writeDb(db);
      return sendJson(response, 200, ok(next));
    } catch (e) {
      return sendJson(response, 400, { success: false, message: `新增支出失败: ${String(e?.message || e || "")}` });
    }
  }

  if (pathname.startsWith("/api/expenses/")) {
    const expenseId = pathname.replace("/api/expenses/", "");
    const idx = db.expenses.findIndex((x) => x.id === expenseId);
    if (idx < 0) return sendJson(response, 404, { success: false, message: "未找到该支出记录" });
    if (request.method === "DELETE") {
      const old = db.expenses[idx];
      db.expenses.splice(idx, 1);
      createEntityVersion(db, "expenses", expenseId, old, null, "delete", db.user?.username || "admin");
      addAuditLog(db, "expense.deleted", { expenseId: old.id, category: old.category, amount: old.amount }, db.user?.username || "admin");
      writeDb(db);
      return sendJson(response, 200, ok({ id: expenseId, deleted: true }));
    }
    if (request.method === "PUT") {
      try {
        const body = await parseBody(request);
        const before = { ...db.expenses[idx] };
        const amount = Number(body.amount || 0);
        if (!String(body.date || "").trim()) return sendJson(response, 400, { success: false, message: "支出日期必填" });
        if (!String(body.category || "").trim()) return sendJson(response, 400, { success: false, message: "支出分类必填" });
        if (!Number.isFinite(amount) || amount <= 0) return sendJson(response, 400, { success: false, message: "支出金额必须大于 0" });
        const next = {
          ...db.expenses[idx],
          ...body,
          amount,
          date: String(body.date || "").trim(),
          period: String(body.period || "").trim(),
          propertyId: String(body.propertyId || "").trim(),
          propertyLabel: String(body.propertyLabel || "").trim(),
          room: String(body.room || "").trim(),
          category: String(body.category || "").trim(),
          payee: String(body.payee || "").trim(),
          paymentMethod: String(body.paymentMethod || "").trim(),
          allocationMode: String(body.allocationMode || db.expenses[idx].allocationMode || "single").trim(),
          sharedByRooms: Array.isArray(body.sharedByRooms) ? body.sharedByRooms.map((x) => String(x || "").trim()).filter(Boolean) : db.expenses[idx].sharedByRooms || [],
          sourceBillId: String(body.sourceBillId || db.expenses[idx].sourceBillId || "").trim(),
          workOrderId: String(body.workOrderId || db.expenses[idx].workOrderId || "").trim(),
          invoiceNo: String(body.invoiceNo || "").trim(),
          note: String(body.note || "").trim(),
          updatedAt: new Date().toISOString(),
        };
        db.expenses[idx] = next;
        createEntityVersion(db, "expenses", next.id, before, next, "update", db.user?.username || "admin");
        addAuditLog(db, "expense.updated", { expenseId: next.id, category: next.category, amount: next.amount }, db.user?.username || "admin");
        writeDb(db);
        return sendJson(response, 200, ok(next));
      } catch (e) {
        return sendJson(response, 400, { success: false, message: `更新支出失败: ${String(e?.message || e || "")}` });
      }
    }
  }

  if (request.method === "POST" && pathname === "/api/properties") {
    try {
      const body = await parseBody(request);
      const nextItem = { ...body, id: body.id || `prop-${randomUUID()}` };
      db.properties.unshift(nextItem);
      writeDb(db);
      return sendJson(response, 200, ok(nextItem));
    } catch {
      return sendJson(response, 400, { success: false, message: "新增房产失败" });
    }
  }

  if (pathname.startsWith("/api/properties/")) {
    const propertyId = pathname.replace("/api/properties/", "");
    const index = db.properties.findIndex((item) => item.id === propertyId);
    if (index === -1) return sendJson(response, 404, { success: false, message: "未找到该房产记录" });
    if (request.method === "PUT") {
      try {
        const body = await parseBody(request);
        db.properties[index] = { ...db.properties[index], ...body, id: propertyId };
        writeDb(db);
        return sendJson(response, 200, ok(db.properties[index]));
      } catch {
        return sendJson(response, 400, { success: false, message: "修改房产失败" });
      }
    }
    if (request.method === "DELETE") {
      const removed = db.properties.splice(index, 1)[0];
      writeDb(db);
      return sendJson(response, 200, ok(removed));
    }
  }

  if (request.method === "POST" && pathname === "/api/tenants") {
    try {
      const body = await parseBody(request);
      const phone = normalizePhone(body.phone || "");
      if (!isValidCnPhone(phone)) {
        return sendJson(response, 400, { success: false, message: "电话号码格式不正确，请填写11位手机号（1开头）" });
      }
      const leaseStart = String(body.leaseStart || "").trim();
      const leaseEnd = String(body.leaseEnd || "").trim();
      if (leaseStart && leaseEnd && leaseEnd < leaseStart) {
        return sendJson(response, 400, { success: false, message: "租期结束不能早于租期开始" });
      }
      const newRoomKey = makeTenantRoomKey(body.building || "", body.room || "");
      if (newRoomKey && db.tenants.some((t) => !t.archived && makeTenantRoomKey(t.building || "", t.room || "") === newRoomKey)) {
        return sendJson(response, 400, { success: false, message: "该房号已有在租租客，请先退租后再新增" });
      }
      const nextItem = upsertTenantWechatFields({ ...body, id: body.id || `tenant-${randomUUID()}` });
      nextItem.phone = phone;
      db.tenants.unshift(nextItem);
      syncPropertyStatusByRoom(db, nextItem.building, nextItem.room);
      createEntityVersion(db, "tenants", nextItem.id, null, nextItem, "create", db.user?.username || "admin");
      addAuditLog(db, "tenant.created", { tenantId: nextItem.id, name: nextItem.name, room: nextItem.room, building: nextItem.building }, db.user?.username || "admin");
      writeDb(db);
      return sendJson(response, 200, ok(nextItem));
    } catch {
      return sendJson(response, 400, { success: false, message: "新增租客失败" });
    }
  }

  if (pathname.startsWith("/api/tenants/")) {
    const tenantId = pathname.replace("/api/tenants/", "");
    const index = db.tenants.findIndex((item) => item.id === tenantId);
    if (index === -1) return sendJson(response, 404, { success: false, message: "未找到该租客记录" });
    if (request.method === "PUT") {
      try {
        const body = await parseBody(request);
        const phone = normalizePhone(body.phone || db.tenants[index].phone || "");
        if (!isValidCnPhone(phone)) {
          return sendJson(response, 400, { success: false, message: "电话号码格式不正确，请填写11位手机号（1开头）" });
        }
        const leaseStart = String(body.leaseStart || db.tenants[index].leaseStart || "").trim();
        const leaseEnd = String(body.leaseEnd || db.tenants[index].leaseEnd || "").trim();
        if (leaseStart && leaseEnd && leaseEnd < leaseStart) {
          return sendJson(response, 400, { success: false, message: "租期结束不能早于租期开始" });
        }
        const roomKey = makeTenantRoomKey(body.building ?? db.tenants[index].building, body.room ?? db.tenants[index].room);
        const willArchived = typeof body.archived === "boolean" ? body.archived : Boolean(db.tenants[index].archived);
        if (!willArchived && roomKey) {
          const conflict = db.tenants.some((t) => t.id !== tenantId && !t.archived && makeTenantRoomKey(t.building || "", t.room || "") === roomKey);
          if (conflict) {
            return sendJson(response, 400, { success: false, message: "该房号已有在租租客，请先退租或更换房号" });
          }
        }
        const before = { ...db.tenants[index] };
        db.tenants[index] = upsertTenantWechatFields({ ...db.tenants[index], ...body, id: tenantId });
        db.tenants[index].phone = phone;
        createEntityVersion(db, "tenants", tenantId, before, db.tenants[index], "update", db.user?.username || "admin");
        addAuditLog(
          db,
          "tenant.updated",
          {
            tenantId,
            name: db.tenants[index].name || "",
            before: {
              building: before.building || "",
              room: before.room || "",
              rent: Number(before.rent || 0),
              leaseStart: before.leaseStart || "",
              leaseEnd: before.leaseEnd || "",
              archived: Boolean(before.archived),
            },
            after: {
              building: db.tenants[index].building || "",
              room: db.tenants[index].room || "",
              rent: Number(db.tenants[index].rent || 0),
              leaseStart: db.tenants[index].leaseStart || "",
              leaseEnd: db.tenants[index].leaseEnd || "",
              archived: Boolean(db.tenants[index].archived),
            },
          },
          db.user?.username || "admin",
        );
        syncPropertyStatusByRoom(db, db.tenants[index].building, db.tenants[index].room);
        writeDb(db);
        return sendJson(response, 200, ok(db.tenants[index]));
      } catch {
        return sendJson(response, 400, { success: false, message: "修改租客失败" });
      }
    }
    if (request.method === "DELETE") {
      const removed = db.tenants.splice(index, 1)[0];
      syncPropertyStatusByRoom(db, removed?.building, removed?.room);
      createEntityVersion(db, "tenants", tenantId, removed, null, "delete", db.user?.username || "admin");
      addAuditLog(db, "tenant.deleted", { tenantId, name: removed?.name || "", room: removed?.room || "", building: removed?.building || "" }, db.user?.username || "admin");
      writeDb(db);
      return sendJson(response, 200, ok(removed));
    }
  }

  if (request.method === "GET" && pathname === "/api/contracts") return sendJson(response, 200, ok(db.contracts));
  if (request.method === "GET" && pathname === "/api/contracts/reminders") {
    const now = new Date();
    const rows = (db.contracts || [])
      .map((item) => {
        const tenant = db.tenants.find((t) => String(t.id || "") === String(item.tenantId || ""));
        const endDate = parseDateLike(item.endDate || "");
        if (!endDate) return null;
        const end = new Date(endDate);
        if (Number.isNaN(end.getTime())) return null;
        const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
        return {
          contractId: item.id,
          tenantId: item.tenantId,
          tenantName: tenant?.name || "",
          building: tenant?.building || "",
          room: tenant?.room || "",
          endDate,
          daysLeft,
          level: daysLeft < 0 ? "expired" : daysLeft <= 7 ? "critical" : daysLeft <= 30 ? "warning" : "normal",
        };
      })
      .filter(Boolean)
      .filter((x) => x.daysLeft <= 60)
      .sort((a, b) => a.daysLeft - b.daysLeft);
    return sendJson(response, 200, ok(rows));
  }
  if (request.method === "POST" && pathname === "/api/contracts") {
    try {
      const body = await parseBody(request);
      const tenantId = String(body.tenantId || "");
      const tenant = db.tenants.find((t) => t.id === tenantId);
      if (!tenant) return sendJson(response, 400, { success: false, message: "租客ID无效或租客不存在" });
      const contract = {
        id: body.id || `contract-${randomUUID()}`,
        tenantId,
        rent: toSafeNumber(body.rent || tenant.rent || 0, 0),
        deposit: toSafeNumber(body.deposit || tenant.deposit || 0, 0),
        payCycle: String(body.payCycle || "monthly"),
        startDate: parseDateLike(body.startDate || tenant.leaseStart || ""),
        endDate: parseDateLike(body.endDate || tenant.leaseEnd || ""),
        feeItems: Array.isArray(body.feeItems) ? body.feeItems : [],
        attachmentUrl: String(body.attachmentUrl || ""),
        renewalOf: String(body.renewalOf || ""),
        notes: String(body.notes || ""),
        status: String(body.status || "active"),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.contracts.unshift(contract);
      createEntityVersion(db, "contracts", contract.id, null, contract, "create", db.user?.username || "admin");
      addAuditLog(db, "contract.created", { contractId: contract.id, tenantId }, db.user?.username || "admin");
      writeDb(db);
      return sendJson(response, 200, ok(contract));
    } catch (e) {
      return sendJson(response, 400, { success: false, message: `新增合同失败: ${String(e?.message || e || "")}` });
    }
  }
  if (pathname.startsWith("/api/contracts/")) {
    const contractId = pathname.replace("/api/contracts/", "");
    const index = db.contracts.findIndex((c) => c.id === contractId);
    if (index === -1) return sendJson(response, 404, { success: false, message: "未找到该合同记录" });
    if (request.method === "PUT") {
      const body = await parseBody(request);
      const before = { ...db.contracts[index] };
      db.contracts[index] = { ...db.contracts[index], ...body, id: contractId, updatedAt: new Date().toISOString() };
      createEntityVersion(db, "contracts", contractId, before, db.contracts[index], "update", db.user?.username || "admin");
      addAuditLog(db, "contract.updated", { contractId }, db.user?.username || "admin");
      writeDb(db);
      return sendJson(response, 200, ok(db.contracts[index]));
    }
    if (request.method === "DELETE") {
      const removed = db.contracts.splice(index, 1)[0];
      createEntityVersion(db, "contracts", contractId, removed, null, "delete", db.user?.username || "admin");
      addAuditLog(db, "contract.deleted", { contractId }, db.user?.username || "admin");
      writeDb(db);
      return sendJson(response, 200, ok(removed));
    }
  }

  if (request.method === "GET" && pathname === "/api/reminders") return sendJson(response, 200, ok(db.reminders));
  if (request.method === "GET" && pathname === "/api/reminders/auto-status") {
    return sendJson(response, 200, ok(getReminderAutoStatus()));
  }
  if (request.method === "POST" && pathname === "/api/reminders") {
    const body = await parseBody(request);
    const reminder = {
      id: body.id || `rem-${randomUUID()}`,
      tenantId: String(body.tenantId || ""),
      room: String(body.room || ""),
      daysBefore: Math.max(0, toSafeNumber(body.daysBefore || 3, 3)),
      remindTime: String(body.remindTime || "09:00"),
      dueDate: parseDateLike(body.dueDate || ""),
      enabled: body.enabled !== false,
      lastTriggeredAt: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.reminders.unshift(reminder);
    addAuditLog(db, "reminder.created", { reminderId: reminder.id }, db.user?.username || "admin");
    writeDb(db);
    return sendJson(response, 200, ok(reminder));
  }
  if (pathname.startsWith("/api/reminders/") && pathname !== "/api/reminders/run-due") {
    const reminderId = pathname.replace("/api/reminders/", "");
    const index = db.reminders.findIndex((item) => item.id === reminderId);
    if (index === -1) return sendJson(response, 404, { success: false, message: "未找到该提醒记录" });
    if (request.method === "PUT") {
      const body = await parseBody(request);
      const next = {
        ...db.reminders[index],
        tenantId: String(body.tenantId ?? db.reminders[index].tenantId ?? ""),
        room: String(body.room ?? db.reminders[index].room ?? ""),
        daysBefore: Math.max(0, toSafeNumber(body.daysBefore ?? db.reminders[index].daysBefore ?? 3, 3)),
        remindTime: String(body.remindTime ?? db.reminders[index].remindTime ?? "09:00"),
        dueDate: parseDateLike(body.dueDate ?? db.reminders[index].dueDate ?? ""),
        enabled: body.enabled == null ? db.reminders[index].enabled !== false : body.enabled !== false,
        updatedAt: new Date().toISOString(),
      };
      db.reminders[index] = next;
      addAuditLog(db, "reminder.updated", { reminderId: next.id }, db.user?.username || "admin");
      writeDb(db);
      return sendJson(response, 200, ok(next));
    }
    if (request.method === "DELETE") {
      const removed = db.reminders.splice(index, 1)[0];
      addAuditLog(db, "reminder.deleted", { reminderId: removed.id }, db.user?.username || "admin");
      writeDb(db);
      return sendJson(response, 200, ok(removed));
    }
  }
  if (request.method === "POST" && pathname === "/api/reminders/run-due") {
    const result = runDueRemindersInternal(db, db.user?.username || "admin", "manual");
    return sendJson(response, 200, ok(result));
  }

  if (request.method === "GET" && pathname === "/api/room-inventory") return sendJson(response, 200, ok(db.roomInventories));
  if (request.method === "POST" && pathname === "/api/room-inventory") {
    const body = await parseBody(request);
    const item = {
      id: body.id || `roomcfg-${randomUUID()}`,
      building: String(body.building || ""),
      room: String(body.room || ""),
      items: Array.isArray(body.items) ? body.items : [],
      updatedAt: new Date().toISOString(),
    };
    const index = db.roomInventories.findIndex((x) => x.id === item.id || (x.building === item.building && x.room === item.room));
    if (index >= 0) db.roomInventories[index] = { ...db.roomInventories[index], ...item };
    else db.roomInventories.unshift(item);
    addAuditLog(db, "room.inventory.saved", { id: item.id, building: item.building, room: item.room }, db.user?.username || "admin");
    writeDb(db);
    return sendJson(response, 200, ok(item));
  }
  if (request.method === "POST" && pathname === "/api/room-inventory/snapshot") {
    const body = await parseBody(request);
    const snapshot = {
      id: `roomsnap-${randomUUID()}`,
      tenantId: String(body.tenantId || ""),
      building: String(body.building || ""),
      room: String(body.room || ""),
      type: String(body.type || "checkin"),
      items: Array.isArray(body.items) ? body.items : [],
      note: String(body.note || ""),
      createdAt: new Date().toISOString(),
    };
    db.roomInventorySnapshots.unshift(snapshot);
    addAuditLog(db, "room.inventory.snapshot", { id: snapshot.id, type: snapshot.type }, db.user?.username || "admin");
    writeDb(db);
    return sendJson(response, 200, ok(snapshot));
  }

  if (request.method === "POST" && pathname === "/api/import/validate") {
    try {
      const body = await parseBody(request);
      const preview = buildImportPreview({ db, entity: body.entity, csvText: body.csvText, overwrite: Boolean(body.overwrite) });
      const report = {
        id: `import-${randomUUID()}`,
        stage: "validate",
        entity: preview.entity,
        totalRows: preview.totalRows,
        imported: preview.imported,
        skipped: preview.skipped,
        errors: preview.errors,
        duplicates: preview.duplicates,
        createdAt: new Date().toISOString(),
      };
      db.importReports.unshift(report);
      writeDb(db);
      return sendJson(response, 200, ok(report));
    } catch (e) {
      return sendJson(response, 400, { success: false, message: `导入校验失败: ${String(e?.message || e || "")}` });
    }
  }

  if (request.method === "POST" && pathname === "/api/import/preview") {
    try {
      const body = await parseBody(request);
      const preview = buildImportPreview({ db, entity: body.entity, csvText: body.csvText, overwrite: Boolean(body.overwrite) });
      return sendJson(
        response,
        200,
        ok({
          entity: preview.entity,
          totalRows: preview.totalRows,
          imported: preview.imported,
          skipped: preview.skipped,
          errors: preview.errors,
          duplicates: preview.duplicates,
          sample: preview.sample,
        }),
      );
    } catch (e) {
      return sendJson(response, 400, { success: false, message: `导入预览失败: ${String(e?.message || e || "")}` });
    }
  }

  if (request.method === "POST" && pathname === "/api/import/execute") {
    try {
      const body = await parseBody(request);
      const overwrite = Boolean(body.overwrite);
      const preview = buildImportPreview({ db, entity: body.entity, csvText: body.csvText, overwrite });
      const beforeRaw = readFileSync(dbPath, "utf8");
      const rollbackPath = path.join(backupDir, `db.rollback.${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
      writeFileSync(rollbackPath, beforeRaw);
      applyImportToDb(db, preview, overwrite);
      const report = {
        id: `import-${randomUUID()}`,
        stage: "execute",
        entity: preview.entity,
        totalRows: preview.totalRows,
        imported: preview.imported,
        skipped: preview.skipped,
        errors: preview.errors,
        duplicates: preview.duplicates,
        rollbackPath,
        createdAt: new Date().toISOString(),
      };
      db.importReports.unshift(report);
      addAuditLog(db, "import.executed", { reportId: report.id, entity: report.entity, imported: report.imported }, db.user?.username || "admin");
      writeDb(db);
      return sendJson(response, 200, ok(report));
    } catch (e) {
      return sendJson(response, 400, { success: false, message: `执行导入失败: ${String(e?.message || e || "")}` });
    }
  }

  if (request.method === "GET" && pathname === "/api/import/report") {
    return sendJson(response, 200, ok(db.importReports.slice(0, 200)));
  }

  if (request.method === "POST" && pathname === "/api/backup/create") {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const target = path.join(backupDir, `db.backup.${stamp}.json`);
    writeFileSync(target, readFileSync(dbPath, "utf8"));
    addAuditLog(db, "backup.created", { target }, db.user?.username || "admin");
    writeDb(db);
    return sendJson(response, 200, ok({ target }));
  }
  if (request.method === "GET" && pathname === "/api/backup/list") {
    const files = existsSync(backupDir)
      ? readdirSync(backupDir)
          .filter((name) => /^db\.(backup|manual|rollback|pre-restore)\..+\.json$/.test(String(name)))
          .map((name) => {
            const fullPath = path.join(backupDir, name);
            const stat = statSync(fullPath);
            return {
              name,
              path: fullPath,
              size: Number(stat.size || 0),
              mtime: stat.mtime.toISOString(),
            };
          })
          .sort((a, b) => String(b.mtime || "").localeCompare(String(a.mtime || "")))
      : [];
    return sendJson(response, 200, ok({ total: files.length, items: files.slice(0, 200) }));
  }
  if (request.method === "GET" && pathname === "/api/reports/profit") {
    return sendJson(response, 200, ok(computeProfitReport(db)));
  }
  if (request.method === "GET" && pathname === "/api/profit-alerts") {
    const nowTs = Date.now();
    const items = (db.profitAlerts || []).filter((row) => {
      if (!row?.key) return false;
      if (row.resolvedAt) return true;
      const ignoreUntilTs = row.ignoreUntil ? new Date(String(row.ignoreUntil)).getTime() : 0;
      return Number.isFinite(ignoreUntilTs) && ignoreUntilTs > nowTs;
    });
    return sendJson(response, 200, ok(items));
  }
  if (request.method === "POST" && pathname === "/api/profit-alerts/mark") {
    try {
      const body = await parseBody(request);
      const action = String(body.action || "").trim();
      const key = String(body.key || "").trim();
      if (!key) return sendJson(response, 400, { success: false, message: "缺少房号标识 key" });
      const nowIso = new Date().toISOString();
      const idx = (db.profitAlerts || []).findIndex((row) => String(row.key || "") === key);
      const base = idx >= 0 ? db.profitAlerts[idx] : { key, roomKey: key, ignoreUntil: "", resolvedAt: "", updatedAt: nowIso };
      let next = { ...base };
      if (action === "ignore7d") {
        next.ignoreUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        next.resolvedAt = "";
      } else if (action === "resolve") {
        next.resolvedAt = nowIso;
        next.ignoreUntil = "";
      } else if (action === "reset") {
        next.resolvedAt = "";
        next.ignoreUntil = "";
      } else {
        return sendJson(response, 400, { success: false, message: "不支持的操作，仅支持 ignore7d/resolve/reset" });
      }
      next.updatedAt = nowIso;
      if (idx >= 0) db.profitAlerts[idx] = next;
      else db.profitAlerts.unshift(next);
      addAuditLog(db, "profit.alert.marked", { key, action, ignoreUntil: next.ignoreUntil || "", resolvedAt: next.resolvedAt || "" }, db.user?.username || "admin");
      writeDb(db);
      return sendJson(response, 200, ok(next));
    } catch (e) {
      return sendJson(response, 400, { success: false, message: `更新低收益预警失败: ${String(e?.message || e || "")}` });
    }
  }
  if (request.method === "GET" && pathname === "/api/audit-logs") {
    const moduleName = String(url.searchParams.get("module") || "").trim().toLowerCase();
    const operator = String(url.searchParams.get("operator") || "").trim();
    const keyword = String(url.searchParams.get("keyword") || "").trim();
    const dateFrom = String(url.searchParams.get("dateFrom") || "").trim();
    const dateTo = String(url.searchParams.get("dateTo") || "").trim();
    const page = toPositiveInt(url.searchParams.get("page"), 1);
    const pageSize = Math.min(200, toPositiveInt(url.searchParams.get("pageSize"), 50));
    let rows = Array.isArray(db.auditLogs) ? db.auditLogs.slice() : [];

    if (moduleName && moduleName !== "all") {
      rows = rows.filter((row) => String(row.action || "").toLowerCase().startsWith(`${moduleName}.`));
    }
    if (operator) {
      rows = rows.filter((row) => String(row.operator || "").includes(operator));
    }
    if (keyword) {
      rows = rows.filter((row) => {
        const text = `${row.createdAt || ""} ${row.action || ""} ${row.operator || ""} ${JSON.stringify(row.detail || {})}`;
        return text.includes(keyword);
      });
    }
    if (dateFrom) {
      rows = rows.filter((row) => String(row.createdAt || "").slice(0, 10) >= dateFrom);
    }
    if (dateTo) {
      rows = rows.filter((row) => String(row.createdAt || "").slice(0, 10) <= dateTo);
    }

    const hasQuery =
      Boolean(moduleName || operator || keyword || dateFrom || dateTo) ||
      url.searchParams.has("page") ||
      url.searchParams.has("pageSize");
    if (!hasQuery) {
      return sendJson(response, 200, ok(rows.slice(0, 500)));
    }

    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const items = rows.slice(start, start + pageSize);
    return sendJson(response, 200, ok({ items, total, page: safePage, pageSize, totalPages }));
  }

  if (request.method === "GET" && pathname === "/api/logs/runtime") {
    const level = String(url.searchParams.get("level") || "").trim().toLowerCase();
    const keyword = String(url.searchParams.get("keyword") || "").trim();
    const page = toPositiveInt(url.searchParams.get("page"), 1);
    const pageSize = Math.min(200, toPositiveInt(url.searchParams.get("pageSize"), 50));
    let rows = Array.isArray(db.runtimeLogs) ? db.runtimeLogs.slice() : [];
    if (level && level !== "all") {
      rows = rows.filter((x) => String(x.level || "").toLowerCase() === level);
    }
    if (keyword) {
      rows = rows.filter((x) => {
        const text = `${x.createdAt || ""} ${x.level || ""} ${x.action || ""} ${JSON.stringify(x.detail || {})}`;
        return text.includes(keyword);
      });
    }
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const items = rows.slice(start, start + pageSize);
    return sendJson(response, 200, ok({ items, total, page: safePage, pageSize, totalPages }));
  }

  if (request.method === "POST" && pathname === "/api/logs/runtime/cleanup") {
    try {
      const body = await parseBody(request);
      const days = Math.min(3650, toPositiveInt(body.days, 30));
      const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
      const beforeMem = Array.isArray(db.runtimeLogs) ? db.runtimeLogs.length : 0;
      db.runtimeLogs = (Array.isArray(db.runtimeLogs) ? db.runtimeLogs : []).filter((row) => {
        const ts = new Date(String(row.createdAt || "")).getTime();
        return Number.isFinite(ts) && ts >= cutoffMs;
      });
      const afterMem = db.runtimeLogs.length;

      const files = readdirSync(logsDir);
      let deletedFiles = 0;
      for (const name of files) {
        const d = parseLogDateFromFilename(name);
        if (!d) continue;
        if (d.getTime() < cutoffMs) {
          unlinkSync(path.join(logsDir, name));
          deletedFiles += 1;
        }
      }
      addRuntimeLog(db, "info", "runtime.logs.cleaned", { days, deletedFiles, removedRows: beforeMem - afterMem });
      writeDb(db);
      return sendJson(response, 200, ok({ days, deletedFiles, removedRows: beforeMem - afterMem, remainingRows: afterMem }));
    } catch (e) {
      return sendJson(response, 400, { success: false, message: `清理运行日志失败: ${String(e?.message || e || "")}` });
    }
  }
  if (request.method === "POST" && pathname === "/api/logs/runtime/archive") {
    try {
      const body = await parseBody(request);
      const days = Math.min(3650, toPositiveInt(body.days, 30));
      const result = archiveRuntimeLogsOlderThan(days);
      addAuditLog(db, "runtime.logs.archived", { days, ...result }, db.user?.username || "admin");
      writeDb(db);
      return sendJson(response, 200, ok({ days, ...result }));
    } catch (e) {
      return sendJson(response, 400, { success: false, message: `日志归档失败: ${String(e?.message || e || "")}` });
    }
  }

  if (request.method === "GET" && pathname === "/api/work-orders") {
    if (!Array.isArray(db.workOrders)) db.workOrders = [];
    return sendJson(response, 200, ok(db.workOrders));
  }
  if (request.method === "POST" && pathname === "/api/work-orders") {
    if (!Array.isArray(db.workOrders)) db.workOrders = [];
    const body = await parseBody(request);
    const amount = Number(body.amount || 0);
    const now = new Date().toISOString();
    const order = {
      id: `wo-${randomUUID()}`,
      type: String(body.type || ""),
      building: String(body.building || ""),
      room: String(body.room || ""),
      propertyId: String(body.propertyId || ""),
      propertyLabel: String(body.propertyLabel || body.building || ""),
      description: String(body.description || ""),
      photos: Array.isArray(body.photos) ? body.photos : [],
      status: String(body.status || "open"),
      amount: Number.isFinite(amount) ? amount : 0,
      date: String(body.date || now.slice(0, 10)),
      period: String(body.period || now.slice(0, 7)),
      payee: String(body.payee || ""),
      paymentMethod: String(body.paymentMethod || "微信"),
      invoiceNo: String(body.invoiceNo || ""),
      expenseId: "",
      createdAt: now,
      updatedAt: now,
    };
    if (order.amount > 0) {
      const expense = {
        id: `exp-${randomUUID()}`,
        date: order.date,
        period: order.period,
        propertyId: order.propertyId,
        propertyLabel: order.propertyLabel,
        room: order.room,
        category: "日常维修",
        amount: order.amount,
        payee: order.payee,
        paymentMethod: order.paymentMethod,
        allocationMode: "single",
        sharedByRooms: [],
        sourceBillId: "",
        workOrderId: order.id,
        invoiceNo: order.invoiceNo,
        note: String(body.description || body.type || "维修工单生成"),
        createdAt: now,
        updatedAt: now,
      };
      db.expenses.unshift(expense);
      order.expenseId = expense.id;
    }
    db.workOrders.unshift(order);
    addAuditLog(db, "workorder.created", { id: order.id, type: order.type, amount: order.amount, expenseId: order.expenseId }, db.user?.username || "admin");
    writeDb(db);
    return sendJson(response, 200, ok(order));
  }
  if (pathname.startsWith("/api/work-orders/")) {
    if (!Array.isArray(db.workOrders)) db.workOrders = [];
    if (!Array.isArray(db.expenses)) db.expenses = [];
    const workOrderId = pathname.replace("/api/work-orders/", "");
    const index = db.workOrders.findIndex((item) => item.id === workOrderId);
    if (index === -1) return sendJson(response, 404, { success: false, message: "未找到该维修工单" });
    if (request.method === "PUT") {
      const body = await parseBody(request);
      const now = new Date().toISOString();
      const amount = Number(body.amount ?? db.workOrders[index].amount ?? 0);
      const next = {
        ...db.workOrders[index],
        type: String(body.type ?? db.workOrders[index].type ?? ""),
        building: String(body.building ?? db.workOrders[index].building ?? ""),
        room: String(body.room ?? db.workOrders[index].room ?? ""),
        propertyId: String(body.propertyId ?? db.workOrders[index].propertyId ?? ""),
        propertyLabel: String(body.propertyLabel ?? db.workOrders[index].propertyLabel ?? body.building ?? db.workOrders[index].building ?? ""),
        description: String(body.description ?? db.workOrders[index].description ?? ""),
        photos: Array.isArray(body.photos) ? body.photos : db.workOrders[index].photos || [],
        status: String(body.status ?? db.workOrders[index].status ?? "open"),
        amount: Number.isFinite(amount) ? amount : 0,
        date: String(body.date ?? db.workOrders[index].date ?? now.slice(0, 10)),
        period: String(body.period ?? db.workOrders[index].period ?? now.slice(0, 7)),
        payee: String(body.payee ?? db.workOrders[index].payee ?? ""),
        paymentMethod: String(body.paymentMethod ?? db.workOrders[index].paymentMethod ?? "微信"),
        invoiceNo: String(body.invoiceNo ?? db.workOrders[index].invoiceNo ?? ""),
        updatedAt: now,
      };
      const expenseIndex = db.expenses.findIndex((expense) => expense.id === next.expenseId || expense.workOrderId === next.id);
      if (next.amount > 0) {
        const expensePayload = {
          date: next.date,
          period: next.period,
          propertyId: next.propertyId,
          propertyLabel: next.propertyLabel || next.building,
          room: next.room,
          category: "日常维修",
          amount: next.amount,
          payee: next.payee,
          paymentMethod: next.paymentMethod,
          allocationMode: "single",
          sharedByRooms: [],
          sourceBillId: "",
          workOrderId: next.id,
          invoiceNo: next.invoiceNo,
          note: next.description || next.type || "维修工单生成",
          updatedAt: now,
        };
        if (expenseIndex >= 0) {
          db.expenses[expenseIndex] = { ...db.expenses[expenseIndex], ...expensePayload };
          next.expenseId = db.expenses[expenseIndex].id;
        } else {
          const expense = { id: `exp-${randomUUID()}`, ...expensePayload, createdAt: now };
          db.expenses.unshift(expense);
          next.expenseId = expense.id;
        }
      } else if (expenseIndex >= 0) {
        db.expenses.splice(expenseIndex, 1);
        next.expenseId = "";
      }
      db.workOrders[index] = next;
      addAuditLog(db, "workorder.updated", { id: next.id, status: next.status, amount: next.amount, expenseId: next.expenseId }, db.user?.username || "admin");
      writeDb(db);
      return sendJson(response, 200, ok(next));
    }
    if (request.method === "DELETE") {
      const removed = db.workOrders.splice(index, 1)[0];
      const expenseIndex = db.expenses.findIndex((expense) => expense.id === removed.expenseId || expense.workOrderId === removed.id);
      if (expenseIndex >= 0) db.expenses.splice(expenseIndex, 1);
      addAuditLog(db, "workorder.deleted", { id: removed.id, expenseId: removed.expenseId || "" }, db.user?.username || "admin");
      writeDb(db);
      return sendJson(response, 200, ok(removed));
    }
  }

  if (request.method === "POST" && pathname === "/api/backup/restore") {
    try {
      const body = await parseBody(request);
      const file = String(body.file || "").trim();
      if (!file) return sendJson(response, 400, { success: false, message: "缺少备份文件路径 file" });
      const abs = path.resolve(file);
      const backupRoot = path.resolve(backupDir);
      if (!abs.startsWith(backupRoot) || !existsSync(abs)) {
        return sendJson(response, 400, { success: false, message: "备份文件无效或不存在" });
      }
      const currentRaw = readFileSync(dbPath, "utf8");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      writeFileSync(path.join(backupDir, `db.pre-restore.${stamp}.json`), currentRaw);
      writeFileSync(dbPath, readFileSync(abs, "utf8"));
      const freshDb = readDb();
      ensureDbCollections(freshDb);
      addAuditLog(freshDb, "backup.restored", { file: abs }, db.user?.username || "admin");
      writeDb(freshDb);
      return sendJson(response, 200, ok({ restoredFrom: abs }));
    } catch (e) {
      return sendJson(response, 400, { success: false, message: `恢复备份失败: ${String(e?.message || e || "")}` });
    }
  }

  if (request.method === "GET" && pathname === "/api/meter/tasks") return sendJson(response, 200, ok(db.meterTasks));
  if (request.method === "GET" && pathname.startsWith("/api/meter/tasks/")) {
    const taskId = pathname.replace("/api/meter/tasks/", "");
    const task = db.meterTasks.find((x) => x.id === taskId);
    if (!task) return sendJson(response, 404, { success: false, message: "未找到该抄表任务" });
    return sendJson(response, 200, ok(task));
  }

  if (request.method === "POST" && pathname === "/api/meter-tasks") {
    try {
      const body = await parseBody(request);
      const uploadValue = String(body.upload || "").trim();
      if (!uploadValue) return sendJson(response, 400, { success: false, message: "缺少抄表图片 upload" });
      const normalized = uploadValue.replace("/uploads/", "");
      const matchedUpload = db.uploads.find(
        (item) => item.id === normalized || item.path === uploadValue || item.path.endsWith(`/${normalized}`),
      );
      const fileName = matchedUpload?.originalName || normalized || "";
      const diskName = matchedUpload?.id || normalized;
      const filePath = path.join(uploadsDir, diskName);
      if (!existsSync(filePath)) return sendJson(response, 404, { success: false, message: "未找到抄表图片文件" });

      const buffer = readFileSync(filePath);
      let parsedText = "";
      let mode = "none";
      let ocrError = "";
      try {
        const tencent = await runTencentGeneralOcr(buffer);
        parsedText = tencent.parsedText || "";
        mode = "tencent-general-ocr";
      } catch (e) {
        ocrError = String(e?.message || e || "");
        try {
          const fallback = await runOcrSpace(buffer, fileName);
          parsedText = fallback.parsedText || "";
          mode = "ocr-space";
        } catch (e2) {
          ocrError = `${ocrError}; ${String(e2?.message || e2 || "")}`;
        }
      }

      const building = normalizeBuildingText(body.building || "");
      const parsedReadings = parseMeterReadingsFromText(parsedText, building);
      const activeTenants = db.tenants.filter((t) => !t.archived);
      const draftReadings = parsedReadings.map((reading) => {
        const room = normalizeRoomText(reading.room);
        const itemBuilding = normalizeBuildingText(reading.building || building);
        const tenant = activeTenants.find((t) => {
          const tRoom = normalizeRoomText(t.room);
          const tBuilding = normalizeBuildingText(t.building || "");
          if (tBuilding && itemBuilding) return tBuilding === itemBuilding && tRoom === room;
          return tRoom === room;
        });
        const meterIndex = buildTenantMeterIndex(tenant);
        const probe = detectReadingIssue(reading, tenant, meterIndex);
        return {
          building: itemBuilding,
          room,
          waterNow: probe.waterNow,
          electricNow: probe.electricNow,
          tenantId: tenant?.id || "",
          tenantName: tenant?.name || "",
          issue: probe.issue,
          confirmed: false,
        };
      });

      const nextTask = {
        id: `mt-${randomUUID()}`,
        upload: matchedUpload?.path || uploadValue,
        uploadId: matchedUpload?.id || normalized,
        originalName: fileName,
        building,
        cycle: String(body.cycle || new Date().toISOString().slice(0, 7)),
        meterDate: String(body.meterDate || new Date().toISOString().slice(0, 10)),
        ocrMode: mode,
        ocrError,
        parsedText,
        readings: draftReadings,
        status: "draft",
        confirmedAt: "",
        generatedAt: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.meterTasks.unshift(nextTask);
      writeDb(db);
      return sendJson(response, 200, ok(nextTask));
    } catch (e) {
      return sendJson(response, 400, { success: false, message: `创建抄表任务失败: ${String(e?.message || e || "")}` });
    }
  }

  if (request.method === "GET" && pathname.startsWith("/api/meter-tasks/")) {
    const taskId = pathname.replace("/api/meter-tasks/", "");
    const task = db.meterTasks.find((x) => x.id === taskId);
    if (!task) return sendJson(response, 404, { success: false, message: "未找到该抄表任务" });
    return sendJson(response, 200, ok(task));
  }

  if (request.method === "POST" && pathname.startsWith("/api/meter-tasks/") && pathname.endsWith("/confirm")) {
    try {
      const taskId = pathname.replace("/api/meter-tasks/", "").replace("/confirm", "");
      const index = db.meterTasks.findIndex((x) => x.id === taskId);
      if (index === -1) return sendJson(response, 404, { success: false, message: "未找到该抄表任务" });
      const body = await parseBody(request);
      const activeTenants = db.tenants.filter((t) => !t.archived);
      const readings = Array.isArray(body.readings) ? body.readings : db.meterTasks[index].readings || [];
      const reviewed = readings.map((item) => {
        const room = normalizeRoomText(item.room);
        const building = normalizeBuildingText(item.building || "");
        const tenant = activeTenants.find((t) => {
          const tRoom = normalizeRoomText(t.room);
          const tBuilding = normalizeBuildingText(t.building || "");
          if (tBuilding && building) return tBuilding === building && tRoom === room;
          return tRoom === room;
        });
        const meterIndex = buildTenantMeterIndex(tenant);
        const probe = detectReadingIssue(item, tenant, meterIndex);
        const issue = Array.isArray(item.issue) ? Array.from(new Set([...item.issue, ...probe.issue])) : probe.issue;
        const confirmed = Boolean(item.confirmed) && issue.length === 0;
        return {
          building,
          room,
          waterNow: probe.waterNow,
          electricNow: probe.electricNow,
          tenantId: tenant?.id || "",
          tenantName: tenant?.name || "",
          issue,
          confirmed,
        };
      });
      const hasBlocking = reviewed.some((x) => !x.confirmed || x.issue.length > 0);
      db.meterTasks[index] = {
        ...db.meterTasks[index],
        readings: reviewed,
        status: hasBlocking ? "draft" : "confirmed",
        confirmedAt: hasBlocking ? "" : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      writeDb(db);
      return sendJson(response, 200, ok({ task: db.meterTasks[index], hasBlocking }));
    } catch (e) {
      return sendJson(response, 400, { success: false, message: `确认抄表任务失败: ${String(e?.message || e || "")}` });
    }
  }


  if (request.method === "POST" && pathname === "/api/bills/generate-from-readings") {
    try {
      const body = await parseBody(request);
      const cycle = String(body.cycle || new Date().toISOString().slice(0, 7));
      const dueDate = String(body.dueDate || `${cycle}-05`);
      const meterDate = String(body.meterDate || new Date().toISOString().slice(0, 10));
      const meterTaskId = String(body.meterTaskId || "");
      const task = meterTaskId ? db.meterTasks.find((x) => x.id === meterTaskId) : null;
      if (meterTaskId && !task) return sendJson(response, 404, { success: false, message: "未找到该抄表任务" });
      if (task && task.status !== "confirmed") {
        return sendJson(response, 400, { success: false, message: "抄表任务未确认，禁止生成账单" });
      }
      const rawReadings = task ? task.readings || [] : Array.isArray(body.readings) ? body.readings : [];
      const readings = rawReadings.filter((x) => Array.isArray(x.issue) ? x.issue.length === 0 : true);
      if (!readings.length) return sendJson(response, 400, { success: false, message: "没有可入账的有效抄表读数" });
      const activeTenants = db.tenants.filter((t) => !t.archived);
      const generated = [];
      let skipped = 0;

      for (const reading of readings) {
        const room = normalizeRoomText(reading.room);
        const building = String(reading.building || "").trim();
        const tenant = activeTenants.find((t) => {
          const tRoom = normalizeRoomText(t.room);
          const tBuilding = String(t.building || "").trim();
          if (tBuilding && building) return tBuilding === building && tRoom === room;
          return tRoom === room;
        });
        if (!tenant) {
          skipped += 1;
          continue;
        }

        const feeItems = Array.isArray(tenant.feeItems) ? tenant.feeItems : [];
        const electricItem = feeItems.find((x) => /电|electric/i.test(String(x.name || "")));
        const waterItem = feeItems.find((x) => /水|water/i.test(String(x.name || "")));
        const electricPrev = Number(electricItem?.initialReading || 0);
        const waterPrev = Number(waterItem?.initialReading || 0);
        const electricNow = Number(reading.electricNow || 0);
        const waterNow = Number(reading.waterNow || 0);
        const electricUsage = Math.max(0, electricNow - electricPrev);
        const waterUsage = Math.max(0, waterNow - waterPrev);
        const electricFee = calcFeeByItem(electricItem || { unitPrice: 0, hasMinimum: false }, electricUsage);
        const waterFee = calcFeeByItem(waterItem || { unitPrice: 0, hasMinimum: false }, waterUsage);
        const utilityFee = Math.round((electricFee + waterFee) * 100) / 100;
        const rentPart = Number(tenant.rent || 0);
        const receivable = Math.round((rentPart + utilityFee) * 100) / 100;

        const record = normalizeRecordRow({
          id: `rec-${randomUUID()}`,
          tenant: tenant.name || "租客",
          tenantId: tenant.id,
          room: building ? `${building} - ${room}` : room,
          building,
          roomNo: room,
          roomKey: makeTenantRoomKey(building, room),
          cycle,
          receivable,
          received: 0,
          payments: [],
          status: "待收",
          method: "待定",
          dueDate,
          paidAt: "-",
          note: `自动抄表生成 ${meterDate}`,
          source: "meter_ocr",
          meterTaskId,
          meterDate,
          readingsSnapshot: {
            building,
            room,
            waterNow,
            electricNow,
          },
          meter: {
            meterDate,
            waterPrev,
            waterNow,
            waterUsage,
            waterPrice: Number(waterItem?.unitPrice || 0),
            waterFee,
            electricPrev,
            electricNow,
            electricUsage,
            electricPrice: Number(electricItem?.unitPrice || 0),
            electricFee,
          },
        });
        db.records.unshift(record);
        generated.push(record);

        // move baseline to current reading for next cycle
        if (electricItem) electricItem.initialReading = electricNow;
        if (waterItem) waterItem.initialReading = waterNow;
      }

      writeDb(db);
      if (task) {
        task.generatedAt = new Date().toISOString();
        task.updatedAt = new Date().toISOString();
        task.status = "generated";
        writeDb(db);
      }
      return sendJson(response, 200, ok({ generatedCount: generated.length, skippedCount: skipped, records: generated }));
    } catch (e) {
      return sendJson(response, 400, { success: false, message: `生成账单失败: ${String(e?.message || e || "")}` });
    }
  }


  if (request.method === "POST" && pathname === "/api/import/csv") {
    try {
      const body = await parseBody(request);
      const overwrite = Boolean(body.overwrite);
      const preview = buildImportPreview({ db, entity: body.entity, csvText: body.csvText, overwrite });
      applyImportToDb(db, preview, overwrite);
      const report = {
        id: `import-${randomUUID()}`,
        stage: "execute",
        entity: preview.entity,
        totalRows: preview.totalRows,
        imported: preview.imported,
        skipped: preview.skipped,
        errors: preview.errors,
        duplicates: preview.duplicates,
        createdAt: new Date().toISOString(),
      };
      db.importReports.unshift(report);
      addAuditLog(db, "import.executed.compat", { reportId: report.id, entity: report.entity }, db.user?.username || "admin");
      writeDb(db);
      return sendJson(response, 200, ok(report));
    } catch (e) {
      return sendJson(response, 400, { success: false, message: `CSV 导入失败: ${String(e?.message || e || "")}` });
    }
  }

  if (request.method === "GET" && pathname.startsWith("/api/bills/") && pathname.endsWith("/wechat-messages")) {
    const cycle = pathname.replace("/api/bills/", "").replace("/wechat-messages", "");
    const records = db.records.filter((r) => String(r.cycle || "") === cycle);
    const messages = records.map((r) => {
      const tenant = db.tenants.find((t) => t.id === r.tenantId) || {};
      const groupName = String(tenant.wechatGroupName || "").trim();
      const remark = String(tenant.wechatRemark || "").trim();
      const content =
        `【收租账单】\n` +
        `租客：${r.tenant || "-"}\n` +
        `房号：${r.room || "-"}\n` +
        `账期：${r.cycle || "-"}\n` +
        `应收：¥${toSafeNumber(r.receivable || 0, 0).toFixed(2)}\n` +
        `已收：¥${toSafeNumber(r.received || 0, 0).toFixed(2)}\n` +
        `状态：${r.status || "待收"}\n` +
        `到期：${r.dueDate || "-"}\n` +
        `收款方式：${r.method || "微信"}`;
      return {
        recordId: r.id,
        tenantId: r.tenantId || "",
        tenant: r.tenant || "",
        room: r.room || "",
        cycle: r.cycle || "",
        groupName,
        remark,
        status: r.sentStatus || "pending",
        sentAt: r.sentAt || "",
        content,
      };
    });
    return sendJson(response, 200, ok(messages));
  }

  if (request.method === "POST" && pathname.startsWith("/api/bills/") && pathname.endsWith("/mark-sent")) {
    try {
      const recordId = pathname.replace("/api/bills/", "").replace("/mark-sent", "");
      const index = db.records.findIndex((r) => r.id === recordId);
      if (index === -1) return sendJson(response, 404, { success: false, message: "未找到该账单记录" });
      const body = await parseBody(request);
      const markStatus = String(body.status || "sent");
      const sentAt = new Date().toISOString();
      db.records[index] = {
        ...db.records[index],
        sentStatus: markStatus,
        sentAt,
      };
      db.messageLogs.unshift({
        id: `msg-${randomUUID()}`,
        recordId,
        tenantId: db.records[index].tenantId || "",
        targetGroup: String(body.targetGroup || ""),
        operator: String(body.operator || db.user?.username || "admin"),
        status: markStatus,
        sentAt,
        createdAt: sentAt,
      });
      addAuditLog(
        db,
        "bill.mark_sent",
        { recordId, status: markStatus, targetGroup: String(body.targetGroup || "") },
        String(body.operator || db.user?.username || "admin"),
      );
      writeDb(db);
      return sendJson(response, 200, ok(db.records[index]));
    } catch (e) {
      return sendJson(response, 400, { success: false, message: `标记发送失败: ${String(e?.message || e || "")}` });
    }
  }

  if (request.method === "POST" && pathname === "/api/bills/mark-sent-batch") {
    try {
      const body = await parseBody(request);
      const recordIds = Array.isArray(body.recordIds) ? body.recordIds.map((x) => String(x || "")).filter(Boolean) : [];
      const failures = Array.isArray(body.failures) ? body.failures : [];
      if (!recordIds.length && !failures.length) return sendJson(response, 400, { success: false, message: "recordIds / failures 不能同时为空" });
      const markStatus = String(body.status || "sent");
      const operator = String(body.operator || db.user?.username || "admin");
      const sourceBatchId = String(body.sourceBatchId || "");
      const batchId = `sendbatch-${randomUUID()}`;
      const sentAt = new Date().toISOString();
      let updated = 0;
      let failed = 0;
      for (const recordId of recordIds) {
        const index = db.records.findIndex((r) => r.id === recordId);
        if (index === -1) continue;
        db.records[index] = {
          ...db.records[index],
          sentStatus: markStatus,
          sentAt,
        };
        db.messageLogs.unshift({
          id: `msg-${randomUUID()}`,
          batchId,
          recordId,
          tenantId: db.records[index].tenantId || "",
          targetGroup: String(body.targetGroup || ""),
          operator,
          status: markStatus,
          sourceBatchId,
          sentAt,
          createdAt: sentAt,
        });
        updated += 1;
      }
      for (const f of failures) {
        const recordId = String(f?.recordId || "");
        const reason = String(f?.reason || "发送前校验失败");
        if (!recordId) continue;
        const record = db.records.find((r) => r.id === recordId) || {};
        db.messageLogs.unshift({
          id: `msg-${randomUUID()}`,
          batchId,
          recordId,
          tenantId: record.tenantId || "",
          targetGroup: "",
          operator,
          status: "failed",
          failedReason: reason,
          sourceBatchId,
          sentAt,
          createdAt: sentAt,
        });
        failed += 1;
      }
      const total = updated + failed;
      addAuditLog(db, "bill.mark_sent_batch", { batchId, total, updated, failed, status: markStatus }, operator);
      writeDb(db);
      return sendJson(response, 200, ok({ batchId, total, updated, failed, status: markStatus, sentAt }));
    } catch (e) {
      return sendJson(response, 400, { success: false, message: `批量标记发送失败: ${String(e?.message || e || "")}` });
    }
  }

  if (request.method === "POST" && pathname === "/api/bills/send-snapshot") {
    try {
      const body = await parseBody(request);
      const operator = String(body.operator || db.user?.username || "admin");
      const reason = String(body.reason || "manual");
      const result = createBillSendSnapshot(db, operator, reason);
      addAuditLog(db, "bill.send.snapshot.created", { reason, total: result.total, latestPath: result.latestPath }, operator);
      writeDb(db);
      return sendJson(response, 200, ok({ createdAt: new Date().toISOString(), total: result.total }));
    } catch (e) {
      return sendJson(response, 400, { success: false, message: `创建发送快照失败: ${String(e?.message || e || "")}` });
    }
  }

  if (request.method === "POST" && pathname === "/api/bills/send-rollback-latest") {
    try {
      const latest = billSendSnapshotLatestPath();
      if (!existsSync(latest)) return sendJson(response, 404, { success: false, message: "未找到发送快照" });
      const raw = readFileSync(latest, "utf8");
      const snap = JSON.parse(String(raw || "{}"));
      const map = new Map((Array.isArray(snap.records) ? snap.records : []).map((x) => [String(x.id || ""), x]));
      let restored = 0;
      db.records = (db.records || []).map((r) => {
        const hit = map.get(String(r.id || ""));
        if (!hit) return r;
        restored += 1;
        return { ...r, sentStatus: hit.sentStatus || "", sentAt: hit.sentAt || "" };
      });
      const now = new Date().toISOString();
      db.messageLogs.unshift({
        id: `msg-${randomUUID()}`,
        batchId: `rollback-latest-${now.replace(/[:.]/g, "-")}`,
        recordId: "",
        tenantId: "",
        targetGroup: "",
        operator: String(db.user?.username || "admin"),
        status: "rollback",
        sentAt: now,
        createdAt: now,
        action: "rollback_latest_send_snapshot",
      });
      addAuditLog(db, "bill.send.snapshot.rolled_back", { restored, snapshotAt: snap.createdAt || "" }, String(db.user?.username || "admin"));
      writeDb(db);
      return sendJson(response, 200, ok({ restored, snapshotAt: snap.createdAt || "" }));
    } catch (e) {
      return sendJson(response, 400, { success: false, message: `回滚发送快照失败: ${String(e?.message || e || "")}` });
    }
  }

  if (request.method === "GET" && pathname === "/api/bills/send-logs") {
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") || 50)));
    const mode = String(url.searchParams.get("mode") || "all");
    const list = Array.isArray(db.messageLogs) ? db.messageLogs : [];
    const grouped = new Map();
    for (const row of list) {
      const key = String(row.batchId || row.id || "");
      if (!grouped.has(key)) {
        grouped.set(key, {
          batchId: String(row.batchId || ""),
          firstLogId: row.id || "",
          sentAt: row.sentAt || row.createdAt || "",
          operator: row.operator || "",
          status: row.status || "",
          targetGroup: row.targetGroup || "",
          count: 0,
          successCount: 0,
          failedCount: 0,
          failedReasons: [],
          sourceBatchId: "",
          reverted: false,
          recordIds: [],
        });
      }
      const g = grouped.get(key);
      g.count += 1;
      if (String(row.status || "") === "failed") {
        g.failedCount += 1;
        if (row.failedReason) g.failedReasons.push(String(row.failedReason));
      } else {
        g.successCount += 1;
      }
      if (row.recordId) g.recordIds.push(row.recordId);
      if (!g.sourceBatchId && row.sourceBatchId) g.sourceBatchId = String(row.sourceBatchId);
      if (row.action === "revert") g.reverted = true;
    }
    for (const row of list) {
      if (row.action !== "revert") continue;
      const source = String(row.sourceBatchId || "");
      if (!source) continue;
      const g = grouped.get(source);
      if (g) g.reverted = true;
    }
    let items = Array.from(grouped.values());
    if (mode === "failed") {
      items = items.filter((x) => Number(x.failedCount || 0) > 0);
    }
    items = items
      .map((x) => ({ ...x, failedReasonSummary: Array.from(new Set(x.failedReasons || [])).slice(0, 3).join("；") }))
      .sort((a, b) => String(b.sentAt || "").localeCompare(String(a.sentAt || ""), "zh-Hans-CN", { numeric: true }))
      .slice(0, limit);
    return sendJson(response, 200, ok(items));
  }

  if (request.method === "GET" && pathname.startsWith("/api/bills/send-logs/")) {
    const batchId = pathname.replace("/api/bills/send-logs/", "");
    const logs = (Array.isArray(db.messageLogs) ? db.messageLogs : []).filter((x) => String(x.batchId || "") === batchId);
    const details = logs.map((log) => {
      const record = db.records.find((r) => r.id === log.recordId) || {};
      return {
        logId: log.id,
        recordId: log.recordId || "",
        tenant: record.tenant || "",
        room: record.room || "",
        cycle: record.cycle || "",
        receivable: Number(record.receivable || 0),
        received: Number(record.received || 0),
        status: record.status || "",
        sentStatus: record.sentStatus || "pending",
        logStatus: log.status || "",
        failedReason: log.failedReason || "",
        sentAt: log.sentAt || log.createdAt || "",
        operator: log.operator || "",
      };
    });
    return sendJson(response, 200, ok({ batchId, total: details.length, items: details }));
  }

  if (request.method === "POST" && pathname.startsWith("/api/bills/send-logs/") && pathname.endsWith("/revert")) {
    try {
      const batchId = pathname.replace("/api/bills/send-logs/", "").replace("/revert", "");
      const logs = (Array.isArray(db.messageLogs) ? db.messageLogs : []).filter((x) => String(x.batchId || "") === batchId);
      if (!logs.length) return sendJson(response, 404, { success: false, message: "未找到该发送批次" });
      const operator = String(db.user?.username || "admin");
      const now = new Date().toISOString();
      let reverted = 0;
      for (const log of logs) {
        const idx = db.records.findIndex((r) => r.id === log.recordId);
        if (idx < 0) continue;
        db.records[idx] = { ...db.records[idx], sentStatus: "pending", sentAt: "" };
        db.messageLogs.unshift({
          id: `msg-${randomUUID()}`,
          batchId: `revert-${batchId}`,
          recordId: log.recordId,
          tenantId: db.records[idx].tenantId || "",
          targetGroup: "",
          operator,
          status: "pending",
          sentAt: now,
          createdAt: now,
          action: "revert",
          sourceBatchId: batchId,
        });
        reverted += 1;
      }
      addAuditLog(db, "bill.mark_sent_batch.revert", { batchId, reverted }, operator);
      writeDb(db);
      return sendJson(response, 200, ok({ batchId, reverted, status: "pending" }));
    } catch (e) {
      return sendJson(response, 400, { success: false, message: `撤销批次已发失败: ${String(e?.message || e || "")}` });
    }
  }

  if (request.method === "POST" && pathname === "/api/uploads") {
    try {
      const body = await parseBody(request);
      const safeName = safeFilename(String(body.filename || "upload.bin"));
      const extension = safeName.split(".").pop() || "bin";
      const allowed = ["png", "jpg", "jpeg", "webp", "bmp", "pdf"];
      if (!allowed.includes(String(extension).toLowerCase())) {
        return sendJson(response, 400, { success: false, message: "不支持的文件类型" });
      }
      const contentBase64 = String(body.contentBase64 || "");
      const sizeInBytes = Buffer.from(contentBase64, "base64").length;
      if (sizeInBytes > uploadMaxMb * 1024 * 1024) {
        return sendJson(response, 400, { success: false, message: `文件过大，限制 ${uploadMaxMb}MB` });
      }
      const fileId = `${randomUUID()}.${extension}`;
      const targetPath = path.join(uploadsDir, fileId);
      writeFileSync(targetPath, Buffer.from(contentBase64, "base64"));
      db.uploads.push({
        id: fileId,
        originalName: safeName || fileId,
        storedAt: new Date().toISOString(),
        path: `/uploads/${fileId}`,
      });
      addAuditLog(db, "upload.created", { uploadId: fileId, originalName: safeName }, db.user?.username || "admin");
      writeDb(db);
      return sendJson(response, 200, ok({ id: fileId, url: `/uploads/${fileId}` }));
    } catch {
      return sendJson(response, 400, { success: false, message: "上传失败，请检查 filename 和 contentBase64" });
    }
  }


  if (request.method === "GET" && pathname.startsWith("/uploads/")) {
    const filename = pathname.replace("/uploads/", "");
    const absolutePath = path.resolve(uploadsDir, safeFilename(filename));
    const uploadsRoot = path.resolve(uploadsDir);
    if (!absolutePath.startsWith(uploadsRoot)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    if (!existsSync(absolutePath)) {
      response.writeHead(404);
      response.end("Not Found");
      return;
    }
    response.writeHead(200, { "Access-Control-Allow-Origin": appOrigin });
    response.end(readFileSync(absolutePath));
    return;
  }

  return sendJson(response, 404, { success: false, message: "接口不存在" });
});

function runKeyByScheduleToday(lastRuns = {}, key = "", today = "") {
  const last = String(lastRuns[key] || "").slice(0, 10);
  return last !== today;
}

async function runAutomationSchedulerTick() {
  try {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const hour = now.getHours();
    const db = readDb();
    ensureDbCollections(db);
    const at = db.settings.automationTasks || {};
    const lastRuns = at.lastRuns || {};
    const ran = [];

    if (at.contractReminder?.enabled && hour >= Number(at.contractReminder.runHour || 9) && runKeyByScheduleToday(lastRuns, "contractReminder", today)) {
      ran.push(await runAutomationTaskByKey(db, "contractReminder", "auto", "system"));
    }
    if (at.monthlyBillGenerate?.enabled && now.getDate() === 1 && hour >= Number(at.monthlyBillGenerate.runHour || 9) && runKeyByScheduleToday(lastRuns, "monthlyBillGenerate", today)) {
      ran.push(await runAutomationTaskByKey(db, "monthlyBillGenerate", "auto", "system"));
    }
    if (at.dailyBackup?.enabled && hour >= Number(at.dailyBackup.runHour || 6) && runKeyByScheduleToday(lastRuns, "dailyBackup", today)) {
      ran.push(await runAutomationTaskByKey(db, "dailyBackup", "auto", "system"));
    }
    if (at.anomalyPush?.enabled && hour >= Number(at.anomalyPush.runHour || 10) && runKeyByScheduleToday(lastRuns, "anomalyPush", today)) {
      ran.push(await runAutomationTaskByKey(db, "anomalyPush", "auto", "system"));
    }

    if (ran.length) {
      writeDb(db);
      writeRuntimeLog("info", "automation.scheduler.tick", { date: today, hour, tasks: ran.map((x) => x.key) });
    }
  } catch (e) {
    writeRuntimeLog("error", "automation.scheduler.tick.failed", { message: String(e?.message || e || "") });
  }
}

server.listen(port, host, () => {
  writeRuntimeLog("info", "server.started", { host, port });
  runAutomationSchedulerTick();
  setInterval(runAutomationSchedulerTick, 5 * 60 * 1000);
  console.log(`income-local-api listening on http://${host}:${port}`);
});

process.on("uncaughtException", (err) => {
  writeRuntimeLog("error", "process.uncaughtException", {
    message: String(err?.message || err || ""),
    stack: String(err?.stack || ""),
  });
});

process.on("unhandledRejection", (reason) => {
  writeRuntimeLog("error", "process.unhandledRejection", {
    message: String(reason?.message || reason || ""),
    stack: String(reason?.stack || ""),
  });
});
