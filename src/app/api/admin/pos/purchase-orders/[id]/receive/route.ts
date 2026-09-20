import { NextRequest, NextResponse } from "next/server";

import { parsePosJson, posApiErrorResponse } from "@/services/admin/pos-api-response";
import { parsePosPurchaseOrderReceiveRequest } from "@/services/admin/pos-contracts";
import { PosApiError } from "@/services/admin/pos-errors";
import { requirePosOperatorSession } from "@/services/admin/pos-operator-session-service";
import { receivePosPurchaseOrder } from "@/services/admin/pos-purchase-service";
import { requireUser } from "@/services/auth/auth-middleware";

const POS_ACCOUNT_ROLES = new Set(["admin", "manager", "operator"]);

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    if (!user.staffId || !user.role || !POS_ACCOUNT_ROLES.has(user.role)) {
      throw new PosApiError("FORBIDDEN", "Insufficient permissions", 403);
    }
    const operator = await requirePosOperatorSession(request, user.id);
    const body = parsePosPurchaseOrderReceiveRequest(await parsePosJson(request));
    const { id } = await context.params;
    const data = await receivePosPurchaseOrder({ ...body, purchase_order_id: id, operator });
    return NextResponse.json({ data });
  } catch (error) {
    return posApiErrorResponse(error);
  }
}
