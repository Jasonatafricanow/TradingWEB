import { z } from "zod";

import rawPolicy from "./collation-policy.json";
import type { ReconciliationSnapshot } from "./types";

const policySchema = z.object({
  format_version: z.literal(1),
  evidence_status: z.literal("reconstructed"),
  transformation_reason: z.string().min(1),
  source_collation: z.literal("utf8mb4_unicode_ci"),
  target_collation: z.literal("utf8mb4_0900_ai_ci"),
  affected_migration_range: z.literal("0012-0031"),
  evidence_sources: z.array(z.string().min(1)).min(1),
  verification_queries: z.array(z.string().min(1)).min(1),
  reconstructed_conversions: z.array(z.string().min(1)).length(13),
  created_normalized_during_0031: z.array(z.string().min(1)).length(2),
}).strict().superRefine((value, context) => {
  const tables = [
    ...value.reconstructed_conversions,
    ...value.created_normalized_during_0031,
  ];
  if (new Set(tables).size !== tables.length) {
    context.addIssue({
      code: "custom",
      message: "Collation policy table names must be unique",
    });
  }
});

export type CollationProfile = ReconciliationSnapshot["collation_profile"];

export interface CollationPolicy {
  formatVersion: 1;
  profile: CollationProfile;
  evidenceStatus: "reconstructed";
  transformationReason: string;
  sourceCollation: "utf8mb4_unicode_ci";
  targetCollation: "utf8mb4_0900_ai_ci";
  affectedMigrationRange: "0012-0031";
  evidenceSources: readonly string[];
  verificationQueries: readonly string[];
  reconstructedConversions: readonly string[];
  createdNormalizedDuring0031: readonly string[];
}

export function loadCollationPolicy(profile: CollationProfile): CollationPolicy {
  if (profile !== "migration-native" && profile !== "production-normalized") {
    throw new Error(`Unknown collation profile: ${String(profile)}`);
  }
  const parsed = policySchema.parse(rawPolicy);
  return {
    formatVersion: parsed.format_version,
    profile,
    evidenceStatus: parsed.evidence_status,
    transformationReason: parsed.transformation_reason,
    sourceCollation: parsed.source_collation,
    targetCollation: parsed.target_collation,
    affectedMigrationRange: parsed.affected_migration_range,
    evidenceSources: parsed.evidence_sources,
    verificationQueries: parsed.verification_queries,
    reconstructedConversions: parsed.reconstructed_conversions,
    createdNormalizedDuring0031: parsed.created_normalized_during_0031,
  };
}

export function expectedCollationForTable(
  policy: CollationPolicy,
  table: string,
): CollationPolicy["sourceCollation"] | CollationPolicy["targetCollation"] {
  const ownedTables = new Set([
    ...policy.reconstructedConversions,
    ...policy.createdNormalizedDuring0031,
  ]);
  if (!ownedTables.has(table)) {
    throw new Error(`Table ${table} is not owned by the collation policy`);
  }
  return policy.profile === "migration-native"
    ? policy.sourceCollation
    : policy.targetCollation;
}
