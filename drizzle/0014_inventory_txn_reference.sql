-- Migration: 0014 - close schema.ts drift on the order/inventory trust chain
--
-- 1) inventory_transactions.reference_type/reference_id: declared in schema.ts,
--    used by transfer-service and load-bearing for P1-04 order-stock idempotency
--    and P3 POS, but no migration ever created them (transfer-service's
--    swallowed-error logging hid it).
-- 2) order_timeline: the whole table exists only in schema.ts; every consumer
--    defensively wraps it in try/catch ("timeline table may not exist yet").
--    P1 order actions and P3 POS write to it inside transactions, so it must exist.

SET @db = DATABASE();
--> statement-breakpoint

-- order_timeline table
CREATE TABLE IF NOT EXISTS order_timeline (
  id VARCHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  order_id VARCHAR(36) NOT NULL,
  action VARCHAR(100) NOT NULL,
  description TEXT NULL,
  old_value TEXT NULL,
  new_value TEXT NULL,
  operator_id VARCHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX order_timeline_order_idx (order_id),
  INDEX order_timeline_created_idx (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint

-- inventory_transactions.reference_type
SET @exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'inventory_transactions'
    AND COLUMN_NAME = 'reference_type'
);
--> statement-breakpoint
SET @sql = IF(
  @exists = 0,
  'ALTER TABLE inventory_transactions ADD COLUMN reference_type VARCHAR(30) NULL AFTER operator_id',
  'SELECT "inventory_transactions.reference_type already exists" AS status'
);
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint

-- inventory_transactions.reference_id
SET @exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'inventory_transactions'
    AND COLUMN_NAME = 'reference_id'
);
--> statement-breakpoint
SET @sql = IF(
  @exists = 0,
  'ALTER TABLE inventory_transactions ADD COLUMN reference_id VARCHAR(36) NULL AFTER reference_type',
  'SELECT "inventory_transactions.reference_id already exists" AS status'
);
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint

-- inv_tx_ref_idx
SET @exists = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'inventory_transactions'
    AND INDEX_NAME = 'inv_tx_ref_idx'
);
--> statement-breakpoint
SET @sql = IF(
  @exists = 0,
  'CREATE INDEX inv_tx_ref_idx ON inventory_transactions (reference_type, reference_id)',
  'SELECT "inv_tx_ref_idx already exists" AS status'
);
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;