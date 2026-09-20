import { NextResponse } from "next/server"
import { requireUser, errorResponse } from "@/services/auth/auth-middleware"
import { getUserMembership, getUserWallet, getUserCoupons } from "@/services/admin/membership-service"

// GET /api/memberships/me — 当前用户会员信息 + 钱包 + 优惠券
export async function GET(request: Request) {
  try {
    const user = await requireUser(request)
    const [membership, wallet, coupons] = await Promise.all([
      getUserMembership(user.id),
      getUserWallet(user.id),
      getUserCoupons(user.id),
    ])
    return NextResponse.json({ data: { membership, wallet, coupons } })
  } catch (err) {
    return errorResponse(err)
  }
}
