import { NextRequest, NextResponse } from "next/server";

import { parsePosJson, posApiErrorResponse } from "@/services/admin/pos-api-response";
import { PosApiError } from "@/services/admin/pos-errors";
import { requirePosOperatorSession } from "@/services/admin/pos-operator-session-service";
import { closeShift } from "@/services/admin/pos-shift-service";
import { requireUser } from "@/services/auth/auth-middleware";

const POS_ACCOUNT_ROLES = new Set(["admin", "manager", "operator"]);

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    if (!user.staffId || !user.role || !POS_ACCOUNT_ROLES.has(user.role)) {
      throw new PosApiError("FORBIDDEN", "Insufficient permissions", 403);
    }
    const operator = await requirePosOperatorSession(request, user.id);
    const body = await parsePosJson(request);
    if (typeof body.counted_cash !== "string" || typeof body.idempotency_key !== "string") {
      throw new PosApiError("SHIFT_CLOSE_REQUEST_INVALID", "counted_cash and idempotency_key are required", 400);
    }
    const { id } = await context.params;
    const data = await closeShift({
      shift_id: id,
      counted_cash: body.counted_cash,
      idempotency_key: body.idempotency_key,
      operator,
    });
    return NextResponse.json({ data });
  } catch (error) {
    return posApiErrorResponse(error);
  }
}
