import { Router } from "express";
import { randomUUID } from "node:crypto";
import { readDb, writeDb } from "../lib/db.js";
import { sendJson, ok, makeTenantRoomKey } from "../lib/utils.js";

const router = Router();

router.get("/api/properties", (req, res) => {
  const db = readDb();
  let list = db.properties;
  if (req.query.building) list = list.filter(p => String(p.building || "").includes(String(req.query.building).trim()));
  if (req.query.room) list = list.filter(p => String(p.room || "").includes(String(req.query.room).trim()));
  sendJson(res, 200, ok(list));
});

router.post("/api/properties", async (req, res) => {
  try {
    const body = req.body;
    const db = readDb();
    const item = { id: body.id || `prop-${randomUUID()}`, building: String(body.building || "").trim(), room: String(body.room || "").trim(), title: String(body.title || "").trim(), address: String(body.address || "").trim(), area: String(body.area || "").trim(), layout: String(body.layout || "").trim(), rent: Number(body.rent || 0), deposit: Number(body.deposit || 0), status: String(body.status || "闲置").trim(), usageType: String(body.usageType || "").trim(), noWaterMeter: Boolean(body.noWaterMeter), lastElectricReading: String(body.lastElectricReading || ""), lastWaterReading: String(body.lastWaterReading || ""), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    db.properties.unshift(item);
    writeDb(db);
    sendJson(res, 200, ok(item));
  } catch (e) { sendJson(res, 400, { success: false, message: "新增房源失败" }); }
});

router.put("/api/properties/:id", async (req, res) => {
  const db = readDb();
  const idx = db.properties.findIndex(p => p.id === req.params.id);
  if (idx === -1) return sendJson(res, 404, { success: false, message: "未找到该房源" });
  try {
    const body = req.body;
    db.properties[idx] = { ...db.properties[idx], ...body, id: req.params.id, updatedAt: new Date().toISOString() };
    writeDb(db);
    sendJson(res, 200, ok(db.properties[idx]));
  } catch (e) { sendJson(res, 400, { success: false, message: "修改房源失败" }); }
});

router.delete("/api/properties/:id", (req, res) => {
  const db = readDb();
  const idx = db.properties.findIndex(p => p.id === req.params.id);
  if (idx === -1) return sendJson(res, 404, { success: false, message: "未找到该房源" });
  db.properties.splice(idx, 1);
  writeDb(db);
  sendJson(res, 200, ok({ deleted: true }));
});

export default router;
