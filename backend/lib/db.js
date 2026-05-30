// ── Data Layer: JSON File Database ──
import { existsSync, readFileSync, writeFileSync, renameSync, statSync, appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const storageDir = process.env.STORAGE_DIR || path.join(__dirname, "..", "storage");
export const dbPath = path.join(storageDir, "db.json");
export const logsDir = path.join(storageDir, "logs");
export const backupDir = process.env.BACKUP_DIR || path.join(storageDir, "backups");
export const uploadsDir = path.join(storageDir, "uploads");

// ── DB Schema ──
export const dbSchema = z.object({
  user: z.object({ id: z.string(), username: z.string(), name: z.string().optional(), role: z.string().optional(), portfolio: z.string().optional() }).passthrough(),
  properties: z.array(z.record(z.unknown())).default([]),
  tenants: z.array(z.record(z.unknown())).default([]),
  records: z.array(z.record(z.unknown())).default([]),
  expenses: z.array(z.record(z.unknown())).default([]),
  contracts: z.array(z.record(z.unknown())).default([]),
  reminders: z.array(z.record(z.unknown())).default([]),
  roomInventories: z.array(z.record(z.unknown())).default([]),
  roomInventorySnapshots: z.array(z.record(z.unknown())).default([]),
  workOrders: z.array(z.record(z.unknown())).default([]),
  uploads: z.array(z.record(z.unknown())).default([]),
  meterTasks: z.array(z.record(z.unknown())).default([]),
  messageLogs: z.array(z.record(z.unknown())).default([]),
  auditLogs: z.array(z.record(z.unknown())).default([]),
  entityVersions: z.array(z.record(z.unknown())).default([]),
  importReports: z.array(z.record(z.unknown())).default([]),
  runtimeLogs: z.array(z.record(z.unknown())).default([]),
  profitAlerts: z.array(z.record(z.unknown())).default([]),
  settings: z.record(z.unknown()).default({}),
  meterDrafts: z.array(z.record(z.unknown())).default([]),
  meterReadings: z.array(z.record(z.unknown())).default([]),
}).passthrough();

let dbCache = null;
let dbCacheMtime = 0;

export function readDb() {
  try {
    const stat = statSync(dbPath);
    if (dbCache && stat.mtimeMs === dbCacheMtime) return dbCache;
    const raw = readFileSync(dbPath, "utf8");
    const safe = typeof raw === "string" ? raw.replace(/^﻿/, "") : raw;
    const parsed = dbSchema.parse(JSON.parse(safe));
    dbCache = parsed;
    dbCacheMtime = stat.mtimeMs;
    return dbCache;
  } catch (e) {
    if (e instanceof z.ZodError) {
      writeRuntimeLog("warn", "db.schema_invalid", { issues: e.issues.slice(0, 5) });
    }
    const tmpPath = dbPath + ".tmp";
    if (existsSync(tmpPath)) {
      try {
        const raw = readFileSync(tmpPath, "utf8");
        const safe = typeof raw === "string" ? raw.replace(/^﻿/, "") : raw;
        dbCache = JSON.parse(safe);
        writeFileSync(dbPath, JSON.stringify(dbCache, null, 2));
        dbCacheMtime = statSync(dbPath).mtimeMs;
        writeRuntimeLog("warn", "db.recovered_from_tmp", {});
        return dbCache;
      } catch {}
    }
    throw e;
  }
}

export function writeDb(data) {
  const validated = dbSchema.parse(data);
  const tmpPath = dbPath + ".tmp";
  const json = JSON.stringify(validated, null, 2);
  writeFileSync(tmpPath, json, "utf8");
  renameSync(tmpPath, dbPath);
  dbCache = validated;
  dbCacheMtime = statSync(dbPath).mtimeMs;
}

export function ensureDbCollections(db) {
  if (!Array.isArray(db.properties)) db.properties = [];
  if (!Array.isArray(db.tenants)) db.tenants = [];
  if (!Array.isArray(db.records)) db.records = [];
  if (!Array.isArray(db.expenses)) db.expenses = [];
  if (!Array.isArray(db.contracts)) db.contracts = [];
  if (!Array.isArray(db.reminders)) db.reminders = [];
  if (!Array.isArray(db.roomInventories)) db.roomInventories = [];
  if (!Array.isArray(db.roomInventorySnapshots)) db.roomInventorySnapshots = [];
  if (!Array.isArray(db.workOrders)) db.workOrders = [];
  if (!Array.isArray(db.uploads)) db.uploads = [];
  if (!Array.isArray(db.meterTasks)) db.meterTasks = [];
  if (!Array.isArray(db.messageLogs)) db.messageLogs = [];
  if (!Array.isArray(db.auditLogs)) db.auditLogs = [];
  if (!Array.isArray(db.entityVersions)) db.entityVersions = [];
  if (!Array.isArray(db.importReports)) db.importReports = [];
  if (!Array.isArray(db.runtimeLogs)) db.runtimeLogs = [];
  if (!Array.isArray(db.profitAlerts)) db.profitAlerts = [];
  if (!db.settings || typeof db.settings !== "object") db.settings = {};
  if (!Array.isArray(db.meterDrafts)) db.meterDrafts = [];
  if (!Array.isArray(db.meterReadings)) db.meterReadings = [];
  // Automation task defaults
  const at = db.settings.automationTasks;
  if (!at || typeof at !== "object") db.settings.automationTasks = {};
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
}

export function runtimeLogFilePath(date = new Date()) {
  const day = date.toISOString().slice(0, 10);
  return path.join(logsDir, `runtime-${day}.log`);
}

export function writeRuntimeLog(level, action, detail = {}) {
  const row = { ts: new Date().toISOString(), level: String(level || "info"), action: String(action || "runtime"), detail };
  try { appendFileSync(runtimeLogFilePath(), `${JSON.stringify(row)}\n`, "utf8"); } catch {}
}

export function addAuditLog(db, action, detail, operator = "system") {
  if (!Array.isArray(db.auditLogs)) db.auditLogs = [];
  db.auditLogs.unshift({ id: `audit-${Date.now()}`, action, detail, operator, createdAt: new Date().toISOString() });
  if (db.auditLogs.length > 3000) db.auditLogs.length = 3000;
}

export function createEntityVersion(db, entity, entityId, beforeValue, afterValue, action, operator = "system", note = "") {
  if (!Array.isArray(db.entityVersions)) db.entityVersions = [];
  db.entityVersions.unshift({ id: `ver-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, entity, entityId, before: beforeValue, after: afterValue, action, operator, note, createdAt: new Date().toISOString() });
  if (db.entityVersions.length > 20000) db.entityVersions.length = 20000;
}
