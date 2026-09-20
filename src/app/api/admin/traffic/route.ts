import { NextRequest, NextResponse } from "next/server"
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware"
import { getTrafficSummary } from "@/services/admin/traffic-service"

// GET /api/admin/traffic
export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    await requireUser(request)
    const days = parseInt(request.nextUrl.searchParams.get("days") || "30", 10)
    const result = await getTrafficSummary(days)
    return NextResponse.json({ data: result })
  } catch (err) {
    return errorResponse(err)
  }
}
