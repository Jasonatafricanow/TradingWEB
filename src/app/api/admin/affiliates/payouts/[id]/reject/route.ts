// POST /api/admin/affiliates/payouts/:id/reject — 拒绝提现
import { NextRequest, NextResponse } from "next/server"
import { requireUser, requireStaffRole } from "@/services/auth/auth-middleware"
import { rejectPayout } from "@/services/affiliate/affiliate-service"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    await requireUser(request)
    const { id } = await params
    const data = await rejectPayout(id)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
