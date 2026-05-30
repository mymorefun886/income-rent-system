import { Router } from "express";
import { randomUUID } from "node:crypto";
import { readDb, writeDb, backupDir, addAuditLog, writeRuntimeLog } from "../lib/db.js";
import { sendJson, ok, normalizeRoomText, makeTenantRoomKey } from "../lib/utils.js";
const router = Router();

function normalizeRecordRow(r) {
  const id = r.id || `rec-${randomUUID()}`;
  const building = String(r.building || "").trim();
  const roomNo = String(r.roomNo || r.room || "").trim();
  return { ...r, id, building, roomNo, roomKey: makeTenantRoomKey(building, roomNo), room: building ? `${building} - ${roomNo}` : roomNo, updatedAt: new Date().toISOString() };
}

router.post("/api/bills/mark-sent", async (req, res) => {
  try {
    const body = req.body;
    const db = readDb();
    const record = db.records.find(r => r.id === body.recordId);
    if (!record) return sendJson(res, 404, { success: false, message: "未找到该账单" });
    record.sentStatus = body.status || "sent";
    record.sentAt = record.sentStatus === "sent" ? new Date().toISOString() : "";
    record.targetGroup = String(body.targetGroup || "").trim();
    if (!Array.isArray(db.messageLogs)) db.messageLogs = [];
    db.messageLogs.unshift({ id: `log-${Date.now()}`, recordId: body.recordId, status: record.sentStatus, targetGroup: record.targetGroup, createdAt: new Date().toISOString() });
    writeDb(db);
    sendJson(res, 200, ok(record));
  } catch (e) { sendJson(res, 400, { success: false, message: "标记发送失败" }); }
});

router.post("/api/bills/mark-sent-batch", async (req, res) => {
  try {
    const body = req.body;
    const db = readDb();
    const recordIds = Array.isArray(body.recordIds) ? body.recordIds : [];
    const markStatus = body.status || "sent";
    let updated = 0, failed = 0;
    recordIds.forEach(id => {
      const record = db.records.find(r => r.id === id);
      if (!record) { failed++; return; }
      record.sentStatus = markStatus;
      record.sentAt = markStatus === "sent" ? new Date().toISOString() : "";
      if (!Array.isArray(db.messageLogs)) db.messageLogs = [];
      db.messageLogs.unshift({ id: `log-${Date.now()}`, recordId: id, status: markStatus, createdAt: new Date().toISOString() });
      updated++;
    });
    writeDb(db);
    sendJson(res, 200, ok({ total: recordIds.length, updated, failed }));
  } catch (e) { sendJson(res, 400, { success: false, message: "批量标记失败" }); }
});

export default router;
