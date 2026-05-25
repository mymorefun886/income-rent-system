/**
 * server.test.js — 真實 server.js handler 集成測試
 *
 * 策略：直接 import server.js 導出的 handler，掛到測試專用 HTTP server。
 * 不需要啟動真實 server，繞過 isMain 邏輯，直接測試業務邏輯。
 *
 * env: vitest-setup.js 預先設定 JWT_SECRET + ADMIN_PASSWORD_HASH + ADMIN_USERNAME
 */
import { test, describe, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import http from 'node:http';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';

const TEST_PORT = 9876;
const TEST_PASSWORD = 'Mf848886#';

let tmpDir;
let server;

async function makeReq(method, path, body, token) {
  return new Promise((resolve) => {
    const opts = {
      hostname: 'localhost',
      port: TEST_PORT,
      path,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, headers: res.headers, body: data }); }
      });
    });
    req.on('error', (e) => resolve({ status: 0, body: e.message }));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function login(username = 'testadmin', password = TEST_PASSWORD) {
  const res = await makeReq('POST', '/api/auth/login', { username, password });
  if (res.status === 200 && res.headers['set-cookie']) {
    const cookies = Array.isArray(res.headers['set-cookie']) ? res.headers['set-cookie'] : [res.headers['set-cookie']];
    const sessionCookie = cookies.find(c => c.startsWith('income-session='));
    const match = sessionCookie ? sessionCookie.match(/^income-session=([^;]+)/) : null;
    return match ? match[1] : null;
  }
  return null;
}

beforeAll(async () => {
  tmpDir = `/tmp/income-test-${randomUUID().slice(0, 8)}`;
  mkdirSync(`${tmpDir}/storage/uploads`, { recursive: true });
  mkdirSync(`${tmpDir}/storage/logs/archive`, { recursive: true });
  mkdirSync(`${tmpDir}/storage/backups`, { recursive: true });

  writeFileSync(`${tmpDir}/storage/db.json`, JSON.stringify({
    user: {
      id: 'u-001',
      username: 'testadmin',
      name: '測試管理員',
      role: '房東管理員',
      portfolio: '測試環境',
    },
    properties: [],
    tenants: [],
    records: [],
    expenses: [],
    uploads: [],
    meterTasks: [],
    messageLogs: [],
    contracts: [],
    reminders: [],
    roomInventories: [],
    roomInventorySnapshots: [],
    auditLogs: [],
    entityVersions: [],
    importReports: [],
    runtimeLogs: [],
    workOrders: [],
    profitAlerts: [],
    settings: {},
  }, null, 2));

  process.env.STORAGE_DIR = `${tmpDir}/storage`;

  const { handler } = await import('../server.js');
  server = http.createServer(handler);
  await new Promise(r => server.listen(TEST_PORT, r));
});

afterAll(async () => {
  server.close();
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.STORAGE_DIR;
});

