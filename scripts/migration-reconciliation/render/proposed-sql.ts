import type { MigrationManifestEntry, ReconciliationReport } from "../types";

export interface ProposedSqlOptions {
  manifest: readonly MigrationManifestEntry[];
  generatedAt: string;
  lockName?: string;
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function renderProposedSql(
  report: ReconciliationReport,
  options: ProposedSqlOptions,
): string | null {
  if (report.decision.kind !== "JOURNAL_REPAIR_ELIGIBLE") return null;

  const suffix = report.decision.missingSuffix.map((id) => {
    const entry = options.manifest.find((candidate) => candidate.id === id);
    if (!entry) throw new Error(`Missing manifest identity for ${id}`);
    return entry;
  });
  const firstSuffixIndex = options.manifest.findIndex(
    (entry) => entry.id === suffix[0]!.id,
  );
  const prefix = options.manifest[firstSuffixIndex - 1];
  if (!prefix) throw new Error("Eligible suffix has no exact predecessor");

  const lockName = options.lockName ?? "migration-journal-reconciliation";
  const expectedRows = suffix.map((entry, index) =>
    index === 0
      ? `  SELECT ${sqlString(entry.sha256)} AS hash, ${entry.when} AS created_at`
      : `  UNION ALL SELECT ${sqlString(entry.sha256)}, ${entry.when}`
  ).join("\n");

  return [
    "-- REVIEW-ONLY proposed journal repair; this tool does not execute SQL.",
    `-- Repository commit: ${report.repository_commit}`,
    `-- Snapshot fingerprint: ${report.snapshot_fingerprint}`,
    `-- Generated at: ${options.generatedAt}`,
    "-- Proceed only after a fresh matching capture and a maintenance-window writer stop.",
    "-- Require GET_LOCK result 1. Roll back and investigate zero or unexpected affected rows.",
    "-- After commit, rerun the reconciliation tool and require exit code 0.",
    "",
    `SET @repair_lock_name = ${sqlString(lockName)};`,
    `SET @expected_prefix_hash = ${sqlString(prefix.sha256)};`,
    `SET @expected_prefix_created_at = ${prefix.when};`,
    `SET @expected_affected_rows = ${suffix.length};`,
    "",
    "SELECT GET_LOCK(@repair_lock_name, 0) INTO @repair_lock_acquired;",
    "SELECT @repair_lock_acquired AS advisory_lock_must_equal_1;",
    "",
    "-- preflight: exact predecessor must occur once and no later journal rows may exist.",
    "SELECT COUNT(*) AS exact_prefix_rows_must_equal_1",
    "FROM `__drizzle_migrations`",
    "WHERE BINARY `hash` = BINARY @expected_prefix_hash",
    "  AND `created_at` = @expected_prefix_created_at;",
    "",
    "SELECT COUNT(*) AS later_rows_must_equal_0",
    "FROM `__drizzle_migrations`",
    "WHERE `created_at` > @expected_prefix_created_at;",
    "",
    "START TRANSACTION;",
    "",
    "INSERT INTO `__drizzle_migrations` (`hash`, `created_at`)",
    "SELECT expected.hash, expected.created_at",
    "FROM (",
    expectedRows,
    ") AS expected",
    "WHERE @repair_lock_acquired = 1",
    "AND (",
    "  SELECT COUNT(*)",
    "  FROM `__drizzle_migrations`",
    "  WHERE `created_at` > @expected_prefix_created_at",
    ") = 0",
    "AND (",
    "  SELECT COUNT(*)",
    "  FROM `__drizzle_migrations`",
    "  WHERE BINARY `hash` = BINARY @expected_prefix_hash",
    "    AND `created_at` = @expected_prefix_created_at",
    ") = 1;",
    "",
    "SELECT ROW_COUNT() AS affected_rows_must_equal_expected_affected_rows;",
    `-- expected_affected_rows = ${suffix.length}`,
    "",
    "COMMIT;",
    "",
    "-- postflight: return the complete inserted suffix for exact comparison with the values above.",
    "SELECT `hash`, `created_at`",
    "FROM `__drizzle_migrations`",
    "WHERE `created_at` > @expected_prefix_created_at",
    "ORDER BY `created_at`, `hash`;",
    "",
    "SELECT RELEASE_LOCK(@repair_lock_name) AS advisory_lock_release_must_equal_1",
    "FROM (SELECT 1 AS lock_guard) AS guard",
    "WHERE @repair_lock_acquired = 1;",
    "",
  ].join("\n");
}
