import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole, errorResponse } from "@/services/auth/auth-middleware";
import { batchCreateCoupons } from "@/services/admin/coupon-service";

export async function POST(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin"]);
    const body = await request.json();
    const result = await batchCreateCoupons(body);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
