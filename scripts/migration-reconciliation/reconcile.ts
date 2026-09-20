import { expectedCollationForTable, type CollationPolicy } from "./collation-policy";
import type {
  CheckContract,
  ForeignKeyContract,
  MigrationContract,
  TableContract,
} from "./contracts";
import {
  normalizeCheck,
  normalizeColumn,
  normalizeIndex,
  normalizeReferentialAction,
} from "./normalize";
import type { SnapshotFreshness } from "./snapshot-schema";
import type {
  Finding,
  MigrationId,
  MigrationManifestEntry,
  MigrationResult,
  MigrationStatus,
  ReconciliationReport,
  ReconciliationSnapshot,
} from "./types";

export interface ReconcileInput {
  manifest: MigrationManifestEntry[];
  snapshot: ReconciliationSnapshot;
  contracts: MigrationContract[];
  policy: CollationPolicy;
  freshness: SnapshotFreshness;
  repositoryCommit: string;
}

const migrationIds: MigrationId[] = [
  "0026",
  "0027",
  "0028",
  "0029",
  "0030",
  "0031",
  "0032",
  "0033",
];

const categoryOrder: Finding["category"][] = [
  "identity",
  "journal",
  "evidence",
  "schema",
  "collation",
  "data",
];

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function addFinding(
  findings: Finding[],
  finding: Omit<Finding, "blocking"> & { blocking?: boolean },
): void {
  findings.push({ ...finding, blocking: finding.blocking ?? true });
}

function ownerForTable(
  contracts: readonly MigrationContract[],
  tableName: string,
): MigrationId | "snapshot" {
  return contracts.find((contract) =>
    [...contract.requiredTables, ...contract.alteredTables]
      .some((table) => table.name === tableName)
    || contract.collationTables.includes(tableName)
  )?.id ?? "snapshot";
}

function validateManifestIdentity(
  input: ReconcileInput,
  findings: Finding[],
): void {
  for (const expected of input.manifest) {
    const migration = expected.id === "0025" ? "snapshot" : expected.id;
    const matches = input.snapshot.migrations.filter((entry) => entry.id === expected.id);
    if (matches.length === 0) {
      addFinding(findings, {
        migration,
        category: "identity",
        code: "FILE_IDENTITY_MISSING",
        expected,
        actual: null,
      });
      continue;
    }
    if (matches.length !== 1) {
      addFinding(findings, {
        migration,
        category: "identity",
        code: "FILE_IDENTITY_MULTIPLICITY",
        expected: 1,
        actual: matches.length,
      });
      continue;
    }
    const actual = matches[0]!;
    if (actual.sha256 !== expected.sha256) {
      addFinding(findings, {
        migration,
        category: "identity",
        code: "FILE_HASH_MISMATCH",
        expected: expected.sha256,
        actual: actual.sha256,
      });
    }
    const expectedIdentity = {
      id: expected.id,
      idx: expected.idx,
      tag: expected.tag,
      filename: expected.filename,
      when: expected.when,
      role: expected.role,
    };
    const actualIdentity = {
      id: actual.id,
      idx: actual.idx,
      tag: actual.tag,
      filename: actual.filename,
      when: actual.when,
      role: actual.role,
    };
    if (!sameValue(actualIdentity, expectedIdentity)) {
      addFinding(findings, {
        migration,
        category: "identity",
        code: "FILE_IDENTITY_MISMATCH",
        expected: expectedIdentity,
        actual: actualIdentity,
      });
    }
  }
}

