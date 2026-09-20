-- 退款/售后表
CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id VARCHAR(36) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id VARCHAR(36),
  user_id UUID,
  reason TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  evidence TEXT,
  admin_note TEXT,
  restocked BOOLEAN NOT NULL DEFAULT false,
  processed_by VARCHAR(36),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS refunds_order_id_idx ON refunds(order_id);
CREATE INDEX IF NOT EXISTS refunds_status_idx ON refunds(status);

-- 订单表增加退款标记
ALTER TABLE orders ADD COLUMN IF NOT EXISTS has_refund BOOLEAN NOT NULL DEFAULT false;
