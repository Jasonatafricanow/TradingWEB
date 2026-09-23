import { NextRequest, NextResponse } from "next/server"
import { IS_DEMO_MODE } from "@/config/constants"
import { errorResponse, requireUser } from "@/services/auth/auth-middleware"

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request)

    if (IS_DEMO_MODE) {
      return NextResponse.json({
        data: { id: user.id, email: user.email, name: user.name ?? null },
      })
    }

    const { db } = await import("@/lib/db")
    const [rows] = await db.$client.execute(
      "SELECT id, email, name, avatar_url, created_at FROM users WHERE id = ? AND is_active = 1 LIMIT 1",
      [user.id],
    )
    const users = rows as {
      id: string
      email: string
      name: string | null
      avatar_url: string | null
      created_at: string
    }[]

    if (users.length === 0) {
      return NextResponse.json({ error: "User not found or disabled" }, { status: 401 })
    }

    return NextResponse.json({ data: users[0] })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser(request)

    if (IS_DEMO_MODE) {
      return NextResponse.json({ success: true })
    }

    const { db } = await import("@/lib/db")
    const body = await request.json()
    const { name } = body

    await db.$client.execute(
      "UPDATE users SET name = ? WHERE id = ? AND is_active = 1",
      [name || null, user.id],
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    return errorResponse(err)
  }
}
