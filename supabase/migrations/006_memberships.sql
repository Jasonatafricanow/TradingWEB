-- 会员等级表
CREATE TABLE IF NOT EXISTS membership_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL,
  level INT NOT NULL UNIQUE,
  min_total_spent DECIMAL(10,2) NOT NULL DEFAULT 0,
  discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  badge_color VARCHAR(20),
  benefits TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS mt_level_idx ON membership_tiers(level);

-- 用户会员表
CREATE TABLE IF NOT EXISTS user_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  tier_id VARCHAR(36),
  total_spent DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_orders INT NOT NULL DEFAULT 0,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS um_user_id_idx ON user_memberships(user_id);

-- 默认会员等级
INSERT INTO membership_tiers (level, name, min_total_spent, discount_percent, badge_color, benefits) VALUES
  (1, '普通会员', 0, 0, '#9ca3af', '基础购物权益'),
  (2, '白银会员', 100, 3, '#94a3b8', '订单 3% 折扣、优先客服'),
  (3, '黄金会员', 500, 5, '#f59e0b', '订单 5% 折扣、优先客服、专属活动'),
  (4, '铂金会员', 2000, 8, '#6366f1', '订单 8% 折扣、生日礼券、专属活动、优先发货'),
  (5, '钻石会员', 5000, 12, '#ec4899', '12% 折扣、专属经理、生日礼券、极速客服、所有活动')
ON CONFLICT (level) DO NOTHING;
