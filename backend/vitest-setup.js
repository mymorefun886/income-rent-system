// vitest-setup.js — 在所有測試檔案 import 之前執行
// 用於設定隔離的測試環境變數
process.env.JWT_SECRET = 'test-jwt-secret-for-unit-tests-only-32bytes';
// PBKDF2-SHA256 hash of "Mf848886#" (100k iterations, 16-byte salt)
process.env.ADMIN_PASSWORD_HASH = 'pbkdf2-sha256$100000$2bdadfc5ca56500e149acff085132c1f$0d52839da678dd2e8a01e79d3203de19398833dd3100d6a1d995f63a285ae063';
process.env.ADMIN_USERNAME = 'testadmin';
process.env.API_ALLOWED_ORIGINS = '*';
process.env.NODE_ENV = 'test';
