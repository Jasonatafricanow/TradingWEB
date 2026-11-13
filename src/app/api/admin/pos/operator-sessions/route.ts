import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

import { requireStaffRole, requireUser } from "@/services/auth/auth-middleware";
import { parsePosJson, posApiErrorResponse } from "@/services/admin/pos-api-response";
import { createOperatorSession } from "@/services/admin/pos-operator-session-service";
import { API_MESSAGES } from "@/lib/api-messages";

export async function POST(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "manager", "operator"]);
    const user = await requireUser(request);
    const body = await parsePosJson(request);
    if (![body.staff_id, body.store_id, body.device_id, body.pin].every((value) => typeof value === "string" && value.length > 0)) {
      return NextResponse.json({ error: { code: "SESSION_INPUT_INVALID", message: "staff_id, store_id, device_id and pin are required", retryable: false, details: null } }, { status: 400 });
    }
    if (user.role !== "admin") {
      const [rows] = await db.$client.execute("SELECT store_id FROM staff WHERE id = ? AND is_active = TRUE LIMIT 1", [user.staffId || ""]);
      const member = (rows as Array<{ store_id: string }>)[0];
      if (!member || member.store_id !== body.store_id) return NextResponse.json({ error: API_MESSAGES.storeAccessDenied }, { status: 403 });
    }
    const data = await createOperatorSession({
      accountUserId: user.id,
      staffId: body.staff_id as string,
      storeId: body.store_id as string,
      deviceId: body.device_id as string,
      pin: body.pin as string,
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return posApiErrorResponse(error);
  }
}
