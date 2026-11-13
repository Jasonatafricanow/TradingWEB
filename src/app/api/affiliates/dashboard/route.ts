// GET /api/affiliates/dashboard — 推广者仪表盘
import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/services/auth/auth-middleware"
import { getMyAffiliate, getAffiliateDashboard } from "@/services/affiliate/affiliate-service"
import { getProgramSettings } from "@/services/promotions/program-settings"

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request)
    const affiliate = await getMyAffiliate(user.id)
    if (!affiliate) return NextResponse.json({ error: "Not an affiliate" }, { status: 403 })
    const [dashboard, programs] = await Promise.all([getAffiliateDashboard(affiliate.id as string), getProgramSettings()])
    return NextResponse.json({ data: { ...dashboard, program: { enabled: programs.affiliate.enabled, hold_days: programs.affiliate.holdDays } } })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
