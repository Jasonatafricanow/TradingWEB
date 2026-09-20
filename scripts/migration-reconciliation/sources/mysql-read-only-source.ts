import { createConnection } from "mysql2/promise";

import { canonicalStringify, fingerprintSnapshot, sha256Hex } from "../canonical-json";
import type { CollationProfile } from "../collation-policy";
import type { MigrationContract } from "../contracts";
import { MigrationReconciliationError } from "../errors";
import { parseSnapshot } from "../snapshot-schema";
import type {
  AggregateEvidence,
  AggregateName,
  CheckEvidence,
  ColumnEvidence,
  ForeignKeyEvidence,
  IndexEvidence,
  JournalRowEvidence,
  MigrationManifestEntry,
  ReconciliationSnapshot,
  RoutineEvidence,
  TableEvidence,
} from "../types";
import {
  MYSQL_QUERIES,
  QUERY_NAMES,
  type QueryName,
  type QueryParameter,
} from "./mysql-queries";

export interface MySqlCaptureConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  connectTimeoutMs: number;
}

export interface MySqlConnectionLike {
  execute(
    sql: string,
    params?: QueryParameter[],
  ): Promise<[unknown[], unknown]>;
  query(sql: string): Promise<[unknown[], unknown]>;
  end(): Promise<void>;
}

export interface MySqlCaptureInput {
  connection?: MySqlConnectionLike;
  config: MySqlCaptureConfig;
  manifest: readonly MigrationManifestEntry[];
  contracts: readonly MigrationContract[];
  profile: CollationProfile;
  repositoryCommit: string;
  capturedAt: Date;
}

type EvidenceRow = Record<string, unknown>;

const aggregateQueryNames: readonly AggregateName[] = [
  "legacy_orders_missing_payment",
  "product_variant_mismatch",
  "stock_total_mismatch",
  "duplicate_inventory_scope",
  "unambiguous_backfill_missing",
  "ambiguous_location_exception_missing",
  "legacy_pos_attribution_missing",
];

function requireEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
  name: string,
): string {
  const value = environment[name];
  if (!value) {
    throw new MigrationReconciliationError(
      "CONFIGURATION_ERROR",
      `Required database configuration ${name} is missing`,
    );
  }
  return value;
}

export function readMySqlCaptureConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): MySqlCaptureConfig {
  const portText = requireEnvironment(environment, "DB_PORT");
  const port = Number(portText);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new MigrationReconciliationError(
      "CONFIGURATION_ERROR",
      "Database port configuration is invalid",
    );
  }
  const timeoutText = environment.DB_CONNECT_TIMEOUT_MS ?? "10000";
  const connectTimeoutMs = Number(timeoutText);
  if (!Number.isInteger(connectTimeoutMs) || connectTimeoutMs <= 0) {
    throw new MigrationReconciliationError(
      "CONFIGURATION_ERROR",
      "Database connection timeout configuration is invalid",
    );
  }
  return {
    host: requireEnvironment(environment, "DB_HOST"),
    port,
    user: requireEnvironment(environment, "DB_USER"),
    password: requireEnvironment(environment, "DB_PASSWORD"),
    database: requireEnvironment(environment, "DB_NAME"),
    connectTimeoutMs,
  };
}

export function buildConnectionOptions(config: MySqlCaptureConfig) {
  return {
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    connectTimeout: config.connectTimeoutMs,
    multipleStatements: false as const,
    rowsAsArray: false as const,
    supportBigNumbers: true as const,
    bigNumberStrings: true as const,
    decimalNumbers: false as const,
  };
}

function record(value: unknown): EvidenceRow {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Evidence query returned a non-object row");
  }
  return value as EvidenceRow;
}

function text(value: unknown): string {
  if (value === null || value === undefined) {
    throw new Error("Required evidence value is missing");
  }
  return String(value);
}

function nullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function integer(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error("Evidence integer is invalid");
  }
  return parsed;
}

function boolean(value: unknown): boolean {
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;
  throw new Error("Evidence boolean is invalid");
}

