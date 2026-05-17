#!/bin/sh
# 收租系统自动备份脚本
# 用法: 添加到 NAS crontab，每天凌晨 3 点执行
# 0 3 * * * /path/to/auto-backup.sh

API_BASE="http://127.0.0.1:8788"
TOKEN_FILE="/app/storage/.backup_token"
BACKUP_DIR="/app/storage/backups"
KEEP_DAYS=30

# 登录获取 token（如果已有且未过期则复用）
if [ -f "$TOKEN_FILE" ]; then
  TOKEN=$(cat "$TOKEN_FILE")
else
  RESP=$(curl -s -X POST "$API_BASE/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"username":"'${ADMIN_USERNAME:-admin}'","password":"'${ADMIN_PASSWORD:-}'"}')
  TOKEN=$(echo "$RESP" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
  if [ -n "$TOKEN" ]; then
    echo "$TOKEN" > "$TOKEN_FILE"
  fi
fi

if [ -z "$TOKEN" ]; then
  echo "[$(date)] 备份失败：无法获取 token" >&2
  exit 1
fi

# 创建备份
RESULT=$(curl -s -X POST "$API_BASE/api/backup/create" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}')

echo "[$(date)] 备份结果: $RESULT"

# 清理旧备份
if [ -d "$BACKUP_DIR" ]; then
  find "$BACKUP_DIR" -name "*.json" -mtime +$KEEP_DAYS -delete 2>/dev/null
  echo "[$(date)] 已清理 ${KEEP_DAYS} 天前的备份"
fi
