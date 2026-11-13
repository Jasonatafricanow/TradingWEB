# tradingWEB 生产部署 Checklist

> **推荐：不停机热部署（版本更新模块）** — 见下方「不停机热部署」章节。
> 传统 `pm2 stop` + 覆盖 `.next` 的流程会有停机窗口，且新旧产物混用易触发
> Server Action 错误；热部署用 release 目录 + current 软链原子切换解决这两个问题。

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

## 不停机热部署（版本更新模块）

### 目录结构

```
/opt/tradingweb/
├── releases/
│   ├── <buildId-A>/          # 每次发布的完整产物（源码 + .next + node_modules）
│   └── <buildId-B>/
├── current -> releases/<buildId-B>   # 软链，PM2 cwd 指向这里
├── shared/
│   └── .env                  # 生产环境变量，各 release 软链共享
└── logs/
```

### 一次性初始化（从传统单目录迁移）

```bash
ssh root@<server>
cd /opt/tradingweb

# 1) 把现有运行目录整体挪进 releases（保留 node_modules 与 .next）
mkdir -p releases shared logs
FIRST_RELEASE="legacy-$(date +%Y%m%d)"
mkdir -p "releases/$FIRST_RELEASE"
# 将现有文件移入（.git、logs、releases、shared 除外；按实际目录调整）
for item in .next node_modules src public package.json pnpm-lock.yaml \
            next.config.mjs ecosystem.config.js scripts drizzle; do
  [ -e "$item" ] && mv "$item" "releases/$FIRST_RELEASE/"
done
cp .env "shared/.env"          # 环境变量集中到 shared
ln -sfn "releases/$FIRST_RELEASE" current

# 2) 让 PM2 指向 current（ecosystem.config.js 已支持 TRADINGWEB_CWD）
pm2 delete tradingweb
TRADINGWEB_CWD=/opt/tradingweb/current pm2 start current/ecosystem.config.js --update-env
pm2 save
```

> 初始化这步需要一次短暂重启；之后的每次发布都不再停机。

### 日常发布（本地一条命令）

```bash
# 本地（需要 rsync/ssh；构建永远在本地，服务器内存不足以 build）
bash scripts/deploy-release.sh root@<server>
```

脚本会：本地 `pnpm build`（自动生成 `.next/build-info.json`）→ 组装产物 →
rsync 到 `releases/<buildId>/` → 远程执行 `scripts/release.sh <buildId>`。

服务器端 `release.sh` 的动作：

1. 校验产物完整性，软链 `shared/.env`；
2. lockfile 未变 → 硬链接继承上一版 `node_modules`（秒级、不占磁盘）；
   有变化 → 加 `--install-deps` 全新安装；
3. 在独立端口（默认 3100）预启动新构建并健康检查 `/api/version`，
   **失败则直接中止，线上不受影响**；
4. 原子切换 `current` 软链 → `pm2 startOrReload`（优雅重载，旧进程处理完
   存量请求后退出）；
5. 复检线上 `/api/version`；失败自动把软链切回上一版并重载（回滚）；
6. 默认保留最近 5 个 release（`--keep N` 可调）。

手动在服务器执行也可以：

```bash
bash /opt/tradingweb/releases/<buildId>/scripts/release.sh <buildId> [--keep 5] [--install-deps]
```

### 版本可见性

- `GET /api/version`：公开探针（appVersion / buildId / builtAt，no-store），
  供部署健康检查与客户端轮询；
- 后台「系统治理 → 版本与更新」（`/admin/version`）：构建详情、git 提交、
  运行时长（admin / operator 可见）；
- 前台所有页面每 60 秒轮询一次探针，发现新 buildId 弹非阻断提示
  「发现新版本 → 立即刷新 / 稍后」，不自动刷新，避免打断下单与收银。

### 注意事项

- 依赖升级（pnpm-lock.yaml 变化）必须 `--install-deps`；硬链接继承只适用于
  lockfile 完全一致的情况。
- Nginx 建议保留 `proxy_next_upstream` 默认重试；优雅重载窗口内的个别请求
  由重试兜底。HTML/RSC 响应不要进长期共享缓存（见附录）。
