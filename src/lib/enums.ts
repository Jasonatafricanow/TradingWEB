/**
 * 跨模块状态机常量与联合类型。
 *
 * 设计原则：
 * 1. as const + 派生联合类型，让 TS 在编译期捕捉拼错的字符串。
 * 2. 与 schema.ts 中 default(...) 字符串保持一致；schema 改动时同步更新本文件。
 * 3. 不在 service 内使用裸字符串 — 用 `OrderStatus.Paid` 代替 `"paid"`。
 * 4. 提供 isXxx(value) 守卫，让边界检查更易读。
 *
 * 与 POS DeliveryLifecycleState 的关系：
 *  - POS 一套（pending/accepted/in_flight/sent/...）只活在 pos_* 表与 /api/admin/pos/*。
 *  - 本文件覆盖 storefront / 后台管理 / 财务报表所用的"客户可见"状态。
 *  - 跨边界映射见 src/services/admin/pos-to-storefront-status.ts（待补）。
 */

// ─── 订单主状态 ────────────────────────────────────────────
export const OrderStatus = {
  Pending: "pending",
  Paid: "paid",
  Processing: "processing",
  Completed: "completed",
  Cancelled: "cancelled",
  Refunded: "refunded",
  Delivering: "delivering",
  Delivered: "delivered",
  DeliveryFailed: "delivery_failed",
} as const;
export type OrderStatus = typeof OrderStatus[keyof typeof OrderStatus];
export const ORDER_STATUS_VALUES: readonly OrderStatus[] = Object.values(OrderStatus);
export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUS_VALUES as readonly string[]).includes(value);
}

// ─── 订单财务状态 ──────────────────────────────────────────
export const FinancialStatus = {
  Pending: "pending",
  Paid: "paid",
  Refunded: "refunded",
  PartiallyRefunded: "partially_refunded",
  Voided: "voided",
} as const;
export type FinancialStatus = typeof FinancialStatus[keyof typeof FinancialStatus];

// ─── 订单履约状态 ──────────────────────────────────────────
export const FulfillmentStatus = {
  Unfulfilled: "unfulfilled",
  PartiallyFulfilled: "partially_fulfilled",
  Fulfilled: "fulfilled",
} as const;
export type FulfillmentStatus = typeof FulfillmentStatus[keyof typeof FulfillmentStatus];

// ─── 订单支付状态 ──────────────────────────────────────────
export const PaymentStatus = {
  Unpaid: "unpaid",
  Paid: "paid",
  Refunded: "refunded",
  Failed: "failed",
} as const;
export type PaymentStatus = typeof PaymentStatus[keyof typeof PaymentStatus];

// ─── 退款状态 ──────────────────────────────────────────────
export const RefundStatus = {
  Pending: "pending",
  Approved: "approved",
  Rejected: "rejected",
  Returned: "returned",
  Completed: "completed",
} as const;
export type RefundStatus = typeof RefundStatus[keyof typeof RefundStatus];
export const REFUND_STATUS_VALUES: readonly RefundStatus[] = Object.values(RefundStatus);
export function isRefundStatus(value: unknown): value is RefundStatus {
  return typeof value === "string" && (REFUND_STATUS_VALUES as readonly string[]).includes(value);
}

// ─── 库存操作（入库/出库/调整） ────────────────────────────
export const InventoryAction = {
  In: "in",
  Out: "out",
  Restock: "restock",
  Adjust: "adjust",
} as const;
export type InventoryAction = typeof InventoryAction[keyof typeof InventoryAction];
export const INVENTORY_ACTION_VALUES: readonly InventoryAction[] = Object.values(InventoryAction);

// ─── 员工角色 ──────────────────────────────────────────────
export const StaffRole = {
  Admin: "admin",
  Manager: "manager",
  Operator: "operator",
  Support: "support",
} as const;
export type StaffRole = typeof StaffRole[keyof typeof StaffRole];
export const STAFF_ROLE_VALUES: readonly StaffRole[] = Object.values(StaffRole);

// ─── 商品状态 ──────────────────────────────────────────────
export const ProductStatus = {
  Active: "active",
  Inactive: "inactive",
  Sold: "sold",
} as const;
export type ProductStatus = typeof ProductStatus[keyof typeof ProductStatus];

// ─── 支付方式类型 ──────────────────────────────────────────
export const PaymentMethodType = {
  OnlineGateway: "online_gateway",
  OfflineManual: "offline_manual",
} as const;
export type PaymentMethodType = typeof PaymentMethodType[keyof typeof PaymentMethodType];
