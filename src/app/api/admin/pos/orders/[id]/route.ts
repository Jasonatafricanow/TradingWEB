import { NextRequest, NextResponse } from "next/server";

import { posApiErrorResponse } from "@/services/admin/pos-api-response";
import { PosApiError } from "@/services/admin/pos-errors";
import { getPosOrder } from "@/services/admin/pos-order-query-service";
import { requirePosOperatorSession } from "@/services/admin/pos-operator-session-service";
import { requireUser } from "@/services/auth/auth-middleware";

const POS_ACCOUNT_ROLES = new Set(["admin", "manager", "operator"]);

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    if (!user.staffId || !user.role || !POS_ACCOUNT_ROLES.has(user.role)) {
      throw new PosApiError("FORBIDDEN", "Insufficient permissions", 403);
    }
    const operator = await requirePosOperatorSession(request, user.id);
    const { id } = await context.params;
    return NextResponse.json({ data: await getPosOrder({ operator, orderId: id }) });
  } catch (error) {
    return posApiErrorResponse(error);
  }
}
