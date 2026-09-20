# tradingWEB 生产部署 Checklist

## 前置：本地构建

> ⚠️ **绝对不要在服务器上运行 `next build`。** 服务器内存仅 1.6GB，`next build` 会 OOM 打崩整个机器。
> 正确流程：本地构建 → 上传产物 → 服务器只跑生产模式。

```bash
# 本地
npx next build
git push origin master

# 服务器
ssh root@<server>
cd /opt/tradingweb
pm2 stop tradingweb
git fetch origin master && git reset --hard origin/master
pnpm install --production --frozen-lockfile

# 本地 rsync .next/ 到服务器（不要在服务器上 build）
rsync -avz --delete \
  --exclude="cache" --exclude="standalone" --exclude="diagnostics" \
  --exclude="types" --exclude="turbopack" --exclude="lock" \
  --exclude="next-server.js.nft.json" --exclude="next-minimal-server.js.nft.json" \
  ./.next/ root@<server>:/opt/tradingweb/.next/

# 服务器启动
pm2 start pnpm --name tradingweb -- next start
```

---

## □ 1. .env 生产配置

| 变量 | 说明 | 必填 |
|------|------|------|
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | MySQL 连接 | ✓ |
| `JWT_SECRET` | JWT 签名密钥 | ✓ |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth | ✓ |
| `APPLE_CLIENT_ID` / `APPLE_CLIENT_SECRET` / `APPLE_REDIRECT_URI` | Apple 登录（当前注释中） | ☐ |
| `CRON_SECRET` | 定时任务鉴权 | ✓ |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Stripe 生产密钥 | ☐ |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` / `PAYPAL_WEBHOOK_ID` | PayPal 生产密钥 | ☐ |

> **当前线上状态**：Google OAuth ✓ | Apple OAuth 未配 | Stripe/PayPal 未配（支付可用 mock/线下）

---

## □ 2. 数据库 Migration

```bash
# 确认所有 migration 已应用
pnpm drizzle-kit migrate
# 检查 payment_methods 表是否存在
mysql -u <user> -p <db> -e "DESC payment_methods;"
```

---

## □ 3. 定时任务（Cron）

### 3.1 过期线下订单自动取消（/api/cron/expire-offline-orders）
每 60 分钟执行，清理超过 72 小时未支付的线下订单。

```bash
# Linux crontab
CRON_SECRET="<与 .env 一致的密钥>"
*/60 * * * * curl -s -X POST "https://fjglobal.online/api/cron/expire-offline-orders?key=$CRON_SECRET"
```

### 3.2 每日运营简报（/api/cron/daily-briefing）
每天 08:00 执行，推送昨日订单/收入/异常摘要。

```bash
0 8 * * * curl -s -X POST "https://fjglobal.online/api/cron/daily-briefing?key=$CRON_SECRET"
```

---

## □ 4. 首次启动准备

### 4.1 创建第一个管理员
```sql
INSERT INTO staff (user_id, role='admin') VALUES ('<用户 UUID>', 'admin');
```
> 先注册用户账号，获取 `users.id`（UUID），再执行 insert。

### 4.2 创建商品分类
Admin → Categories → 新建分类（至少一个）→ 然后才能创建商品。

### 4.3 创建自定义收款方式（可选）
Admin → Settings → Payment Methods → 添加支付宝/微信/银行转账。

---

## □ 5. 部署后验证

- [ ] `https://fjglobal.online` → HTTP 200，首页正常渲染
- [ ] 导航栏滚动毛玻璃效果正常
- [ ] 语言切换（ZH / EN / PT）正常
- [ ] 币种切换正常
- [ ] 注册新用户 / 登录 / Google OAuth
- [ ] 商品加入购物车 → checkout → 线下支付下单
- [ ] 后台 Orders 看到新订单，状态正确
- [ ] 后台标记 paid → 状态流转
- [ ] Admin Dashboard 数据正常
- [ ] 商品管理 / 订单管理 / 优惠券 CRUD
- [ ] 错误日志无异常

---

## □ 6. 服务器健康

| 检查项 | 命令 | 预期 |
|--------|------|------|
| Node 进程 | `pm2 list` | `online`，1 instance |
| 内存 | `free -m` | 可用 > 200MB |
| 磁盘 | `df -h /opt` | 可用 > 5GB |
| Nginx | `systemctl status nginx` | `active (running)` |
| 错误日志 | `pm2 logs tradingweb --lines 5 --nostream` | 无 ERROR |
| 清理 | `rm -rf /opt/tradingweb/.next.bak*` | 清理旧构建产物 |

---

## 附录：常见问题

### 502 Bad Gateway
PM2 重启中（等待 10-15s），或端口 3000 被占用：
```bash
kill $(lsof -ti:3000) 2>/dev/null
pm2 restart tradingweb
```

### Server Action 错误
"Failed to find Server Action" — 新旧构建产物混用。
安全方案：`rm -rf .next` 后全量 rsync。

也可能是部署后老浏览器标签仍持有上一构建的 RSC payload。处理方式：
- 让受影响的用户刷新（跨部署的旧标签做硬刷新）
- 不要把这种孤立的 post-deploy Server Action ID 错误当作应用崩溃
- HTML 与 RSC 响应不要放进长期共享缓存；`/_next/static/` 下的静态资源可以保持 immutable

### 自部署支付 URL

生产环境务必设 `NEXT_PUBLIC_SITE_URL` 为公开 HTTPS origin：

```env
NEXT_PUBLIC_SITE_URL=https://example.com
```

未设时支付 return / cancel URL 会回退到 request origin，但 PM2 + 反向代理后显式配置更稳。

### 数据库 Migration 注意点

线上已有库执行迁移前：
- 确认 `users` 已经有本地 JWT 认证所需列，且 `users.email` 唯一
- `0003_create_users_table.sql` 幂等，仅在 `profiles` 表存在时回填
- `0004_add_seo_meta_fields.sql` 逐列检查再 add
- 执行后核对 Drizzle migration metadata 与 MySQL 实际 schema 一致
