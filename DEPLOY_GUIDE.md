# 收租系统部署指南

## 推荐架构：Cloudflare Tunnel + Cloudflare Pages

```
┌─────────────┐     Cloudflare Tunnel      ┌──────────────────┐
│  NAS Docker  │ ←─────────────────────→ │  Cloudflare 边缘   │
│  backend:8788│    (内网穿透，无公网端口)    │  api.你的域名      │
└─────────────┘                           └──────────────────┘
                                                   ↕
┌──────────────────┐
│ Cloudflare Pages  │  ← 静态前端，全球 CDN
│  你的域名         │
└──────────────────┘
```

## 一、NAS 后端部署

### 1. 生成安全密码
```bash
cd backend
node scripts/gen-password-hash.mjs "你的强密码"
# 输出: pbkdf2-sha256$120000$abc123...$def456...
```

### 2. 修改 docker-compose.yml
```yaml
environment:
  ADMIN_USERNAME: 你的账号
  ADMIN_PASSWORD_HASH: pbkdf2-sha256$120000$...  # 上一步的输出
  APP_ORIGIN: https://你的域名
  API_ALLOWED_ORIGINS: https://你的域名
  # JWT_SECRET 留空，首次启动自动生成
```

### 3. 启动
```bash
docker compose up -d
```

### 4. 验证
```bash
curl http://127.0.0.1:8788/api/health
```

### 5. 配置自动备份（NAS crontab）
```bash
# 每天凌晨 3 点备份，保留 30 天
0 3 * * * /app/backend/scripts/auto-backup.sh
```

## 二、Cloudflare Tunnel（安全穿透）

### 1. 安装 cloudflared
```bash
# 在 NAS 上下载 cloudflared
# https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/
```

### 2. 创建 Tunnel
```bash
cloudflared tunnel create income-api
cloudflared tunnel route dns income-api api.你的域名
```

### 3. 配置 config.yml
```yaml
tunnel: <TUNNEL_ID>
credentials-file: /root/.cloudflared/<TUNNEL_ID>.json
ingress:
  - hostname: api.你的域名
    service: http://127.0.0.1:8788
  - service: http_status:404
```

### 4. 启动
```bash
cloudflared tunnel run income-api
```

## 三、Cloudflare Pages（前端）

### 1. 连接 GitHub / 直接上传
- 上传 `build/` 目录到 Cloudflare Pages
- 或连接 Git 仓库自动构建

### 2. 环境变量
```
VITE_API_BASE_URL = https://api.你的域名
```

### 3. 构建设置
- 框架预设: Vite
- 构建命令: `npm run build`
- 输出目录: `build`
- Node.js: 20

## 四、安全清单

- [ ] 已修改默认账号密码
- [ ] JWT Secret 已自动生成
- [ ] CORS 已限制为你的域名
- [ ] NAS 端口仅绑定 127.0.0.1
- [ ] 已启用 HTTPS（Cloudflare 提供）
- [ ] 已配置自动备份
- [ ] 已测试登录和 API 正常
