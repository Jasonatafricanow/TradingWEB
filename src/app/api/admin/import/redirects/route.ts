/**
 * POST /api/admin/import/redirects?session_id=...
 *
 * Body: ImportRedirectsEnvelope
 * 用于 MoveShopify 推送 Shopify legacy URL -> tradingWEB URL 的 SEO 迁移映射。
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
import { receiveRedirects } from "@/services/import/redirect-receiver";
import type {
  ImportRedirectsEnvelope,
  ImportSource,
} from "@/types/import-contract";

export async function POST(request: Request) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const user = await requireUser(request);

    const url = new URL(request.url);
    const sessionId = url.searchParams.get("session_id");
    const dryRun = url.searchParams.get("dry_run") === "true";
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

    const body = (await request.json()) as ImportRedirectsEnvelope;
    const result = await receiveRedirects(
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
