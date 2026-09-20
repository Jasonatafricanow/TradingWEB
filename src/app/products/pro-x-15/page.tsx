import { redirect } from "next/navigation";

/**
 * Deprecated: 硬编码的单品演示页，与动态 /products/[id] 重复。
 * 保留路径仅用于兼容历史链接 → 重定向到主商品列表。
 */
export default function DeprecatedProX15Page() {
  redirect("/products");
}
