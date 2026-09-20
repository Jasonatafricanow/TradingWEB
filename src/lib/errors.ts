/**
 * 业务异常体系 —— 与 errorResponse 配套使用。
 *
 * 设计原则：
 * 1. 不引入新依赖；继承原生 Error，避免任何运行时副作用。
 * 2. status 字段允许 errorResponse 在不 import 每个类的情况下识别类型。
 * 3. code 字段供客户端 ApiError 归类（与 TradingWEB POS 错误体形态保持一致）。
 * 4. retryable 字段供客户端判断 4xx/5xx 内"是否值得重试"。
 * 5. details 字段承载额外的结构化负载（字段名、限制值等），客户端可选用。
 *
 * 与原 ValidationError 完全向后兼容：原有 `throw new ValidationError(msg)` 调用无需改。
 *
 * 使用示例：
 *   throw new NotFoundError("优惠码不存在", { code: "coupon" });
 *   throw new ConflictError("邮箱已被注册", "EMAIL_TAKEN", { email });
 *   throw new AppError("上游支付网关超时", 502, "UPSTREAM_TIMEOUT", true);
 */

export interface AppErrorOptions {
  code?: string;
  retryable?: boolean;
  details?: unknown;
}

export class AppError extends Error {
  status: number;
  code: string;
  retryable: boolean;
  details: unknown;

  constructor(
    message: string,
    status: number,
    code = "INTERNAL_ERROR",
    options: AppErrorOptions = {},
  ) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.retryable = options.retryable ?? status >= 500;
    this.details = options.details ?? null;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details: unknown = null) {
    super(message, 400, "VALIDATION_ERROR", { details });
    this.name = "ValidationError";
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, details: unknown = null) {
    super(message, 404, "NOT_FOUND", { details });
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code = "CONFLICT", details: unknown = null) {
    super(message, 409, code, { details });
    this.name = "ConflictError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Not authenticated", details: unknown = null) {
    super(message, 401, "UNAUTHORIZED", { details });
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Insufficient permissions", details: unknown = null) {
    super(message, 403, "FORBIDDEN", { details });
    this.name = "ForbiddenError";
  }
}

/**
 * 判断一个未知值是否属于本异常体系。
 * 用于在 catch 块内做窄化，而不需要每次 `instanceof AppError`。
 */
export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
