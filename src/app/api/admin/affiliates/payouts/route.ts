// GET /api/admin/affiliates/payouts — 提现列表
import { NextRequest, NextResponse } from "next/server"
import { requireUser, requireStaffRole } from "@/services/auth/auth-middleware"
import { listPayouts } from "@/services/affiliate/affiliate-service"

export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    await requireUser(request)
    const result = await listPayouts()
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