function validateJournal(
  input: ReconcileInput,
  findings: Finding[],
): Set<MigrationId> {
  const missing = new Set<MigrationId>();
  const anchor = input.manifest.find((entry) => entry.id === "0025");
  if (!anchor) {
    addFinding(findings, {
      migration: "journal",
      category: "journal",
      code: "ANCHOR_IDENTITY",
      expected: "manifest entry 0025",
      actual: null,
    });
    return missing;
  }

  const anchorCandidates = input.snapshot.journal_rows.filter((row) =>
    BigInt(row.created_at) === BigInt(anchor.when) || row.hash === anchor.sha256
  );
  const exactAnchor = anchorCandidates.filter((row) =>
    BigInt(row.created_at) === BigInt(anchor.when) && row.hash === anchor.sha256
  );
  if (anchorCandidates.length > 1 || exactAnchor.length > 1) {
    addFinding(findings, {
      migration: "journal",
      category: "journal",
      code: "ANCHOR_MULTIPLICITY",
      expected: 1,
      actual: anchorCandidates.length,
    });
  } else if (exactAnchor.length !== 1) {
    addFinding(findings, {
      migration: "journal",
      category: "journal",
      code: "ANCHOR_IDENTITY",
      expected: { created_at: String(anchor.when), hash: anchor.sha256 },
      actual: anchorCandidates,
    });
  }

  const knownRows = new Set(
    input.manifest.flatMap((entry) =>
      input.snapshot.journal_rows
        .filter((row) =>
          BigInt(row.created_at) === BigInt(entry.when) || row.hash === entry.sha256
        )
    ),
  );
  const unknownLaterRows = input.snapshot.journal_rows.filter((row) =>
    BigInt(row.created_at) > BigInt(anchor.when) && !knownRows.has(row)
  );
  for (const row of unknownLaterRows) {
    addFinding(findings, {
      migration: "journal",
      category: "journal",
      code: "UNKNOWN_LATER_JOURNAL_ROW",
      expected: "known migration identity",
      actual: row,
    });
  }

  for (const id of migrationIds) {
    const expected = input.manifest.find((entry) => entry.id === id);
    if (!expected) continue;
    const candidates = input.snapshot.journal_rows.filter((row) =>
      BigInt(row.created_at) === BigInt(expected.when) || row.hash === expected.sha256
    );
    const exact = candidates.filter((row) =>
      BigInt(row.created_at) === BigInt(expected.when) && row.hash === expected.sha256
    );
    if (candidates.length === 0) {
      missing.add(id);
    } else if (candidates.length !== 1 || exact.length !== 1) {
      addFinding(findings, {
        migration: id,
        category: "journal",
        code: "JOURNAL_HASH_CONFLICT",
        expected: { created_at: String(expected.when), hash: expected.sha256 },
        actual: candidates,
      });
    }
  }

  const exactIds = new Set(
    migrationIds.filter((id) => {
      const expected = input.manifest.find((entry) => entry.id === id);
      if (!expected) return false;
      return input.snapshot.journal_rows.some((row) =>
        BigInt(row.created_at) === BigInt(expected.when) && row.hash === expected.sha256
      );
    }),
  );
  for (const missingId of missing) {
    const missingIndex = migrationIds.indexOf(missingId);
    if (migrationIds.some((id, index) => index > missingIndex && exactIds.has(id))) {
      addFinding(findings, {
        migration: missingId,
        category: "journal",
        code: "JOURNAL_GAP",
        expected: "missing rows form a suffix",
        actual: [...exactIds].filter(
          (id) => migrationIds.indexOf(id) > missingIndex,
        ),
      });
    }
  }
  return missing;
}

