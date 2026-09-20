import { redirect } from "next/navigation";

/**
 * Deprecated: 早期分类雏形，已被 /products?type=... 取代。
 * 保留路径仅用于兼容历史链接 → 重定向到主商品列表。
 */
export default function DeprecatedPhysicalPage() {
  redirect("/products");
}