function rowsFor(
  captured: ReadonlyMap<QueryName, unknown[]>,
  name: QueryName,
): EvidenceRow[] {
  return (captured.get(name) ?? []).map(record);
}

function oneRow(
  captured: ReadonlyMap<QueryName, unknown[]>,
  name: QueryName,
): EvidenceRow {
  const rows = rowsFor(captured, name);
  if (rows.length !== 1) throw new Error(`${name} must return exactly one row`);
  return rows[0]!;
}

function buildIndexes(rows: readonly EvidenceRow[]): IndexEvidence[] {
  const grouped = new Map<string, { evidence: IndexEvidence; positions: number[] }>();
  for (const row of rows) {
    const table = text(row.table);
    const name = text(row.name);
    const key = `${table}\0${name}`;
    const target = grouped.get(key) ?? {
      evidence: {
        table,
        name,
        unique: boolean(row.unique),
        index_type: text(row.index_type),
        columns: [],
      },
      positions: [],
    };
    target.positions.push(integer(row.seq_in_index));
    target.evidence.columns.push({
      name: text(row.column_name),
      order: text(row.collation).toUpperCase() === "D" ? "DESC" : "ASC",
      prefix_length: row.prefix_length === null
        ? null
        : integer(row.prefix_length),
    });
    grouped.set(key, target);
  }
  return [...grouped.values()].map(({ evidence, positions }) => ({
    ...evidence,
    columns: evidence.columns
      .map((column, index) => ({ column, position: positions[index]! }))
      .sort((left, right) => left.position - right.position)
      .map(({ column }) => column),
  }));
}

function buildForeignKeys(rows: readonly EvidenceRow[]): ForeignKeyEvidence[] {
  const grouped = new Map<
    string,
    { evidence: ForeignKeyEvidence; positions: number[] }
  >();
  for (const row of rows) {
    const table = text(row.table);
    const name = text(row.name);
    const key = `${table}\0${name}`;
    const target = grouped.get(key) ?? {
      evidence: {
        table,
        name,
        columns: [],
        referenced_table: text(row.referenced_table),
        referenced_columns: [],
        on_update: text(row.on_update),
        on_delete: text(row.on_delete),
      },
      positions: [],
    };
    target.positions.push(integer(row.ordinal_position));
    target.evidence.columns.push(text(row.column_name));
    target.evidence.referenced_columns.push(text(row.referenced_column));
    grouped.set(key, target);
  }
  return [...grouped.values()].map(({ evidence, positions }) => {
    const pairs = evidence.columns.map((column, index) => ({
      column,
      referencedColumn: evidence.referenced_columns[index]!,
      position: positions[index]!,
    })).sort((left, right) => left.position - right.position);
    return {
      ...evidence,
      columns: pairs.map((pair) => pair.column),
      referenced_columns: pairs.map((pair) => pair.referencedColumn),
    };
  });
}

