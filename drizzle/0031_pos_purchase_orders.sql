-- Migration: 0031 - POS purchase orders and canonical inventory preflight

CREATE TABLE IF NOT EXISTS pos_inventory_migration_exceptions (
  id VARCHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  exception_type VARCHAR(40) NOT NULL,
  product_id VARCHAR(36) NOT NULL,
  variant_id VARCHAR(36) NULL,
  details JSON NOT NULL,
  resolved_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX pos_inventory_migration_exceptions_type_idx (exception_type, created_at),
  INDEX pos_inventory_migration_exceptions_product_idx (product_id, variant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint

-- Synchronize the current product/variant relation anomalies. Existing rows are
-- revived when an issue reappears and resolved in place when operators repair it.
DROP TEMPORARY TABLE IF EXISTS pos_current_product_variant_mismatches;
--> statement-breakpoint
CREATE TEMPORARY TABLE pos_current_product_variant_mismatches AS
SELECT
  i.product_id,
  i.variant_id,
  JSON_OBJECT(
    'inventory_ids', JSON_ARRAYAGG(i.id),
    'variant_product_id', MAX(v.product_id),
    'row_count', COUNT(*)
  ) AS details
FROM inventory i
LEFT JOIN product_variants v ON v.id = i.variant_id
WHERE i.variant_id IS NOT NULL
  AND (v.id IS NULL OR v.product_id <> i.product_id)
GROUP BY i.product_id, i.variant_id;
--> statement-breakpoint
UPDATE pos_inventory_migration_exceptions e
LEFT JOIN pos_current_product_variant_mismatches current_issue
  ON current_issue.product_id = e.product_id
 AND current_issue.variant_id <=> e.variant_id
SET
  e.resolved_at = CASE
    WHEN current_issue.product_id IS NULL THEN COALESCE(e.resolved_at, CURRENT_TIMESTAMP)
    ELSE NULL
  END,
  e.details = CASE
    WHEN current_issue.product_id IS NULL THEN e.details
    ELSE current_issue.details
  END
WHERE e.exception_type = 'PRODUCT_VARIANT_MISMATCH';
--> statement-breakpoint
INSERT INTO pos_inventory_migration_exceptions
  (exception_type, product_id, variant_id, details)
SELECT
  'PRODUCT_VARIANT_MISMATCH', current_issue.product_id, current_issue.variant_id, current_issue.details
FROM pos_current_product_variant_mismatches current_issue
WHERE NOT EXISTS (
  SELECT 1
  FROM pos_inventory_migration_exceptions e
  WHERE e.exception_type = 'PRODUCT_VARIANT_MISMATCH'
    AND e.product_id = current_issue.product_id
    AND e.variant_id <=> current_issue.variant_id
);
--> statement-breakpoint
DROP TEMPORARY TABLE IF EXISTS pos_current_product_variant_mismatches;
--> statement-breakpoint

-- Relation corruption must stop before even the safe legacy backfill.
DROP PROCEDURE IF EXISTS pos_task11_preflight;
--> statement-breakpoint
CREATE PROCEDURE pos_task11_preflight()
BEGIN
  IF EXISTS (
    SELECT 1 FROM pos_inventory_migration_exceptions
    WHERE exception_type = 'PRODUCT_VARIANT_MISMATCH' AND resolved_at IS NULL
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Task 11 blocked: unresolved PRODUCT_VARIANT_MISMATCH';
  END IF;
END;
--> statement-breakpoint
CALL pos_task11_preflight();
--> statement-breakpoint
DROP PROCEDURE IF EXISTS pos_task11_preflight;
--> statement-breakpoint

-- Missing inventory rows may be backfilled only when one unambiguous active
-- store/warehouse pair exists. These DML steps are safe to repeat.
SET @pos_default_location_count = (
  SELECT COUNT(*)
  FROM stores s
  JOIN warehouses w ON w.id = s.warehouse_id AND w.is_active = TRUE
  WHERE s.status = 'active' AND s.warehouse_id IS NOT NULL
);
--> statement-breakpoint
SET @pos_default_store_id = (
  SELECT IF(@pos_default_location_count = 1, MIN(s.id), NULL)
  FROM stores s
  JOIN warehouses w ON w.id = s.warehouse_id AND w.is_active = TRUE
  WHERE s.status = 'active' AND s.warehouse_id IS NOT NULL
);
--> statement-breakpoint
SET @pos_default_warehouse_id = (
  SELECT IF(@pos_default_location_count = 1, MIN(s.warehouse_id), NULL)
  FROM stores s
  JOIN warehouses w ON w.id = s.warehouse_id AND w.is_active = TRUE
  WHERE s.status = 'active' AND s.warehouse_id IS NOT NULL
);
--> statement-breakpoint

DROP TEMPORARY TABLE IF EXISTS pos_current_ambiguous_locations;
--> statement-breakpoint
CREATE TEMPORARY TABLE pos_current_ambiguous_locations AS
SELECT
  v.product_id,
  v.id AS variant_id,
  JSON_OBJECT('legacy_stock', v.stock, 'active_default_candidates', @pos_default_location_count) AS details
FROM product_variants v
WHERE v.stock > 0
  AND @pos_default_location_count <> 1
  AND NOT EXISTS (
    SELECT 1 FROM inventory i WHERE i.product_id = v.product_id AND i.variant_id = v.id
  );
--> statement-breakpoint
UPDATE pos_inventory_migration_exceptions e
LEFT JOIN pos_current_ambiguous_locations current_issue
  ON current_issue.product_id = e.product_id
 AND current_issue.variant_id <=> e.variant_id
SET
  e.resolved_at = CASE
    WHEN current_issue.product_id IS NULL THEN COALESCE(e.resolved_at, CURRENT_TIMESTAMP)
    ELSE NULL
  END,
  e.details = CASE
    WHEN current_issue.product_id IS NULL THEN e.details
    ELSE current_issue.details
  END
WHERE e.exception_type = 'AMBIGUOUS_DEFAULT_LOCATION';
--> statement-breakpoint
INSERT INTO pos_inventory_migration_exceptions
  (exception_type, product_id, variant_id, details)
SELECT
  'AMBIGUOUS_DEFAULT_LOCATION', current_issue.product_id, current_issue.variant_id, current_issue.details
FROM pos_current_ambiguous_locations current_issue
WHERE NOT EXISTS (
  SELECT 1
  FROM pos_inventory_migration_exceptions e
  WHERE e.exception_type = 'AMBIGUOUS_DEFAULT_LOCATION'
    AND e.product_id = current_issue.product_id
    AND e.variant_id <=> current_issue.variant_id
);
--> statement-breakpoint
DROP TEMPORARY TABLE IF EXISTS pos_current_ambiguous_locations;
--> statement-breakpoint

INSERT INTO inventory
  (id, product_id, variant_id, store_id, warehouse_id, stock, low_stock_threshold, updated_at)
SELECT
  UUID(), v.product_id, v.id, @pos_default_store_id, @pos_default_warehouse_id,
  v.stock, 10, CURRENT_TIMESTAMP
FROM product_variants v
WHERE @pos_default_location_count = 1
  AND NOT EXISTS (
    SELECT 1 FROM inventory i WHERE i.product_id = v.product_id AND i.variant_id = v.id
  );
--> statement-breakpoint

-- Synchronize stock-total anomalies after the only permitted automatic backfill.
DROP TEMPORARY TABLE IF EXISTS pos_current_stock_total_mismatches;
--> statement-breakpoint
CREATE TEMPORARY TABLE pos_current_stock_total_mismatches AS
SELECT
  v.product_id,
  v.id AS variant_id,
  JSON_OBJECT('legacy_stock', v.stock, 'inventory_stock', COALESCE(SUM(i.stock), 0)) AS details
FROM product_variants v
LEFT JOIN inventory i
  ON i.product_id = v.product_id
 AND i.variant_id = v.id
GROUP BY v.product_id, v.id, v.stock
HAVING COALESCE(SUM(i.stock), 0) <> v.stock;
--> statement-breakpoint
UPDATE pos_inventory_migration_exceptions e
LEFT JOIN pos_current_stock_total_mismatches current_issue
  ON current_issue.product_id = e.product_id
 AND current_issue.variant_id <=> e.variant_id
SET
  e.resolved_at = CASE
    WHEN current_issue.product_id IS NULL THEN COALESCE(e.resolved_at, CURRENT_TIMESTAMP)
    ELSE NULL
  END,
  e.details = CASE
    WHEN current_issue.product_id IS NULL THEN e.details
    ELSE current_issue.details
  END
WHERE e.exception_type = 'STOCK_TOTAL_MISMATCH';
--> statement-breakpoint
INSERT INTO pos_inventory_migration_exceptions
  (exception_type, product_id, variant_id, details)
SELECT
  'STOCK_TOTAL_MISMATCH', current_issue.product_id, current_issue.variant_id, current_issue.details
FROM pos_current_stock_total_mismatches current_issue
WHERE NOT EXISTS (
  SELECT 1
  FROM pos_inventory_migration_exceptions e
  WHERE e.exception_type = 'STOCK_TOTAL_MISMATCH'
    AND e.product_id = current_issue.product_id
    AND e.variant_id <=> current_issue.variant_id
);
--> statement-breakpoint
DROP TEMPORARY TABLE IF EXISTS pos_current_stock_total_mismatches;
--> statement-breakpoint

-- This final preflight is intentionally the last operation before Task 11 schema DDL.
-- If SIGNAL interrupts the migration, the next run drops the surviving procedure first.
DROP PROCEDURE IF EXISTS pos_task11_preflight;
--> statement-breakpoint
CREATE PROCEDURE pos_task11_preflight()
BEGIN
  IF EXISTS (
    SELECT 1 FROM pos_inventory_migration_exceptions
    WHERE exception_type = 'PRODUCT_VARIANT_MISMATCH' AND resolved_at IS NULL
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Task 11 blocked: unresolved PRODUCT_VARIANT_MISMATCH';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pos_inventory_migration_exceptions
    WHERE exception_type = 'STOCK_TOTAL_MISMATCH' AND resolved_at IS NULL
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Task 11 blocked: unresolved STOCK_TOTAL_MISMATCH';
  END IF;
END;
--> statement-breakpoint
CALL pos_task11_preflight();
--> statement-breakpoint
DROP PROCEDURE IF EXISTS pos_task11_preflight;
--> statement-breakpoint

-- Consolidate duplicate scopes before adding the canonical unique index. The rollup
-- and exception synchronization can be rerun after interruption without double-counting.
DROP TEMPORARY TABLE IF EXISTS pos_inventory_scope_rollup;
--> statement-breakpoint
CREATE TEMPORARY TABLE pos_inventory_scope_rollup AS
SELECT
  MIN(id) AS keep_id,
  product_id,
  variant_id,
  store_id,
  warehouse_id,
  SUM(stock) AS combined_stock,
  MAX(low_stock_threshold) AS low_stock_threshold,
  JSON_ARRAYAGG(id) AS inventory_ids,
  COUNT(*) AS row_count
FROM inventory
GROUP BY product_id, variant_id, store_id, warehouse_id
HAVING COUNT(*) > 1;
--> statement-breakpoint
UPDATE pos_inventory_migration_exceptions e
LEFT JOIN pos_inventory_scope_rollup current_issue
  ON current_issue.product_id = e.product_id
 AND current_issue.variant_id <=> e.variant_id
 AND JSON_UNQUOTE(JSON_EXTRACT(e.details, '$.store_id')) <=> current_issue.store_id
 AND JSON_UNQUOTE(JSON_EXTRACT(e.details, '$.warehouse_id')) <=> current_issue.warehouse_id
SET e.resolved_at = CASE
  WHEN current_issue.product_id IS NULL THEN COALESCE(e.resolved_at, CURRENT_TIMESTAMP)
  ELSE NULL
END
WHERE e.exception_type = 'DUPLICATE_SCOPE';
--> statement-breakpoint
INSERT INTO pos_inventory_migration_exceptions
  (exception_type, product_id, variant_id, details)
SELECT
  'DUPLICATE_SCOPE', current_issue.product_id, current_issue.variant_id,
  JSON_OBJECT(
    'store_id', current_issue.store_id,
    'warehouse_id', current_issue.warehouse_id,
    'inventory_ids', current_issue.inventory_ids,
    'row_count', current_issue.row_count,
    'combined_stock', current_issue.combined_stock
  )
FROM pos_inventory_scope_rollup current_issue
WHERE NOT EXISTS (
  SELECT 1 FROM pos_inventory_migration_exceptions e
  WHERE e.exception_type = 'DUPLICATE_SCOPE'
    AND e.product_id = current_issue.product_id
    AND e.variant_id <=> current_issue.variant_id
    AND JSON_UNQUOTE(JSON_EXTRACT(e.details, '$.store_id')) <=> current_issue.store_id
    AND JSON_UNQUOTE(JSON_EXTRACT(e.details, '$.warehouse_id')) <=> current_issue.warehouse_id
);
--> statement-breakpoint
UPDATE inventory i
JOIN pos_inventory_scope_rollup r ON i.id = r.keep_id
SET i.stock = r.combined_stock,
    i.low_stock_threshold = r.low_stock_threshold,
    i.updated_at = CURRENT_TIMESTAMP;
--> statement-breakpoint
DELETE duplicate_row
FROM inventory duplicate_row
JOIN pos_inventory_scope_rollup r
  ON duplicate_row.product_id = r.product_id
 AND duplicate_row.variant_id <=> r.variant_id
 AND duplicate_row.store_id <=> r.store_id
 AND duplicate_row.warehouse_id <=> r.warehouse_id
 AND duplicate_row.id <> r.keep_id;
--> statement-breakpoint
UPDATE pos_inventory_migration_exceptions
SET resolved_at = COALESCE(resolved_at, CURRENT_TIMESTAMP)
WHERE exception_type = 'DUPLICATE_SCOPE' AND resolved_at IS NULL;
--> statement-breakpoint
DROP TEMPORARY TABLE IF EXISTS pos_inventory_scope_rollup;
--> statement-breakpoint

-- Guard each ALTER independently so a partially applied migration can resume safely.
DROP PROCEDURE IF EXISTS pos_task11_apply_schema;
--> statement-breakpoint
CREATE PROCEDURE pos_task11_apply_schema()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory' AND COLUMN_NAME = 'variant_scope_key'
  ) THEN
    ALTER TABLE inventory ADD COLUMN variant_scope_key VARCHAR(36)
      GENERATED ALWAYS AS (COALESCE(variant_id, '')) STORED;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory' AND COLUMN_NAME = 'store_scope_key'
  ) THEN
    ALTER TABLE inventory ADD COLUMN store_scope_key VARCHAR(36)
      GENERATED ALWAYS AS (COALESCE(store_id, '')) STORED;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory' AND COLUMN_NAME = 'warehouse_scope_key'
  ) THEN
    ALTER TABLE inventory ADD COLUMN warehouse_scope_key VARCHAR(36)
      GENERATED ALWAYS AS (COALESCE(warehouse_id, '')) STORED;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory' AND INDEX_NAME = 'inventory_scope_unique'
  ) THEN
    ALTER TABLE inventory ADD UNIQUE KEY inventory_scope_unique
      (product_id, variant_scope_key, store_scope_key, warehouse_scope_key);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stock_transfers' AND COLUMN_NAME = 'store_id'
  ) THEN
    ALTER TABLE stock_transfers ADD COLUMN store_id VARCHAR(36) NULL AFTER reference_no;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stock_transfers' AND INDEX_NAME = 'st_store_id_idx'
  ) THEN
    ALTER TABLE stock_transfers ADD INDEX st_store_id_idx (store_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'stock_transfers'
      AND CONSTRAINT_NAME = 'stock_transfers_store_fk'
      AND CONSTRAINT_TYPE = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE stock_transfers
      ADD CONSTRAINT stock_transfers_store_fk FOREIGN KEY (store_id) REFERENCES stores(id);
  END IF;
END;
--> statement-breakpoint
CALL pos_task11_apply_schema();
--> statement-breakpoint
DROP PROCEDURE IF EXISTS pos_task11_apply_schema;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS pos_purchase_orders (
  id VARCHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  number VARCHAR(64) NOT NULL,
  supplier VARCHAR(200) NOT NULL,
  store_id VARCHAR(36) NOT NULL,
  location_id VARCHAR(36) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ordered',
  created_by VARCHAR(36) NOT NULL,
  received_by VARCHAR(36) NULL,
  idempotency_key VARCHAR(160) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  received_at TIMESTAMP NULL,
  UNIQUE KEY pos_purchase_orders_number_unique (number),
  UNIQUE KEY pos_purchase_orders_idempotency_unique (idempotency_key),
  INDEX pos_purchase_orders_store_status_idx (store_id, status, created_at),
  CONSTRAINT pos_purchase_orders_store_fk FOREIGN KEY (store_id) REFERENCES stores(id),
  CONSTRAINT pos_purchase_orders_location_fk FOREIGN KEY (location_id) REFERENCES warehouses(id),
  CONSTRAINT pos_purchase_orders_created_by_fk FOREIGN KEY (created_by) REFERENCES staff(id),
  CONSTRAINT pos_purchase_orders_received_by_fk FOREIGN KEY (received_by) REFERENCES staff(id),
  CONSTRAINT pos_purchase_orders_status_check CHECK (status IN ('ordered', 'received', 'cancelled'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS pos_purchase_order_items (
  id VARCHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  purchase_order_id VARCHAR(36) NOT NULL,
  product_id VARCHAR(36) NOT NULL,
  variant_id VARCHAR(36) NULL,
  ordered_qty INT NOT NULL,
  received_qty INT NOT NULL DEFAULT 0,
  unit_cost DECIMAL(12,2) NOT NULL,
  INDEX pos_purchase_order_items_order_idx (purchase_order_id),
  INDEX pos_purchase_order_items_product_idx (product_id, variant_id),
  CONSTRAINT pos_purchase_order_items_order_fk FOREIGN KEY (purchase_order_id)
    REFERENCES pos_purchase_orders(id) ON DELETE CASCADE,
  CONSTRAINT pos_purchase_order_items_product_fk FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT pos_purchase_order_items_variant_fk FOREIGN KEY (variant_id) REFERENCES product_variants(id),
  CONSTRAINT pos_purchase_order_items_ordered_qty_check CHECK (ordered_qty > 0),
  CONSTRAINT pos_purchase_order_items_received_qty_check CHECK (received_qty BETWEEN 0 AND ordered_qty),
  CONSTRAINT pos_purchase_order_items_unit_cost_check CHECK (unit_cost >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
