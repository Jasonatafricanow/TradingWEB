-- Migration: 0030 - POS shifts, cash movements, audit outbox and device audit uploads

CREATE TABLE pos_shifts (
  id VARCHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  store_id VARCHAR(36) NOT NULL,
  opened_by VARCHAR(36) NOT NULL,
  closed_by VARCHAR(36) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  opening_float DECIMAL(12,2) NOT NULL,
  expected_cash DECIMAL(12,2) NULL,
  counted_cash DECIMAL(12,2) NULL,
  difference_cash DECIMAL(12,2) NULL,
  opened_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP NULL,
  INDEX pos_shifts_store_status_idx (store_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint

CREATE TABLE pos_cash_movements (
  id VARCHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  shift_id VARCHAR(36) NOT NULL,
  kind VARCHAR(10) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  reason VARCHAR(255) NOT NULL,
  operator_id VARCHAR(36) NOT NULL,
  idempotency_key VARCHAR(160) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY pos_cash_movements_idempotency_unique (idempotency_key),
  INDEX pos_cash_movements_shift_idx (shift_id, created_at),
  CONSTRAINT pos_cash_movements_shift_fk FOREIGN KEY (shift_id) REFERENCES pos_shifts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint

CREATE TABLE pos_audit_outbox (
  id VARCHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  event_type VARCHAR(80) NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  entity_id VARCHAR(36) NOT NULL,
  store_id VARCHAR(36) NULL,
  operator_id VARCHAR(36) NULL,
  payload JSON NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMP NULL,
  processed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX pos_audit_outbox_status_idx (status, next_attempt_at),
  INDEX pos_audit_outbox_entity_idx (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint

CREATE TABLE pos_device_audit_logs (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  device_id VARCHAR(100) NOT NULL,
  store_id VARCHAR(36) NOT NULL,
  operator_id VARCHAR(36) NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  entity_id VARCHAR(36) NULL,
  payload JSON NOT NULL,
  hash CHAR(64) NOT NULL,
  prev_hash CHAR(64) NULL,
  occurred_at TIMESTAMP(3) NOT NULL,
  uploaded_at TIMESTAMP(3) NOT NULL,
  INDEX pos_device_audit_logs_device_idx (device_id, uploaded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint

SET @db = DATABASE();
--> statement-breakpoint

SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'pos_exchanges' AND COLUMN_NAME = 'refund_id');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'ALTER TABLE pos_exchanges ADD COLUMN refund_id VARCHAR(36) NULL AFTER replacement_order_id', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint EXECUTE stmt;
--> statement-breakpoint DEALLOCATE PREPARE stmt;
--> statement-breakpoint

SET @exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'pos_exchanges' AND INDEX_NAME = 'pos_exchanges_refund_unique');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'CREATE UNIQUE INDEX pos_exchanges_refund_unique ON pos_exchanges (refund_id)', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint EXECUTE stmt;
--> statement-breakpoint DEALLOCATE PREPARE stmt;
--> statement-breakpoint

SET @exists = (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE BINARY CONSTRAINT_SCHEMA = BINARY @db AND TABLE_NAME = 'pos_exchanges' AND CONSTRAINT_NAME = 'pos_exchanges_refund_fk');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'ALTER TABLE pos_exchanges ADD CONSTRAINT pos_exchanges_refund_fk FOREIGN KEY (refund_id) REFERENCES refunds(id)', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint EXECUTE stmt;
--> statement-breakpoint DEALLOCATE PREPARE stmt;
--> statement-breakpoint

SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'shift_id');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'ALTER TABLE orders ADD COLUMN shift_id VARCHAR(36) NULL AFTER store_id', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint EXECUTE stmt;
--> statement-breakpoint DEALLOCATE PREPARE stmt;
--> statement-breakpoint

SET @exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'orders' AND INDEX_NAME = 'orders_shift_id_idx');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'CREATE INDEX orders_shift_id_idx ON orders (shift_id)', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint EXECUTE stmt;
--> statement-breakpoint DEALLOCATE PREPARE stmt;
--> statement-breakpoint

SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'refunds' AND COLUMN_NAME = 'shift_id');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'ALTER TABLE refunds ADD COLUMN shift_id VARCHAR(36) NULL AFTER order_item_id', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint EXECUTE stmt;
--> statement-breakpoint DEALLOCATE PREPARE stmt;
--> statement-breakpoint

SET @exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'refunds' AND INDEX_NAME = 'refunds_shift_id_idx');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'CREATE INDEX refunds_shift_id_idx ON refunds (shift_id)', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint EXECUTE stmt;
--> statement-breakpoint DEALLOCATE PREPARE stmt;