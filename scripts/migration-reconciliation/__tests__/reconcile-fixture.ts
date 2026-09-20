import { fingerprintSnapshot } from "../canonical-json";
import {
  migrationContracts,
  type CheckContract,
  type ColumnContract,
  type ForeignKeyContract,
  type IndexContract,
  type MigrationContract,
  type TableContract,
} from "../contracts";
import {
  expectedCollationForTable,
  loadCollationPolicy,
  type CollationPolicy,
  type CollationProfile,
} from "../collation-policy";
import { readRepositoryManifest } from "../repository-manifest";
import type {
  CheckEvidence,
  ColumnEvidence,
  ForeignKeyEvidence,
  IndexEvidence,
  MigrationManifestEntry,
  ReconciliationSnapshot,
  TableEvidence,
} from "../types";

interface MergedTable {
  name: string;
  columns: Map<string, ColumnContract>;
  indexes: Map<string, IndexContract>;
  foreignKeys: Map<string, ForeignKeyContract>;
  checks: Map<string, CheckContract>;
}

export interface ReconcileFixture {
  manifest: MigrationManifestEntry[];
  snapshot: ReconciliationSnapshot;
  contracts: MigrationContract[];
  policy: CollationPolicy;
  freshness: { eligible: true };
  repositoryCommit: string;
}

function mergeContracts(contracts: readonly MigrationContract[]): Map<string, MergedTable> {
  const merged = new Map<string, MergedTable>();
  for (const contract of contracts) {
    for (const table of [...contract.requiredTables, ...contract.alteredTables]) {
      const target = merged.get(table.name) ?? {
        name: table.name,
        columns: new Map(),
        indexes: new Map(),
        foreignKeys: new Map(),
        checks: new Map(),
      };
      for (const column of table.columns) target.columns.set(column.name, column);
      for (const index of table.indexes) target.indexes.set(index.name, index);
      for (const foreignKey of table.foreignKeys) {
        target.foreignKeys.set(foreignKey.name, foreignKey);
      }
      for (const check of table.checks) target.checks.set(check.name, check);
      merged.set(table.name, target);
    }
  }
  return merged;
}

function evidenceColumn(
  tableName: string,
  contract: ColumnContract,
  ordinalPosition: number,
  collation: string,
): ColumnEvidence {
  const textual = /^(?:var)?char\(/.test(contract.columnType);
  return {
    table: tableName,
    name: contract.name,
    ordinal_position: ordinalPosition,
    column_type: contract.columnType,
    nullable: contract.nullable,
    default: contract.default,
    extra: contract.extra,
    generation_expression: contract.generationExpression,
    character_set: textual ? "utf8mb4" : null,
    collation: textual ? collation : null,
  };
}

function evidenceIndex(tableName: string, contract: IndexContract): IndexEvidence {
  return {
    table: tableName,
    name: contract.name,
    unique: contract.unique,
    index_type: "BTREE",
    columns: contract.columns.map((column) => ({
      name: column.name,
      order: column.order,
      prefix_length: column.prefixLength,
    })),
  };
}

function evidenceForeignKey(
  tableName: string,
  contract: ForeignKeyContract,
): ForeignKeyEvidence {
  return {
    table: tableName,
    name: contract.name,
    columns: [...contract.columns],
    referenced_table: contract.referencedTable,
    referenced_columns: [...contract.referencedColumns],
    on_update: contract.onUpdate,
    on_delete: contract.onDelete,
  };
}

function policyCollation(
  policy: CollationPolicy,
  tableName: string,
): string {
  try {
    return expectedCollationForTable(policy, tableName);
  } catch {
    return policy.targetCollation;
  }
}

function buildSchemaEvidence(
  contracts: readonly MigrationContract[],
  policy: CollationPolicy,
): {
  tables: TableEvidence[];
  columns: ColumnEvidence[];
  indexes: IndexEvidence[];
  foreign_keys: ForeignKeyEvidence[];
  checks: CheckEvidence[];
} {
  const merged = mergeContracts(contracts);
  for (const tableName of [
    ...policy.reconstructedConversions,
    ...policy.createdNormalizedDuring0031,
  ]) {
    if (!merged.has(tableName)) {
      merged.set(tableName, {
        name: tableName,
        columns: new Map(),
        indexes: new Map(),
        foreignKeys: new Map(),
        checks: new Map(),
      });
    }
  }

  const tables: TableEvidence[] = [];
  const columns: ColumnEvidence[] = [];
  const indexes: IndexEvidence[] = [];
  const foreignKeys: ForeignKeyEvidence[] = [];
  const checks: CheckEvidence[] = [];

  for (const target of [...merged.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    const collation = policyCollation(policy, target.name);
    tables.push({ name: target.name, engine: "InnoDB", collation });
    [...target.columns.values()].forEach((column, index) => {
      columns.push(evidenceColumn(target.name, column, index + 1, collation));
    });
    for (const index of target.indexes.values()) {
      indexes.push(evidenceIndex(target.name, index));
    }
    for (const foreignKey of target.foreignKeys.values()) {
      foreignKeys.push(evidenceForeignKey(target.name, foreignKey));
    }
    for (const check of target.checks.values()) {
      checks.push({ table: target.name, name: check.name, clause: check.expression });
    }
  }
  return { tables, columns, indexes, foreign_keys: foreignKeys, checks };
}

export function refreshFixtureFingerprint(snapshot: ReconciliationSnapshot): void {
  snapshot.content_fingerprint = fingerprintSnapshot(
    snapshot as unknown as Record<string, unknown>,
  );
}

export async function buildReconcileFixture(
  profile: CollationProfile = "production-normalized",
): Promise<ReconcileFixture> {
  const manifest = await readRepositoryManifest(process.cwd());
  const policy = loadCollationPolicy(profile);
  const schema = buildSchemaEvidence(migrationContracts, policy);
  const snapshot: ReconciliationSnapshot = {
    format_version: 1,
    source_kind: "fixture",
    fixture_mode: true,
    captured_at: "2026-07-26T12:00:00.000Z",
    database_identity_fingerprint: "a".repeat(64),
    server_version: "8.0.40-fixture",
    repository_commit: "b".repeat(40),
    collation_profile: profile,
    migrations: structuredClone(manifest),
    journal_rows: manifest.map((entry, index) => ({
      id: String(index + 1),
      hash: entry.sha256,
      created_at: String(entry.when),
    })),
    ...schema,
    routines: [],
    aggregates: migrationContracts.flatMap((contract) =>
      contract.aggregates.map((aggregate) => ({
        name: aggregate.name,
        count: "0",
      }))
    ),
    content_fingerprint: "",
  };
  refreshFixtureFingerprint(snapshot);
  return {
    manifest,
    snapshot,
    contracts: structuredClone(migrationContracts),
    policy,
    freshness: { eligible: true },
    repositoryCommit: snapshot.repository_commit,
  };
}

export function removeJournalRowsFrom(
  fixture: ReconcileFixture,
  firstMissing: string,
): void {
  const first = Number(firstMissing);
  const removedTimestamps = new Set(
    fixture.manifest
      .filter((entry) => Number(entry.id) >= first)
      .map((entry) => String(entry.when)),
  );
  fixture.snapshot.journal_rows = fixture.snapshot.journal_rows
    .filter((row) => !removedTimestamps.has(row.created_at));
  refreshFixtureFingerprint(fixture.snapshot);
}

export function findTableContract(
  contracts: readonly MigrationContract[],
  tableName: string,
): TableContract | undefined {
  return contracts
    .flatMap((contract) => [...contract.requiredTables, ...contract.alteredTables])
    .find((table) => table.name === tableName);
}
