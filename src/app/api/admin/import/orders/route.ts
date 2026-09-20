/**
 * POST /api/admin/import/orders?session_id=...
 *
 * Body: ImportOrdersEnvelope（标准合约 §4.4）
 * 守门：requireStaffRole(['admin','operator'])
 * 注意：customer_link_strategy 从 session 拿，传给 receiver。
 */
import { NextResponse } from "next/server";
import {
  requireStaffRole,
  requireUser,
  errorResponse,
} from "@/services/auth/auth-middleware";
import { db } from "@/lib/db";
import { importSessions } from "@/storage/database/shared/schema";
import { eq } from "drizzle-orm";
import { ValidationError } from "@/lib/errors";
import { receiveOrders } from "@/services/import/order-receiver";
import type {
  CustomerLinkStrategy,
  ImportOrdersEnvelope,
  ImportSource,
} from "@/types/import-contract";

export async function POST(request: Request) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const user = await requireUser(request);

    const url = new URL(request.url);
    const sessionId = url.searchParams.get("session_id");
    if (!sessionId) {
      throw new ValidationError("缺少 session_id query 参数");
    }

    const sessions = await db
      .select()
      .from(importSessions)
      .where(eq(importSessions.id, sessionId))
      .limit(1);
    const session = sessions[0];
    if (!session) {
      throw new ValidationError(`import session not found: ${sessionId}`);
    }
    const body = (await request.json()) as ImportOrdersEnvelope;
    const result = await receiveOrders(
      {
        session_id: session.id,
        source: session.source as ImportSource,
        source_store: session.source_store,
        seller_id: user.staffId ?? user.id,
        customer_link_strategy:
          session.customer_link_strategy as CustomerLinkStrategy,
      },
      body,
    );
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
