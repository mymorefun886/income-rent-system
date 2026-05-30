// ── Auth Routes ──
import { Router } from "express";
import { timingSafeEqual, randomBytes, createHmac } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readDb, writeDb, writeRuntimeLog, addAuditLog } from "../lib/db.js";
import { sendJson, ok, createToken, toMaskedIp } from "../lib/utils.js";

const router = Router();

const username = process.env.ADMIN_USERNAME || "morefun886";
const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH || "";
const jwtSecret = process.env.JWT_SECRET || "";
const loginMaxAttempts = Number(process.env.LOGIN_MAX_ATTEMPTS || 8);
const loginLockMinutes = Number(process.env.LOGIN_LOCK_MINUTES || 15);
const sessionsPath = path.join(process.env.STORAGE_DIR || path.join(process.cwd(), "storage"), "sessions.json");

const authSessions = new Map();
const loginAttempts = new Map();
let sessionCleanupTimer = null;

function loadSessions() {
  try {
    if (existsSync(sessionsPath)) {
      const raw = readFileSync(sessionsPath, "utf8");
      const data = JSON.parse(raw);
      if (Array.isArray(data)) data.forEach(s => { if (s.token) authSessions.set(s.token, s); });
    }
  } catch {}
}

function saveSessions() {
  try { writeFileSync(sessionsPath, JSON.stringify([...authSessions.values()], null, 2), "utf8"); } catch {}
}

function hashPassword(password, salt) {
  return createHmac("sha256", salt).update(password).digest("hex");
}

function verifyPassword(raw) {
  const parts = String(adminPasswordHash || "").split(":");
  if (parts.length < 2) return false;
  const salt = parts[0];
  const storedHash = parts.slice(1).join(":");
  if (!salt || !storedHash) return false;
  return timingSafeEqual(Buffer.from(hashPassword(raw, salt)), Buffer.from(storedHash));
}

function mintSessionToken(userName) {
  const token = `sess-${randomBytes(24).toString("hex")}`;
  const session = { token, userName, createdAt: Date.now(), lastAccess: Date.now() };
  authSessions.set(token, session);
  saveSessions();
  return token;
}

function isLoginLocked(ip) {
  const record = loginAttempts.get(ip);
  if (!record) return false;
  if (Date.now() - record.lockedAt > loginLockMinutes * 60 * 1000) {
    loginAttempts.delete(ip);
    return false;
  }
  return record.count >= loginMaxAttempts;
}

function registerLoginFailure(ip) {
  const record = loginAttempts.get(ip) || { count: 0, lockedAt: 0 };
  record.count++;
  if (record.count >= loginMaxAttempts) record.lockedAt = Date.now();
  loginAttempts.set(ip, record);
}

function clearLoginFailures(ip) { loginAttempts.delete(ip); }

function getAuthToken(request) {
  const header = String(request.headers?.authorization || "");
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function isAuthed(request) {
  const token = getAuthToken(request);
  if (!token) return false;
  const session = authSessions.get(token);
  if (!session) return false;
  session.lastAccess = Date.now();
  return true;
}

function startSessionCleanup() {
  if (sessionCleanupTimer) clearInterval(sessionCleanupTimer);
  sessionCleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [token, s] of authSessions) {
      if (now - s.lastAccess > 24 * 60 * 60 * 1000) authSessions.delete(token);
    }
    saveSessions();
  }, 60 * 60 * 1000);
}

// Load sessions on startup
loadSessions();
startSessionCleanup();

// OPTIONS handler for CORS
export default router;