// ── Auth ──────────────────────────────────────────────
describe('POST /api/auth/login', () => {
  test('正確密碼 → 200 + cookie', async () => {
    const res = await makeReq('POST', '/api/auth/login', { username: 'testadmin', password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user).toBeDefined();
    expect(res.headers['set-cookie']).toBeDefined();
  });

  test('錯誤密碼 → 401', async () => {
    const res = await makeReq('POST', '/api/auth/login', { username: 'testadmin', password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  test('缺少密碼 → 400', async () => {
    const res = await makeReq('POST', '/api/auth/login', {});
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/logout', () => {
  test('未登入也回 200', async () => {
    const res = await makeReq('POST', '/api/auth/logout');
    expect(res.status).toBe(200);
  });
});

// ── Auth required middleware ──────────────────────────
describe('Auth required for /api/*', () => {
  test('GET /api/properties 無 token → 401', async () => {
    const res = await makeReq('GET', '/api/properties');
    expect(res.status).toBe(401);
  });

  test('GET /api/health 無 token → 200 (白名單)', async () => {
    const res = await makeReq('GET', '/api/health');
    expect(res.status).toBe(200);
  });
});

// ── Properties CRUD ───────────────────────────────────
describe('POST /api/properties', () => {
  let token;
  beforeEach(async () => { token = await login(); });

  test('有 token → 200', async () => {
    const res = await makeReq('POST', '/api/properties', { name: '測試大樓A' }, token);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.name).toBe('測試大樓A');
  });

  test('無 token → 401', async () => {
    const res = await makeReq('POST', '/api/properties', { name: '新大樓' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/properties (list)', () => {
  let token;
  beforeEach(async () => { token = await login(); });

  test('有 token → 200 + 陣列', async () => {
    const res = await makeReq('GET', '/api/properties', null, token);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('無 token → 401', async () => {
    const res = await makeReq('GET', '/api/properties');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/properties/:id', () => {
  let token, propId;
  beforeEach(async () => {
    token = await login();
    const res = await makeReq('POST', '/api/properties', { name: '查詢測試' }, token);
    propId = res.body?.data?.id;
  });

  test('不存在的 id + token → 404', async () => {
    const res = await makeReq('GET', '/api/properties/nonexistent-id', null, token);
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/properties/:id', () => {
  let token, propId;
  beforeEach(async () => {
    token = await login();
    const res = await makeReq('POST', '/api/properties', { name: '更新前' }, token);
    propId = res.body?.data?.id;
  });

  test('有 token → 200', async () => {
    const res = await makeReq('PUT', `/api/properties/${propId}`, { name: '更新後' }, token);
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('更新後');
  });

  test('無 token → 401', async () => {
    const res = await makeReq('PUT', `/api/properties/${propId}`, { name: '名稱' });
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/properties/:id', () => {
  test('有 token → 200', async () => {
    const token = await login();
    const created = await makeReq('POST', '/api/properties', { name: '待刪除' }, token);
    const propId = created.body?.data?.id;
    const res = await makeReq('DELETE', `/api/properties/${propId}`, null, token);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(propId);
  });
});

// ── Room Inventory ────────────────────────────────────
describe('POST /api/room-inventory', () => {
  let token;
  beforeEach(async () => { token = await login(); });

  test('有 token → 200', async () => {
    const res = await makeReq('POST', '/api/room-inventory', {
      building: '測試大樓',
      room: '101',
      items: [{ name: '床', condition: '良好' }],
    }, token);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBeDefined();
  });

  test('無 token → 401', async () => {
    const res = await makeReq('POST', '/api/room-inventory', { building: '大樓', room: '102' });
    expect(res.status).toBe(401);
  });
});

// ── Tenants ───────────────────────────────────────────
describe('POST /api/tenants', () => {
  let token;
  beforeEach(async () => { token = await login(); });

  test('有 token + valid phone → 200', async () => {
    const res = await makeReq('POST', '/api/tenants', {
      name: '王小明',
      phone: '13800138000',
      building: '測試大樓',
      room: '101',
    }, token);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.name).toBe('王小明');
  });

  test('無效 phone → 400', async () => {
    const res = await makeReq('POST', '/api/tenants', {
      name: '張三',
      phone: '12345',
    }, token);
    expect(res.status).toBe(400);
  });

  test('無 token → 401', async () => {
    const res = await makeReq('POST', '/api/tenants', { name: '李四', phone: '13900139000' });
    expect(res.status).toBe(401);
  });
});

// ── Contracts ─────────────────────────────────────────
describe('POST /api/contracts', () => {
  let token, tenantId;
  beforeEach(async () => {
    token = await login();
    const tRes = await makeReq('POST', '/api/tenants', {
      name: '合約測試租客',
      phone: '13700137000',
      building: '合約大樓',
      room: '201',
    }, token);
    tenantId = tRes.body?.data?.id;
  });

  test('有 token + valid tenantId → 200', async () => {
    const res = await makeReq('POST', '/api/contracts', {
      tenantId,
      rent: 15000,
      deposit: 30000,
      startDate: '2025-01-01',
      endDate: '2025-12-31',
    }, token);
    expect(res.status).toBe(200);
    expect(res.body.data.tenantId).toBe(tenantId);
  });

  test('無 token → 401', async () => {
    const res = await makeReq('POST', '/api/contracts', { tenantId });
    expect(res.status).toBe(401);
  });
});

// ── Records (租金記錄) ────────────────────────────────
describe('POST /api/records', () => {
  let token;
  beforeEach(async () => { token = await login(); });

  test('有 token → 200', async () => {
    const res = await makeReq('POST', '/api/records', {
      month: '2025-06',
      rent: 15000,
      building: '測試大樓',
      room: '101',
    }, token);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBeDefined();
  });

  test('無 token → 401', async () => {
    const res = await makeReq('POST', '/api/records', { month: '2025-06' });
    expect(res.status).toBe(401);
  });
});

// ── Expenses ──────────────────────────────────────────
describe('POST /api/expenses', () => {
  let token;
  beforeEach(async () => { token = await login(); });

  test('有 token + 完整資料 → 200', async () => {
    const res = await makeReq('POST', '/api/expenses', {
      date: '2025-06-15',
      category: '維修',
      amount: 5000,
      note: '水管維修',
    }, token);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBeDefined();
  });

  test('缺少 category → 400', async () => {
    const res = await makeReq('POST', '/api/expenses', {
      date: '2025-06-15',
      amount: 5000,
    }, token);
    expect(res.status).toBe(400);
  });

  test('無 token → 401', async () => {
    const res = await makeReq('POST', '/api/expenses', { date: '2025-06-15', category: '維修', amount: 500 });
    expect(res.status).toBe(401);
  });
});

// ── Rate Limit ────────────────────────────────────────
describe('Rate limiting headers', () => {
  test('回應包含 rate limit headers', async () => {
    const res = await makeReq('GET', '/api/health');
    expect(res.headers['x-ratelimit-limit']).toBeDefined();
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
  });
});

// ── Security Headers ─────────────────────────────────
describe('Security headers', () => {
  test('回應包含 security headers', async () => {
    const res = await makeReq('GET', '/api/health');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
  });
});

// ── CORS ──────────────────────────────────────────────
describe('CORS preflight', () => {
  test('OPTIONS → 204 + CORS headers', async () => {
    const res = await new Promise((resolve) => {
      const req = http.request({
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/health',
        method: 'OPTIONS',
      }, (res) => {
        resolve({ status: res.statusCode, headers: res.headers });
      });
      req.end();
    });
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBeDefined();
    expect(res.headers['access-control-allow-methods']).toBeDefined();
  });
});
