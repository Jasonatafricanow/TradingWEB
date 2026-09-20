-- ==================== 核心基础表 ====================
-- 依赖: Supabase Auth (auth.users)
-- 本迁移必须在 001-010 之前执行

-- 商品分类表
CREATE TABLE IF NOT EXISTS categories (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  name_en VARCHAR(100),
  name_ja VARCHAR(100),
  name_es VARCHAR(100),
  type VARCHAR(20) NOT NULL DEFAULT 'service',    -- service | virtual
  icon VARCHAR(50),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS categories_type_idx ON categories(type);
CREATE INDEX IF NOT EXISTS categories_sort_order_idx ON categories(sort_order);

-- 商品表（个人咨询服务 + 虚拟商品）
CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  title_en VARCHAR(200),
  title_ja VARCHAR(200),
  title_es VARCHAR(200),
  description TEXT,
  description_en TEXT,
  description_ja TEXT,
  description_es TEXT,
  price DECIMAL(10,2) NOT NULL,
  category_id VARCHAR(36) NOT NULL REFERENCES categories(id),
  type VARCHAR(20) NOT NULL DEFAULT 'service',    -- service | virtual
  image_key VARCHAR(500),
  seller_id UUID NOT NULL DEFAULT auth.uid(),
  status VARCHAR(20) NOT NULL DEFAULT 'active',   -- active | inactive | sold
  duration VARCHAR(50),                            -- 咨询服务时长 e.g. "30min"
  delivery_method VARCHAR(50),                     -- online | email | download
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS products_category_id_idx ON products(category_id);
CREATE INDEX IF NOT EXISTS products_seller_id_idx ON products(seller_id);
CREATE INDEX IF NOT EXISTS products_status_idx ON products(status);
CREATE INDEX IF NOT EXISTS products_type_idx ON products(type);
CREATE INDEX IF NOT EXISTS products_created_at_idx ON products(created_at);

-- 订单表
CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid(),
  order_no VARCHAR(32) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | paid | processing | completed | cancelled | refunded
  total_amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  payment_method VARCHAR(20),                      -- paypal | visa | stripe
  payment_status VARCHAR(20) DEFAULT 'unpaid',     -- unpaid | paid | failed | refunded
  payment_id VARCHAR(200),                         -- 支付平台交易ID
  buyer_email VARCHAR(255),
  buyer_name VARCHAR(128),
  notes TEXT,
  coupon_id VARCHAR(36),
  discount_amount DECIMAL(10,2),
  has_refund BOOLEAN NOT NULL DEFAULT false,
  affiliate_code VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS orders_user_id_idx ON orders(user_id);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status);
CREATE INDEX IF NOT EXISTS orders_order_no_idx ON orders(order_no);
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders(created_at);

-- 订单明细表
CREATE TABLE IF NOT EXISTS order_items (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id VARCHAR(36) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id VARCHAR(36) NOT NULL REFERENCES products(id),
  product_title VARCHAR(200) NOT NULL,
  product_type VARCHAR(20) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items(order_id);
CREATE INDEX IF NOT EXISTS order_items_product_id_idx ON order_items(product_id);

-- 客户地址表
CREATE TABLE IF NOT EXISTS customer_addresses (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  label VARCHAR(50),                               -- 家 / 公司 / 学校
  phone VARCHAR(50),
  address_line1 VARCHAR(200) NOT NULL,
  address_line2 VARCHAR(200),
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100),
  zip VARCHAR(20),
  country VARCHAR(100) NOT NULL DEFAULT 'Moz',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ca_user_id_idx ON customer_addresses(user_id);

-- 用户档案表（关联 auth.users）
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255),
  display_name VARCHAR(100),
  avatar_url VARCHAR(500),
  locale VARCHAR(10) DEFAULT 'en',
  currency VARCHAR(3) DEFAULT 'USD',
  is_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS profiles_email_idx ON profiles(email);

-- 新用户注册时自动创建档案
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, locale)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'locale', 'en')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 仅在 trigger 不存在时创建（幂等）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION handle_new_user();
  END IF;
END;
$$;
