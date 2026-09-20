import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware";
import { getOrderStats } from "@/services/admin/orders-service";

export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator", "support"]);
    await requireUser(request);
    const stats = await getOrderStats();
    return NextResponse.json({ data: stats });
  } catch (err) {
    return errorResponse(err);
  }
}
