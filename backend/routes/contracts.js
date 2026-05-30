import { Router } from "express";
import { randomUUID } from "node:crypto";
import { readDb, writeDb, addAuditLog } from "../lib/db.js";
import { sendJson, ok } from "../lib/utils.js";
const router = Router();

router.get("/api/contracts", (req, res) => { sendJson(res, 200, ok(readDb().contracts)); });

router.post("/api/contracts", async (req, res) => {
  try {
    const db = readDb();
    const item = { id: `ct-${randomUUID()}`, ...req.body, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    db.contracts.unshift(item);
    addAuditLog(db, "contract.created", { contractId: item.id }, (db.user || {}).username || "admin");
    writeDb(db);
    sendJson(res, 200, ok(item));
  } catch (e) { sendJson(res, 400, { success: false, message: "新增合同失败" }); }
});

router.put("/api/contracts/:id", async (req, res) => {
  const db = readDb();
  const idx = db.contracts.findIndex(c => c.id === req.params.id);
  if (idx === -1) return sendJson(res, 404, { success: false, message: "未找到该合同" });
  try {
    db.contracts[idx] = { ...db.contracts[idx], ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
    writeDb(db);
    sendJson(res, 200, ok(db.contracts[idx]));
  } catch (e) { sendJson(res, 400, { success: false, message: "修改合同失败" }); }
});

router.delete("/api/contracts/:id", (req, res) => {
  const db = readDb();
  const idx = db.contracts.findIndex(c => c.id === req.params.id);
  if (idx === -1) return sendJson(res, 404, { success: false, message: "未找到该合同" });
  db.contracts.splice(idx, 1);
  writeDb(db);
  sendJson(res, 200, ok({ deleted: true }));
});

export default router;
