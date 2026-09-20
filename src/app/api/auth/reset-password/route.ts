import { NextRequest, NextResponse } from "next/server"
import { verifyToken, hashPassword } from "@/lib/auth-local"
import { db } from "@/lib/db"
import { IS_DEMO_MODE } from "@/config/constants"

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
    if (!payload || payload.role !== "password_reset") {
      return NextResponse.json({ error: "Reset link is expired or invalid" }, { status: 400 })
    }

    if (IS_DEMO_MODE) {
      return NextResponse.json({
        data: { message: "Password reset successful in demo mode." },
      })
    }

    const passwordHash = hashPassword(password)
    await db.$client.execute(
      "UPDATE users SET password_hash = ? WHERE email = ?",
      [passwordHash, payload.email]
    )

    return NextResponse.json({
      data: { message: "Password reset successful. Please sign in with the new password." },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Password reset failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
