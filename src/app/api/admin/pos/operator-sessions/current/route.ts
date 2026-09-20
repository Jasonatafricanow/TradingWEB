import { NextRequest, NextResponse } from "next/server";

import { requireStaffRole, requireUser } from "@/services/auth/auth-middleware";
import { posApiErrorResponse } from "@/services/admin/pos-api-response";
import { requirePosOperatorSession, revokeOperatorSession } from "@/services/admin/pos-operator-session-service";

export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "manager", "operator"]);
    const user = await requireUser(request);
    const data = await requirePosOperatorSession(request, user.id);
    return NextResponse.json({ data });
  } catch (error) {
    return posApiErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "manager", "operator"]);
    const user = await requireUser(request);
    const token = request.headers.get("X-POS-Operator-Session")?.trim();
    if (!token) return NextResponse.json({ error: { code: "OPERATOR_SESSION_REQUIRED", message: "Operator session is required", retryable: false, details: null } }, { status: 401 });
    const revoked = await revokeOperatorSession(token, user.id);
    return NextResponse.json({ data: { revoked } });
  } catch (error) {
    return posApiErrorResponse(error);
  }
}
