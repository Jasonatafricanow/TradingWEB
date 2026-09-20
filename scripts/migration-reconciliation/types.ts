export type MigrationId =
  | "0026"
  | "0027"
  | "0028"
  | "0029"
  | "0030"
  | "0031"
  | "0032"
  | "0033";

export type ManifestId = "0025" | MigrationId;

export type MigrationStatus =
  | "REGISTERED_EXACT"
  | "JOURNAL_REPAIR_ELIGIBLE"
  | "BLOCKED_FILE_IDENTITY"
  | "BLOCKED_JOURNAL_CONFLICT"
  | "BLOCKED_SCHEMA_DRIFT"
  | "BLOCKED_DATA_DRIFT"
  | "BLOCKED_EVIDENCE_INCOMPLETE";

export type OverallDecision =
  | { kind: "REGISTERED_EXACT"; exitCode: 0 }
  | {
      kind: "JOURNAL_REPAIR_ELIGIBLE";
      exitCode: 10;
      missingSuffix: MigrationId[];
    }
  | { kind: "BLOCKED"; exitCode: 20 }
  | { kind: "OPERATIONAL_ERROR"; exitCode: 30 };

export interface MigrationManifestEntry {
  id: ManifestId;
  idx: number;
  tag: string;
  filename: string;
  when: number;
  sha256: string;
  role: "predecessor-anchor" | "repair-target";
}

export interface JournalRowEvidence {
  id: string;
  hash: string;
  created_at: string;
}

export interface TableEvidence {
  name: string;
  engine: string;
  collation: string | null;
}

export interface ColumnEvidence {
  table: string;
  name: string;
  ordinal_position: number;
  column_type: string;
  nullable: boolean;
  default: string | null;
  extra: string;
  generation_expression: string | null;
  character_set: string | null;
  collation: string | null;
}

export interface IndexColumnEvidence {
  name: string;
  order: "ASC" | "DESC";
  prefix_length: number | null;
}

export interface IndexEvidence {
  table: string;
  name: string;
  unique: boolean;
  index_type: string;
  columns: IndexColumnEvidence[];
}

export interface ForeignKeyEvidence {
  table: string;
  name: string;
  columns: string[];
  referenced_table: string;
  referenced_columns: string[];
  on_update: string;
  on_delete: string;
}

export interface CheckEvidence {
  table: string;
  name: string;
  clause: string;
}

export interface RoutineEvidence {
  name: string;
  type: "PROCEDURE" | "FUNCTION";
}

export type AggregateName =
  | "legacy_orders_missing_payment"
  | "product_variant_mismatch"
  | "stock_total_mismatch"
  | "duplicate_inventory_scope"
  | "unambiguous_backfill_missing"
  | "ambiguous_location_exception_missing"
  | "legacy_pos_attribution_missing";

export interface AggregateEvidence {
  name: AggregateName;
  count: string;
}

export interface ReconciliationSnapshot {
  format_version: 1;
  source_kind: "live_mysql" | "fixture";
  fixture_mode: boolean;
  captured_at: string;
  database_identity_fingerprint: string;
  server_version: string;
  repository_commit: string;
  collation_profile: "migration-native" | "production-normalized";
  migrations: MigrationManifestEntry[];
  journal_rows: JournalRowEvidence[];
  tables: TableEvidence[];
  columns: ColumnEvidence[];
  indexes: IndexEvidence[];
  foreign_keys: ForeignKeyEvidence[];
  checks: CheckEvidence[];
  routines: RoutineEvidence[];
  aggregates: AggregateEvidence[];
  content_fingerprint: string;
}

export interface Finding {
  migration: MigrationId | "journal" | "snapshot";
  category:
    | "identity"
    | "journal"
    | "schema"
    | "data"
    | "collation"
    | "evidence";
  code: string;
  expected: unknown;
  actual: unknown;
  blocking: boolean;
}

export interface MigrationResult {
  id: MigrationId;
  status: MigrationStatus;
  findings: Finding[];
}

export interface ReconciliationReport {
  repository_commit: string;
  snapshot_fingerprint: string;
  decision: OverallDecision;
  migrations: MigrationResult[];
  findings: Finding[];
}
