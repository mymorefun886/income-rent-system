import { Router } from "express";
import { readDb, writeDb, addAuditLog, dbPath, logsDir, backupDir } from "../lib/db.js";
import { sendJson, ok } from "../lib/utils.js";
const router = Router();

router.get("/api/settings", (req, res) => { sendJson(res, 200, ok(readDb().settings || {})); });

router.put("/api/settings", async (req, res) => {
  try {
    const body = req.body;
    const db = readDb();
    db.settings = { ...(db.settings || {}), ...body };
    writeDb(db);
    sendJson(res, 200, ok(db.settings));
  } catch (e) { sendJson(res, 400, { success: false, message: "保存设置失败" }); }
});

router.get("/api/automation-tasks", (req, res) => { sendJson(res, 200, ok((readDb().settings || {}).automationTasks || {})); });

router.put("/api/automation-tasks", async (req, res) => {
  try {
    const body = req.body;
    const db = readDb();
    const current = db.settings.automationTasks || {};
    db.settings.automationTasks = { ...current, ...body, lastRuns: current.lastRuns || {} };
    addAuditLog(db, "automation.settings.updated", { keys: Object.keys(body || {}) }, (db.user || {}).username || "admin");
    writeDb(db);
    sendJson(res, 200, ok(db.settings.automationTasks));
  } catch (e) { sendJson(res, 400, { success: false, message: "保存自动化任务设置失败" }); }
});

export default router;
