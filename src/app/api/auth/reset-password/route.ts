import { NextRequest, NextResponse } from "next/server"
import { verifyToken, hashPassword, passwordResetVersion, safeTimingEqualString } from "@/lib/auth-local"
import { db } from "@/lib/db"
import { IS_DEMO_MODE } from "@/config/constants"
import { AUTH_API_MESSAGES } from "@/lib/auth-api-messages"


export async function POST(request: NextRequest) {
  try {
    const { token, password } = await request.json()

    if (!token) {
      return NextResponse.json({ error: "Reset token is required" }, { status: 400 })
    }
    if (!password || password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 })
    }

    const payload = verifyToken(token)
    if (!payload || payload.role !== "password_reset" || !payload.pwdv) {
      return NextResponse.json({ error: AUTH_API_MESSAGES.invalidResetLink }, { status: 400 })
    }

    if (IS_DEMO_MODE) {
      return NextResponse.json({
        data: { message: "Password reset successful in demo mode." },
      })
    }

    const [rows] = await db.$client.execute(
      "SELECT id, email, password_hash FROM users WHERE id = ? AND email = ? LIMIT 1",
      [payload.sub, payload.email],
    )
    const users = rows as { id: string; email: string; password_hash: string | null }[]
    const user = users[0]

    if (!user) {
      return NextResponse.json({ error: AUTH_API_MESSAGES.invalidResetLink }, { status: 400 })
    }

    const currentVersion = passwordResetVersion(user.password_hash)
    if (!safeTimingEqualString(currentVersion, payload.pwdv)) {
      return NextResponse.json({ error: AUTH_API_MESSAGES.invalidResetLink }, { status: 400 })
    }

    const passwordHash = hashPassword(password)
    const [result] = await db.$client.execute(
      "UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ? AND email = ? AND password_hash <=> ?",
      [passwordHash, user.id, user.email, user.password_hash],
    )
    const affectedRows = Number((result as { affectedRows?: number }).affectedRows ?? 0)
    if (affectedRows !== 1) {
      return NextResponse.json({ error: AUTH_API_MESSAGES.invalidResetLink }, { status: 400 })
    }

    return NextResponse.json({
      data: { message: "Password reset successful. Please sign in with the new password." },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Password reset failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
