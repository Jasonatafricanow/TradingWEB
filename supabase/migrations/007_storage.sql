-- 创建 Supabase Storage bucket 用于商品图片
INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- 允许公开读取
CREATE POLICY "Public Read" ON storage.objects FOR SELECT USING (bucket_id = 'product-images');

-- 仅认证用户可以上传
CREATE POLICY "Auth Upload" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'product-images' AND auth.role() = 'authenticated'
);
