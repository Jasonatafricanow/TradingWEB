import { describe, expect, it } from "vitest";

import {
  migrationContracts,
  validateContractRegistry,
} from "../contracts";
import type {
  MigrationContract,
  NamedContract,
} from "../contracts/model";
import type { MigrationId } from "../types";

const names = (items: readonly NamedContract[]) => items.map((item) => item.name);

function contract(id: MigrationId): MigrationContract {
  const found = migrationContracts.find((item) => item.id === id);
  if (!found) throw new Error(`Missing contract ${id}`);
  return found;
}

function table(id: MigrationId, tableName: string) {
  const migration = contract(id);
  const found = [...migration.requiredTables, ...migration.alteredTables]
    .find((item) => item.name === tableName);
  if (!found) throw new Error(`Missing table ${id}:${tableName}`);
  return found;
}

describe("migration contract registry", () => {
  it("contains every repair target exactly once in order", () => {
    expect(migrationContracts.map((item) => item.id)).toEqual([
      "0026", "0027", "0028", "0029", "0030", "0031", "0032", "0033",
    ]);
    expect(() => validateContractRegistry(migrationContracts)).not.toThrow();
  });

  it("rejects a missing target migration", () => {
    expect(() => validateContractRegistry(migrationContracts.slice(0, -1)))
      .toThrow(/0033/);
  });

  it("rejects duplicate contract-owned object names", () => {
    const invalid = structuredClone(migrationContracts) as MigrationContract[];
    invalid[0]!.requiredTables[0]!.columns.push(
      structuredClone(invalid[0]!.requiredTables[0]!.columns[0]!),
    );

    expect(() => validateContractRegistry(invalid)).toThrow(/duplicate.*id/i);
  });

  it("rejects an index whose owning table has no name", () => {
    const invalid = structuredClone(migrationContracts) as MigrationContract[];
    invalid[0]!.requiredTables[0]!.name = "";

    expect(() => validateContractRegistry(invalid)).toThrow(/table name/i);
  });

  it("rejects aggregates outside migrations 0027, 0031 and 0033", () => {
    const invalid = structuredClone(migrationContracts) as MigrationContract[];
    invalid[0]!.aggregates.push({ name: "legacy_orders_missing_payment" });

    expect(() => validateContractRegistry(invalid)).toThrow(/aggregate.*0026/i);
  });
});

describe("0026 contract coverage", () => {
  it("covers the complete idempotency ledger", () => {
    const target = table("0026", "pos_idempotency_keys");
    expect(names(target.columns)).toEqual([
      "id", "idempotency_key", "operation", "store_id", "request_hash",
      "status", "response_status", "response_body", "resource_type",
      "resource_id", "created_at", "updated_at", "expires_at",
    ]);
    expect(names(target.indexes)).toEqual([
      "PRIMARY",
      "pos_idempotency_key_unique",
      "pos_idempotency_store_created_idx",
      "pos_idempotency_status_idx",
    ]);
  });
});

describe("0027 contract coverage", () => {
  it("covers payment facts and legacy order changes", () => {
    expect(names(table("0027", "order_payments").columns)).toEqual([
      "id", "order_id", "channel", "method", "label", "amount", "reference",
      "provider_transaction_id", "status", "recorded_by", "created_at",
    ]);
    expect(names(table("0027", "order_payments").indexes)).toEqual([
      "PRIMARY", "order_payments_order_idx", "order_payments_provider_idx",
    ]);
    expect(names(table("0027", "order_payments").foreignKeys))
      .toEqual(["order_payments_order_fk"]);
    expect(names(table("0027", "orders").columns))
      .toEqual(["payment_method", "client_ref"]);
    expect(names(table("0027", "orders").indexes))
      .toEqual(["orders_client_ref_unique_idx"]);
    expect(contract("0027").aggregates)
      .toEqual([{ name: "legacy_orders_missing_payment" }]);
  });
});

describe("0028 contract coverage", () => {
  it("covers staff POS identity, sessions, and approvals", () => {
    expect(names(table("0028", "staff").columns)).toEqual([
      "pos_enabled", "pos_pin_hash", "pos_permissions",
      "pos_pin_failed_attempts", "pos_pin_last_failed_at",
      "pos_pin_locked_until",
    ]);
    expect(names(table("0028", "staff").indexes))
      .toEqual(["staff_pos_store_enabled_active_idx"]);
    expect(names(table("0028", "pos_operator_sessions").columns)).toEqual([
      "id", "token_hash", "account_user_id", "staff_id", "store_id",
      "device_id", "permissions", "expires_at", "revoked_at", "created_at",
    ]);
    expect(names(table("0028", "pos_operator_sessions").indexes)).toEqual([
      "PRIMARY", "pos_operator_sessions_token_unique",
      "pos_operator_sessions_staff_idx", "pos_operator_sessions_device_idx",
    ]);
    expect(names(table("0028", "pos_approval_tokens").columns)).toEqual([
      "id", "token_hash", "operation", "resource_hash", "approved_by",
      "store_id", "expires_at", "consumed_at", "created_at",
    ]);
    expect(names(table("0028", "pos_approval_tokens").indexes))
      .toEqual(["PRIMARY", "pos_approval_tokens_token_unique"]);
  });
});

