# 升級報告 — income-rent-system

> 產生日期：2026-05-30
> 專案：個人房東租賃管理系統（React + Vite + Node.js + JSON DB）

---

## 一、現狀摘要

### 架構
- 前端：React SPA，Vite 建置，TailwindCSS 樣式
- 後端：Node.js ESM，單檔 `server.js`（~4300 行）
- 資料庫：JSON 單檔 `storage/db.json`
- 部署：前端 Cloudflare Pages，後端 NAS Docker

### 規模
- 前端 ~15 個頁面，~4000 行
- 後端 ~4300 行（全部在一個檔案）
- 資料庫：6 個月的帳單 + 租客/房源資料

---

## 二、已完成改動（v1.0.1 → v1.2.1）

### v1.0.1 — 手機抄表三層防誤同步保護

| # | 防護層 | 位置 |
|---|---|---|
| 1 | 讀數歸屬追蹤（readingsCycleRef） | MeterInputPage.jsx |
| 2 | 切換帳期攔截 | MeterInputPage.jsx |
| 3 | CSV 導入歸屬綁定 | MeterInputPage.jsx |
| 4 | 同步按鈕顯示目標月份 | MeterInputPage.jsx |
| 5 | 確認框帳期不匹配警告 | MeterInputPage.jsx |
| 6 | 同步時月份不符強制彈窗 | MeterInputPage.jsx |

### v1.0.2 — 紅色月份大字指示器

頁面頂部新增紅底文字：📅 目前操作月份：2026-06

### v1.0.3 — 移除離線抄表功能

移除「下載離線頁」和「列印抄表模板」按鈕，簡化介面。

### v1.0.4 — 自用房顯示調整

502（自用）保留顯示以記錄水電成本，其他自用房隱藏。

### v1.1.0 — 收租帳單批量操作

| 功能 | 說明 |
|---|---|
| 左側勾選框 + 全選 | 桌面表格 + 手機卡片皆支援 |
| 租客搜尋 / 週期篩選 / 狀態篩選 | 三種篩選條件 |
| 批量編輯彈窗 | 狀態 / 已收 / 租金 / 水電單價 |
| 批量刪除 | 確認後一次刪除多條 |

### v1.1.1 — 新增帳單週期切換自動帶入上月讀數

選擇房間後切換週期，自動查詢並填入 electricPrev / waterPrev。

### v1.2.0 — 同步預覽（預覽 → 確認 → 同步）

| 功能 | 說明 |
|---|---|
| 預覽彈窗 | 顯示每間房的電/水讀數變化、帳單狀態 |
| 已收帳單跳過 | 狀態=已收的記錄不受同步影響 |
| 空置房僅存讀數 | 無租客不產生帳單 |
| 同步結果摘要 | 成功後提供「留在本頁」「查看收租帳單」按鈕 |

---

## 三、待解決的核心問題

### 問題 1：JSON 資料庫的本質缺陷

| 問題 | 影響 |
|---|---|
| 無 Schema 約束 | 備份還原可能漏欄位、型別跑掉 |
| 無交易保護 | 寫入中斷 → 檔案毀損 |
| 全量還原 | 不能只恢復特定月份 |
| 讀寫效率低 | 全檔讀取、陣列遍歷 |

### 問題 2：程式碼組織

| 問題 | 影響 |
|---|---|
| server.js 4300 行 | 找一個 API 要滾 2 分鐘 |
| if-else 路由 | 無法使用 middleware |
| 業務邏輯與 HTTP 層混在一起 | 改一個計算公式要翻遍整個檔案 |
| JSON 讀寫散落在各處 | 換資料庫要改幾十處 |

---

## 四、升級計畫

### 總體策略

- **不要重寫 V2**（6000 行程式碼，不值得）
- **絞殺者模式**：逐步替換，全程系統可運作
- **三層架構**：路由層 / 服務層 / 資料層
- **資料庫**：JSON → SQLite（better-sqlite3），不接 Supabase
- **照片/合約**：繼續存 NAS，資料庫只存路徑

### Phase 1 — 程式碼整理（這週）

#### 1a. 拆檔案（方案一）

```
backend/
  server.js                # ~300 行（入口 + 啟動）
  routes/
    auth.js                # 登入
    records.js             # 帳單
    tenants.js             # 租客
    properties.js          # 房源
    meter.js               # 抄表
    bills.js               # 帳單生成
    backup.js              # 備份
    settings.js            # 設定
  lib/
    db.js                  # JSON 讀寫共用函數
    utils.js               # 工具函數
```

