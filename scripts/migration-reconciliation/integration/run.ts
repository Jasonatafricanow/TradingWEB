import { execFile } from "node:child_process";
import { mkdtemp, mkdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";

import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import {
  createConnection,
  createPool,
  type Connection,
  type ResultSetHeader,
} from "mysql2/promise";

import { loadCollationPolicy } from "../collation-policy";
import { migrationContracts } from "../contracts";
import { reconcile } from "../reconcile";
import { renderProposedSql } from "../render/proposed-sql";
import { writeArtifactBundle } from "../render/write-artifacts";
import { readRepositoryManifest } from "../repository-manifest";
import { evaluateSnapshotFreshness } from "../snapshot-schema";
import {
  buildConnectionOptions,
  MySqlReadOnlySource,
  readMySqlCaptureConfig,
  type MySqlCaptureConfig,
} from "../sources/mysql-read-only-source";
import type {
  MigrationManifestEntry,
  OverallDecision,
  ReconciliationReport,
  ReconciliationSnapshot,
} from "../types";
import {
  assertCleanRepositoryStatus,
  assertExactIntegrationMatrix,
  assertRepositoryCommitUnchanged,
  type IntegrationPhaseResult,
} from "./certification";
import {
  assertDisposableDatabase,
  buildDisposableMigrationConnectionOptions,
  createFreshDisposableDatabase,
  isDrizzleMigrationBodyStatement,
  selectDisposableUtf8mb4Tables,
  type DisposableDatabaseGate,
  withDisposableForeignKeyChecksDisabled,
} from "./disposable-db";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(process.cwd());

interface IntegrationContext {
  config: MySqlCaptureConfig;
  gate: DisposableDatabaseGate;
  manifest: MigrationManifestEntry[];
  repositoryCommit: string;
  artifactRoot: string;
  results: IntegrationPhaseResult[];
}

function connectionOptions(config: MySqlCaptureConfig) {
  return buildConnectionOptions(config);
}

async function repositoryCommit(): Promise<string> {
  const { stdout: status } = await execFileAsync(
    "git",
    ["status", "--porcelain", "--untracked-files=all"],
    { cwd: repositoryRoot, windowsHide: true },
  );
  assertCleanRepositoryStatus(status);

  const { stdout } = await execFileAsync(
    "git",
    ["rev-parse", "HEAD"],
    { cwd: repositoryRoot, windowsHide: true },
  );
  const value = stdout.trim();
  if (!/^[0-9a-f]{40,64}$/.test(value)) {
    throw new Error("Repository commit could not be resolved");
  }
  return value;
}

async function artifactRoot(): Promise<string> {
  const selected = process.env.MIGRATION_RECONCILIATION_ARTIFACT_DIR;
  if (!selected) return await mkdtemp(join(tmpdir(), "migration-reconciliation-"));
  const target = resolve(selected);
  const relation = relative(repositoryRoot, target);
  if (relation === "" || (!relation.startsWith("..") && !isAbsolute(relation))) {
    throw new Error("Integration artifact directory must be outside the repository");
  }
  const parentStatus = await stat(dirname(target));
  if (!parentStatus.isDirectory()) throw new Error("Artifact parent is not a directory");
  await mkdir(target);
  return target;
}

async function createDatabase(context: IntegrationContext): Promise<void> {
  assertDisposableDatabase(context.gate);
  const admin = await createConnection({
    host: context.config.host,
    port: context.config.port,
    user: context.config.user,
    password: context.config.password,
    connectTimeout: context.config.connectTimeoutMs,
    multipleStatements: false,
    rowsAsArray: false,
    supportBigNumbers: true,
    bigNumberStrings: true,
    decimalNumbers: false,
  });
  try {
    await createFreshDisposableDatabase(
      {
        async execute(sql, params = []) {
          const [rows, fields] = await admin.execute(sql, [...params]);
          return [Array.isArray(rows) ? rows : [], fields];
        },
      },
      context.gate,
    );
  } finally {
    await admin.end();
  }
}

async function runDrizzleMigrations(
  context: IntegrationContext,
  proveNoReplay = false,
): Promise<number> {
  assertDisposableDatabase(context.gate);
  const statements: string[] = [];
  const pool = createPool(buildDisposableMigrationConnectionOptions(
    context.gate,
    connectionOptions(context.config),
  ));
  try {
    const database = drizzle(pool, {
      logger: {
        logQuery(query) {
          statements.push(query);
        },
      },
    });
    await migrate(database, {
      migrationsFolder: join(repositoryRoot, "drizzle"),
    });
  } finally {
    await pool.end();
  }
  const migrationStatements = statements.filter(isDrizzleMigrationBodyStatement);
  if (proveNoReplay && migrationStatements.length !== 0) {
    throw new Error("Final Drizzle run attempted migration SQL");
  }
  return migrationStatements.length;
}

async function capture(
  context: IntegrationContext,
  profile: ReconciliationSnapshot["collation_profile"],
): Promise<ReconciliationSnapshot> {
  assertDisposableDatabase(context.gate);
  return await MySqlReadOnlySource.capture({
    config: context.config,
    manifest: context.manifest,
    contracts: migrationContracts,
    profile,
    repositoryCommit: context.repositoryCommit,
    capturedAt: new Date(),
  });
}

function reportFor(
  context: IntegrationContext,
  snapshot: ReconciliationSnapshot,
): ReconciliationReport {
  return reconcile({
    manifest: context.manifest,
    snapshot,
    contracts: migrationContracts,
    policy: loadCollationPolicy(snapshot.collation_profile),
    freshness: evaluateSnapshotFreshness(snapshot, new Date()),
    repositoryCommit: context.repositoryCommit,
  });
}

async function recordPhase(
  context: IntegrationContext,
  phase: string,
  snapshot: ReconciliationSnapshot,
  expected: OverallDecision["kind"],
): Promise<ReconciliationReport> {
  const report = reportFor(context, snapshot);
  if (report.decision.kind !== expected) {
    throw new Error(`${phase} returned ${report.decision.kind}, expected ${expected}`);
  }
  const sql = renderProposedSql(report, {
    manifest: context.manifest,
    generatedAt: new Date().toISOString(),
  });
  await writeArtifactBundle({
    outputDirectory: join(context.artifactRoot, phase),
    snapshot,
    report,
    proposedSql: sql,
  });
  context.results.push({
    phase,
    decision: report.decision.kind,
    exitCode: report.decision.exitCode,
  });
  return report;
}

async function mutableConnection(
  context: IntegrationContext,
  multipleStatements = false,
): Promise<Connection> {
  assertDisposableDatabase(context.gate);
  return await createConnection({
    ...connectionOptions(context.config),
    multipleStatements,
  });
}

async function gatedExecute(
  context: IntegrationContext,
  connection: Connection,
  sql: string,
  params: readonly (string | number | null)[] = [],
): Promise<unknown> {
  assertDisposableDatabase(context.gate);
  const [result] = await connection.execute(sql, [...params]);
  return result;
}

function quoteSafeTable(name: string): string {
  if (!/^[a-z0-9_]+$/.test(name)) {
    throw new Error("Collation policy contains an unsafe table identifier");
  }
  return `\`${name}\``;
}

async function normalizeCollations(context: IntegrationContext): Promise<void> {
  const policy = loadCollationPolicy("production-normalized");
  const connection = await mutableConnection(context);
  try {
    const [rows] = await connection.execute(
      `SELECT TABLE_NAME AS name, TABLE_COLLATION AS collation
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()`,
    );
    const normalizationTables = selectDisposableUtf8mb4Tables(
      rows as Array<{ name: string; collation: string | null }>,
    );
    await withDisposableForeignKeyChecksDisabled(
      context.gate,
      async (sql) => await gatedExecute(context, connection, sql),
      async () => {
        for (const table of normalizationTables) {
          await gatedExecute(
            context,
            connection,
            `ALTER TABLE ${quoteSafeTable(table)} CONVERT TO CHARACTER SET utf8mb4 COLLATE ${policy.targetCollation}`,
          );
        }
      },
    );
  } finally {
    await connection.end();
  }
}

async function removeTargetJournalRows(context: IntegrationContext): Promise<void> {
  const timestamps = context.manifest
    .filter((entry) => entry.role === "repair-target")
    .map((entry) => entry.when);
  const placeholders = timestamps.map(() => "?").join(", ");
  const connection = await mutableConnection(context);
  try {
    await gatedExecute(
      context,
      connection,
      `DELETE FROM \`__drizzle_migrations\` WHERE \`created_at\` IN (${placeholders})`,
      timestamps,
    );
  } finally {
    await connection.end();
  }
}

async function executeProposedSql(
  context: IntegrationContext,
  sql: string,
  expectedRows: number,
): Promise<void> {
  const connection = await mutableConnection(context, true);
  try {
    assertDisposableDatabase(context.gate);
    const [results] = await connection.query(sql);
    const affectedRows = (results as unknown[]).filter(
      (result): result is ResultSetHeader =>
        result !== null
        && typeof result === "object"
        && "affectedRows" in result,
    ).map((result) => result.affectedRows);
    if (!affectedRows.includes(expectedRows)) {
      throw new Error("Generated SQL affected-row count was unexpected");
    }
  } finally {
    await connection.end();
  }
}

async function journalRowCount(context: IntegrationContext): Promise<number> {
  const connection = await mutableConnection(context);
  try {
    const [rows] = await connection.execute(
      "SELECT COUNT(*) AS count FROM `__drizzle_migrations`",
    );
    return Number((rows as Array<{ count: number | string }>)[0]!.count);
  } finally {
    await connection.end();
  }
}

const repairLockName = "migration-journal-reconciliation";
const repairLockLiteral = "'migration-journal-reconciliation'";

async function runRepairExecutionMatrix(
  context: IntegrationContext,
  candidate: ReconciliationReport,
): Promise<void> {
  const sql = renderProposedSql(candidate, {
    manifest: context.manifest,
    generatedAt: new Date().toISOString(),
    lockName: repairLockName,
  });
  if (!sql) throw new Error("Eligible integration phase did not render SQL");

  const beforeLockContention = await journalRowCount(context);

  const blocker = await mutableConnection(context, true);
  try {
    const [lockResults] = await blocker.query(
      `SELECT GET_LOCK(${repairLockLiteral}, 0) AS g`,
    ) as unknown as Array<Array<{ g: number | string }>>;
    if (String(lockResults[0]!.g) !== "1") {
      throw new Error("Blocker could not acquire the repair advisory lock");
    }
    try {
      await executeProposedSql(context, sql, 0);
      const after = await journalRowCount(context);
      if (after !== beforeLockContention) {
        throw new Error("Lock-contended repair mutated the journal");
      }
      await recordPhase(
        context,
        "repair-lock-contention",
        await capture(context, "production-normalized"),
        "JOURNAL_REPAIR_ELIGIBLE",
      );
    } finally {
      const releaseResults = await blocker.query(
        `SELECT RELEASE_LOCK(${repairLockLiteral}) AS released`,
      ) as unknown as Array<Array<{ released: number | string }>>;
      if (String(releaseResults[0]![0]!.released) !== "1") {
        throw new Error("Blocker advisory lock was not still held on release");
      }
    }
  } finally {
    await blocker.end();
  }

  const cron = await mutableConnection(context);
  try {
    const driftTimestamp = Math.max(...context.manifest.map((entry) => entry.when)) + 1;
    await gatedExecute(
      context,
      cron,
      "INSERT INTO `__drizzle_migrations` (`hash`, `created_at`) VALUES (?, ?)",
      ["f".repeat(64), driftTimestamp],
    );
    const driftBefore = await journalRowCount(context);
    try {
      await executeProposedSql(context, sql, 0);
      const driftAfter = await journalRowCount(context);
      if (driftAfter !== driftBefore) {
        throw new Error("Preflight-drifted repair mutated the journal");
      }
      await recordPhase(
        context,
        "repair-preflight-drift",
        await capture(context, "production-normalized"),
        "BLOCKED",
      );
    } finally {
      await gatedExecute(
        context,
        cron,
        "DELETE FROM `__drizzle_migrations` WHERE `hash` = ?",
        ["f".repeat(64)],
      );
    }
  } finally {
    await cron.end();
  }

  await executeProposedSql(context, sql, 8);
  await recordPhase(
    context,
    "post-repair",
    await capture(context, "production-normalized"),
    "REGISTERED_EXACT",
  );

  const secondBefore = await journalRowCount(context);
  const secondConnection = await mutableConnection(context, true);
  try {
    await assertDisposableDatabase(context.gate);
    await secondConnection.query(sql);
  } finally {
    await secondConnection.end();
  }
  const secondAfter = await journalRowCount(context);
  if (secondAfter !== secondBefore) {
    throw new Error("Second repair execution appended duplicate suffix rows");
  }
  await recordPhase(
    context,
    "repair-second-execution",
    await capture(context, "production-normalized"),
    "REGISTERED_EXACT",
  );
}

async function withReversibleMutation(
  context: IntegrationContext,
  phase: string,
  mutate: (connection: Connection) => Promise<void>,
  restore: (connection: Connection) => Promise<void>,
): Promise<void> {
  const connection = await mutableConnection(context);
  try {
    await mutate(connection);
    await recordPhase(
      context,
      phase,
      await capture(context, "production-normalized"),
      "BLOCKED",
    );
  } finally {
    try {
      await restore(connection);
    } finally {
      await connection.end();
    }
  }
}

async function runBlockedScenarios(context: IntegrationContext): Promise<void> {
  const entry0028 = context.manifest.find((entry) => entry.id === "0028")!;
  const entry0029 = context.manifest.find((entry) => entry.id === "0029")!;
  const unknownTimestamp = Math.max(...context.manifest.map((entry) => entry.when)) + 1;
  const unknownHash = "f".repeat(64);

  await withReversibleMutation(
    context,
    "blocked-index",
    async (connection) => {
      await gatedExecute(
        context,
        connection,
        "ALTER TABLE `orders` DROP INDEX `orders_store_created_idx`",
      );
    },
    async (connection) => {
      await gatedExecute(
        context,
        connection,
        "ALTER TABLE `orders` ADD INDEX `orders_store_created_idx` (`store_id`, `created_at`, `id`)",
      );
    },
  );
  await withReversibleMutation(
    context,
    "blocked-hash",
    async (connection) => {
      await gatedExecute(
        context,
        connection,
        "UPDATE `__drizzle_migrations` SET `hash` = ? WHERE `created_at` = ?",
        ["0".repeat(64), entry0029.when],
      );
    },
    async (connection) => {
      await gatedExecute(
        context,
        connection,
        "UPDATE `__drizzle_migrations` SET `hash` = ? WHERE `created_at` = ?",
        [entry0029.sha256, entry0029.when],
      );
    },
  );
  await withReversibleMutation(
    context,
    "blocked-gap",
    async (connection) => {
      await gatedExecute(
        context,
        connection,
        "DELETE FROM `__drizzle_migrations` WHERE `created_at` = ?",
        [entry0028.when],
      );
    },
    async (connection) => {
      await gatedExecute(
        context,
        connection,
        "INSERT INTO `__drizzle_migrations` (`hash`, `created_at`) VALUES (?, ?)",
        [entry0028.sha256, entry0028.when],
      );
    },
  );
  await withReversibleMutation(
    context,
    "blocked-unknown-row",
    async (connection) => {
      await gatedExecute(
        context,
        connection,
        "INSERT INTO `__drizzle_migrations` (`hash`, `created_at`) VALUES (?, ?)",
        [unknownHash, unknownTimestamp],
      );
    },
    async (connection) => {
      await gatedExecute(
        context,
        connection,
        "DELETE FROM `__drizzle_migrations` WHERE `hash` = ? AND `created_at` = ?",
        [unknownHash, unknownTimestamp],
      );
    },
  );
  await withReversibleMutation(
    context,
    "blocked-collation",
    async (connection) => {
      await gatedExecute(
        context,
        connection,
        "ALTER TABLE `pos_idempotency_keys` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
      );
    },
    async (connection) => {
      await gatedExecute(
        context,
        connection,
        "ALTER TABLE `pos_idempotency_keys` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci",
      );
    },
  );
  await withReversibleMutation(
    context,
    "blocked-0027-data",
    async (connection) => {
      await gatedExecute(
        context,
        connection,
        `INSERT INTO orders
  (id, user_id, order_no, total_amount, payment_method)
VALUES
  ('integration-order-0027', 'integration-user', 'INTEGRATION-0027', 1.00, 'cash')`,
      );
    },
    async (connection) => {
      await gatedExecute(
        context,
        connection,
        "DELETE FROM orders WHERE id = 'integration-order-0027'",
      );
    },
  );
  await withReversibleMutation(
    context,
    "blocked-0031-data",
    async (connection) => {
      await gatedExecute(
        context,
        connection,
        `INSERT INTO categories (id, name, type)
VALUES ('integration-category', 'Integration', 'product')`,
      );
      await gatedExecute(
        context,
        connection,
        `INSERT INTO products
  (id, title, price, category_id, type, seller_id)
VALUES
  ('integration-product', 'Integration', 1.00, 'integration-category', 'product', 'integration-seller')`,
      );
      await gatedExecute(
        context,
        connection,
        `INSERT INTO product_variants
  (id, product_id, price, stock)
VALUES
  ('integration-variant', 'integration-product', 1.00, 1)`,
      );
    },
    async (connection) => {
      await gatedExecute(
        context,
        connection,
        "DELETE FROM product_variants WHERE id = 'integration-variant'",
      );
      await gatedExecute(
        context,
        connection,
        "DELETE FROM products WHERE id = 'integration-product'",
      );
      await gatedExecute(
        context,
        connection,
        "DELETE FROM categories WHERE id = 'integration-category'",
      );
    },
  );

  await withReversibleMutation(
    context,
    "blocked-0033-data",
    async (connection) => {
      await gatedExecute(
        context,
        connection,
        `INSERT INTO orders (id, user_id, order_no, total_amount, source, payment_id)
VALUES ('integration-order-0033', 'integration-user', 'INTEGRATION-0033', 1.00, 'pos', 'pos:missing-staff')`,
      );
    },
    async (connection) => {
      await gatedExecute(
        context,
        connection,
        "DELETE FROM orders WHERE id = 'integration-order-0033'",
      );
    },
  );

  const stale = await capture(context, "production-normalized");
  stale.captured_at = "2000-01-01T00:00:00.000Z";
  await recordPhase(context, "blocked-stale-offline", stale, "BLOCKED");

  const future = await capture(context, "production-normalized");
  future.captured_at = new Date(Date.now() + 6 * 60 * 1000).toISOString();
  await recordPhase(context, "blocked-future-offline", future, "BLOCKED");
}

async function main(): Promise<void> {
  const config = readMySqlCaptureConfig();
  const gate = {
    database: config.database,
    optIn: process.env.MIGRATION_RECONCILIATION_ALLOW_DISPOSABLE_DB,
  };
  assertDisposableDatabase(gate);
  const context: IntegrationContext = {
    config,
    gate,
    manifest: await readRepositoryManifest(repositoryRoot),
    repositoryCommit: await repositoryCommit(),
    artifactRoot: await artifactRoot(),
    results: [],
  };

  console.log(`Approved disposable database: ${config.database}`);
  await createDatabase(context);
  await runDrizzleMigrations(context);
  await recordPhase(context, "raw-replay", await capture(context, "migration-native"), "REGISTERED_EXACT");

  await normalizeCollations(context);
  await recordPhase(
    context,
    "normalized-replay",
    await capture(context, "production-normalized"),
    "REGISTERED_EXACT",
  );

  await removeTargetJournalRows(context);
  const candidate = await recordPhase(
    context,
    "eight-row-candidate",
    await capture(context, "production-normalized"),
    "JOURNAL_REPAIR_ELIGIBLE",
  );
  await runRepairExecutionMatrix(context, candidate);
  const replayedStatements = await runDrizzleMigrations(context, true);
  context.results.push({
    phase: "final-drizzle-no-replay",
    decision: "REGISTERED_EXACT",
    exitCode: replayedStatements,
  });

  await runBlockedScenarios(context);
  const endingRepositoryCommit = await repositoryCommit();
  assertRepositoryCommitUnchanged(
    context.repositoryCommit,
    endingRepositoryCommit,
  );
  assertExactIntegrationMatrix(context.results);
  await writeFile(
    join(context.artifactRoot, "integration-summary.json"),
    `${JSON.stringify({ databaseGate: "passed", phases: context.results }, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" },
  );
  console.log(JSON.stringify({ databaseGate: "passed", phases: context.results }));
}

/**
 * disposable DB 0000 → 0033 全量回放（replay-full）
 *
 * 复用 drizzle 自身的 migrator（与现有 18 相位认证同源），在 disposable
 * DB（库名必须以 _test/_tmp 结尾）上从空库按序号回放到当前最新迁移。
 * 与 main() 的 18 相位认证互补：main 验证"应用后状态正确"，replay-full
 * 验证"按顺序升级可达"。
 *
 * 输出：replay-summary.json，含每条迁移的序号、耗时、语句数与结果。
 * 失败：与 main 一致地返回 exit 30。
 */
async function buildReplayContext(): Promise<IntegrationContext> {
  const config = readMySqlCaptureConfig(process.env);
  const gate: DisposableDatabaseGate = {
    database: (process.env.DB_NAME ?? "").trim(),
    optIn: process.env.MIGRATION_RECONCILIATION_ALLOW_DISPOSABLE_DB,
  };
  assertDisposableDatabase(gate);
  return {
    config,
    gate,
    manifest: await readRepositoryManifest(repositoryRoot),
    repositoryCommit: await repositoryCommit(),
    artifactRoot: await artifactRoot(),
    results: [],
  };
}

export async function runReplayFull(): Promise<number> {
  const context = await buildReplayContext();
  await createDatabase(context);
  const startedAt = new Date();
  const startedHr = process.hrtime.bigint();
  const replaySteps: Array<{
    sequence: number;
    file: string;
    wallClockMs: number;
    statements: number;
    outcome: "applied" | "failed";
    error: string | null;
  }> = [];
  let previousStatements = 0;
  let failureReason: string | null = null;
  try {
    const connection = await mutableConnection(context, true);
    try {
      const pool = createPool(buildDisposableMigrationConnectionOptions(
        context.gate,
        connectionOptions(context.config),
      ));
      try {
        const captured: string[] = [];
        const database = drizzle(pool, {
          logger: {
            logQuery(query) {
              captured.push(query);
            },
          },
        });
        const stepStarted = process.hrtime.bigint();
        try {
          await migrate(database, { migrationsFolder: join(repositoryRoot, "drizzle") });
        } catch (error) {
          failureReason = (error as Error).message;
        }
        const elapsedMs = Number((process.hrtime.bigint() - stepStarted) / 1_000_000n);
        const applied = captured.filter(isDrizzleMigrationBodyStatement);
        const sequence = applied.length;
        replaySteps.push({
          sequence,
          file: `drizzle-migrator-batch(${sequence})`,
          wallClockMs: elapsedMs,
          statements: applied.length - previousStatements,
          outcome: failureReason === null ? "applied" : "failed",
          error: failureReason,
        });
        previousStatements = applied.length;
      } finally {
        await pool.end();
      }
    } finally {
      await connection.end();
    }
  } catch (error) {
    failureReason = (error as Error).message;
  }
  const finishedAt = new Date();
  const totalWallClockMs = Number((process.hrtime.bigint() - startedHr) / 1_000_000n);
  const journalRows = failureReason === null ? await journalRowCount(context) : 0;
  const summary = {
    repositoryCommit: context.repositoryCommit,
    database: context.gate.database,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    totalWallClockMs,
    drizzleJournalRows: journalRows,
    steps: replaySteps,
    outcome: failureReason === null ? "pass" : "fail",
    failureReason,
  };
  const fileStamp = startedAt.toISOString().replace(/[:.]/g, "-");
  const summaryPath = join(context.artifactRoot, `replay-summary-${fileStamp}.json`);
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  console.log(JSON.stringify(summary));
  if (failureReason !== null) {
    console.error(`replay-full failed: ${failureReason}`);
    return 30;
  }
  return 0;
}

if (/migration-reconciliation[\\/]integration[\\/]run\.(?:ts|js)$/i.test(process.argv[1] ?? "")) {
  const subCommand = process.argv[2];
  if (subCommand === "replay-full") {
    void runReplayFull().catch(() => {
      console.error("replay-full failed; no database credentials or row values were emitted");
      process.exitCode = 1;
    });
  } else {
    void main().catch(() => {
      console.error(
        "Migration reconciliation integration failed; no database credentials or row values were emitted",
      );
      process.exitCode = 1;
    });
  }
}
