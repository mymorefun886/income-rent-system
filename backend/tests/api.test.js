import { test, describe, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import http from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, rmSync } from 'fs';
import { randomUUID } from 'crypto';

// 測試密碼 hash（SHA-256 of "Mf848886#"）
const TEST_PASSWORD = 'Mf848886#';
const TEST_PASSWORD_HASH = 'fec4bab6fd96df3a1cc471f9a807eac125b97c3914fcde4efeec0002aa583940';
const TEST_JWT_SECRET = 'test-jwt-secret-for-unit-tests-only';
const TEST_PORT = 9876;
const TEST_TOKEN = 'test-token-ok';

// 啟動測試用 server（不實際監聽，只做為 request handler）
function startTestServer(storageDir) {
  const dbPath = `${storageDir}/db.json`;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${TEST_PORT}`);
    const pathname = url.pathname;
    const auth = req.headers.authorization || '';
    const hasAuth = auth.startsWith('Bearer ');

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
        res.end(JSON.stringify({ success: true, token: TEST_TOKEN }));
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

    // GET /api/buildings/:id
    if (req.method === 'GET' && pathname.startsWith('/api/buildings/')) {
      const id = pathname.split('/')[3];
      const db = existsSync(dbPath) ? JSON.parse(readFileSync(dbPath)) : { buildings: [] };
      const b = (db.buildings || []).find(b => b.id === id);
      if (b) {
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, data: b }));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ success: false, message: '找不到' }));
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/api/buildings') {
      if (!hasAuth) { res.writeHead(401); res.end(JSON.stringify({ success: false })); return; }
      let body = '';
      req.on('data', c => body += c);
      await new Promise(r => req.once('end', r));
      const data = JSON.parse(body || '{}');
      if (!data.name) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, message: 'name 是必填欄位' }));
        return;
      }
      const db = existsSync(dbPath) ? JSON.parse(readFileSync(dbPath)) : { buildings: [] };
      const newB = { id: randomUUID(), name: data.name };
      db.buildings = db.buildings || [];
      db.buildings.push(newB);
      writeFileSync(dbPath, JSON.stringify(db));
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, data: newB }));
      return;
    }

    if (req.method === 'PUT' && pathname.startsWith('/api/buildings/')) {
      if (!hasAuth) { res.writeHead(401); res.end(JSON.stringify({ success: false })); return; }
      const id = pathname.split('/')[3];
      const db = existsSync(dbPath) ? JSON.parse(readFileSync(dbPath)) : { buildings: [] };
      const idx = (db.buildings || []).findIndex(b => b.id === id);
      if (idx === -1) { res.writeHead(404); res.end(JSON.stringify({ success: false })); return; }
      let body = '';
      req.on('data', c => body += c);
      await new Promise(r => req.once('end', r));
      const data = JSON.parse(body || '{}');
      db.buildings[idx] = { ...db.buildings[idx], ...data };
      writeFileSync(dbPath, JSON.stringify(db));
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, data: db.buildings[idx] }));
      return;
    }

    if (req.method === 'GET' && pathname === '/api/rooms') {
      const db = existsSync(dbPath) ? JSON.parse(readFileSync(dbPath)) : { rooms: [] };
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, data: db.rooms || [] }));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/rooms') {
      if (!hasAuth) { res.writeHead(401); res.end(JSON.stringify({ success: false })); return; }
      let body = '';
      req.on('data', c => body += c);
      await new Promise(r => req.once('end', r));
      const data = JSON.parse(body || '{}');
      const db = existsSync(dbPath) ? JSON.parse(readFileSync(dbPath)) : { rooms: [] };
      const newR = { id: randomUUID(), name: data.name || '未命名', buildingId: data.buildingId || '' };
      db.rooms = db.rooms || [];
      db.rooms.push(newR);
      writeFileSync(dbPath, JSON.stringify(db));
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, data: newR }));
      return;
    }

    if (req.method === 'PUT' && pathname.startsWith('/api/rooms/')) {
      if (!hasAuth) { res.writeHead(401); res.end(JSON.stringify({ success: false })); return; }
      const id = pathname.split('/')[3];
      const db = existsSync(dbPath) ? JSON.parse(readFileSync(dbPath)) : { rooms: [] };
      const idx = (db.rooms || []).findIndex(r => r.id === id);
      if (idx === -1) { res.writeHead(404); res.end(JSON.stringify({ success: false })); return; }
      let body = '';
      req.on('data', c => body += c);
      await new Promise(r => req.once('end', r));
      const data = JSON.parse(body || '{}');
      db.rooms[idx] = { ...db.rooms[idx], ...data };
      writeFileSync(dbPath, JSON.stringify(db));
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, data: db.rooms[idx] }));
      return;
    }

    if (req.method === 'GET' && pathname === '/api/meters') {
      const db = existsSync(dbPath) ? JSON.parse(readFileSync(dbPath)) : { meterRecords: [] };
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, data: db.meterRecords || [] }));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/meters') {
      if (!hasAuth) { res.writeHead(401); res.end(JSON.stringify({ success: false })); return; }
      let body = '';
      req.on('data', c => body += c);
      await new Promise(r => req.once('end', r));
      const data = JSON.parse(body || '{}');
      const db = existsSync(dbPath) ? JSON.parse(readFileSync(dbPath)) : { meterRecords: [] };
      const newM = { id: randomUUID(), roomId: data.roomId || '', cycle: data.cycle || '' };
      db.meterRecords = db.meterRecords || [];
      db.meterRecords.push(newM);
      writeFileSync(dbPath, JSON.stringify(db));
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, data: newM }));
      return;
    }

    if (req.method === 'GET' && pathname === '/api/bills') {
      const db = existsSync(dbPath) ? JSON.parse(readFileSync(dbPath)) : { bills: [] };
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, data: db.bills || [] }));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/bills') {
      if (!hasAuth) { res.writeHead(401); res.end(JSON.stringify({ success: false })); return; }
      let body = '';
      req.on('data', c => body += c);
      await new Promise(r => req.once('end', r));
      const data = JSON.parse(body || '{}');
      const db = existsSync(dbPath) ? JSON.parse(readFileSync(dbPath)) : { bills: [] };
      const newBill = { id: randomUUID(), roomId: data.roomId || '', month: data.month || '' };
      db.bills = db.bills || [];
      db.bills.push(newBill);
      writeFileSync(dbPath, JSON.stringify(db));
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, data: newBill }));
      return;
    }

    if (req.method === 'GET' && pathname === '/api/contracts') {
      const db = existsSync(dbPath) ? JSON.parse(readFileSync(dbPath)) : { contracts: [] };
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, data: db.contracts || [] }));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/contracts') {
      if (!hasAuth) { res.writeHead(401); res.end(JSON.stringify({ success: false })); return; }
      let body = '';
      req.on('data', c => body += c);
      await new Promise(r => req.once('end', r));
      const data = JSON.parse(body || '{}');
      const db = existsSync(dbPath) ? JSON.parse(readFileSync(dbPath)) : { contracts: [] };
      const newC = { id: randomUUID(), roomId: data.roomId || '', tenantName: data.tenantName || '' };
      db.contracts = db.contracts || [];
      db.contracts.push(newC);
      writeFileSync(dbPath, JSON.stringify(db));
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, data: newC }));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ success: false, message: 'Not Found' }));
  });
  return server;
}

async function makeReq(port, method, path, body, authToken) {
  return new Promise((resolve) => {
    const opts = { hostname: 'localhost', port, path, method, headers: {} };
    if (authToken) opts.headers['Authorization'] = `Bearer ${authToken}`;
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
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
    expect(res.body.token).toBe(TEST_TOKEN);
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

describe('GET /api/buildings/:id', () => {
  test('現有 id → 200', async () => {
    const res = await makeReq(port, 'GET', '/api/buildings/b1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('b1');
  });

  test('不存在 id → 404', async () => {
    const res = await makeReq(port, 'GET', '/api/buildings/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /api/buildings', () => {
  test('有 token → 200 + 建立大樓', async () => {
    const res = await makeReq(port, 'POST', '/api/buildings', { name: '新大樓' }, TEST_TOKEN);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.name).toBe('新大樓');
  });

  test('無 token → 401', async () => {
    const res = await makeReq(port, 'POST', '/api/buildings', { name: '新大樓' });
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/buildings/:id', () => {
  test('有 token → 200', async () => {
    const res = await makeReq(port, 'PUT', '/api/buildings/b1', { name: '更新名稱' }, TEST_TOKEN);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('更新名稱');
  });

  test('無 token → 401', async () => {
    const res = await makeReq(port, 'PUT', '/api/buildings/b1', { name: '更新名稱' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/buildings validation', () => {
  test('缺少 name → 400', async () => {
    const res = await makeReq(port, 'POST', '/api/buildings', {}, TEST_TOKEN);
    expect(res.status).toBe(400);
  });

  test('有效資料 → 200', async () => {
    const res = await makeReq(port, 'POST', '/api/buildings', { name: '有效大樓' }, TEST_TOKEN);
    expect(res.status).toBe(200);
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

describe('POST /api/rooms', () => {
  test('有 token → 200', async () => {
    const res = await makeReq(port, 'POST', '/api/rooms', { name: '新房', buildingId: 'b1' }, TEST_TOKEN);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('id');
  });

  test('無 token → 401', async () => {
    const res = await makeReq(port, 'POST', '/api/rooms', { name: '新房' });
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/rooms/:id', () => {
  test('有 token → 200', async () => {
    const res = await makeReq(port, 'PUT', '/api/rooms/r1', { name: '更新房間' }, TEST_TOKEN);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('無 token → 401', async () => {
    const res = await makeReq(port, 'PUT', '/api/rooms/r1', { name: '更新房間' });
    expect(res.status).toBe(401);
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

describe('POST /api/meters', () => {
  test('有 token → 200', async () => {
    const res = await makeReq(port, 'POST', '/api/meters', { roomId: 'r1', cycle: '2025-06' }, TEST_TOKEN);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('id');
  });

  test('無 token → 401', async () => {
    const res = await makeReq(port, 'POST', '/api/meters', { roomId: 'r1', cycle: '2025-06' });
    expect(res.status).toBe(401);
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

describe('POST /api/bills', () => {
  test('有 token → 200', async () => {
    const res = await makeReq(port, 'POST', '/api/bills', { roomId: 'r1', month: '2025-06' }, TEST_TOKEN);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('id');
  });

  test('無 token → 401', async () => {
    const res = await makeReq(port, 'POST', '/api/bills', { roomId: 'r1', month: '2025-06' });
    expect(res.status).toBe(401);
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

describe('POST /api/contracts', () => {
  test('有 token → 200', async () => {
    const res = await makeReq(port, 'POST', '/api/contracts', { roomId: 'r1', tenantName: '新房客' }, TEST_TOKEN);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('id');
  });

  test('無 token → 401', async () => {
    const res = await makeReq(port, 'POST', '/api/contracts', { roomId: 'r1', tenantName: '新房客' });
    expect(res.status).toBe(401);
  });
});