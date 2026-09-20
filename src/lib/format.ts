/**
 * 金额格式化工具 — 统一处理 DB DECIMAL 字符串/数字/NULL 值。
 *
 * MySQL DECIMAL 通过 Drizzle ORM 返回到前端是 string 类型，
 * 直接调 .toFixed() 会抛 "toFixed is not a function"。
 * 本函数安全包装，同时提供可选币种前缀。
 */
export function formatMoney(v: unknown, opts?: { fallback?: string; currency?: string }): string {
  const n = typeof v === "number" ? v : Number(v);
  const safe = Number.isFinite(n) ? n.toFixed(2) : (opts?.fallback ?? "0.00");
  return opts?.currency ? `${opts.currency} ${safe}` : safe;
}
