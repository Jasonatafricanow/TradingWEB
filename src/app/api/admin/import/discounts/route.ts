/**
 * POST /api/admin/import/discounts?session_id=...
 *
 * Body: ImportDiscountsEnvelope
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
import { receiveDiscounts } from "@/services/import/discount-receiver";
import type {
  ImportDiscountsEnvelope,
  ImportSource,
} from "@/types/import-contract";

export async function POST(request: Request) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const user = await requireUser(request);

    const url = new URL(request.url);
    const sessionId = url.searchParams.get("session_id");
    if (!sessionId) {
      throw new ValidationError("missing session_id query parameter");
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

    const dryRun = url.searchParams.get("dry_run") === "true";
    const body = (await request.json()) as ImportDiscountsEnvelope;
    const result = await receiveDiscounts(
      {
        session_id: session.id,
        source: session.source as ImportSource,
        source_store: session.source_store,
        seller_id: user.staffId ?? user.id,
      },
      body,
      { dryRun },
    );
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
