import type { Finding, ReconciliationReport } from "../types";
import { redactAuditValue } from "./redact";

function renderFinding(finding: Finding): string {
  const safe = redactAuditValue(finding) as Finding;
  return [
    `- [${safe.blocking ? "BLOCKING" : "OBSERVATION"}]`,
    `${safe.migration}/${safe.category}/${safe.code}`,
    `expected=${JSON.stringify(safe.expected)}`,
    `actual=${JSON.stringify(safe.actual)}`,
  ].join(" ");
}

export function renderReportMarkdown(report: ReconciliationReport): string {
  const safe = redactAuditValue(report) as ReconciliationReport;
  const lines = [
    "# Migration journal reconciliation report",
    "",
    `Overall decision: ${safe.decision.kind}`,
    `Exit code: ${safe.decision.exitCode}`,
    `Repository commit: ${safe.repository_commit}`,
    `Snapshot fingerprint: ${safe.snapshot_fingerprint}`,
    "",
    "## Migration results",
    "",
    ...safe.migrations.map((migration) => `- ${migration.id}: ${migration.status}`),
    "",
    "## Reconstructed collation evidence",
    "",
    "The collation conversion allowlist is reconstructed evidence and must be verified against the selected snapshot profile.",
    "",
    "## Findings",
    "",
    ...(safe.findings.length > 0
      ? safe.findings.map(renderFinding)
      : ["- None"]),
    "",
  ];
  return lines.join("\n");
}
