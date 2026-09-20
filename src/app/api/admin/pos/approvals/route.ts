import { NextRequest, NextResponse } from "next/server";

import { requireStaffRole, requireUser } from "@/services/auth/auth-middleware";
import { parsePosJson, posApiErrorResponse } from "@/services/admin/pos-api-response";
import { issueApprovalToken } from "@/services/admin/pos-approval-service";
import { PosOperatorSessionError, requirePosOperatorSession } from "@/services/admin/pos-operator-session-service";

export async function POST(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "manager", "operator"]);
    const user = await requireUser(request);
    const operator = await requirePosOperatorSession(request, user.id);
    const body = await parsePosJson(request);
    if (body.store_id !== operator.storeId) throw new PosOperatorSessionError("OPERATOR_STORE_MISMATCH", 403);
    const data = await issueApprovalToken({
      approvedByStaffId: operator.staffId,
      storeId: operator.storeId,
      operation: String(body.operation ?? ""),
      resourceHash: String(body.resource_hash ?? ""),
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return posApiErrorResponse(error);
  }
}
