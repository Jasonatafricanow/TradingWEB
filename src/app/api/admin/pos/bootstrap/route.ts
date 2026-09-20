import { NextRequest, NextResponse } from "next/server";

import { requireStaffRole } from "@/services/auth/auth-middleware";
import { posApiErrorResponse } from "@/services/admin/pos-api-response";
import { getPosBootstrap } from "@/services/admin/pos-bootstrap-service";

export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "manager", "operator"]);
    const storeId = new URL(request.url).searchParams.get("store_id")?.trim();
    if (!storeId) return NextResponse.json({ error: { code: "STORE_ID_REQUIRED", message: "store_id is required", retryable: false, details: null } }, { status: 400 });
    const data = await getPosBootstrap(storeId);
    return NextResponse.json({ data });
  } catch (error) {
    return posApiErrorResponse(error);
  }
}
