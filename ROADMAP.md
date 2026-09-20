# tradingWEB · 产品形态路线图

> 创建日期：2026-06-24
> 作用：记录未来产品形态、端侧边界和演进顺序。
> 边界：`ARCHITECTURE.md` 描述当前系统架构；本文描述中长期规划和决策。

---

## 一、北极星

`tradingWEB` 是唯一业务核心：商品、库存、订单、支付、员工、门店、迁移接收、报表都以 tradingWEB 的 API 和 MySQL 数据库为准。

其它入口都是客户端或工具：

- Storefront Web：客户网页端。
- Admin：运营和管理后台。
- Customer PWA / Native App：客户移动端。
- POS App：实体店零售端。
- MoveShopify Sender：Shopify 数据迁移发起端。
- 其它 Sender：未来可接 WooCommerce、Excel、ERP 等来源。

原则：**多入口，不多套业务系统。**

---

## 二、入口矩阵

| 入口 | 使用者 | 形态 | 后端边界 | 当前策略 |
|------|--------|------|----------|----------|
| Storefront Web | 客户 | Next.js Web | tradingWEB API | 继续作为主 storefront |
| Admin | 管理员 / 运营 | Next.js `/admin` | tradingWEB API | 不物理拆分，只做逻辑隔离 |
| Customer PWA | 客户 | PWA | tradingWEB API | 先做 PWA 过渡，后续再评估 RN 原生 |
| Customer Native App | 客户 | React Native / Expo | tradingWEB API | v2+，等 API 和移动闭环稳定后再做 |
| POS App | 店员 | Android App | tradingWEB API | Android 为首个交付目标；POS 单独前端，不单独后端 |
| MoveShopify Sender | 迁移操作者 | 轻量工具 | tradingWEB import receiver | 只做 Shopify -> tradingWEB 迁移桥 |

---

## 三、数据模型铁律

这些概念必须早钉死，避免 POS、迁移和多入口互相污染。

| 概念 | 定义 | 备注 |
|------|------|------|
| `stores` | 物理销售点 / POS 门店 | 包含地址、营业时间、可绑定仓库；不是多租户站点表 |
| `warehouses` | 仓库 | 负责库存存放，不代表销售渠道 |
| `staff` | 员工和后台/POS 权限 | 首位 admin 初始化需要自动化，不能长期依赖手工 SQL |
| `orders.source` | 订单来源渠道 | 建议值：`web` / `pos` / `import` / `whatsapp_cs` |
| `orders.store_id` | POS 或门店相关订单所属实体店 | POS 订单应同时写 `source='pos'` 和 `store_id` |
| `inventory` | 库存快照 | 至少按 product / variant / warehouse / store 维度表达 |
| `payments` 或支付字段 | 统一记录线上支付、线下转账、POS 现金/刷卡 | POS 不另造支付模型 |
| `import_sessions` | 一次迁移会话 | 例如 F&J 这次 Shopify -> tradingWEB 迁移 |
| `import_jobs` | 迁移任务 | tradingWEB 接收迁移包后的任务记录 |
| `external_source_mappings` | 外部源映射 | 记录 Shopify 等来源对象与本地对象的对应关系 |

---

## 四、MoveShopify 边界

MoveShopify 不再按“独立电商 v2”推进。它的长期定位是 **Shopify -> tradingWEB migration sender**。

### MoveShopify 负责

- 读取 Shopify CSV，未来可扩展 Shopify API。
- 将 Shopify 字段映射成 tradingWEB import contract。
- 做迁移前 dry-run 和预校验。
- 配置目标 tradingWEB URL、admin token、目标 sales point / store。
- 一键推送迁移包，并展示 tradingWEB 返回的进度和报告。

### tradingWEB 负责

- 提供 import receiver API。
- 创建并追踪 `import_sessions` / `import_jobs`。
- 根据 `external_source_mappings` 去重、幂等更新、回链外部来源。
- 写入商品、分类、变体、图片、客户、订单、库存。
- 生成校验报告和失败明细。

### 标准迁移包方向

MoveShopify 输出的不是 Shopify 原始字段，而是 tradingWEB 标准数据包：