function validateTableContract(
  migration: MigrationId,
  contract: TableContract,
  snapshot: ReconciliationSnapshot,
  findings: Finding[],
): void {
  const tables = snapshot.tables.filter((item) => item.name === contract.name);
  if (tables.length === 0) {
    addFinding(findings, {
      migration,
      category: "schema",
      code: "TABLE_MISSING",
      expected: contract.name,
      actual: null,
    });
    return;
  }
  if (tables.length !== 1) {
    addFinding(findings, {
      migration,
      category: "evidence",
      code: "TABLE_EVIDENCE_MULTIPLICITY",
      expected: 1,
      actual: tables.length,
    });
    return;
  }
  const table = tables[0]!;
  if (table.engine.toLowerCase() !== "innodb") {
    addFinding(findings, {
      migration,
      category: "schema",
      code: "TABLE_ENGINE_MISMATCH",
      expected: "InnoDB",
      actual: table.engine,
    });
  }

  for (const expected of contract.columns) {
    const matches = snapshot.columns.filter((column) =>
      column.table === contract.name && column.name === expected.name
    );
    if (matches.length === 0) {
      addFinding(findings, {
        migration,
        category: "schema",
        code: "COLUMN_MISSING",
        expected,
        actual: null,
      });
      continue;
    }
    if (matches.length !== 1) {
      addFinding(findings, {
        migration,
        category: "evidence",
        code: "COLUMN_EVIDENCE_MULTIPLICITY",
        expected: 1,
        actual: matches.length,
      });
      continue;
    }
    const actual = matches[0]!;
    if (!sameValue(normalizeColumn(actual), expected)) {
      addFinding(findings, {
        migration,
        category: "schema",
        code: "COLUMN_MISMATCH",
        expected,
        actual: normalizeColumn(actual),
      });
    }
  }

  for (const expected of contract.indexes) {
    const matches = snapshot.indexes.filter((index) =>
      index.table === contract.name && index.name === expected.name
    );
    if (matches.length === 0) {
      addFinding(findings, {
        migration,
        category: "schema",
        code: "INDEX_MISSING",
        expected,
        actual: null,
      });
      continue;
    }
    if (matches.length !== 1) {
      addFinding(findings, {
        migration,
        category: "evidence",
        code: "INDEX_EVIDENCE_MULTIPLICITY",
        expected: 1,
        actual: matches.length,
      });
      continue;
    }
    const actual = matches[0]!;
    let normalized: unknown;
    try {
      normalized = normalizeIndex(actual);
    } catch {
      normalized = actual;
    }
    if (!sameValue(normalized, expected)) {
      addFinding(findings, {
        migration,
        category: "schema",
        code: "INDEX_MISMATCH",
        expected,
        actual: normalized,
      });
    }
  }

  for (const expected of contract.foreignKeys) {
    const matches = snapshot.foreign_keys.filter((foreignKey) =>
      foreignKey.table === contract.name && foreignKey.name === expected.name
    );
    if (matches.length === 0) {
      addFinding(findings, {
        migration,
        category: "schema",
        code: "FOREIGN_KEY_MISSING",
        expected,
        actual: null,
      });
      continue;
    }
    if (matches.length !== 1) {
      addFinding(findings, {
        migration,
        category: "evidence",
        code: "FOREIGN_KEY_EVIDENCE_MULTIPLICITY",
        expected: 1,
        actual: matches.length,
      });
      continue;
    }
    const actual = matches[0]!;
    let normalized: ForeignKeyContract | unknown;
    try {
      normalized = {
        name: actual.name,
        columns: actual.columns,
        referencedTable: actual.referenced_table,
        referencedColumns: actual.referenced_columns,
        onUpdate: normalizeReferentialAction(actual.on_update),
        onDelete: normalizeReferentialAction(actual.on_delete),
      };
    } catch {
      normalized = {
        name: actual.name,
        columns: actual.columns,
        referencedTable: actual.referenced_table,
        referencedColumns: actual.referenced_columns,
        onUpdate: actual.on_update,
        onDelete: actual.on_delete,
      };
    }
    if (!sameValue(normalized, expected)) {
      addFinding(findings, {
        migration,
        category: "schema",
        code: "FOREIGN_KEY_MISMATCH",
        expected,
        actual: normalized,
      });
    }
  }

  for (const expected of contract.checks) {
    const matches = snapshot.checks.filter((check) =>
      check.table === contract.name && check.name === expected.name
    );
    if (matches.length === 0) {
      addFinding(findings, {
        migration,
        category: "schema",
        code: "CHECK_MISSING",
        expected,
        actual: null,
      });
      continue;
    }
    if (matches.length !== 1) {
      addFinding(findings, {
        migration,
        category: "evidence",
        code: "CHECK_EVIDENCE_MULTIPLICITY",
        expected: 1,
        actual: matches.length,
      });
      continue;
    }
    const actual = matches[0]!;
    const normalized: CheckContract = {
      name: actual.name,
      expression: normalizeCheck(actual.clause),
    };
    const normalizedExpected: CheckContract = {
      ...expected,
      expression: normalizeCheck(expected.expression),
    };
    if (!sameValue(normalized, normalizedExpected)) {
      addFinding(findings, {
        migration,
        category: "schema",
        code: "CHECK_MISMATCH",
        expected: normalizedExpected,
        actual: normalized,
      });
    }
  }
}

