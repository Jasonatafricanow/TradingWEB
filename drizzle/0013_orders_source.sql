-- Migration: 0013 - orders.source channel column
--
-- Adds orders.source ('web' | 'pos' | 'import') so order lists and reports
-- can filter by sales channel (P1-01 saved views, P5-02 channel reports).

SET @db = DATABASE();
--> statement-breakpoint

-- orders.source
SET @exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'orders'
    AND COLUMN_NAME = 'source'
);
--> statement-breakpoint
SET @sql = IF(
  @exists = 0,
  'ALTER TABLE orders ADD COLUMN source VARCHAR(20) NOT NULL DEFAULT ''web'' AFTER store_id',
  'SELECT "orders.source already exists" AS status'
);
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint

-- orders_source_idx
SET @exists = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'orders'
    AND INDEX_NAME = 'orders_source_idx'
);
--> statement-breakpoint
SET @sql = IF(
  @exists = 0,
  'CREATE INDEX orders_source_idx ON orders (source)',
  'SELECT "orders_source_idx already exists" AS status'
);
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;