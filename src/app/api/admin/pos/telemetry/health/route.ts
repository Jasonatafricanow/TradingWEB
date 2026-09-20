import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { posApiErrorResponse } from "@/services/admin/pos-api-response";
import { PosApiError } from "@/services/admin/pos-errors";
import { getPosTelemetryHealth } from "@/services/admin/pos-telemetry-service";
import { requireUser } from "@/services/auth/auth-middleware";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user.staffId || !user.role || !["admin", "manager"].includes(user.role)) {
      throw new PosApiError("FORBIDDEN", "Manager permission required", 403);
    }
    const storeId = request.nextUrl.searchParams.get("store_id")?.trim();
    if (!storeId) throw new PosApiError("TELEMETRY_STORE_REQUIRED", "store_id is required", 400);
    if (user.role !== "admin") {
      const [result] = await db.$client.execute("SELECT store_id FROM staff WHERE id = ? AND is_active = TRUE LIMIT 1", [user.staffId]);
      const row = (result as Array<Record<string, unknown>>)[0];
      if (!row || String(row.store_id) !== storeId) throw new PosApiError("FORBIDDEN", "Store access denied", 403);
    }
    return NextResponse.json({ data: await getPosTelemetryHealth({ storeId }) });
  } catch (error) {
    return posApiErrorResponse(error);
  }
}
