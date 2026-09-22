-- Migration: 0024 - Coupon campaign fields
--
-- Adds campaign_source, campaign_name, customer_segment to coupons
-- so campaigns can be tracked by source (instagram/whatsapp/email),
-- named (e.g. "July VIP Sale"), and targeted at segments (vip/new/active).
-- Also supports batch-generated coupon codes — B4-A.

SET @db = DATABASE();
--> statement-breakpoint

-- coupons.campaign_source
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'coupons' AND COLUMN_NAME = 'campaign_source');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'ALTER TABLE coupons ADD COLUMN campaign_source VARCHAR(50) AFTER is_active', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint EXECUTE stmt;
--> statement-breakpoint DEALLOCATE PREPARE stmt;
--> statement-breakpoint

-- coupons.campaign_name
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'coupons' AND COLUMN_NAME = 'campaign_name');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'ALTER TABLE coupons ADD COLUMN campaign_name VARCHAR(200) AFTER campaign_source', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint EXECUTE stmt;
--> statement-breakpoint DEALLOCATE PREPARE stmt;
--> statement-breakpoint

-- coupons.customer_segment
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'coupons' AND COLUMN_NAME = 'customer_segment');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'ALTER TABLE coupons ADD COLUMN customer_segment VARCHAR(50) AFTER campaign_name', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint EXECUTE stmt;
--> statement-breakpoint DEALLOCATE PREPARE stmt;