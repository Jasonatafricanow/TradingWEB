import { NextRequest, NextResponse } from "next/server"
import { passwordResetVersion, signToken } from "@/lib/auth-local"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { IS_DEMO_MODE } from "@/config/constants"

const GENERIC_RESET_MESSAGE = "If the email is registered, a reset link will be sent."

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : ""

    if (!normalizedEmail) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    const limit = checkRateLimit(
      `forgot-password:${getClientIp(request)}:${normalizedEmail}`,
      { windowMs: 15 * 60_000, max: 5 },
    )
    if (!limit.allowed) {
      const retryAfter = Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000))
      return NextResponse.json(
        { error: "Too many reset requests. Try again later." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      )
    }

    if (IS_DEMO_MODE) {
      const resetToken = signToken({
        sub: normalizedEmail,
        email: normalizedEmail,
        role: "password_reset",
        pwdv: passwordResetVersion(null),
      }, "15m")
      return NextResponse.json({
        data: {
          message: "Demo reset link generated.",
          reset_url: `/auth/reset-password?token=${resetToken}`,
          token: resetToken,
        },
      })
    }

    const { db } = await import("@/lib/db")
    const [rows] = await db.$client.execute(
      "SELECT id, email, password_hash FROM users WHERE email = ? LIMIT 1",
      [normalizedEmail],
    )
    const users = rows as { id: string; email: string; password_hash: string | null }[]

    if (users.length > 0) {
      const user = users[0]
      const resetToken = signToken({
        sub: user.id,
        email: user.email,
        role: "password_reset",
        pwdv: passwordResetVersion(user.password_hash),
      }, "15m")
      const resetUrl = `${process.env.NEXT_PUBLIC_SITE_URL || "https://fjglobal.online"}/auth/reset-password?token=${resetToken}`

      try {
        const { sendPasswordResetEmail } = await import("@/services/notifications/email-service")
        await sendPasswordResetEmail(user.email, resetUrl)
      } catch (error) {
        // Keep the public response enumeration-safe while preserving a server-side signal.
        console.error("[forgot-password] reset email delivery failed", error)
      }
    }

    return NextResponse.json({
      data: {
        message: GENERIC_RESET_MESSAGE,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
