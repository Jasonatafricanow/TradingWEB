import { redirect } from "next/navigation";

/**
 * Deprecated: /orders 已支持按状态过滤；保留路径仅用于兼容历史链接。
 * 携带 ?status=pending 参数，让主订单页自动应用过滤。
 */
export default function DeprecatedPendingOrdersPage() {
  redirect("/orders?status=pending");
}
