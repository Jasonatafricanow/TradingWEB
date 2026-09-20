/**
 * 类型安全的输入清洗函数集
 *
 * 每个函数针对一种 MySQL 列类型做明确的空值/非法值处理，
 * 而不是依赖 falsy 判断或数据库自动转换。
 */

import { ValidationError } from "@/lib/errors";

/**
 * 可空字符串：空字符串 → null，非法类型抛错
 */
export function emptyToNull(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new ValidationError(`Expected string, got ${typeof value}`);
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * 可空金额：缺失/空字符串 → null，保留 0 作为合法值
 * 用于 cost_price、compare_at_price 等"未知 ≠ 零"的字段
 */
export function decimalOrNull(value: unknown): string | null {
  if (value === "" || value === undefined || value === null) return null;
  const normalized = String(value).trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new ValidationError(`Invalid decimal value: ${normalized}`);
  }
  return Number(normalized).toFixed(2);
}

/**
 * 必须存在的金额：缺失 → "0.00"，非法值抛错
 * 用于 shipping_cost, discount_amount, total_amount 等"未填写 = 零"的字段
 */
export function moneyOrZero(value: unknown): string {
  if (value === "" || value === undefined || value === null) return "0.00";
  const normalized = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new ValidationError(`Invalid money value: ${normalized}`);
  }
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new ValidationError(`Invalid money value: ${normalized}`);
  }
  return amount.toFixed(2);
}

/**
 * 可空日期：空字符串 → null，非法日期格式抛错
 */
export function dateOrNull(value: unknown): string | null {
  if (value === "" || value === undefined || value === null) return null;
  const normalized = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new ValidationError(`Invalid date format (expected YYYY-MM-DD): ${normalized}`);
  }
  const date = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
    throw new ValidationError(`Invalid date: ${normalized}`);
  }
  return normalized;
}

/**
 * 可空 UUID：空字符串 → null
 */
export function uuidOrNull(value: unknown): string | null {
  if (value === "" || value === undefined || value === null) return null;
  const normalized = String(value).trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new ValidationError(`Invalid UUID format: ${normalized}`);
  }
  return normalized;
}

/**
 * 记录 Drizzle/MySQL 完整错误（含底层 cause）
 */
export function logDbError(context: string, err: unknown): void {
  const error = err as Record<string, unknown>;
  console.error("[DB_ERROR] " + context, {
    message: error?.message ?? String(err),
    code: (error?.cause as Record<string, unknown>)?.code ?? (error as Record<string, unknown>).code,
    sqlMessage: (error?.cause as Record<string, unknown>)?.sqlMessage,
    sqlState: (error?.cause as Record<string, unknown>)?.sqlState,
    errno: (error?.cause as Record<string, unknown>)?.errno,
  });
}
