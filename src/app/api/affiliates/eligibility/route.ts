// GET /api/affiliates/eligibility — 提现资格
import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/services/auth/auth-middleware"
import { getMyAffiliate } from "@/services/affiliate/affiliate-service"
import { commissionService } from "@/services/affiliate/commission-service"

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request)
    const affiliate = await getMyAffiliate(user.id)
    if (!affiliate) return NextResponse.json({ error: "Not an affiliate" }, { status: 403 })
    const eligibility = await commissionService.checkEligibility(affiliate.id)
    return NextResponse.json({ data: eligibility })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
