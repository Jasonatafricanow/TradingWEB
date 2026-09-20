import { NextRequest, NextResponse } from "next/server";

import { posApiErrorResponse } from "@/services/admin/pos-api-response";
import { PosApiError } from "@/services/admin/pos-errors";
import { listPosOrders, parsePosOrderQuery } from "@/services/admin/pos-order-query-service";
import { requirePosOperatorSession } from "@/services/admin/pos-operator-session-service";
import { requireUser } from "@/services/auth/auth-middleware";

const POS_ACCOUNT_ROLES = new Set(["admin", "manager", "operator"]);

async function operator(request: NextRequest) {
  const user = await requireUser(request);
  if (!user.staffId || !user.role || !POS_ACCOUNT_ROLES.has(user.role)) {
    throw new PosApiError("FORBIDDEN", "Insufficient permissions", 403);
  }
  return requirePosOperatorSession(request, user.id);
}

export async function GET(request: NextRequest) {
  try {
    const activeOperator = await operator(request);
    const query = parsePosOrderQuery(new URL(request.url));
    return NextResponse.json({ data: await listPosOrders({ operator: activeOperator, query }) });
  } catch (error) {
    return posApiErrorResponse(error);
  }
}
