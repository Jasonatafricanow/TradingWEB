/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: ['@langchain/core', '@langchain/openai', 'langchain'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*',
        pathname: '/**',
      },
    ],
  },
  // Turbopack 构建（Next.js 16 默认）
  turbopack: {},
};

export default nextConfig;
