/**
 * Discount Receiver
 *
 * Receives Shopify discount codes and maps them into the local coupons table.
 * Shopify can send negative price-rule values; local coupons store positive
 * amounts, so values are normalized with Math.abs().
 */
import { db } from "@/lib/db";
import { coupons, importJobs, importSessions } from "@/storage/database/shared/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { ValidationError } from "@/lib/errors";
import { findMapping, upsertMapping, type DbLike } from "./source-mapping";
import { validateDiscounts } from "./validator";
import { refreshImportSessionStatus } from "./session-service";
import type {
  ImportBatchResult,
  ImportDiscountRecord,
  ImportDiscountsEnvelope,
  ImportRecordError,
} from "@/types/import-contract";
import type { ReceiverContext } from "./product-receiver";

const SOURCE_TYPE_DISCOUNT = "discount";

export interface ReceiveDiscountsOptions {
  dryRun?: boolean;
}

function normalizeDiscountType(type: string): "percentage" | "fixed" {
  const normalized = type.toLowerCase();
  return normalized === "percentage" || normalized === "percent" ? "percentage" : "fixed";
}

function normalizeAmount(value: string | null | undefined): string {
  const amount = Math.abs(Number(value ?? 0));
  return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
}

function normalizeNullableDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

async function findCouponIdByCode(code: string, dbLike: DbLike): Promise<string | null> {
  const rows = await dbLike
    .select({ id: coupons.id })
    .from(coupons)
    .where(eq(coupons.code, code))
    .limit(1);
  return rows[0]?.id ?? null;
}

async function upsertDiscountCoupon(
  ctx: ReceiverContext,
  record: ImportDiscountRecord,
  dbLike: DbLike,
): Promise<string> {
  const mapped = await findMapping({
    source: ctx.source,
    source_store: ctx.source_store,
    source_type: SOURCE_TYPE_DISCOUNT,
    source_id: record.source_id,
  }, dbLike);

  const code = normalizeCode(record.code);
  const values = {
    code,
    type: normalizeDiscountType(record.type),
    value: normalizeAmount(record.value),
    min_order_amount: record.min_order_amount ? normalizeAmount(record.min_order_amount) : "0.00",
    max_discount: record.max_discount ? normalizeAmount(record.max_discount) : null,
    usage_limit: record.usage_limit ?? 0,
    used_count: record.used_count ?? 0,
    starts_at: normalizeNullableDate(record.starts_at),
    expires_at: normalizeNullableDate(record.expires_at),
    is_active: record.is_active ?? true,
    description: record.description ?? null,
    updated_at: new Date(),
  };

  let couponId = mapped?.local_id ?? null;
  if (!couponId) {
    couponId = await findCouponIdByCode(code, dbLike);
  }

  if (couponId) {
    await dbLike.update(coupons).set(values).where(eq(coupons.id, couponId));
  } else {
    couponId = randomUUID();
    await dbLike.insert(coupons).values({
      id: couponId,
      ...values,
    });
  }

  await upsertMapping(
    {
      source: ctx.source,
      source_store: ctx.source_store,
      source_type: SOURCE_TYPE_DISCOUNT,
      source_id: record.source_id,
    },
    { table: "coupons", id: couponId },
    record,
    dbLike,
  );

  return couponId;
}

export async function receiveDiscounts(
  ctx: ReceiverContext,
  envelope: ImportDiscountsEnvelope,
  opts: ReceiveDiscountsOptions = {},
): Promise<ImportBatchResult> {
  if (envelope.source !== ctx.source || envelope.source_store !== ctx.source_store) {
    throw new ValidationError(
      `envelope source/source_store mismatch: envelope=${envelope.source}/${envelope.source_store}, session=${ctx.source}/${ctx.source_store}`,
    );
  }

  const errors: ImportRecordError[] = [...validateDiscounts(envelope)];
  const invalidIndices = new Set<number>();
  for (const error of errors) {
    if (error.code === "VALIDATION_FAILED" || error.code === "DUPLICATE_SOURCE_ID") {
      invalidIndices.add(error.record_index);
    }
  }

  if (opts.dryRun) {
    return {
      ok: errors.length === 0,
      job_type: "discounts",
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
    job_type: "discounts",
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
      await db.transaction(async (tx) => {
        await upsertDiscountCoupon(ctx, record, tx);
      });
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
    job_type: "discounts",
    total: envelope.records.length,
    success,
    failed,
    errors,
  };
}
