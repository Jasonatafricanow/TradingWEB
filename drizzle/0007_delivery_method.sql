-- Migration 0007: delivery_method expansion for order_items + products
-- Adds delivery_method snapshot to order_items; widens products.delivery_method for multi-value

-- 1. 订单明细增加交付方式快照列
ALTER TABLE order_items
  ADD COLUMN delivery_method VARCHAR(32) NULL
  COMMENT '下单时用户选择的交付方式（快照）';
--> statement-breakpoint

-- 2. 历史订单回填：从关联商品读取交付方式
UPDATE order_items oi
  JOIN products p ON oi.product_id = p.id
SET oi.delivery_method = p.delivery_method
WHERE oi.delivery_method IS NULL AND p.delivery_method IS NOT NULL;
--> statement-breakpoint

-- 3. 商品交付方式列扩容（支持逗号分隔多值）
ALTER TABLE products
  MODIFY COLUMN delivery_method VARCHAR(255) NULL
  COMMENT '交付方式（逗号分隔多值，如 online,email,download）';