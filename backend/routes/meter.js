import { Router } from "express";
import { randomUUID } from "node:crypto";
import { readDb, writeDb } from "../lib/db.js";
import { sendJson, ok } from "../lib/utils.js";
const router = Router();

// Meter Readings
router.get("/api/meter-readings", (req, res) => {
  const db = readDb();
  let items = db.meterReadings || [];
  if (req.query.cycle) items = items.filter(d => String(d.cycle || "") === String(req.query.cycle).trim());
  if (req.query.room) items = items.filter(d => String(d.room || "") === String(req.query.room).trim());
  sendJson(res, 200, ok(items));
});

router.get("/api/meter-readings/all", (req, res) => {
  sendJson(res, 200, ok(readDb().meterReadings || []));
});

router.post("/api/meter-readings", async (req, res) => {
  try {
    const body = req.body;
    const building = String(body.building || "").trim();
    const room = String(body.room || "").trim();
    const rdCycle = String(body.cycle || "").trim();
    if (!building || !room || !rdCycle) return sendJson(res, 400, { success: false, message: "缺少 building/room/cycle" });
    const db = readDb();
    const readings = db.meterReadings || [];
    const existing = readings.find(d => String(d.building || "") === building && String(d.room || "") === room && String(d.cycle || "") === rdCycle);
    const electricNow = String(body.electricNow ?? "").trim();
    const waterNow = String(body.waterNow ?? "").trim();
    const entry = { id: existing?.id || `mr-${randomUUID()}`, building, room, cycle: rdCycle, electricNow: electricNow || (existing?.electricNow ?? ""), waterNow: waterNow || (existing?.waterNow ?? ""), source: body.source || existing?.source || "manual", createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    if (existing) Object.assign(existing, entry);
    else readings.push(entry);
    db.meterReadings = readings;
    writeDb(db);
    sendJson(res, 200, ok(entry));
  } catch (e) { sendJson(res, 400, { success: false, message: "保存读数失败" }); }
});

// Meter Drafts
router.get("/api/meter-drafts", (req, res) => {
  const db = readDb();
  let list = db.meterDrafts || [];
  if (req.query.cycle) list = list.filter(d => String(d.cycle || "") === String(req.query.cycle).trim());
  sendJson(res, 200, ok(list));
});

router.put("/api/meter-drafts", async (req, res) => {
  try {
    const body = req.body;
    const db = readDb();
    const drafts = db.meterDrafts || [];
    const idx = drafts.findIndex(d => String(d.building || "") === String(body.building || "").trim() && String(d.room || "") === String(body.room || "").trim() && String(d.cycle || "") === String(body.cycle || "").trim());
    if (idx >= 0) drafts[idx] = { ...drafts[idx], ...body };
    else drafts.push({ id: `md-${randomUUID()}`, ...body, createdAt: new Date().toISOString() });
    db.meterDrafts = drafts;
    writeDb(db);
    sendJson(res, 200, ok({ saved: true }));
  } catch (e) { sendJson(res, 400, { success: false, message: "保存草稿失败" }); }
});

router.delete("/api/meter-drafts/:id", (req, res) => {
  const db = readDb();
  db.meterDrafts = (db.meterDrafts || []).filter(d => String(d.id || "") !== req.params.id);
  writeDb(db);
  sendJson(res, 200, ok({ deleted: true }));
});

export default router;
