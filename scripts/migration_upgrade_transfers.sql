-- Migration: Upgrade stock_transfers ? multi-SKU warehouse transfers
ALTER TABLE stock_transfers
  ADD COLUMN IF NOT EXISTS reference_no varchar(50) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS shipping_method varchar(30) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS packaging_info json DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS unit_cost decimal(12,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS total_cost decimal(12,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS initiated_by varchar(36) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS approved_by varchar(36) DEFAULT NULL;

CREATE TABLE IF NOT EXISTS transfer_items (
  id varchar(36) NOT NULL PRIMARY KEY,
  transfer_id varchar(36) NOT NULL,
  product_id varchar(36) NOT NULL,
  variant_id varchar(36) DEFAULT NULL,
  quantity decimal(12,2) NOT NULL,
  unit_cost decimal(12,2) DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ti_transfer_id (transfer_id),
  KEY idx_ti_product_id (product_id),
  CONSTRAINT fk_ti_transfer FOREIGN KEY (transfer_id) REFERENCES stock_transfers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
