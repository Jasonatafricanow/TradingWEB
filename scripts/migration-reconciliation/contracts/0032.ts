import {
  column,
  foreignKey,
  index,
  table,
} from "./model";
import type { MigrationContract } from "./model";

export const contract0032: MigrationContract = {
  id: "0032",
  requiredTables: [],
  alteredTables: [
    table(
      "orders",
      [
        column("pickup_contact_name", "varchar(100)", true),
        column("pickup_phone", "varchar(50)", true),
        column("pickup_store_id", "varchar(36)", true),
        column("pickup_ready_at", "timestamp", true),
        column("picked_up_at", "timestamp", true),
      ],
      [
        index("orders_store_created_idx", false, ["store_id", "created_at", "id"]),
        index(
          "orders_customer_created_idx",
          false,
          ["user_id", "created_at", "id"],
        ),
        index(
          "orders_pickup_status_idx",
          false,
          ["pickup_store_id", "fulfillment_status", "created_at"],
        ),
      ],
      [
        foreignKey(
          "orders_pickup_store_fk",
          ["pickup_store_id"],
          "stores",
          ["id"],
        ),
      ],
    ),
  ],
  aggregates: [],
  absentRoutines: ["pos_task12_apply_schema"],
  collationTables: [],
};
