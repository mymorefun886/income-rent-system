# income-rent-system

## Project
個人房東租賃管理系統 — React + Vite + TailwindCSS 前端，Node.js 後端，單文件 JSON 資料庫。

## Key Commands
- 前端：`cd ~/myproject && npm run dev` (localhost:8080)
- 後端：`cd ~/myproject/backend && npm start`
- 測試：`cd ~/myproject/backend && npm run test:run`
- 部署前端：`cd ~/myproject && git push` (Cloudflare Pages)
- 部署後端：NAS 上 `docker compose -f /volume1/docker/rent-smart/docker-compose.yaml up -d --build`

## Architecture
- Frontend: `~/myproject/src/` — React SPA, TailwindCSS
- Backend: `~/myproject/backend/server.js` — Node.js ESM, JSON file DB
- Database: `~/myproject/backend/storage/db.json`
- Backups: `~/myproject/backend/storage/backups/`
- Auth: JWT token, ADMIN_PASSWORD_HASH env var

## Code Standards
- Backend is ESM (type="module" in package.json)
- 統一用繁體中文回覆
- 機密資訊（密碼、API key）絕對不能寫進程式碼
## Changelog
- 每次修改代码或数据后，必须同步更新 CHANGELOG.md
- 格式：v主版本.次版本.修订（Semver）
- 代码改动 → 归在「代码线」
- 数据修复/清理 → 归在「数据线」，文件名自述
- 更新后连同 CHANGELOG.md 一起 commit 推送