describe("0029 contract coverage", () => {
  it("covers refunded totals, immutable return lines, and exchange headers", () => {
    expect(names(table("0029", "orders").columns)).toEqual(["refunded_total"]);
    expect(names(table("0029", "pos_refund_items").columns)).toEqual([
      "id", "refund_id", "order_item_id", "quantity", "restock", "created_at",
    ]);
    expect(names(table("0029", "pos_refund_items").indexes)).toEqual([
      "PRIMARY", "pos_refund_items_refund_item_unique",
      "pos_refund_items_order_item_idx",
    ]);
    expect(names(table("0029", "pos_refund_items").foreignKeys)).toEqual([
      "pos_refund_items_refund_fk", "pos_refund_items_order_item_fk",
    ]);
    expect(names(table("0029", "pos_exchanges").columns)).toEqual([
      "id", "idempotency_key", "store_id", "original_order_id",
      "replacement_order_id", "refund_amount", "new_order_amount",
      "difference_amount", "approval_token_id", "operator_id", "created_at",
    ]);
    expect(names(table("0029", "pos_exchanges").indexes)).toEqual([
      "PRIMARY", "pos_exchanges_idempotency_unique",
      "pos_exchanges_original_idx", "pos_exchanges_replacement_idx",
    ]);
    expect(names(table("0029", "pos_exchanges").foreignKeys)).toEqual([
      "pos_exchanges_original_fk", "pos_exchanges_replacement_fk",
    ]);
  });
});

describe("0030 contract coverage", () => {
  it("covers shifts, cash, outbox, device logs, and exact altered links", () => {
    expect(names(table("0030", "pos_shifts").columns)).toEqual([
      "id", "store_id", "opened_by", "closed_by", "status", "opening_float",
      "expected_cash", "counted_cash", "difference_cash", "opened_at",
      "closed_at",
    ]);
    expect(names(table("0030", "pos_shifts").indexes))
      .toEqual(["PRIMARY", "pos_shifts_store_status_idx"]);
    expect(names(table("0030", "pos_cash_movements").columns)).toEqual([
      "id", "shift_id", "kind", "amount", "reason", "operator_id",
      "idempotency_key", "created_at",
    ]);
    expect(names(table("0030", "pos_cash_movements").indexes)).toEqual([
      "PRIMARY", "pos_cash_movements_idempotency_unique",
      "pos_cash_movements_shift_idx",
    ]);
    expect(names(table("0030", "pos_cash_movements").foreignKeys))
      .toEqual(["pos_cash_movements_shift_fk"]);
    expect(names(table("0030", "pos_audit_outbox").columns)).toEqual([
      "id", "event_type", "entity_type", "entity_id", "store_id",
      "operator_id", "payload", "status", "attempts", "next_attempt_at",
      "processed_at", "created_at",
    ]);
    expect(names(table("0030", "pos_audit_outbox").indexes)).toEqual([
      "PRIMARY", "pos_audit_outbox_status_idx", "pos_audit_outbox_entity_idx",
    ]);
    expect(names(table("0030", "pos_device_audit_logs").columns)).toEqual([
      "id", "device_id", "store_id", "operator_id", "event_type",
      "entity_type", "entity_id", "payload", "hash", "prev_hash",
      "occurred_at", "uploaded_at",
    ]);
    expect(names(table("0030", "pos_device_audit_logs").indexes))
      .toEqual(["PRIMARY", "pos_device_audit_logs_device_idx"]);
    expect(names(table("0030", "pos_exchanges").columns)).toEqual(["refund_id"]);
    expect(names(table("0030", "pos_exchanges").indexes))
      .toEqual(["pos_exchanges_refund_unique"]);
    expect(names(table("0030", "pos_exchanges").foreignKeys))
      .toEqual(["pos_exchanges_refund_fk"]);
    expect(names(table("0030", "orders").columns)).toEqual(["shift_id"]);
    expect(names(table("0030", "orders").indexes)).toEqual(["orders_shift_id_idx"]);
    expect(table("0030", "orders").foreignKeys).toEqual([]);
    expect(names(table("0030", "refunds").columns)).toEqual(["shift_id"]);
    expect(names(table("0030", "refunds").indexes)).toEqual(["refunds_shift_id_idx"]);
    expect(table("0030", "refunds").foreignKeys).toEqual([]);
  });
});

