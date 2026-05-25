/**
 * server.test.js — 真實 server.js 集成測試
 *
 * 現況：Vitest ESM runner 中 `import.meta.url === fileURLToPath(import.meta.url)` 判斷
 * 在 runner 環境下不成立（server.js 的 isMain 永遠 false），導致 server.listen() 不會執行。
 * 解決方案：把路由 handler 提取成獨立模組，讓測試直接 import 該模組而不透過 server.js。
 * 目前由 api.test.js 提供完整的 API contract 測試覆蓋，此文件暫時 skip。
 *
 * TODO: 重構時把 server.js 的路由 handler 移到单独文件（如 src/handlers.mjs），
 *       測試直接 import handlers.mjs + 假的 http server，繞過 server.js 的 isMain 邏輯。
 */
import { test, describe, beforeAll, afterAll } from 'vitest';

describe.skip('真實 server.js 集成測試（暫停）', () => {
  test.skip('需重構後恢復 — 見文件頂部說明', () => {});
});
