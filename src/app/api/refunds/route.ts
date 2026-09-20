import { NextRequest, NextResponse } from "next/server"
import { requireUser, errorResponse } from "@/services/auth/auth-middleware"
import { db } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { orders, refunds } from '@/storage/database/shared/schema'
import { randomUUID } from 'node:crypto'

// POST /api/refunds — 用户提交退款申请
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request)
    const body = await request.json()
    const { order_id, reason } = body

    if (!order_id || !reason) {
      return NextResponse.json({ error: "order_id and reason are required" }, { status: 400 })
    }

    // 验证订单属于当前用户
    const [order] = await db.select().from(orders).where(eq(orders.id, order_id)).limit(1);
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 })
    if (order.user_id !== user.id) return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    if (order.status !== "paid" && order.status !== "processing") {
      return NextResponse.json({ error: "Order cannot be refunded" }, { status: 400 })
    }

    // 检查是否已有退款申请
    const [existing] = await db.select().from(refunds).where(eq(refunds.order_id, order_id)).limit(1);
    if (existing) return NextResponse.json({ error: "Refund already requested" }, { status: 409 })

    const id = randomUUID();
    await db.insert(refunds).values({
      id,
      order_id,
      user_id: user.id,
      reason,
      amount: order.total_amount,
      status: "pending",
    } as typeof refunds.$inferInsert);

    const [data] = await db.select().from(refunds).where(eq(refunds.id, id)).limit(1);

    // 标记订单有退款
    await db.update(orders).set({ has_refund: true }).where(eq(orders.id, order_id));

    return NextResponse.json({ data })
  } catch (err) {
    return errorResponse(err)
  }
}
