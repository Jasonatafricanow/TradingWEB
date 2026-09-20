import { NextRequest, NextResponse } from "next/server"
import { verifyPassword, signToken } from "@/lib/auth-local"
import { IS_DEMO_MODE } from "@/config/constants"

/** Demo users for when no database is configured */
const DEMO_USERS: Record<string, { password: string; id: string; name: string }> = {
  "demo@example.com": { password: "demo123", id: "demo-user-001", name: "Demo User" },
  "admin@globaltrade.enterprise": { password: "admin123", id: "demo-admin-001", name: "Admin" },
}

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
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 })
    }

    // ═══════ DEMO MODE (no DB required) ═══════
    if (IS_DEMO_MODE) {
      const demoUser = DEMO_USERS[email.toLowerCase().trim()]
      if (!demoUser || demoUser.password !== password.trim()) {
        return NextResponse.json({
          error: "Demo mode — use demo@example.com / demo123"
        }, { status: 401 })
      }
      const token = signToken({ sub: demoUser.id, email })
      return NextResponse.json({
        data: {
          token,
          user: { id: demoUser.id, email, name: demoUser.name },
        }
      })
    }

    // ═══════ PRODUCTION MODE (DB required) ═══════
    // Dynamic import: only try DB when not in demo mode
    const { db } = await import('@/lib/db')

    let users: { id: string; email: string; name: string | null; password_hash: string | null; is_active: number }[] = [];
    try {
      const [rows] = await db.$client.execute(
        'SELECT id, email, name, password_hash, is_active FROM users WHERE email = ? LIMIT 1',
        [email]
      );
      users = rows as typeof users;
    } catch {
      return NextResponse.json({ error: "System error, please try again later" }, { status: 500 })
    }

    if (users.length === 0) {
      return NextResponse.json({ error: "Email not registered" }, { status: 401 })
    }

    const user = users[0]

    if (!user.is_active) {
      return NextResponse.json({ error: "Account disabled, contact admin" }, { status: 403 })
    }

    if (!user.password_hash) {
      return NextResponse.json({ error: "No password set — use forgot password" }, { status: 401 })
    }

    if (!verifyPassword(password, user.password_hash)) {
      return NextResponse.json({ error: "Wrong password" }, { status: 401 })
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
