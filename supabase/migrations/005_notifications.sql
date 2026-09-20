-- 邮件模板表
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  subject VARCHAR(200) NOT NULL,
  body_html TEXT NOT NULL,
  variables TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS et_key_idx ON email_templates(key);

-- 邮件发送日志
CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email VARCHAR(255) NOT NULL,
  subject VARCHAR(200) NOT NULL,
  template_key VARCHAR(50),
  status VARCHAR(20) NOT NULL DEFAULT 'sent',
  error TEXT,
  order_id VARCHAR(36),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS el_created_at_idx ON email_logs(created_at);

-- 弃单追踪
CREATE TABLE IF NOT EXISTS abandoned_carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  email VARCHAR(255),
  items JSONB,
  total DECIMAL(10,2),
  coupon_id VARCHAR(36),
  coupon_sent BOOLEAN NOT NULL DEFAULT false,
  notified_at TIMESTAMPTZ,
  abandoned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recovered_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ac_user_id_idx ON abandoned_carts(user_id);
CREATE INDEX IF NOT EXISTS ac_abandoned_at_idx ON abandoned_carts(abandoned_at);
