import { Router } from "express";
import { randomUUID } from "node:crypto";
import { readDb, writeDb, ensureDbCollections, addAuditLog } from "../lib/db.js";
import { sendJson, ok, normalizePhone, normalizeRoomKey, makeTenantRoomKey, parseCycleLike } from "../lib/utils.js";
const router = Router();

router.post("/api/import/validate", async (req, res) => {
  try {
    const body = req.body;
    const entity = String(body.entity || "").trim();
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const errors = [];
    rows.forEach((row, i) => {
      if (entity === "tenants" && !String(row.name || "").trim()) errors.push({ row: i, field: "name", message: "租客姓名必填" });
      if (entity === "records" && !String(row.cycle || "").trim()) errors.push({ row: i, field: "cycle", message: "周期必填" });
      if (entity === "properties" && !String(row.room || "").trim()) errors.push({ row: i, field: "room", message: "房号必填" });
    });
    sendJson(res, 200, ok({ total: rows.length, errors }));
  } catch (e) { sendJson(res, 400, { success: false, message: "验证失败" }); }
});

router.post("/api/import/preview", async (req, res) => {
  try {
    const body = req.body;
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const preview = rows.slice(0, 20);
    sendJson(res, 200, ok({ total: rows.length, preview }));
  } catch (e) { sendJson(res, 400, { success: false, message: "预览失败" }); }
});

router.post("/api/import/execute", async (req, res) => {
  try {
    const body = req.body;
    const entity = String(body.entity || "").trim();
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const overwrite = Boolean(body.overwrite);
    const db = readDb();
    ensureDbCollections(db);
    let imported = 0, skipped = 0, errors = [];
    rows.forEach((row, i) => {
      try {
        if (entity === "tenants") {
          if (!String(row.name || "").trim()) { skipped++; return; }
          const phone = normalizePhone(String(row.phone || "").trim());
          const item = { id: `tenant-${randomUUID()}`, name: String(row.name || "").trim(), phone, building: String(row.building || "").trim(), room: String(row.room || "").trim(), rent: Number(row.rent || 0), deposit: Number(row.deposit || 0), leaseStart: String(row.leaseStart || "").trim(), leaseEnd: String(row.leaseEnd || "").trim(), archived: false, createdAt: new Date().toISOString() };
          const existing = db.tenants.findIndex(t => String(t.name || "").trim() === item.name && String(t.room || "").trim() === item.room);
          if (existing >= 0 && overwrite) db.tenants[existing] = { ...db.tenants[existing], ...item }; else if (existing >= 0) { skipped++; return; } else db.tenants.unshift(item);
          imported++;
        } else if (entity === "records") {
          if (!String(row.cycle || "").trim()) { skipped++; return; }
          const item = { id: `rec-${randomUUID()}`, tenant: String(row.tenant || "").trim(), room: String(row.room || "").trim(), cycle: parseCycleLike(row.cycle), rentPart: Number(row.rentPart || 0), receivable: Number(row.receivable || 0), received: Number(row.received || 0), status: String(row.status || "未收").trim(), method: "微信", dueDate: String(row.dueDate || "").trim(), paidAt: "-", note: "CSV导入", electricPrev: String(row.electricPrev || ""), electricNow: String(row.electricNow || ""), createdAt: new Date().toISOString() };
          db.records.unshift(item);
          imported++;
        } else if (entity === "properties") {
          if (!String(row.room || "").trim()) { skipped++; return; }
          const item = { id: `prop-${randomUUID()}`, building: String(row.building || "").trim(), room: String(row.room || "").trim(), title: String(row.title || "").trim(), address: String(row.address || "").trim(), area: String(row.area || "").trim(), layout: String(row.layout || "").trim(), rent: Number(row.rent || 0), status: String(row.status || "闲置").trim(), createdAt: new Date().toISOString() };
          db.properties.unshift(item);
          imported++;
        } else skipped++;
      } catch (e) { errors.push({ row: i, message: e.message }); skipped++; }
    });
    addAuditLog(db, "import.executed", { entity, imported, skipped, errors: errors.length }, (db.user || {}).username || "admin");
    writeDb(db);
    sendJson(res, 200, ok({ entity, totalRows: rows.length, imported, skipped, errors }));
  } catch (e) { sendJson(res, 400, { success: false, message: "导入失败" }); }
});

router.post("/api/import/csv", async (req, res) => {
  try {
    const body = req.body;
    let csvText = String(body.csv || body.csvText || "").trim();
    const entity = String(body.entity || "records").trim();
    if (!csvText) return sendJson(res, 400, { success: false, message: "CSV 内容为空" });
    const lines = csvText.replace(/^﻿/, "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return sendJson(res, 400, { success: false, message: "CSV 至少需要标题行+1行数据" });
    const header = lines[0].split(",").map(h => h.trim().toLowerCase());
    const db = readDb();
    let imported = 0, skipped = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map(c => c.trim());
      const row = {};
      header.forEach((h, idx) => { row[h] = cols[idx] || ""; });
      if (!row.room && !row.name) { skipped++; continue; }
      if (entity === "tenants" && row.name) {
        const existing = db.tenants.find(t => String(t.name || "").trim() === String(row.name).trim());
        if (!existing) { db.tenants.unshift({ id: `tenant-${randomUUID()}`, name: row.name, phone: normalizePhone(row.phone || ""), building: row.building || "", room: row.room || "", rent: Number(row.rent || 0), deposit: Number(row.deposit || 0), leaseStart: row.leaseStart || "", leaseEnd: row.leaseEnd || "", archived: false, createdAt: new Date().toISOString() }); imported++; }
        else skipped++;
      } else if (entity === "records" && row.cycle) {
        db.records.unshift({ id: `rec-${randomUUID()}`, tenant: row.tenant || "", room: row.room || "", cycle: parseCycleLike(row.cycle), rentPart: Number(row.rentPart || 0), receivable: Number(row.receivable || 0), received: Number(row.received || 0), status: "未收", method: "微信", dueDate: row.dueDate || "", paidAt: "-", note: "CSV导入", electricPrev: row.electricPrev || "", electricNow: row.electricNow || "", waterPrev: row.waterPrev || "", waterNow: row.waterNow || "", createdAt: new Date().toISOString() });
        imported++;
      } else skipped++;
    }
    writeDb(db);
    sendJson(res, 200, ok({ entity, totalRows: lines.length - 1, imported, skipped }));
  } catch (e) { sendJson(res, 400, { success: false, message: "CSV 导入失败" }); }
});

export default router;
