import { randomUUID } from "node:crypto";
import { z } from "zod";

import { db } from "@/lib/db";
import { auditLogs } from "@/storage/database/shared/schema";
import type { PosOperatorContext } from "./pos-operator-session-service";
import { PosApiError } from "./pos-errors";

const base = z.object({ id: z.string().uuid(), occurred_at: z.string().datetime() });
const eventSchema = z.discriminatedUnion("type", [
  base.extend({ type: z.literal("sync_failed"), code: z.string().trim().min(1).max(80), pending_count: z.number().int().min(0).max(10000) }).strict(),
  base.extend({ type: z.literal("print_failed"), driver: z.string().trim().min(1).max(80), message: z.string().trim().min(1).max(200) }).strict(),
  base.extend({ type: z.literal("scanner_failed"), source: z.string().trim().min(1).max(80), message: z.string().trim().min(1).max(200) }).strict(),
  base.extend({ type: z.literal("app_error"), route: z.string().trim().min(1).max(120), message: z.string().trim().min(1).max(200) }).strict(),
]);
const batchSchema = z.object({ records: z.array(eventSchema).min(1).max(50) }).strict();

type ParsedEvent = z.infer<typeof eventSchema>;
export interface StoredTelemetry {
  id: string;
  storeId: string;
  deviceId: string;
  staffId: string;
  type: ParsedEvent["type"];
  code?: string;
  pendingCount?: number;
  driver?: string;
  source?: string;
  route?: string;
  message?: string;
  occurredAt: Date;
}

export interface PosTelemetryRepository {
  insert(records: StoredTelemetry[]): Promise<{ accepted: number; duplicates: number }>;
  listRecent(storeId: string, since: Date): Promise<Array<Pick<StoredTelemetry, "type" | "pendingCount" | "occurredAt">>>;
}

function toStored(event: ParsedEvent, operator: PosOperatorContext): StoredTelemetry {
  return {
    id: event.id,
    storeId: operator.storeId,
    deviceId: operator.deviceId,
    staffId: operator.staffId,
    type: event.type,
    code: "code" in event ? event.code : undefined,
    pendingCount: "pending_count" in event ? event.pending_count : undefined,
    driver: "driver" in event ? event.driver : undefined,
    source: "source" in event ? event.source : undefined,
    route: "route" in event ? event.route : undefined,
    message: "message" in event ? sanitizeMessage(event.message) : undefined,
    occurredAt: new Date(event.occurred_at),
  };
}

function sanitizeMessage(value: string): string {
  return value
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b(token|pin|password)\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b\d{4,}\b/g, "[number]")
    .slice(0, 200);
}

export async function ingestPosTelemetry(input: { operator: PosOperatorContext; input: unknown; repository?: PosTelemetryRepository }) {
  const parsed = batchSchema.safeParse(input.input);
  if (!parsed.success) throw new PosApiError("TELEMETRY_REQUEST_INVALID", "Invalid telemetry batch", 400, false, parsed.error.flatten());
  return (input.repository ?? databaseRepository).insert(parsed.data.records.map((event) => toStored(event, input.operator)));
}

export async function getPosTelemetryHealth(input: { storeId: string; repository?: PosTelemetryRepository; now?: Date }) {
  const now = input.now ?? new Date();
  const rows = await (input.repository ?? databaseRepository).listRecent(input.storeId, new Date(now.getTime() - 24 * 60 * 60 * 1000));
  rows.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  const counts = { sync_failed: 0, print_failed: 0, scanner_failed: 0, app_error: 0 };
  for (const row of rows) counts[row.type] += 1;
  const latestSync = rows.find((row) => row.type === "sync_failed");
  return {
    store_id: input.storeId,
    window_hours: 24,
    event_count: rows.length,
    sync_backlog: latestSync?.pendingCount ?? 0,
    by_type: counts,
    last_event_at: rows[0]?.occurredAt.toISOString() ?? null,
  };
}

function duplicate(error: unknown): boolean {
  const candidate = error as { code?: unknown; errno?: unknown };
  return candidate.code === "ER_DUP_ENTRY" || candidate.errno === 1062;
}

const databaseRepository: PosTelemetryRepository = {
  async insert(records) {
    let accepted = 0;
    let duplicates = 0;
    for (const record of records) {
      try {
        await db.insert(auditLogs).values({
          id: record.id || randomUUID(),
          user_id: record.staffId,
          action: `pos.telemetry.${record.type}`,
          entity_type: "pos_telemetry",
          entity_id: null,
          details: {
            store_id: record.storeId, device_id: record.deviceId, code: record.code, pending_count: record.pendingCount,
            driver: record.driver, source: record.source, route: record.route, message: record.message, occurred_at: record.occurredAt.toISOString(),
          },
        });
        accepted += 1;
      } catch (error) {
        if (!duplicate(error)) throw error;
        duplicates += 1;
      }
    }
    return { accepted, duplicates };
  },
  async listRecent(storeId, since) {
    const [result] = await db.$client.execute(
      `SELECT action, details, created_at FROM audit_logs
       WHERE entity_type = 'pos_telemetry' AND created_at >= ?
         AND JSON_UNQUOTE(JSON_EXTRACT(details, '$.store_id')) = ?
       ORDER BY created_at DESC LIMIT 500`,
      [since, storeId],
    );
    return (result as Array<Record<string, unknown>>).map((row) => {
      let details: Record<string, unknown> = {};
      try { details = typeof row.details === "string" ? JSON.parse(row.details) : row.details as Record<string, unknown>; } catch { details = {}; }
      return {
        type: String(row.action).replace("pos.telemetry.", "") as StoredTelemetry["type"],
        pendingCount: typeof details.pending_count === "number" ? details.pending_count : undefined,
        occurredAt: new Date((details.occurred_at as string | undefined) ?? row.created_at as string | Date),
      };
    });
  },
};
