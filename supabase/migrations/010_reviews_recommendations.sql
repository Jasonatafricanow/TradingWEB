-- 商品评论表
CREATE TABLE IF NOT EXISTS product_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id VARCHAR(36) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id UUID,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title VARCHAR(200),
  content TEXT,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  is_approved BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pr_product_id_idx ON product_reviews(product_id);
CREATE INDEX IF NOT EXISTS pr_user_id_idx ON product_reviews(user_id);

-- 商品推荐关联表
CREATE TABLE IF NOT EXISTS product_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id VARCHAR(36) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  recommended_product_id VARCHAR(36) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type VARCHAR(10) NOT NULL DEFAULT 'manual',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rec_product_id_idx ON product_recommendations(product_id);
