-- Migration: 0008 — 补齐 order_items.delivery_method
--
-- Drizzle schema 已声明 order_items.delivery_method 列，
-- 但生产库缺失该列，导致 Drizzle 查询/写入报 Unknown column 1054。
-- 此迁移补齐该列，使用幂等写法（IF NOT EXISTS 语义）。

-- MySQL 不直接支持 IF NOT EXISTS for ADD COLUMN，
-- 用存储过程 / information_schema 实现幂等
SET @db = DATABASE();
--> statement-breakpoint

SET @exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'order_items'
    AND COLUMN_NAME = 'delivery_method'
);
--> statement-breakpoint

SET @sql = IF(@exists = 0,
  'ALTER TABLE order_items ADD COLUMN delivery_method VARCHAR(32) NULL AFTER subtotal',
  'SELECT "column already exists" AS status'
);
--> statement-breakpoint

PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;