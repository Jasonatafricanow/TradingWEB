-- Migration: 0033 - POS order staff/account attribution on orders

SET @db = DATABASE();
--> statement-breakpoint

SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='orders' AND COLUMN_NAME='staff_id');
--> statement-breakpoint
SET @sql = IF(@exists=0, 'ALTER TABLE orders ADD COLUMN staff_id VARCHAR(36) NULL', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint EXECUTE stmt;
--> statement-breakpoint DEALLOCATE PREPARE stmt;
--> statement-breakpoint

SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='orders' AND COLUMN_NAME='account_user_id');
--> statement-breakpoint
SET @sql = IF(@exists=0, 'ALTER TABLE orders ADD COLUMN account_user_id VARCHAR(36) NULL', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint EXECUTE stmt;
--> statement-breakpoint DEALLOCATE PREPARE stmt;
--> statement-breakpoint

SET @exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='orders' AND INDEX_NAME='orders_store_staff_created_idx');
--> statement-breakpoint
SET @sql = IF(@exists=0, 'CREATE INDEX orders_store_staff_created_idx ON orders (store_id, staff_id, created_at, id)', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint EXECUTE stmt;
--> statement-breakpoint DEALLOCATE PREPARE stmt;
--> statement-breakpoint

-- 回填：仅回填可安全提取的旧 POS 单（提取值长度 1–36），异常历史值留给 aggregate 暴露，不静默截断。
UPDATE orders SET staff_id = SUBSTRING(payment_id, 5)
WHERE source = 'pos' AND payment_id LIKE 'pos:%' AND staff_id IS NULL
  AND CHAR_LENGTH(SUBSTRING(payment_id, 5)) BETWEEN 1 AND 36;