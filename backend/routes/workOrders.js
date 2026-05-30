import { Router } from "express";
import { randomUUID } from "node:crypto";
import { readDb, writeDb } from "../lib/db.js";
import { sendJson, ok } from "../lib/utils.js";
const router = Router();

router.get("/api/work-orders", (req, res) => { sendJson(res, 200, ok(readDb().workOrders)); });

router.post("/api/work-orders", async (req, res) => {
  try {
    const db = readDb();
    const item = { id: `wo-${randomUUID()}`, ...req.body, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    db.workOrders.unshift(item); writeDb(db); sendJson(res, 200, ok(item));
  } catch (e) { sendJson(res, 400, { success: false, message: "新增维修单失败" }); }
});

router.put("/api/work-orders/:id", async (req, res) => {
  const db = readDb(); const idx = db.workOrders.findIndex(w => w.id === req.params.id);
  if (idx === -1) return sendJson(res, 404, { success: false, message: "未找到该维修单" });
  try { db.workOrders[idx] = { ...db.workOrders[idx], ...req.body, id: req.params.id, updatedAt: new Date().toISOString() }; writeDb(db); sendJson(res, 200, ok(db.workOrders[idx])); }
  catch (e) { sendJson(res, 400, { success: false, message: "修改维修单失败" }); }
});

router.delete("/api/work-orders/:id", (req, res) => {
  const db = readDb(); const idx = db.workOrders.findIndex(w => w.id === req.params.id);
  if (idx === -1) return sendJson(res, 404, { success: false, message: "未找到该维修单" });
  db.workOrders.splice(idx, 1); writeDb(db); sendJson(res, 200, ok({ deleted: true }));
});

// Reminders
router.get("/api/reminders", (req, res) => { sendJson(res, 200, ok(readDb().reminders)); });

router.post("/api/reminders", async (req, res) => {
  try {
    const db = readDb(); const item = { id: `rem-${randomUUID()}`, ...req.body, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    db.reminders.unshift(item); writeDb(db); sendJson(res, 200, ok(item));
  } catch (e) { sendJson(res, 400, { success: false, message: "新增提醒失败" }); }
});

router.put("/api/reminders/:id", async (req, res) => {
  const db = readDb(); const idx = db.reminders.findIndex(r => r.id === req.params.id);
  if (idx === -1) return sendJson(res, 404, { success: false, message: "未找到该提醒" });
  try { db.reminders[idx] = { ...db.reminders[idx], ...req.body, id: req.params.id, updatedAt: new Date().toISOString() }; writeDb(db); sendJson(res, 200, ok(db.reminders[idx])); }
  catch (e) { sendJson(res, 400, { success: false, message: "修改提醒失败" }); }
});

router.delete("/api/reminders/:id", (req, res) => {
  const db = readDb(); const idx = db.reminders.findIndex(r => r.id === req.params.id);
  if (idx === -1) return sendJson(res, 404, { success: false, message: "未找到该提醒" });
  db.reminders.splice(idx, 1); writeDb(db); sendJson(res, 200, ok({ deleted: true }));
});

// Room Inventory
router.get("/api/room-inventory", (req, res) => { sendJson(res, 200, ok(readDb().roomInventories)); });

router.post("/api/room-inventory", async (req, res) => {
  try {
    const db = readDb(); const item = { id: `inv-${randomUUID()}`, ...req.body, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    db.roomInventories.unshift(item); writeDb(db); sendJson(res, 200, ok(item));
  } catch (e) { sendJson(res, 400, { success: false, message: "新增物品清单失败" }); }
});

// Health
router.get("/api/health", (req, res) => { sendJson(res, 200, ok({ status: "ok", time: new Date().toISOString() })); });
router.get("/api/system/health", (req, res) => {
  const db = readDb();
  sendJson(res, 200, ok({ status: "ok", timestamp: new Date().toISOString(), backups: { dir: backupDir, files: 0 }, user: { username: String((db.user || {}).username || ""), role: String((db.user || {}).role || "") } }));
});

export default router;
