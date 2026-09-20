import { NextRequest, NextResponse } from "next/server";

import { parsePosJson, posApiErrorResponse } from "@/services/admin/pos-api-response";
import { PosApiError } from "@/services/admin/pos-errors";
import { requirePosOperatorSession } from "@/services/admin/pos-operator-session-service";
import { openShift } from "@/services/admin/pos-shift-service";
import { requireUser } from "@/services/auth/auth-middleware";

const POS_ACCOUNT_ROLES = new Set(["admin", "manager", "operator"]);

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user.staffId || !user.role || !POS_ACCOUNT_ROLES.has(user.role)) {
      throw new PosApiError("FORBIDDEN", "Insufficient permissions", 403);
    }
    const operator = await requirePosOperatorSession(request, user.id);
    const body = await parsePosJson(request);
    if (typeof body.opening_float !== "string") {
      throw new PosApiError("SHIFT_REQUEST_INVALID", "opening_float is required", 400);
    }
    const data = await openShift({ opening_float: body.opening_float, operator });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return posApiErrorResponse(error);
  }
}
