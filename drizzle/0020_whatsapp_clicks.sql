-- Migration: 0020 - whatsapp_clicks tracking table
--
-- Tracks WhatsApp CTA clicks from product pages for conversion analytics.
-- Records visitor/product/UTM context so traffic reports can measure
-- PV -> WhatsApp Click -> Order funnel — FJ-B1-C.

CREATE TABLE IF NOT EXISTS `whatsapp_clicks` (
  `id` varchar(36) NOT NULL DEFAULT (UUID()),
  `visitor_id` varchar(64),
  `product_id` varchar(36),
  `variant_id` varchar(36),
  `path` varchar(500) NOT NULL,
  `locale` varchar(10),
  `referrer` text,
  `utm_source` varchar(100),
  `utm_medium` varchar(100),
  `utm_campaign` varchar(200),
  `utm_content` varchar(200),
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `whatsapp_clicks_id` PRIMARY KEY (`id`)
);

SET @db = DATABASE();

SET @exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'whatsapp_clicks' AND INDEX_NAME = 'wc_visitor_id_idx');
SET @sql = IF(@exists = 0, 'CREATE INDEX wc_visitor_id_idx ON whatsapp_clicks (visitor_id)', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'whatsapp_clicks' AND INDEX_NAME = 'wc_product_id_idx');
SET @sql = IF(@exists = 0, 'CREATE INDEX wc_product_id_idx ON whatsapp_clicks (product_id)', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'whatsapp_clicks' AND INDEX_NAME = 'wc_created_at_idx');
SET @sql = IF(@exists = 0, 'CREATE INDEX wc_created_at_idx ON whatsapp_clicks (created_at)', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
