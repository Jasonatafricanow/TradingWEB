-- 审计日志表
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(36),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id VARCHAR(36),
  details JSONB,
  ip_address VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS al_user_id_idx ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS al_entity_type_idx ON audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS al_created_at_idx ON audit_logs(created_at);

-- 心愿单表
CREATE TABLE IF NOT EXISTS wishlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  product_id VARCHAR(36) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);
CREATE INDEX IF NOT EXISTS wi_user_id_idx ON wishlist_items(user_id);
CREATE INDEX IF NOT EXISTS wi_product_id_idx ON wishlist_items(product_id);
