-- Migration: 0021 - Portuguese content fields for products
--
-- Adds title_pt, description_pt, meta_title_pt, meta_description_pt
-- so the frontend can display Portuguese content for locale 'pt'
-- (B2-A). Follows the same pattern as existing _en/_ja/_es fields.

SET @db = DATABASE();

-- products.title_pt
SET @exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'title_pt'
);
SET @sql = IF(@exists = 0,
  'ALTER TABLE products ADD COLUMN title_pt VARCHAR(200) AFTER title_es',
  'SELECT "products.title_pt already exists" AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- products.description_pt
SET @exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'description_pt'
);
SET @sql = IF(@exists = 0,
  'ALTER TABLE products ADD COLUMN description_pt TEXT AFTER description_es',
  'SELECT "products.description_pt already exists" AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- products.meta_title_pt
SET @exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'meta_title_pt'
);
SET @sql = IF(@exists = 0,
  'ALTER TABLE products ADD COLUMN meta_title_pt VARCHAR(200) AFTER meta_title',
  'SELECT "products.meta_title_pt already exists" AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- products.meta_description_pt
SET @exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'meta_description_pt'
);
SET @sql = IF(@exists = 0,
  'ALTER TABLE products ADD COLUMN meta_description_pt TEXT AFTER meta_description',
  'SELECT "products.meta_description_pt already exists" AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
