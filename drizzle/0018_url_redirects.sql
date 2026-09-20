-- Migration: 0018 - URL redirects for Shopify migration SEO continuity
--
-- MoveShopify can push legacy Shopify paths (for example /products/old-handle)
-- into this table. tradingWEB resolves unmatched frontend paths through it and
-- records hit counts for post-migration SEO QA.

CREATE TABLE IF NOT EXISTS `url_redirects` (
  `id` varchar(36) NOT NULL DEFAULT (UUID()),
  `old_path` varchar(767) NOT NULL,
  `new_path` varchar(767) NOT NULL,
  `status_code` int NOT NULL DEFAULT 301,
  `source` varchar(50),
  `source_store` varchar(100),
  `source_id` varchar(255),
  `hits` int NOT NULL DEFAULT 0,
  `is_active` boolean NOT NULL DEFAULT true,
  `last_hit_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL,
  CONSTRAINT `url_redirects_id` PRIMARY KEY (`id`),
  CONSTRAINT `ur_old_path_unique_idx` UNIQUE (`old_path`)
);

SET @db = DATABASE();

SET @exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'url_redirects' AND INDEX_NAME = 'ur_source_idx');
SET @sql = IF(@exists = 0, 'CREATE INDEX ur_source_idx ON url_redirects (source, source_store)', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'url_redirects' AND INDEX_NAME = 'ur_active_idx');
SET @sql = IF(@exists = 0, 'CREATE INDEX ur_active_idx ON url_redirects (is_active)', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
