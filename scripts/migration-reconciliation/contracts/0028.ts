import {
  column,
  createdAt,
  index,
  primary,
  table,
  uuidPrimaryId,
} from "./model";
import type { MigrationContract } from "./model";

export const contract0028: MigrationContract = {
  id: "0028",
  requiredTables: [
    table(
      "pos_operator_sessions",
      [
        uuidPrimaryId(),
        column("token_hash", "char(64)", false),
        column("account_user_id", "varchar(36)", false),
        column("staff_id", "varchar(36)", false),
        column("store_id", "varchar(36)", false),
        column("device_id", "varchar(100)", false),
        column("permissions", "json", false),
        column("expires_at", "timestamp", false),
        column("revoked_at", "timestamp", true),
        createdAt(),
      ],
      [
        primary(),
        index("pos_operator_sessions_token_unique", true, ["token_hash"]),
        index("pos_operator_sessions_staff_idx", false, ["staff_id", "expires_at"]),
        index("pos_operator_sessions_device_idx", false, ["device_id", "revoked_at"]),
      ],
    ),
    table(
      "pos_approval_tokens",
      [
        uuidPrimaryId(),
        column("token_hash", "char(64)", false),
        column("operation", "varchar(40)", false),
        column("resource_hash", "char(64)", false),
        column("approved_by", "varchar(36)", false),
        column("store_id", "varchar(36)", false),
        column("expires_at", "timestamp", false),
        column("consumed_at", "timestamp", true),
        createdAt(),
      ],
      [
        primary(),
        index("pos_approval_tokens_token_unique", true, ["token_hash"]),
      ],
    ),
  ],
  alteredTables: [
    table(
      "staff",
      [
        column("pos_enabled", "tinyint(1)", false, "0"),
        column("pos_pin_hash", "varchar(255)", true),
        column("pos_permissions", "json", true),
        column("pos_pin_failed_attempts", "int", false, "0"),
        column("pos_pin_last_failed_at", "timestamp", true),
        column("pos_pin_locked_until", "timestamp", true),
      ],
      [
        index(
          "staff_pos_store_enabled_active_idx",
          false,
          ["store_id", "pos_enabled", "is_active"],
        ),
      ],
    ),
  ],
  aggregates: [],
  absentRoutines: [],
  collationTables: ["pos_operator_sessions", "pos_approval_tokens"],
};
