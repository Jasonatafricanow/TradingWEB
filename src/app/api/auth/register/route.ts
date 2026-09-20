import { NextRequest, NextResponse } from "next/server"
import { hashPassword, signToken } from "@/lib/auth-local"
import { randomUUID } from "node:crypto"
import { IS_DEMO_MODE } from "@/config/constants"

export async function POST(request: NextRequest) {
  try {
    const { email, password, name } = await request.json()
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 })
    }

    // ═══════ DEMO MODE ═══════
    if (IS_DEMO_MODE) {
      const id = randomUUID()
      const token = signToken({ sub: id, email })
      return NextResponse.json({
        data: { token, user: { id, email, name: name || null } }
      })
    }

    // ═══════ PRODUCTION MODE ═══════
    const { db } = await import('@/lib/db')

    const [existing] = await db.$client.execute(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [email]
    )
    const existingRows = existing as { id: string }[]
    if (existingRows.length > 0) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 })
    }

    const id = randomUUID()
    const passwordHash = hashPassword(password)
    await db.$client.execute(
      'INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)',
      [id, email, name || null, passwordHash]
    )

    const token = signToken({ sub: id, email })
    return NextResponse.json({
      data: { token, user: { id, email, name: name || null } }
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Registration failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
