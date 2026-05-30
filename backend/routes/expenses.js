import { Router } from "express";
import { randomUUID } from "node:crypto";
import { readDb, writeDb } from "../lib/db.js";
import { sendJson, ok } from "../lib/utils.js";
const router = Router();

router.get("/api/expenses", (req, res) => {
  const db = readDb();
  let list = db.expenses;
  if (req.query.period) list = list.filter(e => String(e.period || "") === String(req.query.period).trim());
  if (req.query.category) list = list.filter(e => String(e.category || "") === String(req.query.category).trim());
  if (req.query.startDate) list = list.filter(e => String(e.date || "") >= String(req.query.startDate).trim());
  if (req.query.endDate) list = list.filter(e => String(e.date || "") <= String(req.query.endDate).trim());
  sendJson(res, 200, ok(list));
});

router.post("/api/expenses", async (req, res) => {
  try {
    const body = req.body;
    const amount = Number(body.amount || 0);
    if (!String(body.date || "").trim()) return sendJson(res, 400, { success: false, message: "支出日期必填" });
    if (!String(body.category || "").trim()) return sendJson(res, 400, { success: false, message: "支出分类必填" });
    if (!Number.isFinite(amount) || amount <= 0) return sendJson(res, 400, { success: false, message: "支出金额必须大于 0" });
    const db = readDb();
    const item = { id: `exp-${randomUUID()}`, date: String(body.date || "").trim(), period: String(body.period || "").trim(), propertyId: String(body.propertyId || "").trim(), propertyLabel: String(body.propertyLabel || "").trim(), room: String(body.room || "").trim(), category: String(body.category || "").trim(), amount, payee: String(body.payee || "").trim(), paymentMethod: String(body.paymentMethod || "").trim(), allocationMode: String(body.allocationMode || "single").trim(), sharedByRooms: Array.isArray(body.sharedByRooms) ? body.sharedByRooms.map(x => String(x || "").trim()).filter(Boolean) : [], sourceBillId: String(body.sourceBillId || "").trim(), workOrderId: String(body.workOrderId || "").trim(), invoiceNo: String(body.invoiceNo || "").trim(), note: String(body.note || "").trim(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    db.expenses.unshift(item);
    writeDb(db);
    sendJson(res, 200, ok(item));
  } catch (e) { sendJson(res, 400, { success: false, message: "新增支出失败" }); }
});

router.put("/api/expenses/:id", async (req, res) => {
  const db = readDb();
  const idx = db.expenses.findIndex(e => e.id === req.params.id);
  if (idx === -1) return sendJson(res, 404, { success: false, message: "未找到该支出" });
  try {
    const body = req.body;
    db.expenses[idx] = { ...db.expenses[idx], ...body, id: req.params.id, updatedAt: new Date().toISOString() };
    writeDb(db);
    sendJson(res, 200, ok(db.expenses[idx]));
  } catch (e) { sendJson(res, 400, { success: false, message: "修改支出失败" }); }
});

router.delete("/api/expenses/:id", (req, res) => {
  const db = readDb();
  const idx = db.expenses.findIndex(e => e.id === req.params.id);
  if (idx === -1) return sendJson(res, 404, { success: false, message: "未找到该支出" });
  db.expenses.splice(idx, 1);
  writeDb(db);
  sendJson(res, 200, ok({ deleted: true }));
});

export default router;
