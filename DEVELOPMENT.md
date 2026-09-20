# TradingWEB · 研发演进与架构设计基线

本文档记录 TradingWEB（GlobalTrade Hub）的技术架构选型、核心迭代历程、工程规范与数据库治理方案。

---

## 1. 架构选型与工程规范

### 1.1 前后端分层与解耦
* **表现层（Presentation Layer）**：Next.js 16 App Router。前台面向消费者的展示页面采用 SSR/SSG，后台管理界面与 POS 对接端点采用基于 React 19 的动态交互。
* **业务服务层（Service Layer）**：所有数据库交互与复杂业务规则集中封装在 `src/services/` 目录中，严禁 API 路由（Route Handlers）直接嵌入大段原始 SQL。
* **数据持久层（Persistence Layer）**：采用 Drizzle ORM，以 TypeScript 代码即 Schema 的方式管理表结构定义与迁移，提供完全类型安全的数据访问保障。

### 1.2 状态机与幂等设计
* **订单状态机**：订单生命周期严格遵循不可逆状态流转（待支付 -> 已支付 -> 履约中 -> 已完成 / 已退款）。
* **POS 交易幂等性**：对所有涉及资金和库存变动的端点强制要求 `client_ref` 唯一交易流水号，服务端通过数据库唯一索引与 Redis/内存锁实现去重。

---

## 2. 迭代演进历程（Sprints）

* **Sprint 1 · 基础设施与认证重构**：
  * 完成自建 JWT 鉴权与 PBKDF2 密码哈希，剥离外部第三方 Auth 强依赖。
  * 建立 Next.js 16 与 Tailwind CSS 4 基础骨架。
* **Sprint 2 · 商品与多规格建模**：
  * 支持实物商品（多属性、变体 SKU）、虚拟商品及服务商品的统一模型抽象。
  * 引入 Zod 进行前后端双向输入校验。
* **Sprint 3 · 支付与国际化（i18n）**：
  * 完成 PayPal REST 与 Stripe 支付接入，支持 Webhook 异步回调防掉单。
  * 构建全站多语言字典与语言切换上下文（中 / 英 / 西 / 日）。
* **Sprint 4 · POS 移动端协议对接**：
  * 为移动端收银 App 开放条码秒查、员工 PIN 码验证、挂单和原路退款端点。
* **Sprint 5 · 管理后台 DataTable 现代化改造**：
  * 全面重构 Admin 列表页，引入 TanStack Table 实现批量选择、列排序与数据过滤。
  * 强化枚举类型定义与操作审计日志留痕。

---

## 3. 测试与质量保证

```bash
# 运行类型检查
pnpm ts-check

# 运行代码检查
pnpm lint

# 运行单元测试
pnpm test

# 运行端到端 E2E 测试
pnpm test:e2e
```
