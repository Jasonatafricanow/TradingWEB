import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware";
import { getDashboardStats } from "@/services/admin/dashboard-service";

export async function GET(request: Request) {
  try {
    await requireStaffRole(request, ["admin", "operator", "support"]);
    await requireUser(request);
    const stats = await getDashboardStats();
    return NextResponse.json({ data: stats });
  } catch (err) {
    return errorResponse(err);
  }
}
