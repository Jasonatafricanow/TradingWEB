import { NextRequest, NextResponse } from "next/server";

import { createPosInventoryTransfer } from "@/services/admin/inventory-service";
import { parsePosJson, posApiErrorResponse } from "@/services/admin/pos-api-response";
import { parsePosTransferCreateRequest } from "@/services/admin/pos-contracts";
import { PosApiError } from "@/services/admin/pos-errors";
import { requirePosOperatorSession } from "@/services/admin/pos-operator-session-service";
import { requireUser } from "@/services/auth/auth-middleware";

const POS_ACCOUNT_ROLES = new Set(["admin", "manager", "operator"]);

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user.staffId || !user.role || !POS_ACCOUNT_ROLES.has(user.role)) {
      throw new PosApiError("FORBIDDEN", "Insufficient permissions", 403);
    }
    const operator = await requirePosOperatorSession(request, user.id);
    const body = parsePosTransferCreateRequest(await parsePosJson(request));
    const data = await createPosInventoryTransfer({ ...body, operator });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return posApiErrorResponse(error);
  }
}