function validateSchemaAndData(
  input: ReconcileInput,
  findings: Finding[],
): void {
  for (const contract of input.contracts) {
    for (const table of [...contract.requiredTables, ...contract.alteredTables]) {
      validateTableContract(contract.id, table, input.snapshot, findings);
    }
    for (const routineName of contract.absentRoutines) {
      const actual = input.snapshot.routines.filter((routine) => routine.name === routineName);
      if (actual.length > 0) {
        addFinding(findings, {
          migration: contract.id,
          category: "schema",
          code: "ROUTINE_PRESENT",
          expected: null,
          actual,
        });
      }
    }
    for (const aggregate of contract.aggregates) {
      const actual = input.snapshot.aggregates.filter((item) => item.name === aggregate.name);
      if (actual.length !== 1) {
        addFinding(findings, {
          migration: contract.id,
          category: "evidence",
          code: "AGGREGATE_MISSING",
          expected: 1,
          actual: actual.length,
        });
      } else if (BigInt(actual[0]!.count) !== 0n) {
        addFinding(findings, {
          migration: contract.id,
          category: "data",
          code: "AGGREGATE_NONZERO",
          expected: "0",
          actual: actual[0]!.count,
        });
      }
    }
  }

  const knownIndexes = new Set(
    input.contracts.flatMap((contract) =>
      [...contract.requiredTables, ...contract.alteredTables]
        .flatMap((table) => table.indexes.map((index) => `${table.name}:${index.name}`))
    ),
  );
  const contractTables = new Set(
    input.contracts.flatMap((contract) =>
      [...contract.requiredTables, ...contract.alteredTables].map((table) => table.name)
    ),
  );
  for (const actual of input.snapshot.indexes) {
    if (
      contractTables.has(actual.table)
      && !knownIndexes.has(`${actual.table}:${actual.name}`)
    ) {
      addFinding(findings, {
        migration: ownerForTable(input.contracts, actual.table),
        category: "schema",
        code: "EXTRA_INDEX",
        expected: null,
        actual: actual.name,
        blocking: false,
      });
    }
  }
}

function validateCollation(input: ReconcileInput, findings: Finding[]): void {
  if (input.snapshot.collation_profile !== input.policy.profile) {
    addFinding(findings, {
      migration: "snapshot",
      category: "evidence",
      code: "COLLATION_PROFILE_MISMATCH",
      expected: input.policy.profile,
      actual: input.snapshot.collation_profile,
    });
  }
  const tables = [
    ...input.policy.reconstructedConversions,
    ...input.policy.createdNormalizedDuring0031,
  ];
  for (const tableName of tables) {
    const expected = expectedCollationForTable(input.policy, tableName);
    const matches = input.snapshot.tables.filter((item) => item.name === tableName);
    const migration = ownerForTable(input.contracts, tableName);
    if (matches.length === 0) {
      addFinding(findings, {
        migration,
        category: "evidence",
        code: "COLLATION_TABLE_MISSING",
        expected,
        actual: null,
      });
      continue;
    }
    if (matches.length !== 1) {
      addFinding(findings, {
        migration,
        category: "evidence",
        code: "COLLATION_TABLE_EVIDENCE_MULTIPLICITY",
        expected: 1,
        actual: matches.length,
      });
      continue;
    }
    const table = matches[0]!;
    if (table.collation !== expected) {
      addFinding(findings, {
        migration,
        category: "collation",
        code: "COLLATION_MISMATCH",
        expected,
        actual: table.collation,
      });
    }
    for (const column of input.snapshot.columns.filter((item) =>
      item.table === tableName && item.collation !== null
    )) {
      if (column.collation !== expected) {
        addFinding(findings, {
          migration,
          category: "collation",
          code: "COLLATION_MISMATCH",
          expected,
          actual: { column: column.name, collation: column.collation },
        });
      }
    }
  }
}

