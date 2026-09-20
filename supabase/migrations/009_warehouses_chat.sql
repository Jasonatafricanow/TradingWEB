-- 仓库表
CREATE TABLE IF NOT EXISTS warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  location VARCHAR(200),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 默认主仓库
INSERT INTO warehouses (id, name, location, is_active) 
VALUES ('00000000-0000-0000-0000-000000000001', '主仓库', '默认', true)
ON CONFLICT DO NOTHING;

-- 库存表加 warehouse_id
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS warehouse_id VARCHAR(36) REFERENCES warehouses(id);

-- 调拨表
CREATE TABLE IF NOT EXISTS stock_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id VARCHAR(36) NOT NULL REFERENCES products(id),
  from_warehouse_id VARCHAR(36) NOT NULL REFERENCES warehouses(id),
  to_warehouse_id VARCHAR(36) NOT NULL REFERENCES warehouses(id),
  quantity INT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  note TEXT,
  operator_id VARCHAR(36),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS st_product_id_idx ON stock_transfers(product_id);
CREATE INDEX IF NOT EXISTS st_status_idx ON stock_transfers(status);

-- AI客服对话
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  title VARCHAR(200),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  assigned_to VARCHAR(36),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

-- 客服消息
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id VARCHAR(36) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS msg_conversation_id_idx ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS msg_created_at_idx ON messages(created_at);
