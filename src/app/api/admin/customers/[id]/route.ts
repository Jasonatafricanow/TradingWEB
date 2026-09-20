import { NextRequest, NextResponse } from "next/server"
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware"
import { getCustomerDetail } from "@/services/admin/customer-service"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaffRole(request, ["admin", "operator", "support"]);
    const { id } = await params
    const data = await getCustomerDetail(id)
    return NextResponse.json({ data })
  } catch (err) { return errorResponse(err) }
}
