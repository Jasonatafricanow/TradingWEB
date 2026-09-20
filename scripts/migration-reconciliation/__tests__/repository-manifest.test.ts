import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readMigrationFiles } from "drizzle-orm/migrator";

import {
  assertDisposableDatabase,
  buildDisposableMigrationConnectionOptions,
  createFreshDisposableDatabase,
  isDrizzleMigrationBodyStatement,
  selectDisposableUtf8mb4Tables,
  type DisposableAdminConnection,
  withDisposableForeignKeyChecksDisabled,
} from "../integration/disposable-db";
import { readRepositoryManifest } from "../repository-manifest";

describe("disposable integration database gate", () => {
  it("enables multi-statement replay only behind the disposable gate", () => {
    const options = buildDisposableMigrationConnectionOptions(
      {
        database: "tradingweb_migration_reconciliation_test",
        optIn: "1",
      },
      { multipleStatements: false as const, host: "database.example" },
    );

    expect(options).toEqual({
      multipleStatements: true,
      host: "database.example",
    });
    expect(() => buildDisposableMigrationConnectionOptions(
      {
        database: "production",
        optIn: "1",
      },
      { multipleStatements: false as const },
    )).toThrow("Disposable integration database name must end in _test or _tmp");
  });

  it("restores foreign-key checks after a disposable normalization failure", async () => {
    const statements: string[] = [];

    await expect(withDisposableForeignKeyChecksDisabled(
      {
        database: "tradingweb_migration_reconciliation_test",
        optIn: "1",
      },
      async (sql) => {
        statements.push(sql);
      },
      async () => {
        statements.push("ALTER TABLE test_table CONVERT");
        throw new Error("conversion failed");
      },
    )).rejects.toThrow("conversion failed");

    expect(statements).toEqual([
      "SET FOREIGN_KEY_CHECKS = 0",
      "ALTER TABLE test_table CONVERT",
      "SET FOREIGN_KEY_CHECKS = 1",
    ]);
  });

  it("selects every and only utf8mb4 table for disposable normalization", () => {
    expect(selectDisposableUtf8mb4Tables([
      { name: "orders", collation: "utf8mb4_unicode_ci" },
      { name: "order_payments", collation: "utf8mb4_0900_ai_ci" },
      { name: "binary_events", collation: null },
      { name: "legacy_latin", collation: "latin1_swedish_ci" },
    ])).toEqual(["orders", "order_payments"]);

    expect(() => selectDisposableUtf8mb4Tables([
      { name: "unsafe`table", collation: "utf8mb4_unicode_ci" },
    ])).toThrow("unsafe table identifier");
  });

  it.each([
    "CREATE TABLE IF NOT EXISTS `__drizzle_migrations` (`id` serial)",
    "SELECT id, hash, created_at FROM `__drizzle_migrations`",
    "begin",
    "START TRANSACTION",
    "commit",
    "ROLLBACK",
  ])("does not classify Drizzle bookkeeping as migration SQL: %s", (sql) => {
    expect(isDrizzleMigrationBodyStatement(sql)).toBe(false);
  });

  it("classifies schema SQL as a replayed migration body", () => {
    expect(isDrizzleMigrationBodyStatement(
      "ALTER TABLE orders ADD COLUMN replayed int",
    )).toBe(true);
  });

  it.each([
    "",
    "production",
    "tradingweb",
    "production_test_backup",
    "tradingweb_tmp2",
    "tradingweb-test",
  ])("rejects production-like or suffix-lookalike database %j", (database) => {
    expect(() => assertDisposableDatabase({ database, optIn: "1" }))
      .toThrow("Disposable integration database name must end in _test or _tmp");
  });

  it.each([
    "tradingweb_reconcile_test",
    "tradingweb_reconcile_tmp",
  ])("requires explicit opt-in for disposable database %s", (database) => {
    expect(() => assertDisposableDatabase({ database, optIn: undefined }))
      .toThrow("Set MIGRATION_RECONCILIATION_ALLOW_DISPOSABLE_DB=1");
    expect(() => assertDisposableDatabase({ database, optIn: "0" }))
      .toThrow("Set MIGRATION_RECONCILIATION_ALLOW_DISPOSABLE_DB=1");
    expect(() => assertDisposableDatabase({ database, optIn: "1" }))
      .not.toThrow();
  });

  it("rejects identifier metacharacters even with a disposable suffix", () => {
    expect(() => assertDisposableDatabase({
      database: "safe`; DROP DATABASE production; --_test",
      optIn: "1",
    })).toThrow("Disposable integration database name contains unsafe characters");
  });

  it("creates a new disposable database without any DROP statement", async () => {
    const statements: Array<{ sql: string; params: readonly unknown[] }> = [];
    const connection: DisposableAdminConnection = {
      async execute(sql, params = []) {
        statements.push({ sql, params });
        return sql.includes("information_schema.SCHEMATA") ? [[]] : [[]];
      },
    };

    await createFreshDisposableDatabase(connection, {
      database: "tradingweb_migration_reconciliation_20260726_test",
      optIn: "1",
    });

    expect(statements).toEqual([
      {
        sql: expect.stringContaining("information_schema.SCHEMATA"),
        params: ["tradingweb_migration_reconciliation_20260726_test"],
      },
      {
        sql: "CREATE DATABASE `tradingweb_migration_reconciliation_20260726_test` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
        params: [],
      },
    ]);
    expect(statements.some((statement) => /\bDROP\b/i.test(statement.sql)))
      .toBe(false);
  });

  it("refuses an existing disposable database without mutation", async () => {
    const statements: string[] = [];
    const connection: DisposableAdminConnection = {
      async execute(sql) {
        statements.push(sql);
        return [[{ schema_name: "tradingweb_migration_reconciliation_20260726_test" }]];
      },
    };

    await expect(createFreshDisposableDatabase(connection, {
      database: "tradingweb_migration_reconciliation_20260726_test",
      optIn: "1",
    })).rejects.toThrow("Disposable integration database already exists");
    expect(statements).toHaveLength(1);
    expect(statements[0]).not.toMatch(/\bCREATE\b|\bDROP\b/i);
  });
});

