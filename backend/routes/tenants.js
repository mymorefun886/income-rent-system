import { Router } from "express";
import { randomUUID } from "node:crypto";
import { readDb, writeDb, addAuditLog, createEntityVersion } from "../lib/db.js";
import { sendJson, ok, normalizePhone, isValidCnPhone } from "../lib/utils.js";

const router = Router();

router.get("/api/tenants", (req, res) => {
  const db = readDb();
  let list = db.tenants;
  if (req.query.name) list = list.filter(t => String(t.name || "").includes(String(req.query.name).trim()));
  if (req.query.room) list = list.filter(t => String(t.room || "").includes(String(req.query.room).trim()));
  if (req.query.building) list = list.filter(t => String(t.building || "").includes(String(req.query.building).trim()));
  if (req.query.archived === "true") list = list.filter(t => t.archived);
  else if (req.query.archived !== "all") list = list.filter(t => !t.archived);
  sendJson(res, 200, ok(list));
});

router.post("/api/tenants", async (req, res) => {
  try {
    const body = req.body;
    const db = readDb();
    const phone = normalizePhone(String(body.phone || "").trim());
    if (phone && !isValidCnPhone(phone)) return sendJson(res, 400, { success: false, message: "手机号格式不正确" });
    const item = { id: body.id || `tenant-${randomUUID()}`, name: String(body.name || "").trim(), phone, building: String(body.building || "").trim(), room: String(body.room || "").trim(), rent: Number(body.rent || 0), deposit: Number(body.deposit || 0), leaseStart: String(body.leaseStart || "").trim(), leaseEnd: String(body.leaseEnd || "").trim(), archived: Boolean(body.archived), feeItems: Array.isArray(body.feeItems) ? body.feeItems : [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    db.tenants.unshift(item);
    addAuditLog(db, "tenant.created", { tenantId: item.id, name: item.name }, (db.user || {}).username || "admin");
    writeDb(db);
    sendJson(res, 200, ok(item));
  } catch (e) { sendJson(res, 400, { success: false, message: "新增租客失败" }); }
});

router.put("/api/tenants/:id", async (req, res) => {
  const db = readDb();
  const idx = db.tenants.findIndex(t => t.id === req.params.id);
  if (idx === -1) return sendJson(res, 404, { success: false, message: "未找到该租客" });
  try {
    const body = req.body;
    db.tenants[idx] = { ...db.tenants[idx], ...body, id: req.params.id, updatedAt: new Date().toISOString() };
    addAuditLog(db, "tenant.updated", { tenantId: req.params.id }, (db.user || {}).username || "admin");
    writeDb(db);
    sendJson(res, 200, ok(db.tenants[idx]));
  } catch (e) { sendJson(res, 400, { success: false, message: "修改租客失败" }); }
});

router.delete("/api/tenants/:id", (req, res) => {
  const db = readDb();
  const idx = db.tenants.findIndex(t => t.id === req.params.id);
  if (idx === -1) return sendJson(res, 404, { success: false, message: "未找到该租客" });
  const removed = db.tenants.splice(idx, 1)[0];
  addAuditLog(db, "tenant.deleted", { tenantId: req.params.id, name: removed.name }, (db.user || {}).username || "admin");
  writeDb(db);
  sendJson(res, 200, ok(removed));
});

export default router;
