-- Migration: 0023 - Order delivery fields
--
-- Adds delivery_zone_id, shipping_cost, delivery_date, delivery_time_slot
-- to orders for Maputo local delivery — B3-B.

SET @db = DATABASE();

-- orders.delivery_zone_id
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'delivery_zone_id');
SET @sql = IF(@exists = 0, 'ALTER TABLE orders ADD COLUMN delivery_zone_id VARCHAR(36) AFTER buyer_phone', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- orders.shipping_cost
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'shipping_cost');
SET @sql = IF(@exists = 0, 'ALTER TABLE orders ADD COLUMN shipping_cost DECIMAL(10,2) AFTER delivery_zone_id', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- orders.delivery_date
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'delivery_date');
SET @sql = IF(@exists = 0, 'ALTER TABLE orders ADD COLUMN delivery_date VARCHAR(20) AFTER shipping_cost', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- orders.delivery_time_slot
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'delivery_time_slot');
SET @sql = IF(@exists = 0, 'ALTER TABLE orders ADD COLUMN delivery_time_slot VARCHAR(100) AFTER delivery_date', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
