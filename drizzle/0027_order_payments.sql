-- Migration: 0027 - shared order payment facts
-- Safe to replay: table creation, column/index creation, and historical backfill
-- are guarded. Legacy orders.payment_* columns remain compatibility fields.

SET @db = DATABASE();
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS order_payments (
  id VARCHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  order_id VARCHAR(36) NOT NULL,
  channel VARCHAR(20) NOT NULL,
  method VARCHAR(64) NOT NULL,
  label VARCHAR(100) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  reference VARCHAR(200) NULL,
  provider_transaction_id VARCHAR(200) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'recorded',
  recorded_by VARCHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX order_payments_order_idx (order_id),
  INDEX order_payments_provider_idx (provider_transaction_id),
  CONSTRAINT order_payments_order_fk FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB;
--> statement-breakpoint

SET @length = (
  SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'order_payments' AND COLUMN_NAME = 'method'
);
--> statement-breakpoint
SET @sql = IF(@length < 64, 'ALTER TABLE order_payments MODIFY COLUMN method VARCHAR(64) NOT NULL', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint EXECUTE stmt;
--> statement-breakpoint DEALLOCATE PREPARE stmt;
--> statement-breakpoint

SET @length = (
  SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'payment_method'
);
--> statement-breakpoint
SET @sql = IF(@length < 64, 'ALTER TABLE orders MODIFY COLUMN payment_method VARCHAR(64) NULL', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint EXECUTE stmt;
--> statement-breakpoint DEALLOCATE PREPARE stmt;
--> statement-breakpoint

SET @exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'client_ref'
);
--> statement-breakpoint
SET @sql = IF(
  @exists = 0,
  'ALTER TABLE orders ADD COLUMN client_ref VARCHAR(160) NULL AFTER source',
  'SELECT "skip" AS s'
);
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint EXECUTE stmt;
--> statement-breakpoint DEALLOCATE PREPARE stmt;
--> statement-breakpoint

SET @named_index = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'orders' AND INDEX_NAME = 'orders_client_ref_unique_idx'
);
--> statement-breakpoint
SET @exact_index = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'orders'
    AND INDEX_NAME = 'orders_client_ref_unique_idx'
    AND NON_UNIQUE = 0 AND SEQ_IN_INDEX = 1 AND COLUMN_NAME = 'client_ref'
);
--> statement-breakpoint
SET @sql = IF(
  @named_index > 0 AND NOT (@named_index = 1 AND @exact_index = 1),
  'DROP INDEX orders_client_ref_unique_idx ON orders',
  'SELECT "skip" AS s'
);
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint EXECUTE stmt;
--> statement-breakpoint DEALLOCATE PREPARE stmt;
--> statement-breakpoint

SET @exact_index = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'orders'
    AND INDEX_NAME = 'orders_client_ref_unique_idx'
    AND NON_UNIQUE = 0 AND SEQ_IN_INDEX = 1 AND COLUMN_NAME = 'client_ref'
);
--> statement-breakpoint
SET @sql = IF(
  @exact_index = 0,
  'CREATE UNIQUE INDEX orders_client_ref_unique_idx ON orders (client_ref)',
  'SELECT "skip" AS s'
);
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint EXECUTE stmt;
--> statement-breakpoint DEALLOCATE PREPARE stmt;
--> statement-breakpoint

INSERT INTO order_payments (
  id, order_id, channel, method, label, amount, reference,
  provider_transaction_id, status, recorded_by, created_at
)
SELECT
  UUID(), o.id,
  CASE WHEN o.source = 'pos' THEN 'pos' ELSE 'storefront' END,
  o.payment_method,
  o.payment_method,
  o.total_amount,
  NULL,
  o.payment_id,
  CASE
    WHEN o.payment_status = 'paid' OR o.financial_status = 'paid' THEN 'recorded'
    ELSE 'pending'
  END,
  NULL,
  o.created_at
FROM orders o
WHERE o.payment_method IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM order_payments op WHERE op.order_id = o.id
  );