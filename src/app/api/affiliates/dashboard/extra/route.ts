// GET /api/affiliates/dashboard-extra — 仪表盘额外数据
import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/services/auth/auth-middleware"
import { getMyAffiliate } from "@/services/affiliate/affiliate-service"
import { commissionService } from "@/services/affiliate/commission-service"

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request)
    const affiliate = await getMyAffiliate(user.id)
    if (!affiliate) return NextResponse.json({ error: "Not an affiliate" }, { status: 403 })
    const extra = await commissionService.getExtra(affiliate.id as string)
    return NextResponse.json({ data: extra })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
