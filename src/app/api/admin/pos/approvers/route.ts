import { NextRequest, NextResponse } from "next/server";

import { requireStaffRole, requireUser } from "@/services/auth/auth-middleware";
import { posApiErrorResponse } from "@/services/admin/pos-api-response";
import { discoverPosApprovers } from "@/services/admin/pos-approver-discovery-service";
import { PosOperatorSessionError, requirePosOperatorSession } from "@/services/admin/pos-operator-session-service";

export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "manager", "operator"]);
    const user = await requireUser(request);
    const operator = await requirePosOperatorSession(request, user.id);
    const requestedStoreId = request.nextUrl.searchParams.get("store_id")?.trim();
    if (requestedStoreId !== operator.storeId) {
      throw new PosOperatorSessionError("OPERATOR_STORE_MISMATCH", 403);
    }
    const data = await discoverPosApprovers(operator.storeId);
    return NextResponse.json({ data });
  } catch (error) {
    return posApiErrorResponse(error);
  }
}
