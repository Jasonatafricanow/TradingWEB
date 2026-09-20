import type { OverallDecision } from "../types";

export interface IntegrationPhaseResult {
  phase: string;
  decision: OverallDecision["kind"];
  exitCode: number;
}

export function assertCleanRepositoryStatus(status: string): void {
  if (status.trim().length !== 0) {
    throw new Error("Integration certification requires a clean repository");
  }
}

export function assertRepositoryCommitUnchanged(
  expectedCommit: string,
  actualCommit: string,
): void {
  if (actualCommit !== expectedCommit) {
    throw new Error("Integration certification repository commit changed");
  }
}

const expectedIntegrationMatrix: readonly IntegrationPhaseResult[] = [
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

export function assertExactIntegrationMatrix(
  results: readonly IntegrationPhaseResult[],
): void {
  if (JSON.stringify(results) !== JSON.stringify(expectedIntegrationMatrix)) {
    throw new Error("Integration phase matrix mismatch");
  }
}
