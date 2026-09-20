-- 页面访问统计表
CREATE TABLE IF NOT EXISTS page_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path VARCHAR(500) NOT NULL,
  title VARCHAR(500),
  referrer TEXT,
  user_agent VARCHAR(500),
  ip_anonymized VARCHAR(64),
  country VARCHAR(100),
  visitor_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pv_path_idx ON page_views(path);
CREATE INDEX IF NOT EXISTS pv_created_at_idx ON page_views(created_at);
CREATE INDEX IF NOT EXISTS pv_visitor_id_idx ON page_views(visitor_id);
