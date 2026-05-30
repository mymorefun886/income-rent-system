// ── Records Routes ──
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { readDb, writeDb, createEntityVersion } from "../lib/db.js";
import { sendJson, ok, normalizeRoomText, makeTenantRoomKey, toPositiveInt, parseCycleLike } from "../lib/utils.js";

const router = Router();

router.get("/api/records", (req, res) => {
  const db = readDb();
  const page = toPositiveInt(req.query.page, 0);
  const pageSize = Math.min(500, toPositiveInt(req.query.pageSize, 100));
  let rows = db.records;
  if (req.query.cycle) rows = rows.filter(r => String(r.cycle || "") === String(req.query.cycle).trim());
  if (req.query.room) { const nk = normalizeRoomText(req.query.room); rows = rows.filter(r => normalizeRoomText(r.room).includes(nk)); }
  if (req.query.status) rows = rows.filter(r => String(r.status || "") === String(req.query.status).trim());
  if (req.query.tenant) rows = rows.filter(r => String(r.tenant || "").includes(String(req.query.tenant).trim()));
  if (req.query.search) { const s = String(req.query.search).toLowerCase(); rows = rows.filter(r => String(r.tenant || "").toLowerCase().includes(s) || String(r.room || "").toLowerCase().includes(s) || String(r.cycle || "").includes(s)); }
  if (req.query.startCycle) rows = rows.filter(r => String(r.cycle || "") >= String(req.query.startCycle).trim());
  if (req.query.endCycle) rows = rows.filter(r => String(r.cycle || "") <= String(req.query.endCycle).trim());
  if (page) { const total = rows.length; const pages = Math.max(1, Math.ceil(total / pageSize)); const p = Math.min(Math.max(1, page), pages); return sendJson(res, 200, ok({ items: rows.slice((p-1)*pageSize, (p-1)*pageSize+pageSize), total, page: p, totalPages: pages })); }
  sendJson(res, 200, ok(rows));
});

router.post("/api/records", async (req, res) => {
  try {
    const body = req.body;
    const db = readDb();
    const item = { id: body.id || "rec-" + randomUUID(), tenant: String(body.tenant ?? ""), tenantId: String(body.tenantId ?? ""), room: String(body.room ?? ""), building: String(body.building ?? ""), cycle: parseCycleLike(body.cycle || ""), rentPart: Number(body.rentPart ?? 0), receivable: Number(body.receivable ?? 0), received: Number(body.received ?? 0), payments: Array.isArray(body.payments) ? body.payments : [], status: body.status || "未收", method: body.method || "微信", dueDate: String(body.dueDate ?? ""), paidAt: String(body.paidAt ?? "-"), note: String(body.note ?? ""), electricPrev: String(body.electricPrev ?? ""), electricNow: String(body.electricNow ?? ""), electricUsage: String(body.electricUsage ?? ""), electricPrice: String(body.electricPrice ?? ""), waterPrev: String(body.waterPrev ?? ""), waterNow: String(body.waterNow ?? ""), waterUsage: String(body.waterUsage ?? ""), waterPrice: String(body.waterPrice ?? ""), waterMinimumCharge: String(body.waterMinimumCharge ?? "0"), noWaterMeter: Boolean(body.noWaterMeter), propertyFee: String(body.propertyFee ?? "0"), networkFee: String(body.networkFee ?? "0"), garbageFee: String(body.garbageFee ?? "0"), miscFee: String(body.miscFee ?? "0"), otherFee: String(body.otherFee ?? "0"), depositAdjustment: String(body.depositAdjustment ?? "0"), sentStatus: String(body.sentStatus ?? ""), sentAt: String(body.sentAt ?? ""), source: String(body.source ?? ""), createdAt: body.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    db.records.unshift(item);
    createEntityVersion(db, "records", item.id, null, item, "create", (db.user || {}).username || "admin");
    writeDb(db);
    sendJson(res, 200, ok(item));
  } catch (e) { sendJson(res, 400, { success: false, message: "新增账单失败" }); }
});

router.delete("/api/records", (req, res) => {
  const db = readDb(); db.records = []; writeDb(db); sendJson(res, 200, ok({ cleared: true }));
});

router.put("/api/records/:id", async (req, res) => {
  const db = readDb();
  const idx = db.records.findIndex(r => r.id === req.params.id);
  if (idx === -1) return sendJson(res, 404, { success: false, message: "未找到该账单记录" });
  try {
    const body = req.body;
    const before = { ...db.records[idx] };
    db.records[idx] = { ...db.records[idx], ...body, id: req.params.id, updatedAt: new Date().toISOString() };
    createEntityVersion(db, "records", req.params.id, before, db.records[idx], "update", (db.user || {}).username || "admin");
    writeDb(db);
    sendJson(res, 200, ok(db.records[idx]));
  } catch (e) { sendJson(res, 400, { success: false, message: "修改账单失败" }); }
});

router.delete("/api/records/:id", (req, res) => {
  const db = readDb();
  const idx = db.records.findIndex(r => r.id === req.params.id);
  if (idx === -1) return sendJson(res, 404, { success: false, message: "未找到该账单记录" });
  const removed = db.records.splice(idx, 1)[0];
  createEntityVersion(db, "records", req.params.id, removed, null, "delete", (db.user || {}).username || "admin");
  writeDb(db);
  sendJson(res, 200, ok(removed));
});

export default router;
