# TradingWEB (GlobalTrade Hub)

> 现代化跨境咨询与综合贸易交易平台。支持个人咨询服务、虚拟商品交易与实物商品贸易，并无缝集成移动 POS 与 Shopify 数据迁移。

[![Next.js](https://img.shields.io/badge/Next.js-16%20App%20Router-black.svg)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue.svg)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38bdf8.svg)](https://tailwindcss.com/)
[![Drizzle ORM](https://img.shields.io/badge/ORM-Drizzle-C5F74F.svg)](https://orm.drizzle.team/)
[![MySQL](https://img.shields.io/badge/Database-MySQL%208.0%2B-blue.svg)](https://www.mysql.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 📖 项目简介

**TradingWEB** 是一套面向全球化业务的全栈跨境贸易系统。基于 Next.js 16 App Router 与 React 19 构建，采用现代化的分层架构，深度融合了前台电商交易、咨询预约、多语言国际化、多币种支付、商户管理后台（Admin Dashboard），并原生作为 **TradingWEB POS（移动收银端）** 与 **ShopifyDataBridge（数据迁移工具）** 的中央业务与数据中台。

### 🌟 核心功能

* 🛍️ **全类型商品交易**：支持实物商品（多规格变体、库存控制）、虚拟商品（自动化交付）与专家咨询服务（时段预约与定金）。
* 💳 **跨境全球支付**：集成 PayPal REST API 与 Stripe 国际信用卡通道，支持多币种无缝结算与 Webhook 异步对账。
* 🌐 **完整国际化（i18n）**：全站原生支持多语言（中 / 英 / 西 / 日），覆盖客户端界面、服务端错误码与邮件通知。
* 📊 **企业级运营后台（Admin）**：
  * 基于 TanStack Table 的高性能 DataTable，支持海量数据虚拟滚动与多列排序。
  * 批量操作（批量上架/下架、批量改价、批量履约导出）。
  * 权限角色管理（RBAC）、操作审计日志与实时销售数据看板。
* 📱 **POS 专属业务中台**：
  * 原生提供门店收银专属端点（条码秒查、库存快速调整、店长/员工 PIN 码管理、原路/现金退款）。
  * 严格的幂等性保证（基于 `client_ref` 杜绝重复建单）。
* 🌉 **数据迁移中继站**：
  * 内置针对 Shopify 数据的导入接收端（Import Receiver），支持一键无损迁移商品、客户与历史订单。

---

## 🏗️ 技术架构

| 分层 | 技术选型 | 说明 |
| :--- | :--- | :--- |
| **应用框架** | Next.js 16 (App Router) | 混合服务端渲染（SSR）与静态生成（SSG） |
| **前端交互** | React 19 + shadcn/ui (Radix UI) | 无障碍、高质量 UI 组件库 |
| **样式体系** | Tailwind CSS 4 | 极速构建现代响应式界面 |
| **语言规范** | TypeScript 5 (Strict Mode) | 全链路严格类型安全 |
| **数据持久化** | MySQL 8.0+ / Drizzle ORM | 类型安全的数据库建模与迁移工具 |
| **身份认证** | 自建 JWT (PBKDF2 密码哈希) | 无外部 SaaS 强依赖，安全自主可控 |
| **测试框架** | Vitest (单测) + Playwright (E2E) | 核心业务流自动化测试 |

---

## 🚀 快速开始

### 前置条件
* **Node.js** >= 18
* **pnpm** >= 9（强制使用 pnpm）
* **MySQL** >= 8.0

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

```bash
cp .env.example .env.local
```

编辑 `.env.local` 配置文件：

```env
# 数据库连接
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=tradingweb
DB_PORT=3306

# 鉴权密钥
JWT_SECRET=your-random-jwt-secret-key

# 支付配置 (可选)
STRIPE_SECRET_KEY=sk_test_...
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
```

> **未配置数据库时的演示模式**：如果 `DB_HOST` 为空，部分管理后台页面将自动降级为使用内存 Mock 数据，方便纯前端预览与调试。

### 3. 数据库结构同步与迁移

```bash
# 推送 Drizzle Schema 到数据库
npx drizzle-kit push
```

### 4. 启动开发服务器

```bash
pnpm dev
# 浏览器访问 http://localhost:5000
```

---

## 📂 目录结构

```
src/
├── app/                         # Next.js App Router 页面路由
│   ├── page.tsx                 # 商城首页
│   ├── admin/                   # 运营后台管理（商品/订单/客户/财务/审计）
│   ├── products/                # 商城商品展示与详情
│   ├── cart/                    # 购物车
│   ├── checkout/                # 结算支付
│   ├── orders/                  # 用户订单中心
│   └── api/                     # 后端 RESTful API
│       ├── auth/                # 登录/注册/Token
│       ├── products/            # 商品 CRUD 与检索
│       ├── orders/              # 订单创建与状态机流转
│       ├── payment/             # PayPal / Stripe 支付集成
│       ├── pos/                 # 移动收银端专有接口
│       └── admin/               # 后台高级管理与导入
├── components/                  # React 业务组件与通用 UI
│   └── ui/                      # 基于 shadcn/ui 的原子组件
├── contexts/                    # 全局状态上下文（Auth, Cart, i18n）
├── services/                    # 领域业务服务层（解耦 Controller 与 DB）
├── db/                          # Drizzle 数据库连接与 Schema 定义
└── lib/                         # 工具函数、安全净化与验证器
```

---

## 📄 许可证

本项目采用 [MIT License](LICENSE) 授权。