describe("0031 contract coverage", () => {
  it("covers canonical inventory and purchase-order schema", () => {
    expect(names(table("0031", "pos_inventory_migration_exceptions").columns))
      .toEqual([
        "id", "exception_type", "product_id", "variant_id", "details",
        "resolved_at", "created_at",
      ]);
    expect(names(table("0031", "pos_inventory_migration_exceptions").indexes))
      .toEqual([
        "PRIMARY", "pos_inventory_migration_exceptions_type_idx",
        "pos_inventory_migration_exceptions_product_idx",
      ]);
    expect(names(table("0031", "inventory").columns)).toEqual([
      "variant_scope_key", "store_scope_key", "warehouse_scope_key",
    ]);
    expect(table("0031", "inventory").columns.map((item) => item.nullable))
      .toEqual([true, true, true]);
    expect(names(table("0031", "inventory").indexes))
      .toEqual(["inventory_scope_unique"]);
    expect(names(table("0031", "stock_transfers").columns)).toEqual(["store_id"]);
    expect(names(table("0031", "stock_transfers").indexes)).toEqual(["st_store_id_idx"]);
    expect(names(table("0031", "stock_transfers").foreignKeys))
      .toEqual(["stock_transfers_store_fk"]);
    expect(names(table("0031", "pos_purchase_orders").indexes)).toEqual([
      "PRIMARY", "pos_purchase_orders_number_unique",
      "pos_purchase_orders_idempotency_unique",
      "pos_purchase_orders_store_status_idx",
    ]);
    expect(names(table("0031", "pos_purchase_orders").columns)).toEqual([
      "id", "number", "supplier", "store_id", "location_id", "status",
      "created_by", "received_by", "idempotency_key", "created_at", "received_at",
    ]);
    expect(names(table("0031", "pos_purchase_orders").foreignKeys)).toEqual([
      "pos_purchase_orders_store_fk", "pos_purchase_orders_location_fk",
      "pos_purchase_orders_created_by_fk", "pos_purchase_orders_received_by_fk",
    ]);
    expect(names(table("0031", "pos_purchase_orders").checks))
      .toEqual(["pos_purchase_orders_status_check"]);
    expect(names(table("0031", "pos_purchase_order_items").columns)).toEqual([
      "id", "purchase_order_id", "product_id", "variant_id", "ordered_qty",
      "received_qty", "unit_cost",
    ]);
    expect(names(table("0031", "pos_purchase_order_items").foreignKeys)).toEqual([
      "pos_purchase_order_items_order_fk",
      "pos_purchase_order_items_product_fk",
      "pos_purchase_order_items_variant_fk",
    ]);
    expect(names(table("0031", "pos_purchase_order_items").indexes)).toEqual([
      "PRIMARY", "pos_purchase_order_items_order_idx",
      "pos_purchase_order_items_product_idx",
    ]);
    expect(names(table("0031", "pos_purchase_order_items").checks)).toEqual([
      "pos_purchase_order_items_ordered_qty_check",
      "pos_purchase_order_items_received_qty_check",
      "pos_purchase_order_items_unit_cost_check",
    ]);
    expect(contract("0031").aggregates.map((item) => item.name)).toEqual([
      "product_variant_mismatch", "stock_total_mismatch",
      "duplicate_inventory_scope", "unambiguous_backfill_missing",
      "ambiguous_location_exception_missing",
    ]);
    expect(contract("0031").absentRoutines).toEqual([
      "pos_task11_preflight", "pos_task11_apply_schema",
    ]);
  });
});

describe("collation ownership coverage", () => {
  it("assigns every created textual table to its migration contract", () => {
    expect(contract("0026").collationTables).toEqual(["pos_idempotency_keys"]);
    expect(contract("0027").collationTables).toEqual(["order_payments"]);
    expect(contract("0028").collationTables)
      .toEqual(["pos_operator_sessions", "pos_approval_tokens"]);
    expect(contract("0029").collationTables)
      .toEqual(["pos_refund_items", "pos_exchanges"]);
    expect(contract("0030").collationTables).toEqual([
      "pos_shifts", "pos_cash_movements", "pos_audit_outbox",
      "pos_device_audit_logs",
    ]);
    expect(contract("0031").collationTables).toEqual([
      "pos_inventory_migration_exceptions", "pos_purchase_orders",
      "pos_purchase_order_items",
    ]);
    expect(contract("0032").collationTables).toEqual([]);
  });
});

describe("0032 contract coverage", () => {
  it("covers pickup fulfillment and pagination indexes", () => {
    expect(names(table("0032", "orders").columns)).toEqual([
      "pickup_contact_name", "pickup_phone", "pickup_store_id",
      "pickup_ready_at", "picked_up_at",
    ]);
    expect(names(table("0032", "orders").indexes)).toEqual([
      "orders_store_created_idx", "orders_customer_created_idx",
      "orders_pickup_status_idx",
    ]);
    expect(names(table("0032", "orders").foreignKeys))
      .toEqual(["orders_pickup_store_fk"]);
    expect(contract("0032").absentRoutines).toEqual(["pos_task12_apply_schema"]);
  });
});

describe("0033 contract coverage", () => {
  it("covers orders POS attribution and the legacy backfill aggregate", () => {
    expect(names(table("0033", "orders").columns)).toEqual([
      "staff_id", "account_user_id",
    ]);
    expect(names(table("0033", "orders").indexes)).toEqual([
      "orders_store_staff_created_idx",
    ]);
    expect(contract("0033").aggregates.map((item) => item.name)).toEqual([
      "legacy_pos_attribution_missing",
    ]);
  });
});
