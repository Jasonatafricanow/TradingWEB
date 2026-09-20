import {
  column,
  createdAt,
  foreignKey,
  index,
  primary,
  table,
  uuidPrimaryId,
} from "./model";
import type { MigrationContract } from "./model";

export const contract0029: MigrationContract = {
  id: "0029",
  requiredTables: [
    table(
      "pos_refund_items",
      [
        uuidPrimaryId(),
        column("refund_id", "varchar(36)", false),
        column("order_item_id", "varchar(36)", false),
        column("quantity", "int", false),
        column("restock", "tinyint(1)", false),
        createdAt(),
      ],
      [
        primary(),
        index(
          "pos_refund_items_refund_item_unique",
          true,
          ["refund_id", "order_item_id"],
        ),
        index("pos_refund_items_order_item_idx", false, ["order_item_id"]),
      ],
      [
        foreignKey(
          "pos_refund_items_refund_fk",
          ["refund_id"],
          "refunds",
          ["id"],
          "CASCADE",
        ),
        foreignKey(
          "pos_refund_items_order_item_fk",
          ["order_item_id"],
          "order_items",
          ["id"],
        ),
      ],
    ),
    table(
      "pos_exchanges",
      [
        uuidPrimaryId(),
        column("idempotency_key", "varchar(160)", false),
        column("store_id", "varchar(36)", false),
        column("original_order_id", "varchar(36)", false),
        column("replacement_order_id", "varchar(36)", false),
        column("refund_amount", "decimal(12,2)", false),
        column("new_order_amount", "decimal(12,2)", false),
        column("difference_amount", "decimal(12,2)", false),
        column("approval_token_id", "varchar(36)", true),
        column("operator_id", "varchar(36)", false),
        createdAt(),
      ],
      [
        primary(),
        index("pos_exchanges_idempotency_unique", true, ["idempotency_key"]),
        index("pos_exchanges_original_idx", false, ["original_order_id"]),
        index("pos_exchanges_replacement_idx", false, ["replacement_order_id"]),
      ],
      [
        foreignKey(
          "pos_exchanges_original_fk",
          ["original_order_id"],
          "orders",
          ["id"],
        ),
        foreignKey(
          "pos_exchanges_replacement_fk",
          ["replacement_order_id"],
          "orders",
          ["id"],
        ),
      ],
    ),
  ],
  alteredTables: [
    table("orders", [
      column("refunded_total", "decimal(12,2)", false, "0.00"),
    ]),
  ],
  aggregates: [],
  absentRoutines: [],
  collationTables: ["pos_refund_items", "pos_exchanges"],
};