const expected = [
  { id: "0025", idx: 24, tag: "0025_repair_health_check", when: 1782950400000 },
  { id: "0026", idx: 25, tag: "0026_pos_idempotency", when: 1783968842846 },
  { id: "0027", idx: 26, tag: "0027_order_payments", when: 1784073600000 },
  { id: "0028", idx: 27, tag: "0028_pos_operator_sessions", when: 1784160000000 },
  { id: "0029", idx: 28, tag: "0029_pos_exchanges", when: 1784246400000 },
  { id: "0030", idx: 29, tag: "0030_pos_shifts_outbox", when: 1784419200000 },
  { id: "0031", idx: 30, tag: "0031_pos_purchase_orders", when: 1784505600000 },
  { id: "0032", idx: 31, tag: "0032_pos_fulfillment", when: 1784592000000 },
  { id: "0033", idx: 32, tag: "0033_add_orders_pos_attribution", when: 1784678400000 },
] as const;

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

async function createRepository(
  mutate?: (entries: Array<Record<string, unknown>>) => void,
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "migration-manifest-"));
  temporaryRoots.push(root);
  await mkdir(join(root, "drizzle", "meta"), { recursive: true });
  const entries = expected.map((item) => ({
    idx: item.idx,
    version: "7",
    when: item.when,
    tag: item.tag,
    breakpoints: true,
  }));
  mutate?.(entries);
  await writeFile(
    join(root, "drizzle", "meta", "_journal.json"),
    JSON.stringify({ version: "7", dialect: "mysql", entries }),
    "utf8",
  );
  for (const item of entries) {
    if (typeof item.tag === "string") {
      await writeFile(
        join(root, "drizzle", `${item.tag}.sql`),
        `SELECT '${item.tag}';\n`,
        "utf8",
      );
    }
  }
  return root;
}

