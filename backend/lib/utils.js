// ── Utility Functions ──
import { createHash } from "node:crypto";

export const host = process.env.HOST || "0.0.0.0";
export const port = Number(process.env.PORT || 8788);
export const appOrigin = process.env.APP_ORIGIN || "";
export const apiAllowedOrigins = String(process.env.API_ALLOWED_ORIGINS || appOrigin || (process.env.NODE_ENV === "development" ? "http://localhost:8080" : ""))
  .split(",").map(x => x.trim()).filter(Boolean);

export function sendJson(response, statusCode, payload) {
  const reqOrigin = String(response.req?.headers?.origin || "");
  const originAllowed = apiAllowedOrigins.includes("*") || (reqOrigin && apiAllowedOrigins.some(a => reqOrigin === a));
  const finalOrigin = originAllowed ? reqOrigin || appOrigin : appOrigin;
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": finalOrigin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

export function parseBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    const MAX_BODY_SIZE = Number(process.env.MAX_BODY_SIZE || 1_000_000);
    request.on("data", chunk => { raw += chunk.toString(); if (raw.length > MAX_BODY_SIZE) request.destroy(); });
    request.on("end", () => {
      if (!raw) return resolve({});
      if (raw.length > MAX_BODY_SIZE) { request.destroy(); reject(new Error("Request body too large")); return; }
      try { resolve(JSON.parse(raw)); } catch (err) { reject(err); }
    });
    request.on("error", err => reject(err || new Error("Request error")));
  });
}

export function ok(data) { return { success: true, data }; }

export function createToken(value) { return createHash("sha256").update(value).digest("hex"); }

export function toMaskedIp(raw = "") {
  if (!raw) return "unknown";
  const clean = raw.replace(/^::ffff:/, "");
  const parts = clean.split(".");
  return parts.length === 4 ? parts.slice(0, 2).join(".") + ".*.*" : clean.slice(0, Math.max(clean.indexOf(":") > 0 ? clean.indexOf(":") : 4)) + "*";
}

export function normalizePhone(value = "") { return String(value || "").replace(/[\s-]/g, ""); }

export function isValidCnPhone(value = "") { return /^1\d{10}$/.test(normalizePhone(value)); }

export function normalizeRoomKey(value = "") { return String(value || "").replace(/\s+/g, "").toUpperCase(); }

export function makeTenantRoomKey(building = "", room = "") {
  const b = String(building || "").trim();
  const r = String(room || "").trim();
  if (!b && !r) return "";
  if (!b) return r;
  return `${b}::${r}`;
}

export function makePropertyRoomKey(building = "", room = "") {
  return normalizeRoomKey(`${building || ""} ${room || ""}`);
}

export function safeFilename(filename = "") {
  return String(filename || "").replace(/[<>:"/\|?*]/g, "_").replace(/\s+/g, "_").slice(0, 200);
}

export function parseCycleLike(value) {
  const v = String(value || "").trim();
  if (/^\d{4}-\d{2}$/.test(v)) return v;
  const m = v.match(/(\d{4})[/-]?(\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}`;
  return v;
}

export function toPositiveInt(value, fallback = 0) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function parseDateLike(value) {
  const v = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : v;
}

export function parseLogDateFromFilename(filename = "") {
  const m = String(filename || "").match(/runtime-(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

// ── Room text normalization ──
export function normalizeRoomText(value) {
  return String(value || "").replace(/[-\s]+/g, "").replace(/（/g, "(").replace(/）/g, ")").toUpperCase();
}
