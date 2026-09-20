import { NextRequest, NextResponse } from "next/server";

import { parsePosJson, posApiErrorResponse } from "@/services/admin/pos-api-response";
import { parsePosPurchaseOrderCreateRequest } from "@/services/admin/pos-contracts";
import { PosApiError } from "@/services/admin/pos-errors";
import { requirePosOperatorSession } from "@/services/admin/pos-operator-session-service";
import { createPosPurchaseOrder, listPosPurchaseOrders } from "@/services/admin/pos-purchase-service";
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
    return NextResponse.json({ data: await listPosPurchaseOrders({ operator: await operator(request) }) });
  } catch (error) {
    return posApiErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const activeOperator = await operator(request);
    const body = parsePosPurchaseOrderCreateRequest(await parsePosJson(request));
    const data = await createPosPurchaseOrder({ ...body, operator: activeOperator });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return posApiErrorResponse(error);
  }
}
