import { describe, expect, it } from "vitest";

import { canonicalStringify, sha256Hex } from "../canonical-json";
import { migrationContracts } from "../contracts";
import {
  MYSQL_QUERIES,
  QUERY_NAMES,
  type QueryName,
} from "../sources/mysql-queries";
import {
  buildConnectionOptions,
  MySqlReadOnlySource,
  type MySqlConnectionLike,
} from "../sources/mysql-read-only-source";
import { buildReconcileFixture } from "./reconcile-fixture";

interface ExecutedStatement {
  sql: string;
  params: readonly unknown[];
}

class FakeConnection implements MySqlConnectionLike {
  readonly statements: ExecutedStatement[] = [];
  readonly controls: string[] = [];
  closed = false;

  constructor(
    private readonly rows: ReadonlyMap<QueryName, unknown[]>,
    private readonly failAt?: QueryName,
    private readonly failureMessage = "query failed",
  ) {}

  async execute(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<[unknown[], unknown]> {
    this.statements.push({ sql, params });
    const queryName = QUERY_NAMES.find((name) => MYSQL_QUERIES[name].sql === sql);
    if (this.failAt !== undefined && queryName === this.failAt) {
      throw new Error(this.failureMessage);
    }
    return [queryName ? [...(this.rows.get(queryName) ?? [])] : [], {}];
  }

  async query(sql: string): Promise<[unknown[], unknown]> {
    this.controls.push(sql);
    return [[], {}];
  }

  async end(): Promise<void> {
    this.closed = true;
  }
}

function rowsFromFixture(
  fixture: Awaited<ReturnType<typeof buildReconcileFixture>>,
): Map<QueryName, unknown[]> {
  const snapshot = fixture.snapshot;
  const rows = new Map<QueryName, unknown[]>([
    ["database_identity", [{ database_name: "pos_test", server_uuid: "server-1" }]],
    ["server_version", [{ server_version: snapshot.server_version }]],
    ["journal_rows", structuredClone(snapshot.journal_rows)],
    ["tables", structuredClone(snapshot.tables)],
    ["columns", structuredClone(snapshot.columns)],
    ["checks", structuredClone(snapshot.checks)],
    ["routines", structuredClone(snapshot.routines)],
  ]);
  rows.set(
    "indexes",
    snapshot.indexes.flatMap((index) =>
      index.columns.map((column, position) => ({
        table: index.table,
        name: index.name,
        unique: index.unique ? 1 : 0,
        index_type: index.index_type,
        column_name: column.name,
        seq_in_index: position + 1,
        collation: column.order === "ASC" ? "A" : "D",
        prefix_length: column.prefix_length,
      }))
    ),
  );
  rows.set(
    "foreign_keys",
    snapshot.foreign_keys.flatMap((foreignKey) =>
      foreignKey.columns.map((column, position) => ({
        table: foreignKey.table,
        name: foreignKey.name,
        column_name: column,
        ordinal_position: position + 1,
        referenced_table: foreignKey.referenced_table,
        referenced_column: foreignKey.referenced_columns[position],
        on_update: foreignKey.on_update,
        on_delete: foreignKey.on_delete,
      }))
    ),
  );
  for (const aggregate of snapshot.aggregates) {
    rows.set(aggregate.name, [{ count: aggregate.count }]);
  }
  return rows;
}

describe("fixed MySQL query catalog", () => {
  it("contains only the named read-only evidence queries", () => {
    expect(QUERY_NAMES).toEqual([
      "database_identity",
      "server_version",
      "journal_rows",
      "tables",
      "columns",
      "indexes",
      "foreign_keys",
      "checks",
      "routines",
      "legacy_orders_missing_payment",
      "product_variant_mismatch",
      "stock_total_mismatch",
      "duplicate_inventory_scope",
      "unambiguous_backfill_missing",
      "ambiguous_location_exception_missing",
      "legacy_pos_attribution_missing",
    ]);

    for (const name of QUERY_NAMES) {
      const query = MYSQL_QUERIES[name];
      const normalized = query.sql.replace(/^\s*(?:--[^\n]*\n\s*)*/, "");
      expect(normalized).toMatch(/^(?:SELECT|SHOW)\b/i);
      expect(query.sql).not.toContain(";");
      expect(query.sql).not.toMatch(
        /\b(?:INSERT|UPDATE|DELETE|REPLACE|ALTER|CREATE|DROP|TRUNCATE|CALL|GRANT|REVOKE)\b/i,
      );
      expect(query.params).toEqual([]);
    }
  });

  it("uses count-only business evidence and reviewed migration predicates", () => {
    const aggregateNames = QUERY_NAMES.slice(9);
    for (const name of aggregateNames) {
      expect(MYSQL_QUERIES[name].sql).toMatch(/COUNT\(\*\)\s+AS\s+count/i);
    }
    expect(MYSQL_QUERIES.legacy_orders_missing_payment.sql).toContain(
      "o.payment_method IS NOT NULL",
    );
    expect(MYSQL_QUERIES.legacy_orders_missing_payment.sql).toContain(
      "op.order_id = o.id",
    );
    expect(MYSQL_QUERIES.product_variant_mismatch.sql).toContain(
      "v.id IS NULL OR v.product_id <> i.product_id",
    );
    expect(MYSQL_QUERIES.stock_total_mismatch.sql).toContain(
      "COALESCE(SUM(i.stock), 0) <> v.stock",
    );
    expect(MYSQL_QUERIES.duplicate_inventory_scope.sql).toContain(
      "HAVING COUNT(*) > 1",
    );
    expect(MYSQL_QUERIES.unambiguous_backfill_missing.sql).toContain(
      "s.status = 'active'",
    );
    expect(MYSQL_QUERIES.ambiguous_location_exception_missing.sql).toContain(
      "AMBIGUOUS_DEFAULT_LOCATION",
    );
  });
});

describe("MySqlReadOnlySource", () => {
  it("exports connection options that disable multiple statements", () => {
    expect(buildConnectionOptions({
      host: "db.internal",
      port: 3306,
      user: "audit",
      password: "secret",
      database: "pos",
      connectTimeoutMs: 5_000,
    })).toMatchObject({
      multipleStatements: false,
      rowsAsArray: false,
      supportBigNumbers: true,
      bigNumberStrings: true,
      decimalNumbers: false,
    });
  });

  it("captures every catalog query in one read-only transaction", async () => {
    const fixture = await buildReconcileFixture();
    fixture.snapshot.journal_rows[0]!.created_at = "9223372036854775807";
    const connection = new FakeConnection(rowsFromFixture(fixture));

    const snapshot = await MySqlReadOnlySource.capture({
      connection,
      config: {
        host: "db.internal",
        port: 3306,
        user: "audit",
        password: "secret",
        database: "pos",
        connectTimeoutMs: 5_000,
      },
      manifest: fixture.manifest,
      contracts: migrationContracts,
      profile: "production-normalized",
      repositoryCommit: "b".repeat(40),
      capturedAt: new Date("2026-07-26T14:00:00.000Z"),
    });

    expect(connection.controls).toEqual([
      "SET TRANSACTION READ ONLY",
      "START TRANSACTION READ ONLY",
      "COMMIT",
    ]);
    expect(connection.statements.map((item) => item.sql)).toEqual(
      QUERY_NAMES.map((name) => MYSQL_QUERIES[name].sql),
    );
    expect(connection.closed).toBe(true);
    expect(snapshot.journal_rows[0]!.created_at).toBe("9223372036854775807");
    expect(snapshot.database_identity_fingerprint).toBe(sha256Hex(canonicalStringify({
      databaseName: "pos_test",
      serverUuid: "server-1",
    })));
    expect(JSON.stringify(snapshot)).not.toContain("pos_test");
    expect(JSON.stringify(snapshot)).not.toContain("server-1");
  });

  it("rolls back, closes, and emits no snapshot after a query failure", async () => {
    const fixture = await buildReconcileFixture();
    const connection = new FakeConnection(
      rowsFromFixture(fixture),
      "columns",
      "DB_PASSWORD=secret query failed",
    );

    const error = await MySqlReadOnlySource.capture({
      connection,
      config: {
        host: "db.internal",
        port: 3306,
        user: "audit",
        password: "secret",
        database: "pos",
        connectTimeoutMs: 5_000,
      },
      manifest: fixture.manifest,
      contracts: migrationContracts,
      profile: "production-normalized",
      repositoryCommit: "b".repeat(40),
      capturedAt: new Date("2026-07-26T14:00:00.000Z"),
    }).catch((caught: unknown) => caught);

    expect(connection.controls.at(-1)).toBe("ROLLBACK");
    expect(connection.closed).toBe(true);
    expect(error).toMatchObject({ code: "QUERY_ERROR" });
    expect(String(error)).not.toContain("secret");
    expect(String(error)).not.toContain("DB_PASSWORD");
    expect((error as Error).cause).toBeUndefined();
  });
});
