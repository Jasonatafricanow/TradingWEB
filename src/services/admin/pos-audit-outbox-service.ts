import { randomUUID } from "node:crypto";

import { and, asc, eq, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import type { DbTx } from "@/services/orders/order-pricing-service";
import { auditLogs, posAuditOutbox, posDeviceAuditLogs } from "@/storage/database/shared/schema";
import type { PosOperatorContext } from "./pos-operator-session-service";
import { hashPosRequest } from "./pos-contracts";
import { PosApiError } from "./pos-errors";

export interface PosAuditOutboxEventInput {
  eventType: string;
  entityType: string;
  entityId: string;
  storeId?: string | null;
  operatorId?: string | null;
  payload: Record<string, unknown>;
}

export interface PosAuditOutboxEvent extends PosAuditOutboxEventInput {
  id: string;
  attempts: number;
}

export type EnqueuePosAuditEvent = (tx: DbTx, event: PosAuditOutboxEventInput) => Promise<void>;

export async function enqueuePosAuditEvent(tx: DbTx, event: PosAuditOutboxEventInput): Promise<void> {
  await tx.insert(posAuditOutbox).values({
    id: randomUUID(),
    event_type: event.eventType,
    entity_type: event.entityType,
    entity_id: event.entityId,
    store_id: event.storeId ?? null,
    operator_id: event.operatorId ?? null,
    payload: event.payload,
    status: "pending",
    attempts: 0,
  });
}

function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; errno?: number; cause?: { code?: string; errno?: number } };
  return candidate.code === "ER_DUP_ENTRY" || candidate.errno === 1062
    || candidate.cause?.code === "ER_DUP_ENTRY" || candidate.cause?.errno === 1062;
}

export interface PosAuditDispatcherDependencies {
  listDueEvents(limit: number, now: Date): Promise<PosAuditOutboxEvent[]>;
  insertAuditLog(event: PosAuditOutboxEvent): Promise<void>;
  markProcessed(id: string, processedAt: Date): Promise<void>;
  markFailed(id: string, attempts: number, nextAttemptAt: Date): Promise<void>;
}

const databaseDispatcherDependencies: PosAuditDispatcherDependencies = {
  async listDueEvents(limit, now) {
    const rows = await db.select().from(posAuditOutbox).where(and(
      eq(posAuditOutbox.status, "pending"),
      or(isNull(posAuditOutbox.next_attempt_at), lte(posAuditOutbox.next_attempt_at, now)),
    )).orderBy(asc(posAuditOutbox.created_at)).limit(limit);
    return rows.map((row) => ({
      id: row.id,
      eventType: row.event_type,
      entityType: row.entity_type,
      entityId: row.entity_id,
      storeId: row.store_id,
      operatorId: row.operator_id,
      payload: row.payload as Record<string, unknown>,
      attempts: row.attempts,
    }));
  },
  async insertAuditLog(event) {
    await db.insert(auditLogs).values({
      id: event.id,
      user_id: event.operatorId ?? null,
      action: event.eventType,
      entity_type: event.entityType,
      entity_id: event.entityId,
      details: {
        ...event.payload,
        pos_audit_outbox_id: event.id,
        store_id: event.storeId ?? null,
      },
    });
  },
  async markProcessed(id, processedAt) {
    await db.update(posAuditOutbox).set({
      status: "processed",
      processed_at: processedAt,
      next_attempt_at: null,
    }).where(eq(posAuditOutbox.id, id));
  },
  async markFailed(id, attempts, nextAttemptAt) {
    await db.update(posAuditOutbox).set({ attempts, next_attempt_at: nextAttemptAt })
      .where(eq(posAuditOutbox.id, id));
  },
};

function retryAt(now: Date, attempts: number): Date {
  const delayMinutes = Math.min(60, 2 ** Math.min(attempts - 1, 6));
  return new Date(now.getTime() + delayMinutes * 60_000);
}

export async function dispatchAuditOutbox(
  input: { limit?: number; now?: Date } = {},
  dependencies: PosAuditDispatcherDependencies = databaseDispatcherDependencies,
): Promise<{ processed: number; failed: number }> {
  const now = input.now ?? new Date();
  const limit = Math.max(1, Math.min(input.limit ?? 50, 100));
  const events = await dependencies.listDueEvents(limit, now);
  let processed = 0;
  let failed = 0;

  for (const event of events) {
    try {
      try {
        await dependencies.insertAuditLog(event);
      } catch (error) {
        // audit_logs.id is the outbox UUID. A duplicate means a previous delivery
        // committed before the dispatcher recorded processed_at.
        if (!isDuplicateKeyError(error)) throw error;
      }
      await dependencies.markProcessed(event.id, now);
      processed += 1;
    } catch {
      const attempts = event.attempts + 1;
      await dependencies.markFailed(event.id, attempts, retryAt(now, attempts));
      failed += 1;
    }
  }
  return { processed, failed };
}

