-- Migration: 0019 - UTM attribution fields for page_views
--
-- Adds utm_source, utm_medium, utm_campaign, utm_content to page_views
-- so traffic reports and order attribution can track marketing channels
-- (Instagram, WhatsApp, Facebook Ads, etc.) — FJ-B1-A.

SET @db = DATABASE();

-- page_views.utm_source
SET @exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'page_views'
    AND COLUMN_NAME = 'utm_source'
);
SET @sql = IF(
  @exists = 0,
  'ALTER TABLE page_views ADD COLUMN utm_source VARCHAR(100) AFTER visitor_id',
  'SELECT "page_views.utm_source already exists" AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- page_views.utm_medium
SET @exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'page_views'
    AND COLUMN_NAME = 'utm_medium'
);
SET @sql = IF(
  @exists = 0,
  'ALTER TABLE page_views ADD COLUMN utm_medium VARCHAR(100) AFTER utm_source',
  'SELECT "page_views.utm_medium already exists" AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- page_views.utm_campaign
SET @exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'page_views'
    AND COLUMN_NAME = 'utm_campaign'
);
SET @sql = IF(
  @exists = 0,
  'ALTER TABLE page_views ADD COLUMN utm_campaign VARCHAR(200) AFTER utm_medium',
  'SELECT "page_views.utm_campaign already exists" AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- page_views.utm_content
SET @exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'page_views'
    AND COLUMN_NAME = 'utm_content'
);
SET @sql = IF(
  @exists = 0,
  'ALTER TABLE page_views ADD COLUMN utm_content VARCHAR(200) AFTER utm_campaign',
  'SELECT "page_views.utm_content already exists" AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- pv_utm_campaign_idx
SET @exists = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'page_views'
    AND INDEX_NAME = 'pv_utm_campaign_idx'
);
SET @sql = IF(
  @exists = 0,
  'CREATE INDEX pv_utm_campaign_idx ON page_views (utm_campaign)',
  'SELECT "pv_utm_campaign_idx already exists" AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
