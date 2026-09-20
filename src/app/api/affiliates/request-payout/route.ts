// POST /api/affiliates/request-payout — 申请提现
import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/services/auth/auth-middleware"
import { getMyAffiliate, requestPayout } from "@/services/affiliate/affiliate-service"

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request)
    const { amount } = await request.json()
    const payoutAmount = Number(amount)
    if (!Number.isFinite(payoutAmount) || payoutAmount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 })
    }
    const affiliate = await getMyAffiliate(user.id)
    if (!affiliate) return NextResponse.json({ error: "Not an affiliate" }, { status: 403 })
    const data = await requestPayout(affiliate.id as string, payoutAmount)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