const deviceAuditRecordSchema = z.object({
  id: z.string().uuid(),
  event_type: z.string().trim().min(1).max(80),
  entity_type: z.string().trim().min(1).max(40),
  entity_id: z.string().trim().min(1).max(36).nullable(),
  payload: z.record(z.string(), z.unknown()),
  hash: z.string().regex(/^[a-f0-9]{64}$/i),
  prev_hash: z.string().regex(/^[a-f0-9]{64}$/i).nullable(),
  occurred_at: z.string().datetime(),
}).strict();

const auditBatchSchema = z.object({ records: z.array(deviceAuditRecordSchema).min(1).max(100) }).strict();
export type PosDeviceAuditRecord = z.infer<typeof deviceAuditRecordSchema>;

export function parsePosAuditBatch(input: unknown): { records: PosDeviceAuditRecord[] } {
  const result = auditBatchSchema.safeParse(input);
  if (result.success) return result.data;
  throw new PosApiError("AUDIT_BATCH_REQUEST_INVALID", "Invalid device audit batch", 400, false,
    result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })));
}

interface PosAuditUploadDependencies {
  insertDeviceAudit(input: {
    id: string;
    deviceId: string;
    storeId: string;
    operatorId: string;
    eventType: string;
    entityType: string;
    entityId: string | null;
    payload: Record<string, unknown>;
    hash: string;
    prevHash: string | null;
    occurredAt: Date;
    uploadedAt: Date;
  }): Promise<boolean>;
  findDeviceAuditById(id: string): Promise<PosDeviceAuditStoredRecord | null>;
  now(): Date;
}

interface PosDeviceAuditStoredRecord {
  id: string;
  deviceId: string;
  storeId: string;
  operatorId: string;
  eventType: string;
  entityType: string;
  entityId: string | null;
  payload: Record<string, unknown>;
  hash: string;
  prevHash: string | null;
  occurredAt: Date;
  uploadedAt: Date;
}

const databaseAuditUploadDependencies: PosAuditUploadDependencies = {
  async insertDeviceAudit(input) {
    try {
      await db.insert(posDeviceAuditLogs).values({
        id: input.id,
        device_id: input.deviceId,
        store_id: input.storeId,
        operator_id: input.operatorId,
        event_type: input.eventType,
        entity_type: input.entityType,
        entity_id: input.entityId,
        payload: input.payload,
        hash: input.hash,
        prev_hash: input.prevHash,
        occurred_at: input.occurredAt,
        uploaded_at: input.uploadedAt,
      });
      return true;
    } catch (error) {
      if (isDuplicateKeyError(error)) return false;
      throw error;
    }
  },
  async findDeviceAuditById(id) {
    const [row] = await db.select().from(posDeviceAuditLogs).where(eq(posDeviceAuditLogs.id, id)).limit(1);
    return row ? {
      id: row.id,
      deviceId: row.device_id,
      storeId: row.store_id,
      operatorId: row.operator_id,
      eventType: row.event_type,
      entityType: row.entity_type,
      entityId: row.entity_id,
      payload: row.payload as Record<string, unknown>,
      hash: row.hash.toLowerCase(),
      prevHash: row.prev_hash?.toLowerCase() ?? null,
      occurredAt: row.occurred_at,
      uploadedAt: row.uploaded_at,
    } : null;
  },
  now: () => new Date(),
};

function immutableDeviceAuditHash(record: Omit<PosDeviceAuditStoredRecord, "uploadedAt">): string {
  return hashPosRequest({
    id: record.id,
    deviceId: record.deviceId,
    storeId: record.storeId,
    operatorId: record.operatorId,
    eventType: record.eventType,
    entityType: record.entityType,
    entityId: record.entityId,
    payload: record.payload,
    hash: record.hash.toLowerCase(),
    prevHash: record.prevHash?.toLowerCase() ?? null,
    occurredAt: record.occurredAt.toISOString(),
  });
}

export async function uploadAuditBatch(
  input: { records: unknown[]; operator: PosOperatorContext },
  dependencies: PosAuditUploadDependencies = databaseAuditUploadDependencies,
): Promise<{ accepted: number; duplicates: number }> {
  const { records } = parsePosAuditBatch({ records: input.records });
  const uploadedAt = dependencies.now();
  let accepted = 0;
  let duplicates = 0;
  for (const record of records) {
    const requested: PosDeviceAuditStoredRecord = {
      id: record.id,
      deviceId: input.operator.deviceId,
      storeId: input.operator.storeId,
      operatorId: input.operator.staffId,
      eventType: record.event_type,
      entityType: record.entity_type,
      entityId: record.entity_id,
      payload: record.payload,
      hash: record.hash.toLowerCase(),
      prevHash: record.prev_hash?.toLowerCase() ?? null,
      occurredAt: new Date(record.occurred_at),
      uploadedAt,
    };
    const inserted = await dependencies.insertDeviceAudit(requested);
    if (inserted) accepted += 1;
    else {
      const existing = await dependencies.findDeviceAuditById(record.id);
      if (!existing || immutableDeviceAuditHash(existing) !== immutableDeviceAuditHash(requested)) {
        throw new PosApiError("AUDIT_UUID_CONFLICT", "Device audit UUID was reused with conflicting facts", 409);
      }
      duplicates += 1;
    }
  }
  return { accepted, duplicates };
}
