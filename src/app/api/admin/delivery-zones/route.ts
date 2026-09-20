import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole, errorResponse } from "@/services/auth/auth-middleware";
import { listDeliveryZones, createDeliveryZone } from "@/services/admin/delivery-zone-service";

export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const activeOnly = request.nextUrl.searchParams.get("active") === "true";
    const data = await listDeliveryZones(activeOnly);
    return NextResponse.json({ data });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin"]);
    const body = await request.json();
    const data = await createDeliveryZone(body);
    return NextResponse.json({ data });
  } catch (err) {
    return errorResponse(err);
  }
}
