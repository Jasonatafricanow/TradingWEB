-- 库存快照表
CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
  stock INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER NOT NULL DEFAULT 10,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS inventory_product_id_idx ON inventory(product_id);

-- 库存变动日志表
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL, -- 'in' | 'out' | 'adjust'
  quantity INTEGER NOT NULL,
  before_stock INTEGER NOT NULL,
  after_stock INTEGER NOT NULL,
  note TEXT,
  operator_id VARCHAR(36),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS inv_tx_product_id_idx ON inventory_transactions(product_id);
CREATE INDEX IF NOT EXISTS inv_tx_created_at_idx ON inventory_transactions(created_at);

-- 员工管理表
CREATE TABLE IF NOT EXISTS staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE,
  role VARCHAR(20) NOT NULL DEFAULT 'support', -- 'admin' | 'operator' | 'support'
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(50),
  avatar_url VARCHAR(500),
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS staff_user_id_idx ON staff(user_id);
CREATE INDEX IF NOT EXISTS staff_role_idx ON staff(role);
CREATE INDEX IF NOT EXISTS staff_email_idx ON staff(email);
