import {
  column,
  createdAt,
  index,
  primary,
  table,
  uuidPrimaryId,
} from "./model";
import type { MigrationContract } from "./model";

export const contract0026: MigrationContract = {
  id: "0026",
  requiredTables: [
    table(
      "pos_idempotency_keys",
      [
        uuidPrimaryId(),
        column("idempotency_key", "varchar(160)", false),
        column("operation", "varchar(40)", false),
        column("store_id", "varchar(36)", true),
        column("request_hash", "char(64)", false),
        column("status", "varchar(20)", false, "processing"),
        column("response_status", "int", true),
        column("response_body", "json", true),
        column("resource_type", "varchar(40)", true),
        column("resource_id", "varchar(36)", true),
        createdAt(),
        column(
          "updated_at",
          "timestamp",
          false,
          "current_timestamp",
          "default_generated on update current_timestamp",
        ),
        column("expires_at", "timestamp", true),
      ],
      [
        primary(),
        index("pos_idempotency_key_unique", true, ["idempotency_key"]),
        index("pos_idempotency_store_created_idx", false, ["store_id", "created_at"]),
        index("pos_idempotency_status_idx", false, ["status"]),
      ],
    ),
  ],
  alteredTables: [],
  aggregates: [],
  absentRoutines: [],
  collationTables: ["pos_idempotency_keys"],
};
