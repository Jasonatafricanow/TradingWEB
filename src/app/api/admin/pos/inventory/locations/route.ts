import { NextRequest, NextResponse } from "next/server";

import { listPosInventoryLocations } from "@/services/admin/inventory-service";
import { posApiErrorResponse } from "@/services/admin/pos-api-response";
import { PosApiError } from "@/services/admin/pos-errors";
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
    const purpose = new URL(request.url).searchParams.get("purpose") ?? "inventory";
    if (!["inventory", "inventory_adjustment", "inventory_transfer", "purchase_order"].includes(purpose)) {
      throw new PosApiError("LOCATION_PURPOSE_INVALID", "Invalid inventory location purpose", 400);
    }
    return NextResponse.json({
      data: await listPosInventoryLocations({ operator, purpose: purpose as "inventory" | "inventory_adjustment" | "inventory_transfer" | "purchase_order" }),
    });
  } catch (error) {
    return posApiErrorResponse(error);
  }
}
