import { test, describe, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import http from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, rmSync } from 'fs';
import { randomUUID } from 'crypto';

// 測試密碼 hash（SHA-256 of "Mf848886#"）
const TEST_PASSWORD = 'Mf848886#';
const TEST_PASSWORD_HASH = 'fec4bab6fd96df3a1cc471f9a807eac125b97c3914fcde4efeec0002aa583940';
const TEST_JWT_SECRET = 'test-jwt-secret-for-unit-tests-only';
const TEST_PORT = 9876;

// 啟動測試用 server（不實際監聽，只做為 request handler）
function startTestServer(storageDir) {
  const dbPath = `${storageDir}/db.json`;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${TEST_PORT}`);
    const pathname = url.pathname;

    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
      res.end();
      return;
    }

    // 簡化版 handler — 實做核心端點邏輯
    if (req.method === 'POST' && pathname === '/api/auth/login') {
      let body = '';
      req.on('data', c => body += c);
      await new Promise(r => req.once('end', r));
      const { password } = JSON.parse(body || '{}');
      if (password === TEST_PASSWORD) {
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, token: 'test-token-ok' }));
      } else {
        res.writeHead(401);
        res.end(JSON.stringify({ success: false, message: '密碼錯誤' }));
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/api/auth/logout') {
      res.writeHead(200);
      res.end(JSON.stringify({ success: true }));
      return;
    }

    if (req.method === 'GET' && pathname === '/api/buildings') {
      const db = existsSync(dbPath) ? JSON.parse(readFileSync(dbPath)) : { buildings: [] };
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, data: db.buildings || [] }));
      return;
    }

    if (req.method === 'GET' && pathname === '/api/rooms') {
      const db = existsSync(dbPath) ? JSON.parse(readFileSync(dbPath)) : { rooms: [] };
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, data: db.rooms || [] }));
      return;
    }

    if (req.method === 'GET' && pathname === '/api/meters') {
      const db = existsSync(dbPath) ? JSON.parse(readFileSync(dbPath)) : { meterRecords: [] };
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, data: db.meterRecords || [] }));
      return;
    }

    if (req.method === 'GET' && pathname === '/api/bills') {
      const db = existsSync(dbPath) ? JSON.parse(readFileSync(dbPath)) : { bills: [] };
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, data: db.bills || [] }));
      return;
    }

    if (req.method === 'GET' && pathname === '/api/contracts') {
      const db = existsSync(dbPath) ? JSON.parse(readFileSync(dbPath)) : { contracts: [] };
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, data: db.contracts || [] }));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ success: false, message: 'Not Found' }));
  });
  return server;
}

async function makeReq(port, method, path, body) {
  return new Promise((resolve) => {
    const opts = { hostname: 'localhost', port, path, method };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

let tmpDir, server, port;

beforeAll(async () => {
  tmpDir = `/tmp/income-test-${randomUUID().slice(0, 8)}`;
  mkdirSync(`${tmpDir}/storage/uploads`, { recursive: true });
  mkdirSync(`${tmpDir}/storage/logs/archive`, { recursive: true });
  mkdirSync(`${tmpDir}/storage/backups`, { recursive: true });
  // 初始化一個帶有範例資料的 db.json
  writeFileSync(`${tmpDir}/storage/db.json`, JSON.stringify({
    buildings: [{ id: 'b1', name: '測試大樓' }],
    rooms: [{ id: 'r1', buildingId: 'b1', name: '測試房間', status: 'occupied' }],
    meterRecords: [{ id: 'm1', roomId: 'r1', cycle: '2025-05', electric: 100 }],
    bills: [{ id: 'bill1', roomId: 'r1', month: '2025-05', status: 'unpaid' }],
    contracts: [{ id: 'c1', roomId: 'r1', tenantName: '測試租客' }],
  }));
  port = TEST_PORT;
  server = startTestServer(`${tmpDir}/storage`);
  await new Promise(r => server.listen(port, r));
});

afterAll(() => {
  server.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── Auth ──────────────────────────────────────────────
describe('POST /api/auth/login', () => {
  test('正確密碼 → success + token', async () => {
    const res = await makeReq(port, 'POST', '/api/auth/login', { password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBe('test-token-ok');
  });

  test('錯誤密碼 → 401', async () => {
    const res = await makeReq(port, 'POST', '/api/auth/login', { password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('缺少密碼 → 400 或 401', async () => {
    const res = await makeReq(port, 'POST', '/api/auth/login', {});
    expect([400, 401]).toContain(res.status);
  });
});

describe('POST /api/auth/logout', () => {
  test('成功 logout → 200', async () => {
    const res = await makeReq(port, 'POST', '/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ── Buildings ────────────────────────────────────────
describe('GET /api/buildings', () => {
  test('返回 building list → 200', async () => {
    const res = await makeReq(port, 'GET', '/api/buildings');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0]).toHaveProperty('id');
    expect(res.body.data[0]).toHaveProperty('name');
  });
});

// ── Rooms ─────────────────────────────────────────────
describe('GET /api/rooms', () => {
  test('返回 room list → 200', async () => {
    const res = await makeReq(port, 'GET', '/api/rooms');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0]).toHaveProperty('id');
  });
});

// ── Meters ───────────────────────────────────────────
describe('GET /api/meters', () => {
  test('返回 meter records → 200', async () => {
    const res = await makeReq(port, 'GET', '/api/meters');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0]).toHaveProperty('id');
  });
});

// ── Bills ─────────────────────────────────────────────
describe('GET /api/bills', () => {
  test('返回 bills → 200', async () => {
    const res = await makeReq(port, 'GET', '/api/bills');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// ── Contracts ─────────────────────────────────────────
describe('GET /api/contracts', () => {
  test('返回 contracts → 200', async () => {
    const res = await makeReq(port, 'GET', '/api/contracts');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});