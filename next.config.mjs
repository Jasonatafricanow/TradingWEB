/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: ['cdn.shopify.com', 'images.unsplash.com', ...(process.env.IMAGE_ALLOWED_HOSTS || '').split(',')]
      .map(hostname => hostname.trim()).filter(Boolean)
      .map(hostname => ({ protocol: 'https', hostname, pathname: '/**' })),
  },
  // Turbopack 构建（Next.js 16 默认）
  turbopack: {},
};

export default nextConfig;
