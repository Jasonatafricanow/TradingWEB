// POST /api/affiliates/exit — 退出推广并结算
import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/services/auth/auth-middleware"
import { getMyAffiliate } from "@/services/affiliate/affiliate-service"
import { commissionService } from "@/services/affiliate/commission-service"

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request)
    const affiliate = await getMyAffiliate(user.id)
    if (!affiliate) return NextResponse.json({ error: "Not an affiliate" }, { status: 403 })
    if (affiliate.status === "deactivated") return NextResponse.json({ error: "Already deactivated" }, { status: 400 })

    const settlement = await commissionService.processExit(affiliate.id)
    return NextResponse.json({ data: settlement })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
