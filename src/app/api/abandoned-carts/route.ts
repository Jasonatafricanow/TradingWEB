import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/services/auth/auth-middleware"
import { recordAbandonedCart, markRecovered } from "@/services/notifications/abandoned-cart-service"

function normalizeCartItems(value: unknown): unknown[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) return null
  return value
}

function normalizeTotal(value: unknown): number | null {
  const total = Number(value)
  if (!Number.isFinite(total) || total < 0) return null
  return Math.round(total * 100) / 100
}

function normalizeEmail(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim().toLowerCase()
  if (!trimmed || trimmed.length > 255 || !trimmed.includes("@")) return undefined
  return trimmed
}

// POST /api/abandoned-carts — 前端记录弃单
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const items = normalizeCartItems(body.items)
    const total = normalizeTotal(body.total)

    if (!items || total === null) {
      return NextResponse.json({ error: "valid items and total are required" }, { status: 400 })
    }

    const result = await recordAbandonedCart({
      email: normalizeEmail(body.email),
      items,
      total,
    })
    return NextResponse.json({ data: result })
  } catch {
    return NextResponse.json({ error: "Failed to record abandoned cart" }, { status: 500 })
  }
}

// PUT /api/abandoned-carts — 前端标记已恢复（完成支付后调用）
export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser(request)
    await markRecovered(user.id)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed to mark recovered" }, { status: 500 })
  }
}
