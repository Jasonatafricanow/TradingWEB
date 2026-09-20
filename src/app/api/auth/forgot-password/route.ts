import { NextRequest, NextResponse } from "next/server"
import { signToken } from "@/lib/auth-local"
import { IS_DEMO_MODE } from "@/config/constants"

const GENERIC_RESET_MESSAGE = "If the email is registered, a reset link will be sent."

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : ""

    if (!normalizedEmail) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    if (IS_DEMO_MODE) {
      const resetToken = signToken({ sub: normalizedEmail, email: normalizedEmail, role: "password_reset" }, "15m")
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
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [normalizedEmail]
    )
    const users = rows as { id: string }[]

    if (users.length > 0) {
      const resetToken = signToken({ sub: normalizedEmail, email: normalizedEmail, role: "password_reset" }, "15m")
      const resetUrl = `${process.env.NEXT_PUBLIC_SITE_URL || "https://fjglobal.online"}/auth/reset-password?token=${resetToken}`
      // TODO: Send resetUrl through the configured email provider.
      void resetUrl
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