function constructSnapshot(
  input: MySqlCaptureInput,
  captured: ReadonlyMap<QueryName, unknown[]>,
): ReconciliationSnapshot {
  const identity = oneRow(captured, "database_identity");
  const identityPayload = {
    databaseName: text(identity.database_name),
    serverUuid: text(identity.server_uuid),
  };
  const server = oneRow(captured, "server_version");
  const journalRows: JournalRowEvidence[] = rowsFor(captured, "journal_rows")
    .map((row) => ({
      id: text(row.id),
      hash: text(row.hash),
      created_at: text(row.created_at),
    }));
  const tables: TableEvidence[] = rowsFor(captured, "tables").map((row) => ({
    name: text(row.name),
    engine: text(row.engine),
    collation: nullableText(row.collation),
  }));
  const columns: ColumnEvidence[] = rowsFor(captured, "columns").map((row) => ({
    table: text(row.table),
    name: text(row.name),
    ordinal_position: integer(row.ordinal_position),
    column_type: text(row.column_type),
    nullable: boolean(row.nullable),
    default: nullableText(row.default),
    extra: text(row.extra),
    generation_expression: nullableText(row.generation_expression),
    character_set: nullableText(row.character_set),
    collation: nullableText(row.collation),
  }));
  const checks: CheckEvidence[] = rowsFor(captured, "checks").map((row) => ({
    table: text(row.table),
    name: text(row.name),
    clause: text(row.clause),
  }));
  const routines: RoutineEvidence[] = rowsFor(captured, "routines").map((row) => ({
    name: text(row.name),
    type: text(row.type).toUpperCase() as RoutineEvidence["type"],
  }));
  const aggregates: AggregateEvidence[] = aggregateQueryNames.map((name) => ({
    name,
    count: text(oneRow(captured, name).count),
  }));
  const snapshot: ReconciliationSnapshot = {
    format_version: 1,
    source_kind: "live_mysql",
    fixture_mode: false,
    captured_at: input.capturedAt.toISOString(),
    database_identity_fingerprint: sha256Hex(canonicalStringify(identityPayload)),
    server_version: text(server.server_version),
    repository_commit: input.repositoryCommit,
    collation_profile: input.profile,
    migrations: structuredClone([...input.manifest]),
    journal_rows: journalRows,
    tables,
    columns,
    indexes: buildIndexes(rowsFor(captured, "indexes")),
    foreign_keys: buildForeignKeys(rowsFor(captured, "foreign_keys")),
    checks,
    routines,
    aggregates,
    content_fingerprint: "",
  };
  snapshot.content_fingerprint = fingerprintSnapshot(
    snapshot as unknown as Record<string, unknown>,
  );
  return parseSnapshot(snapshot);
}

function validateAggregateContracts(contracts: readonly MigrationContract[]): void {
  const names = contracts.flatMap((contract) =>
    contract.aggregates.map((aggregate) => aggregate.name)
  );
  if (canonicalStringify(names) !== canonicalStringify(aggregateQueryNames)) {
    throw new MigrationReconciliationError(
      "CONFIGURATION_ERROR",
      "Aggregate contract registry does not match the fixed query catalog",
    );
  }
}

async function defaultConnection(
  config: MySqlCaptureConfig,
): Promise<MySqlConnectionLike> {
  try {
    const connection = await createConnection(buildConnectionOptions(config));
    return {
      async execute(sql, params = []) {
        const [rows, fields] = await connection.execute(sql, params);
        return [Array.isArray(rows) ? rows : [], fields];
      },
      async query(sql) {
        const [rows, fields] = await connection.query(sql);
        return [Array.isArray(rows) ? rows : [], fields];
      },
      async end() {
        await connection.end();
      },
    };
  } catch {
    throw new MigrationReconciliationError(
      "CONNECTION_ERROR",
      "Read-only MySQL connection could not be established",
    );
  }
}

export class MySqlReadOnlySource {
  static async capture(input: MySqlCaptureInput): Promise<ReconciliationSnapshot> {
    validateAggregateContracts(input.contracts);
    const connection = input.connection ?? await defaultConnection(input.config);
    const captured = new Map<QueryName, unknown[]>();
    let transactionStarted = false;
    try {
      await connection.query("SET TRANSACTION READ ONLY");
      await connection.query("START TRANSACTION READ ONLY");
      transactionStarted = true;
      for (const name of QUERY_NAMES) {
        const query = MYSQL_QUERIES[name];
        const [rows] = await connection.execute(query.sql, [...query.params]);
        captured.set(name, rows);
      }
      const snapshot = constructSnapshot(input, captured);
      await connection.query("COMMIT");
      transactionStarted = false;
      return snapshot;
    } catch (cause) {
      if (transactionStarted) {
        await connection.query("ROLLBACK").catch(() => undefined);
      }
      if (cause instanceof MigrationReconciliationError) throw cause;
      throw new MigrationReconciliationError(
        "QUERY_ERROR",
        "Read-only MySQL evidence capture failed",
      );
    } finally {
      await connection.end().catch(() => undefined);
    }
  }
}
