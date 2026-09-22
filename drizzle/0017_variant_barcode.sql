-- Migration: 0017 - variant barcode for POS and Shopify-grade catalog search
--
-- Product-level barcode is useful for simple products; variant-level barcode is
-- required for multi-SKU retail/POS scanning. Guards keep the migration safe to
-- re-run if a production database was patched manually.

SET @db = DATABASE();
--> statement-breakpoint

SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'product_variants' AND COLUMN_NAME = 'barcode');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'ALTER TABLE product_variants ADD COLUMN barcode VARCHAR(100) NULL AFTER sku', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint EXECUTE stmt;
--> statement-breakpoint DEALLOCATE PREPARE stmt;
--> statement-breakpoint

SET @exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'product_variants' AND INDEX_NAME = 'pv_barcode_idx');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'CREATE INDEX pv_barcode_idx ON product_variants (barcode)', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint EXECUTE stmt;
--> statement-breakpoint DEALLOCATE PREPARE stmt;