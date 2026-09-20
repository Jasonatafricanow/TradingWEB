import { z } from "zod";

import { fingerprintSnapshot } from "./canonical-json";
import type { ReconciliationSnapshot } from "./types";

const hex64 = z.string().regex(/^[0-9a-f]{64}$/);
const commitHash = z.string().regex(/^[0-9a-f]{40,64}$/);
const decimalString = z.string().regex(/^(0|[1-9][0-9]*)$/);
const migrationId = z.enum([
  "0025",
  "0026",
  "0027",
  "0028",
  "0029",
  "0030",
  "0031",
  "0032",
  "0033",
]);

const migrationManifestEntrySchema = z.object({
  id: migrationId,
  idx: z.number().int().nonnegative().safe(),
  tag: z.string().min(1),
  filename: z.string().min(1),
  when: z.number().int().nonnegative().safe(),
  sha256: hex64,
  role: z.enum(["predecessor-anchor", "repair-target"]),
}).strict();

const journalRowSchema = z.object({
  id: decimalString,
  hash: hex64,
  created_at: decimalString,
}).strict();

const tableSchema = z.object({
  name: z.string().min(1),
  engine: z.string().min(1),
  collation: z.string().min(1).nullable(),
}).strict();

const columnSchema = z.object({
  table: z.string().min(1),
  name: z.string().min(1),
  ordinal_position: z.number().int().positive().safe(),
  column_type: z.string().min(1),
  nullable: z.boolean(),
  default: z.string().nullable(),
  extra: z.string(),
  generation_expression: z.string().nullable(),
  character_set: z.string().nullable(),
  collation: z.string().nullable(),
}).strict();

const indexColumnSchema = z.object({
  name: z.string().min(1),
  order: z.enum(["ASC", "DESC"]),
  prefix_length: z.number().int().positive().safe().nullable(),
}).strict();

const indexSchema = z.object({
  table: z.string().min(1),
  name: z.string().min(1),
  unique: z.boolean(),
  index_type: z.string().min(1),
  columns: z.array(indexColumnSchema),
}).strict();

const foreignKeySchema = z.object({
  table: z.string().min(1),
  name: z.string().min(1),
  columns: z.array(z.string().min(1)).min(1),
  referenced_table: z.string().min(1),
  referenced_columns: z.array(z.string().min(1)).min(1),
  on_update: z.string().min(1),
  on_delete: z.string().min(1),
}).strict().refine(
  (value) => value.columns.length === value.referenced_columns.length,
  { message: "Foreign key column counts must match" },
);

const checkSchema = z.object({
  table: z.string().min(1),
  name: z.string().min(1),
  clause: z.string().min(1),
}).strict();

const routineSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["PROCEDURE", "FUNCTION"]),
}).strict();

const aggregateSchema = z.object({
  name: z.enum([
    "legacy_orders_missing_payment",
    "product_variant_mismatch",
    "stock_total_mismatch",
    "duplicate_inventory_scope",
    "unambiguous_backfill_missing",
    "ambiguous_location_exception_missing",
    "legacy_pos_attribution_missing",
  ]),
  count: decimalString,
}).strict();

const reconciliationSnapshotSchema = z.object({
  format_version: z.literal(1),
  source_kind: z.enum(["live_mysql", "fixture"]),
  fixture_mode: z.boolean(),
  captured_at: z.iso.datetime({ offset: true }),
  database_identity_fingerprint: hex64,
  server_version: z.string().min(1),
  repository_commit: commitHash,
  collation_profile: z.enum(["migration-native", "production-normalized"]),
  migrations: z.array(migrationManifestEntrySchema),
  journal_rows: z.array(journalRowSchema),
  tables: z.array(tableSchema),
  columns: z.array(columnSchema),
  indexes: z.array(indexSchema),
  foreign_keys: z.array(foreignKeySchema),
  checks: z.array(checkSchema),
  routines: z.array(routineSchema),
  aggregates: z.array(aggregateSchema),
  content_fingerprint: hex64,
}).strict().superRefine((value, context) => {
  if (value.source_kind === "live_mysql" && value.fixture_mode) {
    context.addIssue({
      code: "custom",
      path: ["fixture_mode"],
      message: "fixture_mode must be false for source_kind live_mysql",
    });
  }
  if (value.source_kind === "fixture" && !value.fixture_mode) {
    context.addIssue({
      code: "custom",
      path: ["fixture_mode"],
      message: "fixture_mode must be true for source_kind fixture",
    });
  }
});

export function parseSnapshot(value: unknown): ReconciliationSnapshot {
  const parsed = reconciliationSnapshotSchema.parse(value);
  const expectedFingerprint = fingerprintSnapshot(parsed);
  if (parsed.content_fingerprint !== expectedFingerprint) {
    throw new Error("Snapshot content fingerprint mismatch");
  }
  return parsed as ReconciliationSnapshot;
}

export type SnapshotFreshness =
  | { eligible: true }
  | {
      eligible: false;
      reason: "SNAPSHOT_EXPIRED" | "SNAPSHOT_FROM_FUTURE";
    };

const allowedClockSkewMs = 5 * 60 * 1000;
const maximumSnapshotAgeMs = 24 * 60 * 60 * 1000;

export function evaluateSnapshotFreshness(
  snapshot: ReconciliationSnapshot,
  now: Date,
): SnapshotFreshness {
  if (snapshot.fixture_mode) return { eligible: true };

  const capturedAt = new Date(snapshot.captured_at).getTime();
  const nowMs = now.getTime();
  const ageMs = nowMs - capturedAt;
  if (ageMs < -allowedClockSkewMs) {
    return { eligible: false, reason: "SNAPSHOT_FROM_FUTURE" };
  }
  if (ageMs > maximumSnapshotAgeMs) {
    return { eligible: false, reason: "SNAPSHOT_EXPIRED" };
  }
  return { eligible: true };
}
