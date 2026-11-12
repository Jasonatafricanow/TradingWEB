import { NextResponse } from "next/server"
import { requireUser, errorResponse } from "@/services/auth/auth-middleware"
import { getUserMembership, getUserWallet, getUserCoupons } from "@/services/admin/membership-service"
import { db } from "@/lib/db"

// GET /api/memberships/me — 当前用户会员信息 + 钱包 + 优惠券
export async function GET(request: Request) {
  try {
    const user = await requireUser(request)
    const [membership, wallet, coupons] = await Promise.all([
      getUserMembership(user.id),
      getUserWallet(user.id),
      getUserCoupons(user.id),
    ])
    // user_memberships totals are never updated after an order (TW-16), so
    // report spend and order count from the orders themselves (read-only).
    const [rows] = await db.$client.execute(
      "SELECT COUNT(*) AS orders, COALESCE(SUM(total_amount - COALESCE(refunded_total, 0)), 0) AS spent FROM orders WHERE user_id = ? AND payment_status IN ('paid', 'refunded')",
      [user.id],
    )
    const live = (rows as Array<{ orders: number | string; spent: number | string }>)[0]
    const liveMembership = membership
      ? { ...membership, total_orders: Number(live?.orders ?? 0), total_spent: Number(live?.spent ?? 0).toFixed(2) }
      : membership
    return NextResponse.json({ data: { membership: liveMembership, wallet, coupons } })
  } catch (err) {
    return errorResponse(err)
  }
}
