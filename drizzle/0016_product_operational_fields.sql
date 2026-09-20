-- Migration: 0016 - product operational fields for Shopify-grade catalog admin
--
-- Adds product-level merchandising identifiers that are maintained from the
-- admin product editor and product CSV import/export. Guards make this safe to
-- re-run in environments that already received part of the schema manually.

SET @db = DATABASE();

-- products.compare_at_price
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'compare_at_price');
SET @sql = IF(@exists = 0, 'ALTER TABLE products ADD COLUMN compare_at_price DECIMAL(10,2) NULL AFTER price', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- products.barcode
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'barcode');
SET @sql = IF(@exists = 0, 'ALTER TABLE products ADD COLUMN barcode VARCHAR(100) NULL AFTER status', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- products.vendor
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'vendor');
SET @sql = IF(@exists = 0, 'ALTER TABLE products ADD COLUMN vendor VARCHAR(150) NULL AFTER barcode', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- products.collection
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'collection');
SET @sql = IF(@exists = 0, 'ALTER TABLE products ADD COLUMN collection VARCHAR(150) NULL AFTER vendor', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Named indexes used by catalog search/filtering.
SET @exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND INDEX_NAME = 'products_barcode_idx');
SET @sql = IF(@exists = 0, 'CREATE INDEX products_barcode_idx ON products (barcode)', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND INDEX_NAME = 'products_vendor_idx');
SET @sql = IF(@exists = 0, 'CREATE INDEX products_vendor_idx ON products (vendor)', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND INDEX_NAME = 'products_collection_idx');
SET @sql = IF(@exists = 0, 'CREATE INDEX products_collection_idx ON products (collection)', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
