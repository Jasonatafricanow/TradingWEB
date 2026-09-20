import { NextRequest, NextResponse } from "next/server";

import { parsePosJson, posApiErrorResponse } from "@/services/admin/pos-api-response";
import { PosApiError } from "@/services/admin/pos-errors";
import { transitionPickupFulfillment, type PickupFulfillmentStatus } from "@/services/admin/pos-order-query-service";
import { requirePosOperatorSession } from "@/services/admin/pos-operator-session-service";
import { requireUser } from "@/services/auth/auth-middleware";

const POS_ACCOUNT_ROLES = new Set(["admin", "manager", "operator"]);
const NEXT_PICKUP_STATES = new Set<PickupFulfillmentStatus>(["preparing", "ready", "picked_up"]);

async function operator(request: NextRequest) {
  const user = await requireUser(request);
  if (!user.staffId || !user.role || !POS_ACCOUNT_ROLES.has(user.role)) {
    throw new PosApiError("FORBIDDEN", "Insufficient permissions", 403);
  }
  return requirePosOperatorSession(request, user.id);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const activeOperator = await operator(request);
    const { id } = await context.params;
    if (!id || id.length > 160) throw new PosApiError("ORDER_ID_INVALID", "Order ID is invalid", 400);
    const body = await parsePosJson(request);
    if (Object.keys(body).length !== 1 || !("fulfillment_status" in body)) {
      throw new PosApiError("FULFILLMENT_REQUEST_INVALID", "Only fulfillment_status is accepted", 400);
    }
    const nextStatus = body.fulfillment_status;
    if (typeof nextStatus !== "string" || !NEXT_PICKUP_STATES.has(nextStatus as PickupFulfillmentStatus)) {
      throw new PosApiError("FULFILLMENT_REQUEST_INVALID", "fulfillment_status must be preparing, ready or picked_up", 400);
    }
    const data = await transitionPickupFulfillment({
      operator: activeOperator,
      orderId: id,
      nextStatus: nextStatus as PickupFulfillmentStatus,
    });
    return NextResponse.json({ data });
  } catch (error) {
    return posApiErrorResponse(error);
  }
}
