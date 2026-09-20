import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildDbIndexes, hasExactUniqueIndex } from "../schema-integrity-rules";

const table = "pos_idempotency_keys";
const index = "pos_idempotency_key_unique";

function row(overrides: Record<string, unknown> = {}) {
  return {
    t: table,
    i: index,
    nu: 0,
    seq: 1,
    c: "idempotency_key",
    ...overrides,
  };
}

describe("POS schema integrity rules", () => {
  it("accepts the named unique index on exactly idempotency_key", () => {
    const indexes = buildDbIndexes([row()]);

    expect(hasExactUniqueIndex(indexes, table, index, ["idempotency_key"])).toBe(true);
  });

  it("rejects a same-named non-unique index", () => {
    const indexes = buildDbIndexes([row({ nu: 1 })]);

    expect(hasExactUniqueIndex(indexes, table, index, ["idempotency_key"])).toBe(false);
  });

  it("rejects a same-named unique index on the wrong column", () => {
    const indexes = buildDbIndexes([row({ c: "request_hash" })]);

    expect(hasExactUniqueIndex(indexes, table, index, ["idempotency_key"])).toBe(false);
  });

  it("rejects a same-named composite index with extra columns", () => {
    const indexes = buildDbIndexes([
      row(),
      row({ seq: 2, c: "request_hash" }),
    ]);

    expect(hasExactUniqueIndex(indexes, table, index, ["idempotency_key"])).toBe(false);
  });
});

describe("Task 5 migration 0027 contract", () => {
  const migrationPath = resolve(process.cwd(), "drizzle/0027_order_payments.sql");
  const migration = existsSync(migrationPath)
    ? readFileSync(migrationPath, "utf8")
    : "";

  it("creates the shared order_payments table", () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS order_payments/i);
    expect(migration).toMatch(/method VARCHAR\(64\) NOT NULL/i);
    expect(migration).toMatch(/FOREIGN KEY \(order_id\) REFERENCES orders\(id\) ON DELETE CASCADE/i);
  });

  it("widens the legacy payment method field for every configured method code", () => {
    expect(migration).toContain("ALTER TABLE orders MODIFY COLUMN payment_method VARCHAR(64) NULL");
  });

  it("adds orders.client_ref with an exact unique index", () => {
    expect(migration).toMatch(/ADD COLUMN client_ref VARCHAR\(160\) NULL/i);
    expect(migration).toMatch(/CREATE UNIQUE INDEX orders_client_ref_unique_idx ON orders \(client_ref\)/i);
  });

  it("recognizes only the exact unique client_ref index", () => {
    const indexes = buildDbIndexes([
      row({ t: "orders", i: "orders_client_ref_unique_idx", c: "client_ref" }),
    ]);
    expect(hasExactUniqueIndex(indexes, "orders", "orders_client_ref_unique_idx", ["client_ref"])).toBe(true);
    expect(hasExactUniqueIndex(indexes, "orders", "orders_client_ref_unique_idx", ["payment_id"])).toBe(false);
  });
});

describe("Task 5 migration 0028 contract", () => {
  const migrationPath = resolve(process.cwd(), "drizzle/0028_pos_operator_sessions.sql");
  const migration = existsSync(migrationPath)
    ? readFileSync(migrationPath, "utf8")
    : "";

  it("adds persistent POS identity and lockout fields to staff", () => {
    for (const column of [
      "pos_enabled",
      "pos_pin_hash",
      "pos_permissions",
      "pos_pin_failed_attempts",
      "pos_pin_last_failed_at",
      "pos_pin_locked_until",
    ]) {
      expect(migration).toContain(`ADD COLUMN ${column}`);
    }
  });

  it("creates operator sessions and one-use approval tokens", () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS pos_operator_sessions/i);
    expect(migration).toMatch(/UNIQUE KEY pos_operator_sessions_token_unique \(token_hash\)/i);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS pos_approval_tokens/i);
    expect(migration).toMatch(/UNIQUE KEY pos_approval_tokens_token_unique \(token_hash\)/i);
  });

  it("self-heals the staff POS lookup index to the exact non-unique column order", () => {
    expect(migration).toMatch(/INDEX_NAME\s*=\s*'staff_pos_store_enabled_active_idx'[\s\S]*NON_UNIQUE\s*=\s*1[\s\S]*SEQ_IN_INDEX\s*=\s*1[\s\S]*COLUMN_NAME\s*=\s*'store_id'/i);
    expect(migration).toMatch(/INDEX_NAME\s*=\s*'staff_pos_store_enabled_active_idx'[\s\S]*SEQ_IN_INDEX\s*=\s*2[\s\S]*COLUMN_NAME\s*=\s*'pos_enabled'/i);
    expect(migration).toMatch(/INDEX_NAME\s*=\s*'staff_pos_store_enabled_active_idx'[\s\S]*SEQ_IN_INDEX\s*=\s*3[\s\S]*COLUMN_NAME\s*=\s*'is_active'/i);
    expect(migration).toContain("DROP INDEX staff_pos_store_enabled_active_idx ON staff");
  });
});

