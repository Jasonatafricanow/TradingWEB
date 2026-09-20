// GET /api/affiliates/dashboard — 推广者仪表盘
import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/services/auth/auth-middleware"
import { getMyAffiliate, getAffiliateDashboard } from "@/services/affiliate/affiliate-service"

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request)
    const affiliate = await getMyAffiliate(user.id)
    if (!affiliate) return NextResponse.json({ error: "Not an affiliate" }, { status: 403 })
    const dashboard = await getAffiliateDashboard(affiliate.id as string)
    return NextResponse.json({ data: dashboard })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
