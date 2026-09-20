-- Migration: 0015 - close remaining schema.ts drift (P4-02 scanner findings)
--
-- Found by scripts/schema-integrity-check.ts against a database built purely
-- from the migration chain 0000-0014:
-- - 4 tables existed only in schema.ts: transfer_items (transfer-service writes
--   it!), notifications, shipping_templates, media_library
-- - 15 columns missing: stock_transfers workflow columns (reference_no etc.,
--   all written by transfer-service), warehouses.type (queried by
--   warehouse-service restock), products.cost_price/attribute_unit,
--   membership_tiers.type, abandoned_carts/profiles phone+whatsapp
-- - 10 named indexes missing
--
-- Note: stock_transfers still carries legacy product_id/quantity/variant_id
-- columns from the pre-transfer_items single-item design; they are left in
-- place (dropping is destructive) and are simply unused by current code.

SET @db = DATABASE();

-- ── new tables ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS transfer_items (
  id VARCHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  transfer_id VARCHAR(36) NOT NULL,
  product_id VARCHAR(36) NOT NULL,
  variant_id VARCHAR(36) NULL,
  quantity DECIMAL(12,2) NOT NULL,
  unit_cost DECIMAL(12,2) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ti_transfer_id_idx (transfer_id),
  INDEX ti_product_id_idx (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NULL,
  reference_type VARCHAR(50) NULL,
  reference_id VARCHAR(36) NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  channel VARCHAR(20) NULL DEFAULT 'in_app',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP NULL,
  INDEX notifications_user_idx (user_id),
  INDEX notifications_read_idx (is_read),
  INDEX notifications_type_idx (type),
  INDEX notifications_created_idx (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shipping_templates (
  id VARCHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'flat',
  base_rate DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  free_shipping_min DECIMAL(10,2) NULL,
  conditions JSON NULL,
  regions JSON NULL,
  description TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL,
  INDEX shipping_templates_active_idx (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS media_library (
  id VARCHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size INT NOT NULL DEFAULT 0,
  url VARCHAR(500) NOT NULL,
  alt_text VARCHAR(500) NULL,
  uploaded_by VARCHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ml_uploaded_by_idx (uploaded_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── missing columns (guarded) ───────────────────────────────────

-- abandoned_carts.phone
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'abandoned_carts' AND COLUMN_NAME = 'phone');
SET @sql = IF(@exists = 0, 'ALTER TABLE abandoned_carts ADD COLUMN phone VARCHAR(50) NULL', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- abandoned_carts.whatsapp
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'abandoned_carts' AND COLUMN_NAME = 'whatsapp');
SET @sql = IF(@exists = 0, 'ALTER TABLE abandoned_carts ADD COLUMN whatsapp VARCHAR(50) NULL', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- membership_tiers.type (default replicated from schema.ts as-is)
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'membership_tiers' AND COLUMN_NAME = 'type');
SET @sql = IF(@exists = 0, 'ALTER TABLE membership_tiers ADD COLUMN type VARCHAR(20) NOT NULL DEFAULT ''warehouse''', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- products.cost_price
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'cost_price');
SET @sql = IF(@exists = 0, 'ALTER TABLE products ADD COLUMN cost_price DECIMAL(12,2) NULL AFTER price', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- products.attribute_unit
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'attribute_unit');
SET @sql = IF(@exists = 0, 'ALTER TABLE products ADD COLUMN attribute_unit VARCHAR(20) NULL', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- profiles.phone
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'profiles' AND COLUMN_NAME = 'phone');
SET @sql = IF(@exists = 0, 'ALTER TABLE profiles ADD COLUMN phone VARCHAR(50) NULL', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- profiles.whatsapp
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'profiles' AND COLUMN_NAME = 'whatsapp');
SET @sql = IF(@exists = 0, 'ALTER TABLE profiles ADD COLUMN whatsapp VARCHAR(50) NULL', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- stock_transfers.reference_no
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'stock_transfers' AND COLUMN_NAME = 'reference_no');
SET @sql = IF(@exists = 0, 'ALTER TABLE stock_transfers ADD COLUMN reference_no VARCHAR(50) NOT NULL DEFAULT '''' AFTER id', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- stock_transfers.shipping_method
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'stock_transfers' AND COLUMN_NAME = 'shipping_method');
SET @sql = IF(@exists = 0, 'ALTER TABLE stock_transfers ADD COLUMN shipping_method VARCHAR(30) NULL', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- stock_transfers.packaging_info
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'stock_transfers' AND COLUMN_NAME = 'packaging_info');
SET @sql = IF(@exists = 0, 'ALTER TABLE stock_transfers ADD COLUMN packaging_info JSON NULL', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- stock_transfers.unit_cost
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'stock_transfers' AND COLUMN_NAME = 'unit_cost');
SET @sql = IF(@exists = 0, 'ALTER TABLE stock_transfers ADD COLUMN unit_cost DECIMAL(12,2) NULL', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- stock_transfers.total_cost
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'stock_transfers' AND COLUMN_NAME = 'total_cost');
SET @sql = IF(@exists = 0, 'ALTER TABLE stock_transfers ADD COLUMN total_cost DECIMAL(12,2) NULL', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- stock_transfers.initiated_by
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'stock_transfers' AND COLUMN_NAME = 'initiated_by');
SET @sql = IF(@exists = 0, 'ALTER TABLE stock_transfers ADD COLUMN initiated_by VARCHAR(36) NULL', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- stock_transfers.approved_by
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'stock_transfers' AND COLUMN_NAME = 'approved_by');
SET @sql = IF(@exists = 0, 'ALTER TABLE stock_transfers ADD COLUMN approved_by VARCHAR(36) NULL', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- warehouses.type (restock() filters type='supplier')
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'warehouses' AND COLUMN_NAME = 'type');
SET @sql = IF(@exists = 0, 'ALTER TABLE warehouses ADD COLUMN type VARCHAR(20) NOT NULL DEFAULT ''warehouse''', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── missing indexes (guarded) ───────────────────────────────────

-- delivery_methods.dm_code_idx
SET @exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'delivery_methods' AND INDEX_NAME = 'dm_code_idx');
SET @sql = IF(@exists = 0, 'CREATE INDEX dm_code_idx ON delivery_methods (code)', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- delivery_methods.dm_active_idx
SET @exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'delivery_methods' AND INDEX_NAME = 'dm_active_idx');
SET @sql = IF(@exists = 0, 'CREATE INDEX dm_active_idx ON delivery_methods (is_active)', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- payment_methods.pm_code_idx
SET @exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'payment_methods' AND INDEX_NAME = 'pm_code_idx');
SET @sql = IF(@exists = 0, 'CREATE INDEX pm_code_idx ON payment_methods (code)', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- payment_methods.pm_enabled_idx
SET @exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'payment_methods' AND INDEX_NAME = 'pm_enabled_idx');
SET @sql = IF(@exists = 0, 'CREATE INDEX pm_enabled_idx ON payment_methods (enabled)', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- product_types.pt_code_idx
SET @exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'product_types' AND INDEX_NAME = 'pt_code_idx');
SET @sql = IF(@exists = 0, 'CREATE INDEX pt_code_idx ON product_types (code)', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- product_types.pt_active_idx
SET @exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'product_types' AND INDEX_NAME = 'pt_active_idx');
SET @sql = IF(@exists = 0, 'CREATE INDEX pt_active_idx ON product_types (is_active)', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- product_types.pt_sort_order_idx
SET @exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'product_types' AND INDEX_NAME = 'pt_sort_order_idx');
SET @sql = IF(@exists = 0, 'CREATE INDEX pt_sort_order_idx ON product_types (sort_order)', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- stock_transfers.st_reference_no_idx
SET @exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'stock_transfers' AND INDEX_NAME = 'st_reference_no_idx');
SET @sql = IF(@exists = 0, 'CREATE INDEX st_reference_no_idx ON stock_transfers (reference_no)', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- stock_transfers.st_from_wh_idx
SET @exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'stock_transfers' AND INDEX_NAME = 'st_from_wh_idx');
SET @sql = IF(@exists = 0, 'CREATE INDEX st_from_wh_idx ON stock_transfers (from_warehouse_id)', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- stock_transfers.st_to_wh_idx
SET @exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'stock_transfers' AND INDEX_NAME = 'st_to_wh_idx');
SET @sql = IF(@exists = 0, 'CREATE INDEX st_to_wh_idx ON stock_transfers (to_warehouse_id)', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
