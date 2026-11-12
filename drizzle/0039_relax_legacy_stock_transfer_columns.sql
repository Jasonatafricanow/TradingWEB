-- TW-12: stock_transfers still carries product_id / quantity from the
-- single-item design (0000). Current code stores lines in transfer_items and
-- never writes these columns, so under STRICT_TRANS_TABLES (MySQL 8 default)
-- every new transfer failed with "Field 'product_id' doesn't have a default
-- value". Found by replaying 0000 -> 0038 on a disposable MySQL 8.4.
--
-- Non-destructive: only relaxes NOT NULL. The columns, their data and the
-- product foreign key stay. Each step checks the live column first, so a
-- database that was already patched by hand is left alone.

SET @db = DATABASE();
--> statement-breakpoint
-- stock_transfers.product_id
SET @needs = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'stock_transfers' AND COLUMN_NAME = 'product_id' AND IS_NULLABLE = 'NO');
--> statement-breakpoint
SET @sql = IF(@needs = 1, 'ALTER TABLE stock_transfers MODIFY COLUMN product_id VARCHAR(36) NULL', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
-- stock_transfers.quantity
SET @needs = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'stock_transfers' AND COLUMN_NAME = 'quantity' AND IS_NULLABLE = 'NO');
--> statement-breakpoint
SET @sql = IF(@needs = 1, 'ALTER TABLE stock_transfers MODIFY COLUMN quantity INT NULL', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
