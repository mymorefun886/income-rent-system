#!/bin/bash
# =============================================
# 每日備份腳本 — 不依賴 server.js 運行
# 用途：每天固定執行，將 db.json 備份到 backups/
# 並只保留最近 90 天的備份
# =============================================
# 使用方式：
#   1. 在 Synology NAS 安裝 crontab：
#      crontab -e
#      # 每天早上 3 點執行
#      0 3 * * * /bin/bash /volume1/docker/rent-smart/backup-daily.sh
#
#   2. 或在本地 VM 測試：
#      bash backup-daily.sh
# =============================================

set -euo pipefail

# 自動偵測 project root（支援從 NAS 和本地調用）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

BACKEND_DIR="$PROJECT_ROOT/backend"
STORAGE_DIR="$BACKEND_DIR/storage"
BACKUPS_DIR="$BACKUPS_DIR"  # 預設讀取 BACKUP_DIR env，否則用 storage/backups
BACKUPS_DIR="${BACKUP_DIR:-$STORAGE_DIR/backups}"
KEEP_DAYS=90
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
DATE_TAG=$(date '+%Y-%m-%d')
DB_PATH="$STORAGE_DIR/db.json"
LOG_FILE="$STORAGE_DIR/logs/backup.log"

# 確保必要目錄存在
mkdir -p "$BACKUPS_DIR" "$STORAGE_DIR/logs"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE" 2>/dev/null || echo "$*"
}

# 檢查 db.json 是否存在
if [[ ! -f "$DB_PATH" ]]; then
    log "ERROR: db.json not found at $DB_PATH"
    exit 1
fi

# 產生備份檔名
BACKUP_FILE="$BACKUPS_DIR/db.daily.$TIMESTAMP.json"

# 複製 db.json
cp "$DB_PATH" "$BACKUP_FILE"

# 計算壓縮後大小
SIZE=$(du -sh "$BACKUP_FILE" 2>/dev/null | cut -f1 || echo "unknown")
log "Backup created: $BACKUP_FILE ($SIZE)"

# 清理超期備份（保留 KEEP_DAYS 天）
CUTOFF_DATE=$(date -d "$KEEP_DAYS days ago" '+%Y%m%d' 2>/dev/null || date -v-${KEEP_DAYS}d '+%Y%m%d')
DELETED=0
for backup in "$BACKUPS_DIR"/db.daily.*.json; do
    [[ -f "$backup" ]] || continue
    # 從檔名抽出時間戳：db.daily.YYYYMMDD_HHMMSS.json
    fname="$(basename "$backup")"
    ts="${fname#db.daily.}"
    ts="${ts%.json}"
    # 比較日期部分
    date_part="${ts:0:8}"
    if [[ "$date_part" < "$CUTOFF_DATE" ]]; then
        rm -f "$backup"
        log "Deleted old backup: $backup"
        DELETED=$((DELETED + 1))
    fi
done

# 同時清理別的備份類型（保留 auto-daily 同樣 90 天）
for backup in "$BACKUPS_DIR"/db.auto-daily.*.json; do
    [[ -f "$backup" ]] || continue
    fname="$(basename "$backup")"
    ts="${fname#db.auto-daily.}"
    ts="${ts%.json}"
    date_part="${ts:0:8}"
    if [[ "$date_part" < "$CUTOFF_DATE" ]]; then
        rm -f "$backup"
        log "Deleted old auto-daily backup: $backup"
        DELETED=$((DELETED + 1))
    fi
done

log "Backup complete. $DELETED old backups removed. Total backups: $(ls "$BACKUPS_DIR"/*.json 2>/dev/null | wc -l)"

# 上一次錯誤級別的 exit code 來自 cp / rm — 成功
exit 0