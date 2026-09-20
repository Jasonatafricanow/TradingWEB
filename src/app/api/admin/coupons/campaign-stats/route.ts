import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole, errorResponse } from "@/services/auth/auth-middleware";
import { getCouponCampaignStats } from "@/services/admin/coupon-service";

export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const data = await getCouponCampaignStats();
    return NextResponse.json({ data });
  } catch (err) {
    return errorResponse(err);
  }
}
