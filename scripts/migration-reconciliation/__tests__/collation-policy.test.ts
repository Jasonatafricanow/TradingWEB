import { describe, expect, it } from "vitest";

import {
  expectedCollationForTable,
  loadCollationPolicy,
} from "../collation-policy";

const reconstructedTables = [
  "import_jobs",
  "import_sessions",
  "order_payments",
  "pos_approval_tokens",
  "pos_audit_outbox",
  "pos_cash_movements",
  "pos_device_audit_logs",
  "pos_exchanges",
  "pos_idempotency_keys",
  "pos_inventory_migration_exceptions",
  "pos_operator_sessions",
  "pos_refund_items",
  "pos_shifts",
];

describe("loadCollationPolicy", () => {
  it("retains exactly the 13 reconstructed conversion tables in documented order", () => {
    const policy = loadCollationPolicy("production-normalized");

    expect(policy.evidenceStatus).toBe("reconstructed");
    expect(policy.reconstructedConversions).toEqual(reconstructedTables);
    expect(new Set(policy.reconstructedConversions).size).toBe(13);
  });

  it("keeps 0031 purchase-order tables separate from reconstructed conversions", () => {
    const policy = loadCollationPolicy("production-normalized");

    expect(policy.createdNormalizedDuring0031).toEqual([
      "pos_purchase_orders",
      "pos_purchase_order_items",
    ]);
    expect(policy.reconstructedConversions).not.toContain("pos_purchase_orders");
    expect(policy.reconstructedConversions).not.toContain("pos_purchase_order_items");
  });

  it("selects migration-native collation for raw disposable replay", () => {
    const policy = loadCollationPolicy("migration-native");

    expect(expectedCollationForTable(policy, "pos_idempotency_keys"))
      .toBe("utf8mb4_unicode_ci");
    expect(expectedCollationForTable(policy, "pos_purchase_orders"))
      .toBe("utf8mb4_unicode_ci");
  });

  it("selects production collation for every policy-owned table", () => {
    const policy = loadCollationPolicy("production-normalized");
    const tables = [
      ...policy.reconstructedConversions,
      ...policy.createdNormalizedDuring0031,
    ];

    expect(tables.map((table) => expectedCollationForTable(policy, table)))
      .toEqual(tables.map(() => "utf8mb4_0900_ai_ci"));
  });

  it("rejects an unknown profile instead of defaulting", () => {
    expect(() => loadCollationPolicy("legacy" as never)).toThrow(/profile/i);
  });

  it("rejects an unknown table instead of defaulting", () => {
    const policy = loadCollationPolicy("production-normalized");

    expect(() => expectedCollationForTable(policy, "orders")).toThrow(/orders/);
  });

  it("contains only fixed verification queries over the complete table allowlist", () => {
    const policy = loadCollationPolicy("production-normalized");
    const queries = policy.verificationQueries.join("\n");
    const tables = [
      ...policy.reconstructedConversions,
      ...policy.createdNormalizedDuring0031,
    ];

    expect(queries).not.toContain("<");
    for (const table of tables) {
      expect(queries).toContain(`'${table}'`);
    }
  });
});
