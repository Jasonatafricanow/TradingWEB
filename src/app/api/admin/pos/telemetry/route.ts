import { NextRequest, NextResponse } from "next/server";

import { parsePosJson, posApiErrorResponse } from "@/services/admin/pos-api-response";
import { requirePosOperatorSession } from "@/services/admin/pos-operator-session-service";
import { ingestPosTelemetry } from "@/services/admin/pos-telemetry-service";
import { requireUser } from "@/services/auth/auth-middleware";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const operator = await requirePosOperatorSession(request, user.id);
    const data = await ingestPosTelemetry({ operator, input: await parsePosJson(request) });
    return NextResponse.json({ data });
  } catch (error) {
    return posApiErrorResponse(error);
  }
}
