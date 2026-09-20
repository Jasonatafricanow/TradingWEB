-- 优惠券/折扣码表
CREATE TABLE IF NOT EXISTS coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  type VARCHAR(10) NOT NULL,        -- 'percentage' | 'fixed'
  value DECIMAL(10,2) NOT NULL,
  min_order_amount DECIMAL(10,2) DEFAULT 0,
  max_discount DECIMAL(10,2),
  usage_limit INTEGER DEFAULT 0,
  used_count INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS coupons_code_idx ON coupons(code);
CREATE INDEX IF NOT EXISTS coupons_expires_at_idx ON coupons(expires_at);

-- 订单表增加优惠券字段
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_id VARCHAR(36);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2);
