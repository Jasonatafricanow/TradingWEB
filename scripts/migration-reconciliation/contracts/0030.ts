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

export const contract0030: MigrationContract = {
  id: "0030",
  requiredTables: [
    table(
      "pos_shifts",
      [
        uuidPrimaryId(),
        column("store_id", "varchar(36)", false),
        column("opened_by", "varchar(36)", false),
        column("closed_by", "varchar(36)", true),
        column("status", "varchar(20)", false, "open"),
        column("opening_float", "decimal(12,2)", false),
        column("expected_cash", "decimal(12,2)", true),
        column("counted_cash", "decimal(12,2)", true),
        column("difference_cash", "decimal(12,2)", true),
        createdAt("opened_at"),
        column("closed_at", "timestamp", true),
      ],
      [primary(), index("pos_shifts_store_status_idx", false, ["store_id", "status"])],
    ),
    table(
      "pos_cash_movements",
      [
        uuidPrimaryId(),
        column("shift_id", "varchar(36)", false),
        column("kind", "varchar(10)", false),
        column("amount", "decimal(12,2)", false),
        column("reason", "varchar(255)", false),
        column("operator_id", "varchar(36)", false),
        column("idempotency_key", "varchar(160)", false),
        createdAt(),
      ],
      [
        primary(),
        index("pos_cash_movements_idempotency_unique", true, ["idempotency_key"]),
        index("pos_cash_movements_shift_idx", false, ["shift_id", "created_at"]),
      ],
      [
        foreignKey(
          "pos_cash_movements_shift_fk",
          ["shift_id"],
          "pos_shifts",
          ["id"],
          "CASCADE",
        ),
      ],
    ),
    table(
      "pos_audit_outbox",
      [
        uuidPrimaryId(),
        column("event_type", "varchar(80)", false),
        column("entity_type", "varchar(40)", false),
        column("entity_id", "varchar(36)", false),
        column("store_id", "varchar(36)", true),
        column("operator_id", "varchar(36)", true),
        column("payload", "json", false),
        column("status", "varchar(20)", false, "pending"),
        column("attempts", "int", false, "0"),
        column("next_attempt_at", "timestamp", true),
        column("processed_at", "timestamp", true),
        createdAt(),
      ],
      [
        primary(),
        index("pos_audit_outbox_status_idx", false, ["status", "next_attempt_at"]),
        index("pos_audit_outbox_entity_idx", false, ["entity_type", "entity_id"]),
      ],
    ),
    table(
      "pos_device_audit_logs",
      [
        column("id", "varchar(36)", false),
        column("device_id", "varchar(100)", false),
        column("store_id", "varchar(36)", false),
        column("operator_id", "varchar(36)", false),
        column("event_type", "varchar(80)", false),
        column("entity_type", "varchar(40)", false),
        column("entity_id", "varchar(36)", true),
        column("payload", "json", false),
        column("hash", "char(64)", false),
        column("prev_hash", "char(64)", true),
        column("occurred_at", "timestamp(3)", false),
        column("uploaded_at", "timestamp(3)", false),
      ],
      [
        primary(),
        index("pos_device_audit_logs_device_idx", false, ["device_id", "uploaded_at"]),
      ],
    ),
  ],
  alteredTables: [
    table(
      "pos_exchanges",
      [column("refund_id", "varchar(36)", true)],
      [index("pos_exchanges_refund_unique", true, ["refund_id"])],
      [
        foreignKey(
          "pos_exchanges_refund_fk",
          ["refund_id"],
          "refunds",
          ["id"],
        ),
      ],
    ),
    table(
      "orders",
      [column("shift_id", "varchar(36)", true)],
      [index("orders_shift_id_idx", false, ["shift_id"])],
    ),
    table(
      "refunds",
      [column("shift_id", "varchar(36)", true)],
      [index("refunds_shift_id_idx", false, ["shift_id"])],
    ),
  ],
  aggregates: [],
  absentRoutines: [],
  collationTables: [
    "pos_shifts",
    "pos_cash_movements",
    "pos_audit_outbox",
    "pos_device_audit_logs",
  ],
};
