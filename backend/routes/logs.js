import { Router } from "express";
import { existsSync, readdirSync, readFileSync, statSync, unlinkSync, renameSync, mkdirSync, appendFileSync } from "node:fs";
import path from "node:path";
import { readDb, writeDb, logsDir, addAuditLog, writeRuntimeLog } from "../lib/db.js";
import { sendJson, ok, toPositiveInt, parseLogDateFromFilename } from "../lib/utils.js";
const router = Router();

router.post("/api/logs/client-error", async (req, res) => {
  try {
    writeRuntimeLog("error", "client.error", { message: String(req.body?.message || ""), url: String(req.body?.url || ""), stack: String(req.body?.stack || "").slice(0, 500) });
    sendJson(res, 200, ok({ logged: true }));
  } catch (e) { sendJson(res, 200, ok({ logged: false })); }
});

router.get("/api/audit-logs", (req, res) => {
  const db = readDb();
  const limit = Math.min(500, toPositiveInt(req.query.limit, 200));
  const action = String(req.query.action || "").trim();
  let logs = db.auditLogs || [];
  if (action) logs = logs.filter(l => String(l.action || "").includes(action));
  sendJson(res, 200, ok(logs.slice(0, limit)));
});

router.get("/api/logs/runtime", (req, res) => {
  try {
    const dateStr = String(req.query.date || "").trim();
    const filePath = dateStr ? path.join(logsDir, `runtime-${dateStr}.log`) : (() => { const files = readdirSync(logsDir).filter(f => f.startsWith("runtime-")).sort().reverse(); return files.length ? path.join(logsDir, files[0]) : null; })();
    if (!filePath || !existsSync(filePath)) return sendJson(res, 200, ok([]));
    const raw = readFileSync(filePath, "utf8");
    const lines = raw.split("\n").filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).slice(-500);
    sendJson(res, 200, ok(lines));
  } catch (e) { sendJson(res, 200, ok([])); }
});

router.post("/api/logs/runtime/cleanup", (req, res) => {
  try {
    const keepDays = Math.max(1, toPositiveInt(req.body?.keepDays, 30));
    const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
    const files = readdirSync(logsDir).filter(f => f.startsWith("runtime-"));
    let deleted = 0;
    files.forEach(f => { try { const fp = path.join(logsDir, f); if (statSync(fp).mtimeMs < cutoff) { unlinkSync(fp); deleted++; } } catch {} });
    sendJson(res, 200, ok({ deleted }));
  } catch (e) { sendJson(res, 200, ok({ deleted: 0 })); }
});

router.post("/api/logs/runtime/archive", (req, res) => {
  try {
    const archiveDir = path.join(logsDir, "archive");
    if (!existsSync(archiveDir)) mkdirSync(archiveDir, { recursive: true });
    const files = readdirSync(logsDir).filter(f => f.startsWith("runtime-"));
    let archived = 0;
    files.forEach(f => { try { renameSync(path.join(logsDir, f), path.join(archiveDir, f)); archived++; } catch {} });
    sendJson(res, 200, ok({ archived }));
  } catch (e) { sendJson(res, 200, ok({ archived: 0 })); }
});

export default router;
