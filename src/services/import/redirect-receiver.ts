/**
 * Redirect Receiver
 *
 * 接收 MoveShopify 推送的旧 URL -> 新 URL 映射。典型场景：
 * Shopify /products/old-handle 迁移后 301 到 tradingWEB /products/new-slug。
 */
import { db } from "@/lib/db";
import { importJobs, importSessions } from "@/storage/database/shared/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { ValidationError } from "@/lib/errors";
import { upsertUrlRedirect } from "@/services/admin/redirect-service";
import { upsertMapping } from "./source-mapping";
import { validateRedirects } from "./validator";
import { refreshImportSessionStatus } from "./session-service";
import type {
  ImportBatchResult,
  ImportRecordError,
  ImportRedirectsEnvelope,
} from "@/types/import-contract";
import type { ReceiverContext } from "./product-receiver";

const SOURCE_TYPE_REDIRECT = "redirect";

export interface ReceiveRedirectsOptions {
  dryRun?: boolean;
}

export async function receiveRedirects(
  ctx: ReceiverContext,
  envelope: ImportRedirectsEnvelope,
  opts: ReceiveRedirectsOptions = {},
): Promise<ImportBatchResult> {
  if (envelope.source !== ctx.source || envelope.source_store !== ctx.source_store) {
    throw new ValidationError(
      `envelope source/source_store 和 session 不匹配：envelope=${envelope.source}/${envelope.source_store}，session=${ctx.source}/${ctx.source_store}`,
    );
  }

  const errors: ImportRecordError[] = [...validateRedirects(envelope)];
  const invalidIndices = new Set(errors.map((error) => error.record_index));

  if (opts.dryRun) {
    return {
      ok: errors.length === 0,
      job_type: "redirects",
      total: envelope.records.length,
      success: envelope.records.length - invalidIndices.size,
      failed: invalidIndices.size,
      errors,
    };
  }

  const jobId = randomUUID();
  await db.insert(importJobs).values({
    id: jobId,
    session_id: ctx.session_id,
    job_type: "redirects",
    status: "running",
    total_rows: envelope.records.length,
  });
  await db
    .update(importSessions)
    .set({ status: "running", finished_at: null })
    .where(eq(importSessions.id, ctx.session_id));

  let success = 0;
  let failed = invalidIndices.size;

  for (let i = 0; i < envelope.records.length; i++) {
    if (invalidIndices.has(i)) continue;
    const record = envelope.records[i];
    try {
      const redirect = await upsertUrlRedirect({
        old_path: record.old_path,
        new_path: record.new_path,
        status_code: record.status_code,
        source: ctx.source,
        source_store: ctx.source_store,
        source_id: record.source_id,
        is_active: true,
      });
      if (!redirect) throw new Error("redirect upsert failed");

      await upsertMapping(
        {
          source: ctx.source,
          source_store: ctx.source_store,
          source_type: SOURCE_TYPE_REDIRECT,
          source_id: record.source_id,
        },
        { table: "url_redirects", id: redirect.id },
        record,
      );
      success++;
    } catch (e) {
      failed++;
      errors.push({
        record_index: i,
        source_id: record.source_id,
        code: "INTERNAL_ERROR",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const allOk = failed === 0;
  await db
    .update(importJobs)
    .set({
      status: allOk ? "completed" : "failed",
      success_rows: success,
      failed_rows: failed,
      errors: errors.length > 0 ? (errors as never) : null,
      finished_at: new Date(),
    })
    .where(eq(importJobs.id, jobId));

  await refreshImportSessionStatus(ctx.session_id);

  return {
    ok: allOk,
    session_id: ctx.session_id,
    job_type: "redirects",
    total: envelope.records.length,
    success,
    failed,
    errors,
  };
}
