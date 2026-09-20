import { NextResponse } from "next/server"
import { IS_DEMO_MODE } from "@/config/constants"
import { AppError } from "@/lib/errors"
import { getUserFromToken } from "./auth-service"

export class AuthError extends Error {
  constructor(message: string, public status: number = 401) {
    super(message)
    this.name = "AuthError"
  }
}

export interface AuthenticatedUser {
  id: string
  email: string
  name?: string | null
  role?: string
  staffId?: string
}

export async function requireUser(request: Request): Promise<AuthenticatedUser> {
  if (!process.env.JWT_SECRET && (!IS_DEMO_MODE || process.env.NODE_ENV === "production")) {
    throw new AuthError("Authentication is not configured", 500)
  }

  const authHeader = request.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthError("Not authenticated")
  }

  const token = authHeader.slice(7)
  const user = await getUserFromToken(token)

  if (!user) {
    throw new AuthError("Session expired, please sign in again")
  }

  return user
}

export async function requireStaffRole(request: Request, allowedRoles: string[]): Promise<void> {
  try {
    const user = await requireUser(request)
    if (IS_DEMO_MODE && process.env.NODE_ENV !== "production" && user.role && allowedRoles.includes(user.role)) {
      return
    }
    if (user.staffId && user.role && allowedRoles.includes(user.role)) {
      return
    }
    throw new AuthError("Insufficient permissions", 403)
  } catch (err) {
    if (err instanceof AuthError) throw err
    throw new AuthError("Permission check failed", 403)
  }
}

export function withAuth<T extends (...args: unknown[]) => Promise<Response>>(
  handler: (user: AuthenticatedUser, ...args: Parameters<T>) => Promise<Response>
): T {
  return (async (...args: unknown[]) => {
    const request = args[0] as Request
    try {
      const user = await requireUser(request)
      return handler(user, ...(args as Parameters<T>))
    } catch (err) {
      if (err instanceof AuthError) {
        return NextResponse.json({ error: err.message }, { status: err.status })
      }
      return NextResponse.json({ error: "Authentication failed" }, { status: 500 })
    }
  }) as T
}

export function errorResponse(err: unknown): NextResponse {
  const message = err instanceof Error ? err.message : "Internal server error";
  // AuthError/AppError 取各自 status；其他错误统一 500。
  // 兼容旧 `(err as { status?: number }).status === 400` 的写法。
  const fallbackStatus =
    typeof (err as { status?: number }).status === "number"
      ? (err as { status: number }).status
      : 500;
  const status =
    err instanceof AuthError ? err.status :
    err instanceof AppError ? err.status :
    err instanceof Error && err.name === "ValidationError" ? 400 :
    fallbackStatus;
  // 统一错误体：与 TradingWEB POS PosApiError 形态一致。
  const body: Record<string, unknown> = { error: message };
  if (err instanceof AppError) {
    body.error = {
      code: err.code,
      message: err.message,
      retryable: err.retryable,
      details: err.details,
    };
  }
  // 错误日志：5xx 写到 stderr，4xx 仅在开发环境输出。
  if (status >= 500) {
    console.error("[api-error]", { status, message, err });
  } else if (process.env.NODE_ENV !== "production") {
    console.warn("[api-warn]", { status, message });
  }
  return NextResponse.json(body, { status });
}
