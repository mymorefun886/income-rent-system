// ── Misc Routes: Uploads, Entity Versions, Dashboard, Reports ──
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readDb, writeDb, backupDir, uploadsDir, addAuditLog } from "../lib/db.js";
import { sendJson, ok, toPositiveInt, safeFilename } from "../lib/utils.js";
const router = Router();
const uploadMaxMb = Number(process.env.UPLOAD_MAX_MB || 10);
router.post("/api/uploads", async (req, res) => { try {
  const body = req.body;
  const safeName = safeFilename(String(body.filename || "upload.bin"));
  const ext = safeName.split(".").pop() || "bin";
  if (!["png","jpg","jpeg","webp","bmp","pdf"].includes(ext.toLowerCase())) return sendJson(res, 400, { success: false, message: "不支持的文件类型" });
  const contentBase64 = String(body.contentBase64 || "");
  const size = Buffer.from(contentBase64, "base64").length;
  if (size > uploadMaxMb * 1024 * 1024) return sendJson(res, 400, { success: false, message: "文件过大" });
  const db = readDb(); const fileId = randomUUID() + "." + ext;
  writeFileSync(path.join(uploadsDir, fileId), Buffer.from(contentBase64, "base64"));
  if (!Array.isArray(db.uploads)) db.uploads = [];
  db.uploads.push({ id: fileId, originalName: safeName, storedAt: new Date().toISOString(), path: "/uploads/" + fileId });
  addAuditLog(db, "upload.created", { uploadId: fileId }, (db.user || {}).username || "admin");
  writeDb(db); sendJson(res, 200, ok({ id: fileId, url: "/uploads/" + fileId }));
} catch (e) { sendJson(res, 400, { success: false, message: "上传失败" }); }});
router.get("/uploads/:filename", (req, res) => {
  const abs = path.resolve(uploadsDir, safeFilename(req.params.filename));
  if (!abs.startsWith(path.resolve(uploadsDir))) return res.status(403).end("Forbidden");
  if (!existsSync(abs)) return res.status(404).end("Not Found"); res.sendFile(abs);
});
router.get("/api/dashboard", (req, res) => {
  const db = readDb();
  const tr = db.records.reduce((s, r) => s + Number(r.receivable || 0), 0);
  const tp = db.records.reduce((s, r) => s + Number(r.received || 0), 0);
  sendJson(res, 200, ok({ totalReceivable: tr, totalReceived: tp, activeTenants: db.tenants.filter(t=>!t.archived).length, totalProperties: db.properties.length, totalRecords: db.records.length }));
});
router.get("/api/entity-versions", (req, res) => {
  const db = readDb(); const entity = String(req.query.entity || "").trim();
  if (!entity) return sendJson(res, 400, { success: false, message: "entity 必填" });
  let rows = (db.entityVersions || []).filter(x => String(x.entity || "") === entity);
  if (req.query.entityId) rows = rows.filter(x => String(x.entityId || "") === String(req.query.entityId).trim());
  sendJson(res, 200, ok(rows.slice(0, toPositiveInt(req.query.limit, 100))));
});
router.get("/api/wechat/messages", (req, res) => {
  const db = readDb(); const cycle = String(req.query.cycle || "").trim();
  let msgs = db.messageLogs || []; if (cycle) msgs = msgs.filter(m => String(m.createdAt || "").startsWith(cycle));
  sendJson(res, 200, ok(msgs));
});
router.get("/api/contracts/reminders", (req, res) => {
  const db = readDb();
  const dueDays = Number((db.settings || {}).opsRules?.contractDueDays || 30);
  const reminders = (db.contracts || []).filter(c => { if (!c.leaseEnd) return false; const diff = Math.ceil((new Date(c.leaseEnd) - new Date()) / 86400000); return diff >= 0 && diff <= dueDays; });
  sendJson(res, 200, ok(reminders));
});
router.post("/api/tenants/snapshot", async (req, res) => { try {
  const db = readDb(); const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  writeFileSync(path.join(backupDir, "tenants.snapshot." + stamp + ".json"), JSON.stringify({ createdAt: new Date().toISOString(), tenants: db.tenants }, null, 2), "utf8");
  writeFileSync(path.join(backupDir, "tenants.snapshot.latest.json"), JSON.stringify({ createdAt: new Date().toISOString(), tenants: db.tenants }, null, 2), "utf8");
  addAuditLog(db, "tenant.snapshot.created", { total: db.tenants.length }, (db.user || {}).username || "admin"); writeDb(db);
  sendJson(res, 200, ok({ createdAt: new Date().toISOString(), total: db.tenants.length }));
} catch (e) { sendJson(res, 400, { success: false, message: "快照失败" }); }});
export default router;
