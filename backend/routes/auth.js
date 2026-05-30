// ── Auth Routes ──
import { Router } from "express";
import { randomBytes, timingSafeEqual, createHmac } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readDb, writeDb } from "../lib/db.js";
import { sendJson, ok, createToken, toMaskedIp } from "../lib/utils.js";

const router = Router();
const username = process.env.ADMIN_USERNAME || "morefun886";
const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH || "";
const loginMaxAttempts = Number(process.env.LOGIN_MAX_ATTEMPTS || 8);
const loginLockMinutes = Number(process.env.LOGIN_LOCK_MINUTES || 15);
const sessionsPath = path.join(process.env.STORAGE_DIR || path.join(process.cwd(), "storage"), "sessions.json");
const authSessions = new Map();
const loginAttempts = new Map();
let sessionCleanupTimer = null;

function loadSessions() { try { if (existsSync(sessionsPath)) { JSON.parse(readFileSync(sessionsPath, "utf8")).forEach(s => { if (s.token) authSessions.set(s.token, s); }); } } catch {} }
function saveSessions() { try { writeFileSync(sessionsPath, JSON.stringify([...authSessions.values()], null, 2), "utf8"); } catch {} }
function hashPassword(password, salt) { return createHmac("sha256", salt).update(password).digest("hex"); }
function verifyPassword(raw) { const parts = String(adminPasswordHash || "").split(":"); if (parts.length < 2) return false; const salt = parts[0]; const storedHash = parts.slice(1).join(":"); if (!salt || !storedHash) return false; return timingSafeEqual(Buffer.from(hashPassword(raw, salt)), Buffer.from(storedHash)); }
function mintSessionToken(userName) { const token = `sess-${randomBytes(24).toString("hex")}`; authSessions.set(token, { token, userName, createdAt: Date.now(), lastAccess: Date.now() }); saveSessions(); return token; }
function isLoginLocked(ip) { const r = loginAttempts.get(ip); if (!r) return false; if (Date.now() - r.lockedAt > loginLockMinutes * 60 * 1000) { loginAttempts.delete(ip); return false; } return r.count >= loginMaxAttempts; }
function registerLoginFailure(ip) { const r = loginAttempts.get(ip) || { count: 0, lockedAt: 0 }; r.count++; if (r.count >= loginMaxAttempts) r.lockedAt = Date.now(); loginAttempts.set(ip, r); }
function clearLoginFailures(ip) { loginAttempts.delete(ip); }
function getAuthToken(request) { const m = String(request.headers?.authorization || "").match(/^Bearer\s+(.+)$/i); return m ? m[1] : null; }
function isAuthed(request) { const token = getAuthToken(request); if (!token) return false; const s = authSessions.get(token); if (!s) return false; s.lastAccess = Date.now(); return true; }

function startSessionCleanup() {
  if (sessionCleanupTimer) clearInterval(sessionCleanupTimer);
  sessionCleanupTimer = setInterval(() => { const now = Date.now(); for (const [t, s] of authSessions) { if (now - s.lastAccess > 86400000) authSessions.delete(t); } saveSessions(); }, 3600000);
}

loadSessions(); startSessionCleanup();

// POST /api/auth/login
router.post("/api/auth/login", (req, res) => {
  try {
    const ip = toMaskedIp(req.ip || req.socket?.remoteAddress || "");
    if (isLoginLocked(ip)) return sendJson(res, 429, { success: false, message: "登录尝试过多，请稍后再试" });
    const inputUser = String(req.body?.username || "").trim();
    const inputPass = String(req.body?.password || "").trim();
    if (!inputUser || !inputPass) return sendJson(res, 400, { success: false, message: "用户名和密码不能为空" });
    if (inputUser !== username || !verifyPassword(inputPass)) { registerLoginFailure(ip); return sendJson(res, 401, { success: false, message: "用户名或密码错误" }); }
    clearLoginFailures(ip);
    const token = mintSessionToken(inputUser);
    const db = readDb();
    sendJson(res, 200, { success: true, data: { token, user: { id: "admin", username: inputUser, name: db.user?.name || inputUser, role: db.user?.role || "admin" } } });
  } catch (e) { sendJson(res, 400, { success: false, message: "登录失败" }); }
});

router.post("/api/auth/logout", (req, res) => {
  const token = getAuthToken(req);
  if (token) authSessions.delete(token);
  saveSessions();
  sendJson(res, 200, ok({ loggedOut: true }));
});

router.get("/api/auth/me", (req, res) => {
  if (!isAuthed(req)) return sendJson(res, 401, { success: false, message: "未登录" });
  const db = readDb();
  sendJson(res, 200, ok({ username: db.user?.username || username, name: db.user?.name || "", role: db.user?.role || "admin" }));
});

export default router;
