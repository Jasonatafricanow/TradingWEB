-- Migration: 0029 - idempotent POS refunds and atomic exchanges
-- pos_refund_items is the immutable authority for remaining returnable quantity.

SET @db = DATABASE();
--> statement-breakpoint

SET @exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'refunded_total'
);
--> statement-breakpoint
SET @sql = IF(
  @exists = 0,
  'ALTER TABLE orders ADD COLUMN refunded_total DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER has_refund',
  'SELECT "skip" AS s'
);
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint EXECUTE stmt;
--> statement-breakpoint DEALLOCATE PREPARE stmt;
--> statement-breakpoint

CREATE TABLE pos_refund_items (
  id VARCHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  refund_id VARCHAR(36) NOT NULL,
  order_item_id VARCHAR(36) NOT NULL,
  quantity INT NOT NULL,
  restock BOOLEAN NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY pos_refund_items_refund_item_unique (refund_id, order_item_id),
  INDEX pos_refund_items_order_item_idx (order_item_id),
  CONSTRAINT pos_refund_items_refund_fk FOREIGN KEY (refund_id) REFERENCES refunds(id) ON DELETE CASCADE,
  CONSTRAINT pos_refund_items_order_item_fk FOREIGN KEY (order_item_id) REFERENCES order_items(id)
) ENGINE=InnoDB;
--> statement-breakpoint

CREATE TABLE pos_exchanges (
  id VARCHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  idempotency_key VARCHAR(160) NOT NULL,
  store_id VARCHAR(36) NOT NULL,
  original_order_id VARCHAR(36) NOT NULL,
  replacement_order_id VARCHAR(36) NOT NULL,
  refund_amount DECIMAL(12,2) NOT NULL,
  new_order_amount DECIMAL(12,2) NOT NULL,
  difference_amount DECIMAL(12,2) NOT NULL,
  approval_token_id VARCHAR(36) NULL,
  operator_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY pos_exchanges_idempotency_unique (idempotency_key),
  INDEX pos_exchanges_original_idx (original_order_id),
  INDEX pos_exchanges_replacement_idx (replacement_order_id),
  CONSTRAINT pos_exchanges_original_fk FOREIGN KEY (original_order_id) REFERENCES orders(id),
  CONSTRAINT pos_exchanges_replacement_fk FOREIGN KEY (replacement_order_id) REFERENCES orders(id)
) ENGINE=InnoDB;