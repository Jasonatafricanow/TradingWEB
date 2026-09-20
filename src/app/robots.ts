import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/_next/', '/static/', '/admin/'],
    },
    sitemap: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://globaltrade-hub.com'}/sitemap.xml`,
  };
}
