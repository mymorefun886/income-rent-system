---
name: create-migration
description: "Use when you need to safely add, rename, or remove fields/collections in the db.json file. Provides validated migration templates with rollback support. User-only invocation (migrations have side effects)."
---

# Create Migration (db.json)

## Overview

This project uses a single JSON file (`backend/storage/db.json`) as its database with no formal migration system. Before changing the schema, you MUST create a migration to avoid breaking existing data.

The backend already has an `entityVersions` system — use it as the rollback mechanism.

## Data Collections

These are the known collections in `db.json`:

| Collection | Purpose |
|------------|---------|
| `properties` | 房產/房源 |
| `tenants` | 租客資料 |
| `records` | 房租/水電账单 |
| `expenses` | 支出記錄 |
| `meterTasks` | 抄表任務 |
| `messageLogs` | 訊息日誌 |
| `uploads` | 上傳檔案 |
| `contracts` | 合約 |
| `reminders` | 提醒 |
| `roomInventories` | 房間清點 |
| `roomInventorySnapshots` | 清點快照 |
| `auditLogs` | 審計日誌 |
| `entityVersions` | 版本歷史（用於 rollback） |
| `importReports` | 匯入報告 |
| `runtimeLogs` | 運行日誌 |
| `workOrders` | 工單 |
| `profitAlerts` | 利潤警報 |
| `settings` | 系統設定 |
| `user` | 用戶資料 |

## When to use

- Add a new field to any collection
- Rename a field in any collection
- Remove a deprecated field
- Add a new collection
- Change field type (e.g., string → number)

## How to use

### Step 1: Assess the migration

Answer these before writing any code:
1. **Which collection?** (e.g., `tenants`)
2. **What change?** (add / rename / remove / type change)
3. **Backward compatible?** (will existing code handle missing values?)
4. **How many records affected?** (check with a read-only query first)

### Step 2: Write the migration

Create a migration file at `backend/migrations/YYYYMMDD_description.js` with this template:

```javascript
// backend/migrations/YYYYMMDD_description.js
// Migration: <description>
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';

const DB_PATH = './storage/db.json';
const BACKUP_PATH = `./storage/db.before-YYYYMMDD.json`;

// Step 1: Backup
copyFileSync(DB_PATH, BACKUP_PATH);
console.log(`Backup saved to ${BACKUP_PATH}`);

// Step 2: Read current state
const db = JSON.parse(readFileSync(DB_PATH, 'utf-8'));

// Step 3: Apply migration
// TODO: Your specific changes here
// Example: add default value for new field
// db.tenants = db.tenants.map(t => ({ ...t, newField: t.newField ?? 'default' }));

// Step 4: Validate
// Check that migration didn't break anything
const recordCount = db.tenants.length; // adjust per collection
console.log(`Migration applied: ${recordCount} records processed`);

// Step 5: Write back
writeFileSync(DB_PATH, JSON.stringify(db, null, 2));

// Step 6: Log to entityVersions (for rollback tracking)
db.entityVersions = db.entityVersions || [];
db.entityVersions.push({
  timestamp: new Date().toISOString(),
  migration: 'YYYYMMDD_description',
  recordCount,
  direction: 'forward',
});
writeFileSync(DB_PATH, JSON.stringify(db, null, 2));

console.log('Migration complete.');
```

### Step 3: Verify

After running the migration:
1. Check the backup was created
2. Verify data integrity (no records lost, no unexpected changes)
3. Test the affected API endpoints
4. If something is wrong, restore from backup:
  ```bash
  cp ./storage/db.before-YYYYMMDD.json ./storage/db.json
  ```

## Safety Rules

1. **Always backup before migrating** — copy to `db.before-YYYYMMDD.json`
2. **Use `entityVersions` to log** — record what changed so it can be reversed
3. **Never delete fields** — mark as deprecated and filter in queries instead
4. **Provide defaults** — new fields should have sensible defaults for existing records
5. **Test on a backup first** — dry run by reading and analyzing before writing
6. **Keep migrations small** — one logical change per migration file
7. **Always run from the backend directory** — `cd backend && node migrations/YYYYMMDD_desc.js`

## Invocation

User-only. Migrations have direct database side effects and must be explicitly invoked.

**NEVER auto-trigger** — always confirm with the user before running a migration.