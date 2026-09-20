import { NextRequest, NextResponse } from "next/server";

import { parsePosJson, posApiErrorResponse } from "@/services/admin/pos-api-response";
import { PosApiError } from "@/services/admin/pos-errors";
import { requirePosOperatorSession } from "@/services/admin/pos-operator-session-service";
import { recordCashMovement } from "@/services/admin/pos-shift-service";
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
    if (
      (body.kind !== "in" && body.kind !== "out")
      || typeof body.amount !== "string"
      || typeof body.reason !== "string"
      || typeof body.idempotency_key !== "string"
    ) {
      throw new PosApiError("CASH_MOVEMENT_REQUEST_INVALID", "Invalid cash movement request", 400);
    }
    const { id } = await context.params;
    const data = await recordCashMovement({
      shift_id: id,
      kind: body.kind,
      amount: body.amount,
      reason: body.reason,
      idempotency_key: body.idempotency_key,
      operator,
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return posApiErrorResponse(error);
  }
}
