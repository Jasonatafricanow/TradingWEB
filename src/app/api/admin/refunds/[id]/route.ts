import { NextRequest, NextResponse } from "next/server"
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware"
import { getRefund } from "@/services/admin/refund-service"

// GET /api/admin/refunds/[id] — 获取退款详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const { id } = await params
    const data = await getRefund(id)
    return NextResponse.json({ data })
  } catch (err) {
    return errorResponse(err)
  }
}