describe("Task 8 migration 0029 contract", () => {
  const migrationPath = resolve(process.cwd(), "drizzle/0029_pos_exchanges.sql");
  const migration = existsSync(migrationPath)
    ? readFileSync(migrationPath, "utf8")
    : "";

  it("creates the exact POS exchange header and immutable return-line ledger", () => {
    expect(migration).toMatch(/CREATE TABLE pos_exchanges/i);
    for (const column of [
      "idempotency_key VARCHAR(160) NOT NULL",
      "store_id VARCHAR(36) NOT NULL",
      "original_order_id VARCHAR(36) NOT NULL",
      "replacement_order_id VARCHAR(36) NOT NULL",
      "refund_amount DECIMAL(12,2) NOT NULL",
      "new_order_amount DECIMAL(12,2) NOT NULL",
      "difference_amount DECIMAL(12,2) NOT NULL",
      "approval_token_id VARCHAR(36) NULL",
      "operator_id VARCHAR(36) NOT NULL",
    ]) expect(migration).toContain(column);
    expect(migration).toMatch(/UNIQUE KEY pos_exchanges_idempotency_unique \(idempotency_key\)/i);
    expect(migration).toMatch(/INDEX pos_exchanges_original_idx \(original_order_id\)/i);
    expect(migration).toMatch(/INDEX pos_exchanges_replacement_idx \(replacement_order_id\)/i);

    expect(migration).toMatch(/CREATE TABLE pos_refund_items/i);
    expect(migration).toMatch(/id VARCHAR\(36\) NOT NULL DEFAULT \(UUID\(\)\) PRIMARY KEY/i);
    expect(migration).toMatch(/refund_id VARCHAR\(36\) NOT NULL/i);
    expect(migration).toMatch(/order_item_id VARCHAR\(36\) NOT NULL/i);
    expect(migration).toMatch(/quantity INT NOT NULL/i);
    expect(migration).toMatch(/restock BOOLEAN NOT NULL/i);
    expect(migration).toMatch(/created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP/i);
    expect(migration).toMatch(/UNIQUE KEY pos_refund_items_refund_item_unique \(refund_id, order_item_id\)/i);
    expect(migration).toMatch(/INDEX pos_refund_items_order_item_idx \(order_item_id\)/i);
    expect(migration).toMatch(/FOREIGN KEY \(refund_id\) REFERENCES refunds\(id\) ON DELETE CASCADE/i);
    expect(migration).toMatch(/FOREIGN KEY \(order_item_id\) REFERENCES order_items\(id\)/i);
  });
});

describe("Task 10 migration 0030 contract", () => {
  const migrationPath = resolve(process.cwd(), "drizzle/0030_pos_shifts_outbox.sql");
  const migration = existsSync(migrationPath)
    ? readFileSync(migrationPath, "utf8")
    : "";

  it("links each exchange header to its exact accounting refund", () => {
    expect(migration).toMatch(/ADD COLUMN refund_id VARCHAR\(36\) NULL/i);
    expect(migration).toMatch(/CREATE UNIQUE INDEX pos_exchanges_refund_unique ON pos_exchanges \(refund_id\)/i);
    expect(migration).toMatch(/FOREIGN KEY \(refund_id\) REFERENCES refunds\(id\)/i);
  });

  it("persists millisecond audit timestamps for identical replay comparison", () => {
    expect(migration).toMatch(/occurred_at TIMESTAMP\(3\) NOT NULL/i);
    expect(migration).toMatch(/uploaded_at TIMESTAMP\(3\) NOT NULL/i);
  });
});