function validateSnapshotProvenance(
  input: ReconcileInput,
  findings: Finding[],
): void {
  if (input.repositoryCommit !== input.snapshot.repository_commit) {
    addFinding(findings, {
      migration: "snapshot",
      category: "identity",
      code: "REPOSITORY_COMMIT_MISMATCH",
      expected: input.repositoryCommit,
      actual: input.snapshot.repository_commit,
    });
  }
}

function objectName(finding: Finding): string {
  for (const value of [finding.actual, finding.expected]) {
    if (typeof value === "string") return value;
    if (value !== null && typeof value === "object") {
      const record = value as Record<string, unknown>;
      if (typeof record.name === "string") return record.name;
      if (typeof record.column === "string") return record.column;
      if (typeof record.id === "string") return record.id;
    }
  }
  return "";
}

function statusFor(
  id: MigrationId,
  findings: readonly Finding[],
  missing: ReadonlySet<MigrationId>,
): MigrationStatus {
  const blocking = findings.filter((finding) =>
    finding.migration === id && finding.blocking
  );
  if (blocking.some((finding) => finding.category === "identity")) {
    return "BLOCKED_FILE_IDENTITY";
  }
  if (blocking.some((finding) => finding.category === "journal")) {
    return "BLOCKED_JOURNAL_CONFLICT";
  }
  if (blocking.some((finding) => finding.category === "evidence")) {
    return "BLOCKED_EVIDENCE_INCOMPLETE";
  }
  if (blocking.some((finding) =>
    finding.category === "schema" || finding.category === "collation"
  )) {
    return "BLOCKED_SCHEMA_DRIFT";
  }
  if (blocking.some((finding) => finding.category === "data")) {
    return "BLOCKED_DATA_DRIFT";
  }
  return missing.has(id) ? "JOURNAL_REPAIR_ELIGIBLE" : "REGISTERED_EXACT";
}

function sortFindings(findings: Finding[]): Finding[] {
  const migrationOrder = ["snapshot", "journal", ...migrationIds];
  return [...findings].sort((left, right) => {
    const migrationComparison = migrationOrder.indexOf(left.migration)
      - migrationOrder.indexOf(right.migration);
    if (migrationComparison !== 0) return migrationComparison;
    const categoryComparison = categoryOrder.indexOf(left.category)
      - categoryOrder.indexOf(right.category);
    if (categoryComparison !== 0) return categoryComparison;
    const codeComparison = left.code.localeCompare(right.code);
    if (codeComparison !== 0) return codeComparison;
    return objectName(left).localeCompare(objectName(right));
  });
}

export function reconcile(input: ReconcileInput): ReconciliationReport {
  const findings: Finding[] = [];
  validateSnapshotProvenance(input, findings);
  validateManifestIdentity(input, findings);
  const missing = validateJournal(input, findings);
  validateSchemaAndData(input, findings);
  validateCollation(input, findings);
  if (!input.freshness.eligible) {
    addFinding(findings, {
      migration: "snapshot",
      category: "evidence",
      code: input.freshness.reason,
      expected: "eligible snapshot",
      actual: input.freshness.reason,
    });
  }

  const sortedFindings = sortFindings(findings);
  const migrations: MigrationResult[] = migrationIds.map((id) => ({
    id,
    status: statusFor(id, sortedFindings, missing),
    findings: sortedFindings.filter((finding) => finding.migration === id),
  }));
  const hasBlocking = sortedFindings.some((finding) => finding.blocking);
  const missingSuffix = migrationIds.filter((id) => missing.has(id));
  const decision = hasBlocking
    ? { kind: "BLOCKED" as const, exitCode: 20 as const }
    : missingSuffix.length > 0
      ? {
          kind: "JOURNAL_REPAIR_ELIGIBLE" as const,
          exitCode: 10 as const,
          missingSuffix,
        }
      : { kind: "REGISTERED_EXACT" as const, exitCode: 0 as const };

  return {
    repository_commit: input.snapshot.repository_commit,
    snapshot_fingerprint: input.snapshot.content_fingerprint,
    decision,
    migrations,
    findings: sortedFindings,
  };
}
