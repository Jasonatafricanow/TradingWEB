-- Product Variants Migration
-- Run this on your MySQL/MariaDB database to add product variants support

CREATE TABLE IF NOT EXISTS product_variants (
  id varchar(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  product_id varchar(36) NOT NULL,
  title varchar(200) DEFAULT NULL,
  sku varchar(100) DEFAULT NULL,
  price decimal(10,2) NOT NULL,
  compare_at_price decimal(10,2) DEFAULT NULL,
  cost decimal(10,2) DEFAULT NULL,
  weight decimal(10,2) DEFAULT NULL,
  weight_unit varchar(10) DEFAULT 'kg',
  stock int NOT NULL DEFAULT 0,
  option1 varchar(255) DEFAULT NULL,
  option2 varchar(255) DEFAULT NULL,
  option3 varchar(255) DEFAULT NULL,
  position int DEFAULT 1,
  is_default tinyint NOT NULL DEFAULT 0,
  image varchar(500) DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NULL DEFAULT NULL,
  KEY pv_product_id_idx (product_id),
  KEY pv_sku_idx (sku),
  CONSTRAINT fk_pv_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
