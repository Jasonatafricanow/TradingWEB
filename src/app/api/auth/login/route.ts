import { NextRequest, NextResponse } from "next/server"
import { hashPassword, verifyPassword, signToken } from "@/lib/auth-local"
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit"
import { IS_DEMO_MODE } from "@/config/constants"
import { AUTH_API_MESSAGES } from "@/lib/auth-api-messages"

/** Demo users for when no database is configured */
const DEMO_USERS: Record<string, { password: string; id: string; name: string }> = {
  "demo@example.com": { password: "demo123", id: "demo-user-001", name: "Demo User" },
  "admin@globaltrade.enterprise": { password: "admin123", id: "demo-admin-001", name: "Admin" },
}

const DUMMY_PASSWORD_HASH = hashPassword("invalid-login-dummy-password")

export async function POST(request: NextRequest) {
  try {
    // production 缺 DB_HOST → fail-closed，拒绝签发 demo token（明确配置错误）
    if (process.env.NODE_ENV === "production" && (!process.env.DB_HOST || process.env.DB_HOST.trim() === "")) {
      return NextResponse.json(
        { error: "Server is not configured (missing DB_HOST in production)" },
        { status: 503 },
      )
    }

    const { email, password } = await request.json()
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : ""
    if (!normalizedEmail || typeof password !== "string" || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 })
    }

    const clientIp = getClientIp(request)
    const limit = checkRateLimit(
      `login:${clientIp}:${normalizedEmail}`,
      { ...RATE_LIMITS.auth, windowMs: 5 * 60_000, max: 10 },
    )
    if (!limit.allowed) {
      const retryAfter = Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000))
      return NextResponse.json(
        { error: AUTH_API_MESSAGES.tooManyLoginAttempts },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      )
    }

    // ═══════ DEMO MODE (no DB required) ═══════
    if (IS_DEMO_MODE) {
      const demoUser = DEMO_USERS[normalizedEmail]
      if (!demoUser || demoUser.password !== password.trim()) {
        return NextResponse.json({
          error: "Demo mode — use demo@example.com / demo123"
        }, { status: 401 })
      }
      const token = signToken({ sub: demoUser.id, email: normalizedEmail })
      return NextResponse.json({
        data: {
          token,
          user: { id: demoUser.id, email: normalizedEmail, name: demoUser.name },
        }
      })
    }

    // ═══════ PRODUCTION MODE (DB required) ═══════
    const { db } = await import("@/lib/db")

    let users: { id: string; email: string; name: string | null; password_hash: string | null; is_active: number }[] = []
    try {
      const [rows] = await db.$client.execute(
        "SELECT id, email, name, password_hash, is_active FROM users WHERE email = ? LIMIT 1",
        [normalizedEmail],
      )
      users = rows as typeof users
    } catch {
      return NextResponse.json({ error: "System error, please try again later" }, { status: 500 })
    }

    const user = users[0]
    if (!user) {
      // Keep the missing-user path computationally close to a bad-password path.
      verifyPassword(password, DUMMY_PASSWORD_HASH)
      return NextResponse.json({ error: AUTH_API_MESSAGES.invalidCredentials }, { status: 401 })
    }

    const passwordHash = user.password_hash || DUMMY_PASSWORD_HASH
    const passwordOk = verifyPassword(password, passwordHash)
    if (!user.is_active || !user.password_hash || !passwordOk) {
      return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 })
    }

    const token = signToken({ sub: user.id, email: user.email })
    return NextResponse.json({
      data: {
        token,
        user: { id: user.id, email: user.email, name: user.name },
      }
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Login failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
