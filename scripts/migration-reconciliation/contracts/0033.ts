import { column, index, table } from "./model";
import type { MigrationContract } from "./model";

export const contract0033: MigrationContract = {
  id: "0033",
  requiredTables: [],
  alteredTables: [
    table(
      "orders",
      [
        column("staff_id", "varchar(36)", true),
        column("account_user_id", "varchar(36)", true),
      ],
      [
        index(
          "orders_store_staff_created_idx",
          false,
          ["store_id", "staff_id", "created_at", "id"],
        ),
      ],
    ),
  ],
  aggregates: [{ name: "legacy_pos_attribution_missing" }],
  absentRoutines: [],
  collationTables: [],
};
