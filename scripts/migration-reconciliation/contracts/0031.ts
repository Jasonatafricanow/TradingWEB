import {
  check,
  column,
  createdAt,
  foreignKey,
  index,
  primary,
  table,
  uuidPrimaryId,
} from "./model";
import type { MigrationContract } from "./model";

export const contract0031: MigrationContract = {
  id: "0031",
  requiredTables: [
    table(
      "pos_inventory_migration_exceptions",
      [
        uuidPrimaryId(),
        column("exception_type", "varchar(40)", false),
        column("product_id", "varchar(36)", false),
        column("variant_id", "varchar(36)", true),
        column("details", "json", false),
        column("resolved_at", "timestamp", true),
        createdAt(),
      ],
      [
        primary(),
        index(
          "pos_inventory_migration_exceptions_type_idx",
          false,
          ["exception_type", "created_at"],
        ),
        index(
          "pos_inventory_migration_exceptions_product_idx",
          false,
          ["product_id", "variant_id"],
        ),
      ],
    ),
    table(
      "pos_purchase_orders",
      [
        uuidPrimaryId(),
        column("number", "varchar(64)", false),
        column("supplier", "varchar(200)", false),
        column("store_id", "varchar(36)", false),
        column("location_id", "varchar(36)", true),
        column("status", "varchar(20)", false, "ordered"),
        column("created_by", "varchar(36)", false),
        column("received_by", "varchar(36)", true),
        column("idempotency_key", "varchar(160)", false),
        createdAt(),
        column("received_at", "timestamp", true),
      ],
      [
        primary(),
        index("pos_purchase_orders_number_unique", true, ["number"]),
        index("pos_purchase_orders_idempotency_unique", true, ["idempotency_key"]),
        index(
          "pos_purchase_orders_store_status_idx",
          false,
          ["store_id", "status", "created_at"],
        ),
      ],
      [
        foreignKey("pos_purchase_orders_store_fk", ["store_id"], "stores", ["id"]),
        foreignKey(
          "pos_purchase_orders_location_fk",
          ["location_id"],
          "warehouses",
          ["id"],
        ),
        foreignKey(
          "pos_purchase_orders_created_by_fk",
          ["created_by"],
          "staff",
          ["id"],
        ),
        foreignKey(
          "pos_purchase_orders_received_by_fk",
          ["received_by"],
          "staff",
          ["id"],
        ),
      ],
      [
        check(
          "pos_purchase_orders_status_check",
          "status in ('ordered','received','cancelled')",
        ),
      ],
    ),
    table(
      "pos_purchase_order_items",
      [
        uuidPrimaryId(),
        column("purchase_order_id", "varchar(36)", false),
        column("product_id", "varchar(36)", false),
        column("variant_id", "varchar(36)", true),
        column("ordered_qty", "int", false),
        column("received_qty", "int", false, "0"),
        column("unit_cost", "decimal(12,2)", false),
      ],
      [
        primary(),
        index(
          "pos_purchase_order_items_order_idx",
          false,
          ["purchase_order_id"],
        ),
        index(
          "pos_purchase_order_items_product_idx",
          false,
          ["product_id", "variant_id"],
        ),
      ],
      [
        foreignKey(
          "pos_purchase_order_items_order_fk",
          ["purchase_order_id"],
          "pos_purchase_orders",
          ["id"],
          "CASCADE",
        ),
        foreignKey(
          "pos_purchase_order_items_product_fk",
          ["product_id"],
          "products",
          ["id"],
        ),
        foreignKey(
          "pos_purchase_order_items_variant_fk",
          ["variant_id"],
          "product_variants",
          ["id"],
        ),
      ],
      [
        check("pos_purchase_order_items_ordered_qty_check", "ordered_qty>0"),
        check(
          "pos_purchase_order_items_received_qty_check",
          "received_qty between 0 and ordered_qty",
        ),
        check("pos_purchase_order_items_unit_cost_check", "unit_cost>=0"),
      ],
    ),
  ],
  alteredTables: [
    table(
      "inventory",
      [
        column(
          "variant_scope_key",
          "varchar(36)",
          true,
          null,
          "stored generated",
          "coalesce(variant_id,'')",
        ),
        column(
          "store_scope_key",
          "varchar(36)",
          true,
          null,
          "stored generated",
          "coalesce(store_id,'')",
        ),
        column(
          "warehouse_scope_key",
          "varchar(36)",
          true,
          null,
          "stored generated",
          "coalesce(warehouse_id,'')",
        ),
      ],
      [
        index(
          "inventory_scope_unique",
          true,
          [
            "product_id",
            "variant_scope_key",
            "store_scope_key",
            "warehouse_scope_key",
          ],
        ),
      ],
    ),
    table(
      "stock_transfers",
      [column("store_id", "varchar(36)", true)],
      [index("st_store_id_idx", false, ["store_id"])],
      [
        foreignKey(
          "stock_transfers_store_fk",
          ["store_id"],
          "stores",
          ["id"],
        ),
      ],
    ),
  ],
  aggregates: [
    { name: "product_variant_mismatch" },
    { name: "stock_total_mismatch" },
    { name: "duplicate_inventory_scope" },
    { name: "unambiguous_backfill_missing" },
    { name: "ambiguous_location_exception_missing" },
  ],
  absentRoutines: ["pos_task11_preflight", "pos_task11_apply_schema"],
  collationTables: [
    "pos_inventory_migration_exceptions",
    "pos_purchase_orders",
    "pos_purchase_order_items",
  ],
};
