import { NextRequest, NextResponse } from "next/server";

import { posApiErrorResponse } from "@/services/admin/pos-api-response";
import { PosApiError } from "@/services/admin/pos-errors";
import { getPosRangeReport, parsePosReportQuery } from "@/services/admin/pos-report-service";
import { requirePosOperatorSession } from "@/services/admin/pos-operator-session-service";
import { requireUser } from "@/services/auth/auth-middleware";

const POS_ACCOUNT_ROLES = new Set(["admin", "manager", "operator"]);

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user.staffId || !user.role || !POS_ACCOUNT_ROLES.has(user.role)) {
      throw new PosApiError("FORBIDDEN", "Insufficient permissions", 403);
    }
    const operator = await requirePosOperatorSession(request, user.id);
    const query = parsePosReportQuery(new URL(request.url));
    return NextResponse.json({ data: await getPosRangeReport({ operator, query }) });
  } catch (error) {
    return posApiErrorResponse(error);
  }
}
