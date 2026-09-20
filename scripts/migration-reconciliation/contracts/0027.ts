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

export const contract0027: MigrationContract = {
  id: "0027",
  requiredTables: [
    table(
      "order_payments",
      [
        uuidPrimaryId(),
        column("order_id", "varchar(36)", false),
        column("channel", "varchar(20)", false),
        column("method", "varchar(64)", false),
        column("label", "varchar(100)", false),
        column("amount", "decimal(12,2)", false),
        column("reference", "varchar(200)", true),
        column("provider_transaction_id", "varchar(200)", true),
        column("status", "varchar(20)", false, "recorded"),
        column("recorded_by", "varchar(36)", true),
        createdAt(),
      ],
      [
        primary(),
        index("order_payments_order_idx", false, ["order_id"]),
        index("order_payments_provider_idx", false, ["provider_transaction_id"]),
      ],
      [
        foreignKey(
          "order_payments_order_fk",
          ["order_id"],
          "orders",
          ["id"],
          "CASCADE",
        ),
      ],
    ),
  ],
  alteredTables: [
    table(
      "orders",
      [
        column("payment_method", "varchar(64)", true),
        column("client_ref", "varchar(160)", true),
      ],
      [index("orders_client_ref_unique_idx", true, ["client_ref"])],
    ),
  ],
  aggregates: [{ name: "legacy_orders_missing_payment" }],
  absentRoutines: [],
  collationTables: ["order_payments"],
};
