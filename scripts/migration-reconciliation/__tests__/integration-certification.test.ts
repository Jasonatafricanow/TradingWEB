import { describe, expect, it } from "vitest";

import {
  assertCleanRepositoryStatus,
  assertExactIntegrationMatrix,
  assertRepositoryCommitUnchanged,
  type IntegrationPhaseResult,
} from "../integration/certification";

const exactMatrix: IntegrationPhaseResult[] = [
  { phase: "raw-replay", decision: "REGISTERED_EXACT", exitCode: 0 },
  { phase: "normalized-replay", decision: "REGISTERED_EXACT", exitCode: 0 },
  { phase: "eight-row-candidate", decision: "JOURNAL_REPAIR_ELIGIBLE", exitCode: 10 },
  { phase: "repair-lock-contention", decision: "JOURNAL_REPAIR_ELIGIBLE", exitCode: 10 },
  { phase: "repair-preflight-drift", decision: "BLOCKED", exitCode: 20 },
  { phase: "post-repair", decision: "REGISTERED_EXACT", exitCode: 0 },
  { phase: "repair-second-execution", decision: "REGISTERED_EXACT", exitCode: 0 },
  { phase: "final-drizzle-no-replay", decision: "REGISTERED_EXACT", exitCode: 0 },
  { phase: "blocked-index", decision: "BLOCKED", exitCode: 20 },
  { phase: "blocked-hash", decision: "BLOCKED", exitCode: 20 },
  { phase: "blocked-gap", decision: "BLOCKED", exitCode: 20 },
  { phase: "blocked-unknown-row", decision: "BLOCKED", exitCode: 20 },
  { phase: "blocked-collation", decision: "BLOCKED", exitCode: 20 },
  { phase: "blocked-0027-data", decision: "BLOCKED", exitCode: 20 },
  { phase: "blocked-0031-data", decision: "BLOCKED", exitCode: 20 },
  { phase: "blocked-0033-data", decision: "BLOCKED", exitCode: 20 },
  { phase: "blocked-stale-offline", decision: "BLOCKED", exitCode: 20 },
  { phase: "blocked-future-offline", decision: "BLOCKED", exitCode: 20 },
];

describe("integration certification repository gate", () => {
  it("accepts an empty porcelain status", () => {
    expect(() => assertCleanRepositoryStatus("")).not.toThrow();
    expect(() => assertCleanRepositoryStatus("\n")).not.toThrow();
  });

  it.each([
    " M scripts/migration-reconciliation/integration/run.ts\n",
    "M  scripts/migration-reconciliation/integration/run.ts\n",
    "?? untracked.txt\n",
  ])("rejects non-clean repository status %#", (status) => {
    expect(() => assertCleanRepositoryStatus(status)).toThrow(
      "Integration certification requires a clean repository",
    );
  });
});

describe("integration certification repository identity", () => {
  it("accepts the same commit at the end of the run", () => {
    const commit = "a".repeat(40);

    expect(() => assertRepositoryCommitUnchanged(commit, commit)).not.toThrow();
  });

  it("rejects a changed commit at the end of the run", () => {
    expect(() => assertRepositoryCommitUnchanged(
      "a".repeat(40),
      "b".repeat(40),
    )).toThrow("Integration certification repository commit changed");
  });
});

describe("integration certification phase matrix", () => {
  it("accepts the exact ordered 18-phase matrix", () => {
    expect(() => assertExactIntegrationMatrix(exactMatrix)).not.toThrow();
  });

  it("rejects a missing phase", () => {
    expect(() => assertExactIntegrationMatrix(exactMatrix.slice(0, -1))).toThrow(
      "Integration phase matrix mismatch",
    );
  });

  it("rejects a duplicate phase even when the result count remains 18", () => {
    const duplicated = exactMatrix.map((result) => ({ ...result }));
    duplicated[9] = { ...duplicated[8]! };

    expect(() => assertExactIntegrationMatrix(duplicated)).toThrow(
      "Integration phase matrix mismatch",
    );
  });

  it("rejects a reordered phase", () => {
    const reordered = [...exactMatrix];
    [reordered[8], reordered[9]] = [reordered[9]!, reordered[8]!];

    expect(() => assertExactIntegrationMatrix(reordered)).toThrow(
      "Integration phase matrix mismatch",
    );
  });

  it("rejects a wrong decision", () => {
    const wrong = exactMatrix.map((result) => ({ ...result }));
    wrong[16] = {
      ...wrong[16]!,
      decision: "REGISTERED_EXACT",
    };

    expect(() => assertExactIntegrationMatrix(wrong)).toThrow(
      "Integration phase matrix mismatch",
    );
  });

  it("rejects a wrong exit code independently of the decision", () => {
    const wrong = exactMatrix.map((result) => ({ ...result }));
    wrong[16] = {
      ...wrong[16]!,
      exitCode: 0,
    };

    expect(() => assertExactIntegrationMatrix(wrong)).toThrow(
      "Integration phase matrix mismatch",
    );
  });
});
