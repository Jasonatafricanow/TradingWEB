-- Migration: 0022 - Maputo local delivery zones
--
-- Adds a delivery_zones table for configuring Maputo-area delivery regions
-- (Cidade, Matola, Costa do Sol) with per-zone base rates, free shipping
-- thresholds, and available time slots — B3-A.

CREATE TABLE IF NOT EXISTS `delivery_zones` (
  `id` varchar(36) NOT NULL DEFAULT (UUID()),
  `name` varchar(100) NOT NULL,
  `name_en` varchar(100),
  `base_rate` decimal(10,2) NOT NULL DEFAULT 0.00,
  `free_shipping_min` decimal(10,2),
  `time_slots` json DEFAULT NULL,
  `is_active` tinyint NOT NULL DEFAULT 1,
  `sort_order` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL,
  CONSTRAINT `delivery_zones_id` PRIMARY KEY (`id`)
);
--> statement-breakpoint

SET @db = DATABASE();
--> statement-breakpoint

SET @exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'delivery_zones' AND INDEX_NAME = 'dz_active_idx');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'CREATE INDEX dz_active_idx ON delivery_zones (is_active)', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint EXECUTE stmt;
--> statement-breakpoint DEALLOCATE PREPARE stmt;
--> statement-breakpoint

SET @exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'delivery_zones' AND INDEX_NAME = 'dz_sort_order_idx');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'CREATE INDEX dz_sort_order_idx ON delivery_zones (sort_order)', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint EXECUTE stmt;
--> statement-breakpoint DEALLOCATE PREPARE stmt;