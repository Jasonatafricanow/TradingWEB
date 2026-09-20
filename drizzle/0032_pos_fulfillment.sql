-- Task 12: structured pickup fulfillment and indexed POS order pagination.
-- Rerunnable so disposable-database preflight can be repeated safely.
DROP PROCEDURE IF EXISTS pos_task12_apply_schema;
--> statement-breakpoint
CREATE PROCEDURE pos_task12_apply_schema()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'pickup_contact_name'
  ) THEN
    ALTER TABLE orders ADD COLUMN pickup_contact_name VARCHAR(100) NULL AFTER buyer_phone;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'pickup_phone'
  ) THEN
    ALTER TABLE orders ADD COLUMN pickup_phone VARCHAR(50) NULL AFTER pickup_contact_name;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'pickup_store_id'
  ) THEN
    ALTER TABLE orders ADD COLUMN pickup_store_id VARCHAR(36) NULL AFTER pickup_phone;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'pickup_ready_at'
  ) THEN
    ALTER TABLE orders ADD COLUMN pickup_ready_at TIMESTAMP NULL AFTER pickup_store_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'picked_up_at'
  ) THEN
    ALTER TABLE orders ADD COLUMN picked_up_at TIMESTAMP NULL AFTER pickup_ready_at;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'orders_store_created_idx'
  ) THEN
    CREATE INDEX orders_store_created_idx ON orders (store_id, created_at, id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'orders_customer_created_idx'
  ) THEN
    CREATE INDEX orders_customer_created_idx ON orders (user_id, created_at, id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'orders_pickup_status_idx'
  ) THEN
    CREATE INDEX orders_pickup_status_idx ON orders (pickup_store_id, fulfillment_status, created_at);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'orders'
      AND CONSTRAINT_NAME = 'orders_pickup_store_fk' AND CONSTRAINT_TYPE = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_pickup_store_fk FOREIGN KEY (pickup_store_id) REFERENCES stores(id);
  END IF;
END;
--> statement-breakpoint
CALL pos_task12_apply_schema();
--> statement-breakpoint
DROP PROCEDURE IF EXISTS pos_task12_apply_schema;
