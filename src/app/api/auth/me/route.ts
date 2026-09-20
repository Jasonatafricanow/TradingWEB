import { NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth-local"
import { IS_DEMO_MODE } from "@/config/constants"

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 })
    }

    const token = authHeader.slice(7)
    const payload = verifyToken(token)
    if (!payload) {
      return NextResponse.json({ error: "Session expired, please login again" }, { status: 401 })
    }

    // ═══════ DEMO MODE — return JWT data directly ═══════
    if (IS_DEMO_MODE) {
      return NextResponse.json({
        data: { id: payload.sub, email: payload.email, name: null }
      })
    }

    // ═══════ PRODUCTION MODE ═══════
    const { db } = await import('@/lib/db')

    const [rows] = await db.$client.execute(
      'SELECT id, email, name, avatar_url, created_at FROM users WHERE id = ? LIMIT 1',
      [payload.sub]
    )
    const users = rows as { id: string; email: string; name: string | null; avatar_url: string | null; created_at: string }[]

    if (users.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    return NextResponse.json({ data: users[0] })
  } catch (err) {
    return NextResponse.json({ error: "Verification failed" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 })
    }

    const token = authHeader.slice(7)
    const payload = verifyToken(token)
    if (!payload) {
      return NextResponse.json({ error: "Session expired" }, { status: 401 })
    }

    // ═══════ DEMO MODE — silently accept ═══════
    if (IS_DEMO_MODE) {
      return NextResponse.json({ success: true })
    }

    // ═══════ PRODUCTION MODE ═══════
    const { db } = await import('@/lib/db')

    const body = await request.json()
    const { name } = body

    await db.$client.execute(
      "UPDATE users SET name = ? WHERE id = ?",
      [name || null, payload.sub]
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 })
  }
}
