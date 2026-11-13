/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // 手机预览时不显示开发指示器，避免遮挡底部购买条
  devIndicators: false,
  // 允许局域网设备（手机预览）访问开发期资源；可用 DEV_ALLOWED_ORIGINS 追加
  allowedDevOrigins: [
    '192.168.5.201',
    'localhost',
    '127.0.0.1',
    ...(process.env.DEV_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  ],
  images: {
    // 商品与场景图均为 public 下已压缩的本地静态资产（长边 1400px）。
    // 直接服务可省去 sharp 转码的内存与首帧延迟，避免图片长时间空白。
    unoptimized: true,
    remotePatterns: ['cdn.shopify.com', 'images.unsplash.com', ...(process.env.IMAGE_ALLOWED_HOSTS || '').split(',')]
      .map(hostname => hostname.trim()).filter(Boolean)
      .map(hostname => ({ protocol: 'https', hostname, pathname: '/**' })),
  },
  // Turbopack 构建（Next.js 16 默认）
  turbopack: {},
};

export default nextConfig;