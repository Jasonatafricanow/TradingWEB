/**
 * 业务常量
 */
export const ORDER_STATUS: Record<string, string> = {
  pending: "待支付",
  paid: "已支付",
  processing: "处理中",
  completed: "已完成",
  cancelled: "已取消",
  refunded: "已退款",
}

export const ORDER_STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  paid: "bg-blue-100 text-blue-700",
  processing: "bg-purple-100 text-purple-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
  refunded: "bg-gray-100 text-gray-700",
}

export { PRODUCT_TYPES } from "./product-types"

export const DELIVERY_METHODS = ["online", "email", "download"] as const

export const STAFF_ROLES = ["admin", "operator", "support"] as const

export const MEMBERSHIP_TIERS = [
  { level: 1, name: "普通会员", minSpent: 0, discount: 0 },
  { level: 2, name: "白银会员", minSpent: 100, discount: 3 },
  { level: 3, name: "黄金会员", minSpent: 500, discount: 5 },
  { level: 4, name: "铂金会员", minSpent: 2000, discount: 8 },
  { level: 5, name: "钻石会员", minSpent: 5000, discount: 12 },
] as const

/** 演示模式判定（纯函数，便于测试）：production 下永不 demo；非 production 且未配 DB 时 demo。 */
export function resolveIsDemoMode(env: { NODE_ENV?: string; DB_HOST?: string } = process.env): boolean {
  if (env.NODE_ENV === "production") return false;
  return !env.DB_HOST || env.DB_HOST.trim() === "";
}

/** 演示模式检测（未配置数据库且非 production 时） */
export const IS_DEMO_MODE = resolveIsDemoMode();