```json
{
  "source": "shopify",
  "source_store": "fj-boutique",
  "categories": [],
  "products": [],
  "variants": [],
  "images": [],
  "customers": [],
  "orders": []
}
```

---

## 五、模块化单体约定

当前不拆 Admin 仓库，也不急着重命名 service 目录。

### 当前保留

- 保留现有 `services/admin/*`、`services/products/*`、`services/payment/*` 等组织方式。
- POS 进入后，如果同一服务同时被 admin / storefront / pos 复用，再考虑向 `services/catalog`、`services/orders`、`services/inventory` 这类领域命名迁移。

### 现在必须守住

- `src/app/admin/*` 不引用 storefront 专属组件。
- storefront 页面不引用 `admin/_components`。
- POS 前端不直接访问数据库，只调用 tradingWEB API。
- 共享逻辑只放在 `services/`、`lib/`、`config/`、`storage/`。
- 任何新入口不得自建商品、库存、订单、支付模型。

---

## 六、开发优先级

| 序 | 阶段 | 目标 | 说明 |
|----|------|------|------|
| 1 | 补 tradingWEB 接收能力 | staff 初始化、`stores` 语义澄清、import receiver、`import_sessions`、`import_jobs`、`external_source_mappings` | MoveShopify Bridge 的 receiver 端属于本阶段 |
| 2 | MoveShopify Sender + F&J 迁移 | Shopify CSV -> tradingWEB import package -> tradingWEB 落库 | 优先走 Shopify CSV，除非 legacy Supabase 有人工修正数据 |
| 3 | F&J 上线 tradingWEB storefront | 迁移后真实跑客户闭环 | 观察支付、订单、库存、客服反馈 |
| 4 | Storefront PWA | manifest、service worker、离线 fallback、移动端安装体验 | PWA 先行，原生 App 后置 |
| 5 | Admin / Storefront 隔离审计 | 检查组件互引和隐式依赖 | 成本低，尽早做 |
| 6 | POS 在线 MVP | 员工登录、搜商品/扫码、购物车、收款记录、生成订单、扣库存 | 在线优先，不做离线同步 |
| 7 | POS 硬件能力 | 小票打印、扫码枪、刷卡终端、本地支付通道 | 按真实门店需求逐项接 |
| 8 | 客户原生 App | React Native / Expo | 产品化或 App Store 渠道成为刚需后再做 |

---

## 七、红线

- 不同时开 `tradingWEB`、客户原生 App、POS 原生 App 三条主线。
- 不把 MoveShopify 重新做成独立电商系统。
- 不为 POS 单独做后端或单独数据库。
- 不在 PWA 阶段提前做复杂原生能力。
- 不在第一版 POS 做离线同步；离线同步必须等真实断网频率证明值得做。
- 不为了“未来好拆”现在重排 40+ 个 service import 路径。

---

## 八、决策日志

| 日期 | 决策 | 说明 |
|------|------|------|
| 2026-06-24 | tradingWEB 是单一业务核心 | 多入口共享同一 API 和 MySQL |
| 2026-06-24 | MoveShopify 改为 migration sender | 不再作为独立电商 v2 推进 |
| 2026-06-24 | tradingWEB 补 migration receiver | 接收、校验、去重、落库、报告在 tradingWEB 侧完成 |
| 2026-06-24 | Admin 暂不物理拆分 | 单仓库逻辑隔离，未来有性能/团队/部署压力再拆 |
| 2026-06-24 | POS 单独前端，不单独后端 | POS 是 tradingWEB 的客户端，不自建业务系统 |
| 2026-06-24 | 客户端 PWA-first | 原生 App 延后到 API 和业务闭环稳定后 |
| 2026-06-24 | `stores` 定义为物理销售点 | 销售渠道用 `orders.source` 表达 |
| 2026-07-15 | Android 是 POS 首个交付目标 | 采用 Bearer JWT、显式 operator-session/device headers 和稳定 JSON DTO，不依赖浏览器 Cookie |
| 2026-07-15 | 离线 POS 进入后续范围但必须受服务端契约约束 | 任何离线写入都必须携带服务端幂等键、规范化请求摘要和显式冲突处理；当前 Task 5 仍以在线原子结账为验收边界 |
