-- Migration 0006: payment_methods table for custom offline/manual payment methods
-- PayPal/Stripe remain code-hardcoded; this table stores COD/bank_transfer/custom

CREATE TABLE payment_methods (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  name_en VARCHAR(128),
  type ENUM('online_gateway', 'offline_manual') NOT NULL DEFAULT 'offline_manual',
  config JSON,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE NOW()
);

-- Seed default offline methods
INSERT INTO payment_methods (id, code, name, name_en, type, enabled, sort_order)
VALUES
  (UUID(), 'cod', '货到付款', 'Cash on Delivery', 'offline_manual', TRUE, 10),
  (UUID(), 'bank_transfer', '银行转账', 'Bank Transfer', 'offline_manual', TRUE, 20);

-- Widen orders.payment_method to fit custom codes
ALTER TABLE orders MODIFY COLUMN payment_method VARCHAR(64);