describe("readRepositoryManifest", () => {
  it("returns the exact 0025 anchor and ordered 0026-0033 targets", async () => {
    const manifest = await readRepositoryManifest(process.cwd());

    expect(manifest.map(({ id, idx, tag, when, role }) => ({
      id,
      idx,
      tag,
      when,
      role,
    }))).toEqual(expected.map((item, index) => ({
      ...item,
      role: index === 0 ? "predecessor-anchor" : "repair-target",
    })));
  });

  it("matches the installed Drizzle reader hashes for real files", async () => {
    const root = process.cwd();
    const manifest = await readRepositoryManifest(root);
    const drizzleMigrations = readMigrationFiles({
      migrationsFolder: resolve(root, "drizzle"),
    });
    const drizzleHashByTimestamp = new Map(
      drizzleMigrations.map((item) => [item.folderMillis, item.hash]),
    );

    expect(manifest.map((item) => item.sha256))
      .toEqual(manifest.map((item) => drizzleHashByTimestamp.get(item.when)));
  });

  it("preserves CRLF versus LF hash differences", async () => {
    const lfRoot = await createRepository();
    const crlfRoot = await createRepository();
    const crlfFile = join(crlfRoot, "drizzle", "0026_pos_idempotency.sql");
    const sql = await readFile(crlfFile, "utf8");
    await writeFile(crlfFile, sql.replace(/\n/g, "\r\n"), "utf8");

    const lf = await readRepositoryManifest(lfRoot);
    const crlf = await readRepositoryManifest(crlfRoot);

    expect(lf.find((item) => item.id === "0026")?.sha256)
      .not.toBe(crlf.find((item) => item.id === "0026")?.sha256);
  });

  it("rejects a missing migration file", async () => {
    const root = await createRepository();
    await rm(join(root, "drizzle", "0028_pos_operator_sessions.sql"));

    await expect(readRepositoryManifest(root)).rejects.toThrow(/0028_pos_operator_sessions\.sql/);
  });

  it("rejects a renamed tag", async () => {
    const root = await createRepository((entries) => {
      entries[2]!.tag = "0027_renamed";
    });

    await expect(readRepositoryManifest(root)).rejects.toThrow(/0027_order_payments/);
  });

  it("rejects duplicate target ids", async () => {
    const root = await createRepository((entries) => {
      entries.push({
        ...entries[1],
        idx: 32,
        when: 1784678400000,
        tag: "0026_duplicate",
      });
    });

    await expect(readRepositoryManifest(root)).rejects.toThrow(/duplicate.*0026/i);
  });

  it("rejects duplicate timestamps", async () => {
    const root = await createRepository((entries) => {
      entries[2]!.when = entries[1]!.when;
    });

    await expect(readRepositoryManifest(root)).rejects.toThrow(/timestamp/i);
  });

  it("rejects a tampered unique timestamp", async () => {
    const root = await createRepository((entries) => {
      entries[2]!.when = 1784073600001;
    });

    await expect(readRepositoryManifest(root)).rejects.toThrow(/1784073600000/);
  });

  it("rejects a non-contiguous journal index", async () => {
    const root = await createRepository((entries) => {
      entries[4]!.idx = 99;
    });

    await expect(readRepositoryManifest(root)).rejects.toThrow(/idx 28/);
  });

  it("rejects an unexpected migration after the reviewed 0033 boundary", async () => {
    const root = await createRepository((entries) => {
      entries.push({
        idx: 33,
        version: "7",
        when: 1784764800000,
        tag: "0034_future_change",
        breakpoints: true,
      });
    });

    await expect(readRepositoryManifest(root)).rejects.toThrow(/0034_future_change/);
  });
});
