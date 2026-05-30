import { Router } from "express";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readDb, writeDb, backupDir, addAuditLog } from "../lib/db.js";
import { sendJson, ok } from "../lib/utils.js";
const router = Router();

router.post("/api/backup/create", async (req, res) => {
  try {
    const db = readDb();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const target = path.join(backupDir, `db.backup.${stamp}.json`);
    writeFileSync(target, JSON.stringify(db, null, 2), "utf8");
    addAuditLog(db, "backup.created", { file: target }, (db.user || {}).username || "admin");
    writeDb(db);
    sendJson(res, 200, ok({ path: target, size: statSync(target).size }));
  } catch (e) { sendJson(res, 400, { success: false, message: "备份失败" }); }
});

router.get("/api/backup/list", (req, res) => {
  if (!existsSync(backupDir)) return sendJson(res, 200, ok([]));
  const files = readdirSync(backupDir).filter(name => /^db\.(backup|manual|rollback|pre-restore)\..+\.json$/.test(String(name))).sort((a, b) => b.localeCompare(a)).slice(0, 100);
  const list = files.map(name => {
    const fullPath = path.join(backupDir, name);
    try { const s = statSync(fullPath); return { name, size: s.size, mtime: s.mtime.toISOString() }; } catch { return { name, size: 0, mtime: "" }; }
  });
  sendJson(res, 200, ok(list));
});

router.post("/api/backup/restore", async (req, res) => {
  try {
    const body = req.body;
    const fileName = String(body.file || "").trim();
    if (!fileName) return sendJson(res, 400, { success: false, message: "请指定备份文件" });
    const abs = path.isAbsolute(fileName) ? fileName : path.join(backupDir, fileName);
    if (!existsSync(abs)) return sendJson(res, 404, { success: false, message: "备份文件不存在" });
    const raw = readFileSync(abs, "utf8");
    const freshDb = JSON.parse(raw);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    writeFileSync(path.join(backupDir, `db.pre-restore.${stamp}.json`), JSON.stringify(readDb(), null, 2), "utf8");
    addAuditLog(freshDb, "backup.restored", { file: abs }, freshDb.user?.username || "admin");
    writeDb(freshDb);
    sendJson(res, 200, ok({ restored: true, file: abs }));
  } catch (e) { sendJson(res, 400, { success: false, message: "恢复失败: " + (e.message || "") }); }
});

export default router;
