/**
 * getErrorMessage — 统一错误消息提取工具
 *
 * 优先级链：string → Error.message → object.message → object.error.message
 *         → object.error → JSON.stringify → fallback
 */
export function getErrorMessage(value: unknown, fallback?: string): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.message === "string") return obj.message;
    if (obj.error && typeof obj.error === "object") {
      const errInner = obj.error as Record<string, unknown>;
      if (typeof errInner.message === "string") return errInner.message;
    }
    if (typeof obj.error === "string") return obj.error;
    try {
      return JSON.stringify(value).slice(0, 200);
    } catch {
      // fall through
    }
  }
  return fallback ?? "未知错误";
}