#### 1b. 裝 Router（方案三）

```bash
npm install express
```

將 `if (method === "GET" && pathname === "/api/records")` 改為：

```js
router.get("/api/records", handler);
```

**結果：** server.js 從 4300 行 → ~300 行

### Phase 2 — SQLite 遷移（下週）

#### 2a. 安裝 better-sqlite3

```bash
npm install better-sqlite3
```

#### 2b. 建立 Schema

```sql
CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  name TEXT, building TEXT, room TEXT,
  rent REAL, deposit REAL,
  leaseStart TEXT, leaseEnd TEXT,
  archived INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id),
  room TEXT, building TEXT, cycle TEXT,
  rent_part REAL, receivable REAL, received REAL,
  status TEXT, electric_now TEXT, water_now TEXT,
  electric_usage REAL, water_usage REAL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE properties (
  id TEXT PRIMARY KEY,
  building TEXT, room TEXT, usage_type TEXT,
  no_water_meter INTEGER DEFAULT 0
);

-- 其他表格：expenses, contracts, work_orders, meter_readings 等
```

#### 2c. 建立 data 層

```
backend/
  data/
    tenants.js     → getAllTenants, getTenantById, createTenant, updateTenant
    records.js     → getRecordsByCycle, getRecordById, createRecord, updateRecord
    properties.js  → getAllProperties
    db.js          → SQLite 連線 + schema 初始化
```

#### 2d. 切換實作（Route 層不改）

```js
// 改前（JSON）
async function getAllTenants() {
  const db = JSON.parse(readFileSync(dbPath));
  return db.tenants;
}

// 改後（SQLite）
async function getAllTenants() {
  return db.prepare("SELECT * FROM tenants WHERE archived = 0").all();
}
```

### Phase 3 — 服務層（有餘力再做）

```
backend/
  services/
    billing.js       → 計算租金、水電費、應收總額
    meter.js         → 計算用量、水費保底
    report.js        → 損益表、空置率
```

---

## 五、資料庫選擇對比

| | 現狀 JSON | SQLite（better-sqlite3） | Supabase |
|---|---|---|---|
| Schema 約束 | ❌ | ✅ | ✅ |
| 交易保護 | ❌ | ✅ | ✅ |
| NAS 24h 離線 | ✅ | ✅ | ❌ |
| 備份方式 | cp 檔案 | cp 檔案 | API dump |
| 查詢速度 | 全檔掃描 | 索引查詢，毫秒級 | 取決於網路 |
| 學習成本 | $0 | $0（內建） | 要學新 API |
| 費用 | $0 | $0 | 超額要付費 |

**結論：** SQLite 是最短路徑，保留 NAS 優勢、解決 JSON 痛點、不增加成本。

---

## 六、建議優先級

| 優先級 | 階段 | 內容 | 時間 |
|---|---|---|---|
| 🔴 立即 | Phase 1a | 拆檔案（6-8 個路由檔） | 2 小時 |
| 🔴 立即 | Phase 1b | Express Router | 半天 |
| 🟡 下週 | Phase 2a | 安裝 SQLite + schema | 1 天 |
| 🟡 下週 | Phase 2b | data 層（JSON→SQLite 切換） | 1-2 天 |
| 🟢 有空 | Phase 3 | services/ 業務邏輯抽離 | - |

---

## 七、檔案遷移對照表

| 原始行號 | 功能 | 移到 |
|---|---|---|
| ~1-100 | 共用工具函數 | `lib/utils.js` |
| ~100-200 | JSON 讀寫 | `lib/db.js` |
| ~200-600 | 初始化 + 認證 | `server.js` 保留 + `routes/auth.js` |
| ~600-1200 | 房源 API | `routes/properties.js` |
| ~1200-2000 | 租客 API | `routes/tenants.js` |
| ~2000-2800 | 帳單 API | `routes/records.js` |
| ~2800-3500 | 抄表 API | `routes/meter.js` |
| ~3500-4000 | 備份/報表 API | `routes/backup.js` |
| ~4000-4300 | 自動化任務 | `routes/settings.js` |

---

*本報告由 Claude Code 生成，記錄截至 2026-05-30 的所有變更與規劃。*
