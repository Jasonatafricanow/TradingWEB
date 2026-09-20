# GlobalTrade Hub — 架构说明

## 前后端分离设计

```
┌─────────────────────────────────────────────────────┐
│                  浏览器 (Frontend)                     │
│  ┌────────────────────────────────────────────────┐  │
│  │  Next.js App Router (src/app/)                  │  │
│  │  ├── pages/         ← 页面组件（部分 client）    │  │
│  │  ├── components/    ← UI 组件 (shadcn)           │  │
│  │  ├── contexts/      ← 全局状态 (auth/cart/i18n)  │  │
│  │  └── hooks/         ← 自定义 hooks               │  │
│  └────────────────────────────────────────────────┘  │
│         ↓ fetch() / POST JSON                         │
│         ↓ Authorization: Bearer <token>               │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│                  后端 API (Next.js API Routes)         │
│  ┌────────────────────────────────────────────────┐  │
│  │  src/app/api/  ← 薄层路由，只做 HTTP 编排        │  │
│  │  ├── /products/*                                │  │
│  │  ├── /orders/*                                  │  │
│  │  ├── /payment/*                                 │  │
│  │  ├── /admin/*                                   │  │
│  │  ├── /coupons/*                                 │  │
│  │  ├── /memberships/*                             │  │
│  │  └── /track/*                                   │  │
│  └────────────────────────────────────────────────┘  │
│         ↓ 调用 services                               │
│  ┌────────────────────────────────────────────────┐  │
│  │  src/services/  ← 业务逻辑层（纯后端，不在前端打包）│  │
│  │  ├── auth/        认证                           │  │
│  │  ├── products/    商品                           │  │
│  │  ├── orders/      订单                           │  │
│  │  ├── payment/     支付                           │  │
│  │  ├── admin/       管理后台                       │  │
│  │  ├── cart/        购物车                         │  │
│  │  └── notifications/ 通知                         │  │
│  └────────────────────────────────────────────────┘  │
│         ↓ Drizzle ORM 查询                            │
│  ┌────────────────────────────────────────────────┐  │
│  │  MySQL 8.0                                       │  │
│  │  - 连接: lib/db.ts（mysql2 连接池）              │  │
│  │  - 表结构: storage/database/shared/schema.ts    │  │
│  │  - 迁移: drizzle/*.sql（当前在用）              │  │
│  │  - 历史: supabase/migrations/（Supabase 时代）  │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

> 早期版本基于 Supabase + PostgreSQL，2026-05 后通过 commit `c4ec1a5`（"架构重塑 — 剔除 Supabase + 统一数据层"）切到 MySQL + Drizzle。`supabase/` 目录保留作为参考，不再写入。

## 核心原则

### 1. 前端只负责展示和交互
- 所有业务逻辑在 `services/` 层实现
- API 路由 (`app/api/`) 是薄层，只做 HTTP 参数解析 + 权限校验 + 调用 services
- 前端通过 `fetch()` 调用 API，不直接操作数据库

### 2. 前端体积优化
- 重库（如 recharts ~500KB）通过 `next/dynamic` + `ssr: false` 按需加载
- 图表组件统一在 `components/charts.tsx` 中动态导入
- 页面组件仅在需要时加载对应 JS

### 3. 数据流
```
用户操作 → 页面组件 (client) → fetch API → API Route (server)
  → Service (业务逻辑) → Drizzle → MySQL → 返回 JSON → 页面更新
```

### 4. 状态管理
- 客户端状态：React Context (auth, cart, i18n)
- 服务端状态：MySQL（Drizzle ORM）
- 临时状态：localStorage (语言偏好, 访客ID, 购物车本地缓存, JWT token)

### 5. 认证（自建 JWT）
- 前端：登录/注册成功后把 JWT 存到 `localStorage["tradingweb_auth_token"]`
- 后端：`services/auth/auth-middleware.ts` 提供 `requireUser()` / `requireStaffRole()` / `withAuth()`
- `lib/auth-local.ts`：JWT 签发/验证 + PBKDF2 密码哈希（零外部依赖）
- 请求头：`Authorization: Bearer <token>`，由 `lib/client-api.ts` 的 `apiFetch()` 自动注入

## 目录职责

| 目录 | 职责 | 运行环境 |
|------|------|---------|
| `src/app/` | 页面 + API 路由 | Server + Client |
| `src/app/api/` | API 端点（薄层） | Server only |
| `src/components/` | UI 组件 | Client |
| `src/services/` | 业务逻辑 | Server only |
| `src/contexts/` | 全局状态 | Client |
| `src/hooks/` | 自定义 hooks | Client |
| `src/lib/` | 工具函数 | Client + Server |
| `src/storage/` | 数据库客户端 | Server only |

---

## 产品形态规划

> 多入口架构（Storefront / Admin / POS / Mobile App / Migration Sender）、入口矩阵、数据模型铁律、模块化单体约定、红线、决策日志在 **`ROADMAP.md`**。
>
> 本文件只描述当前系统的"前后端分离 + 数据流 + 认证"边界。产品形态和演进顺序去 ROADMAP，避免两处真源 drift（2026-06-24 治理后采用此分工）。
