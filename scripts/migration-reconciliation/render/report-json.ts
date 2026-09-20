import { canonicalStringify } from "../canonical-json";
import type { ReconciliationReport } from "../types";
import { redactAuditValue } from "./redact";

export function renderReportJson(report: ReconciliationReport): string {
  return `${canonicalStringify(redactAuditValue(report))}\n`;
}