- 数据库迁移与热部署解耦：先执行向后兼容的 migration，再发布代码。

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
*/60 * * * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" "https://fjglobal.online/api/cron/expire-offline-orders"
```

### 3.2 每日运营简报（/api/cron/daily-briefing）
每天 08:00 执行，推送昨日订单/收入/异常摘要。同一天同一收件人只发一封，调度器重复触发不会重发。

```bash
0 8 * * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" "https://fjglobal.online/api/cron/daily-briefing"
```

### 3.3 邮件发件箱重试（/api/cron/email-outbox）
每 5 分钟执行。重试状态为 `queued` 的邮件（支付商限流/5xx、网络失败、付款提交后进程中断），以及卡在 `sending` 超过 10 分钟的邮件。
每行邮件用自己的 ID 作为 Resend 幂等键，重试不会产生第二封；只处理 23 小时内的记录（幂等键有效期 24 小时）。

```bash
*/5 * * * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" "https://fjglobal.online/api/cron/email-outbox"
```

邮件状态含义：`queued` 待发送，`sending` 发送中，`sent` 支付商已接收（不代表收件人已收到），`failed` 未配置/被拒/重试耗尽。
需要 `RESEND_API_KEY` 和 `EMAIL_FROM`；未配置时邮件记为 `failed: provider_not_configured`，不会显示为已发送。

### 3.4 推广佣金到期入账（/api/cron/affiliate-commissions）
每小时执行。佣金在订单付款时记为 `pending`，过了冻结期（后台「会员与推广规则」里的天数）才计入推广者余额；每笔只入账一次，重复执行无副作用。
冻结期设为 0 时付款即入账，不依赖这个任务。

```bash
0 * * * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" "https://fjglobal.online/api/cron/affiliate-commissions"
```

---

## □ 3b. Nginx 限流

```bash
# 服务器上，以 root 运行（直接连源站）
sh scripts/rate-limit-nginx.sh
# 前面有 CDN / 反向代理时，必须给出可信代理网段，否则所有访客共用代理 IP 的同一个限流桶
TRUSTED_PROXY_CIDRS="<代理网段，空格分隔>" REAL_IP_HEADER=CF-Connecting-IP sh scripts/rate-limit-nginx.sh
```

- 配置在 `deploy/nginx/`：限流区装到 `conf.d/`，限流 location 和代理设置装到 `snippets/`，站点配置里只插入一行 include（插在第一个 `location /` 之前，原文件备份为 `.bak-ratelimit`）。
- 限额：`/api/auth/*` 10 次/分（突发 5），`/api/payment/create` 与 `/api/orders` 20 次/分（突发 10），其他 `/api/*` 60 次/分（突发 40），超出返回 429；支付回调 `/api/payment/webhook`、`/api/payment/callback` 和前台页面不限流。
- nginx 会把 `X-Forwarded-For` 覆盖为真实客户端 IP，所以应用 `.env` 可以设 `TRUST_PROXY_HEADERS=true`，让应用内按 IP 的限流生效。
- 旧版脚本把限流区写进了一行注释，实际从未生效；新脚本会清掉那行和引用不存在的 `zone=api` 的行，可以重复运行。
- 已在本地 nginx 1.28 上用真实请求验证上述行为；线上需要在执行后再用 `curl` 抽查一次 429。

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

### 0034–0040 必须先于代码上线

以下表和列被新代码在主链路上直接读写，代码先上线会导致对应功能整体失败：

| 迁移 | 表 | 代码缺表时的后果 |
|---|---|---|
| `0034_oauth_identities` | `oauth_identities` | Google / Apple 登录全部失败 |
| `0035_order_stock_allocations` | `order_stock_allocations` | 结账扣库存、退货回补失败 |
| `0036_revoked_sessions` | `revoked_sessions` | 每个带登录态的请求都查此表，缺表时全站鉴权 500 |
| `0037_email_outbox_notification_dedupe` | `email_logs` 新增 body/dedupe_key 等列，`notifications.dedupe_key` | 邮件写日志失败；付款事务里的通知和确认邮件被跳过（付款本身不受影响，只记错误日志） |
| `0038_pos_refund_tenders` | `pos_refund_tenders` | POS 退款、换货写退款方式失败（整笔回滚）；交班对账查询失败 |
| `0039_relax_legacy_stock_transfer_columns` | `stock_transfers.product_id/quantity` 改为可空 | 严格模式下新建调拨一律失败（不跑也是现状：线上如能建调拨，说明这两列已可空，0039 会自动跳过） |
| `0040_member_wallet_commission` | `orders` 新增会员折扣/钱包/推广人列，`wallet_credits`、`wallet_transactions`，等级/推广者有效期列，`referrals` 新增 kind/dedupe_key 等 | 下单写订单失败（全站结账不可用）；付款事务失败 |

发布顺序：先在线上 `SHOW TABLES` 确认前三张表不存在，`DESC email_logs` / `DESC notifications` 看现有列 → 执行迁移 → 再发布代码。
上线前先在一次性库上全量重放（本地已用 MySQL 8.4 跑通 0000→0040，0040 重复执行无报错）：

```bash
MIGRATION_RECONCILIATION_ALLOW_DISPOSABLE_DB=1 DB_NAME=tw_replay_check DB_HOST=… DB_USER=… DB_PASSWORD=… \
  pnpm tsx scripts/migration-reconciliation/integration/replay-latest.ts
```

0040 上线后三项功能（会员折扣、钱包、推广佣金）默认全部关闭，价格不变；由管理员在后台「会员与推广规则」逐项开启。
0040 会把 `referrals` 里已有的提现/退出记录（`PAYOUT_`/`EXIT_` 开头）标为 `kind = 'payout'`，佣金查询不再把它们算进去。

0034 建 `oauth_identities` 时按线上 `users.id` 实际的排序规则建 `user_id`（外键要求两边一致；`users` 是 `utf8mb4_unicode_ci`，新表默认会是库的默认排序规则）。
0037、0039、0040 每一步都先查 information_schema，已满足就跳过；如果线上 `email_logs` 用的不是 `to_email` 列（例如历史上手工建成 `recipient`），先停下核对，不要直接跑。
`0008` 的 journal 断档与这三项无关，仍按「需线上 DESC 确认」处理，不要顺带补跑。
