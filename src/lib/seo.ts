/**
 * SEO 工具函数 — JSON-LD 结构化数据生成
 */

export interface ProductSEO {
  id: string
  title: string
  description?: string
  price: string
  currency?: string
  image?: string
  type: string
  availability?: "InStock" | "OutOfStock" | "PreOrder"
}

/** 生成 Product Schema (JSON-LD) */
export function productJsonLd(product: ProductSEO): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description || `${product.title} - GlobalTrade Hub`,
    image: product.image || undefined,
    offers: {
      "@type": "Offer",
      price: product.price,
      priceCurrency: product.currency || "USD",
      availability: `https://schema.org/${product.availability || "InStock"}`,
      url: `${process.env.NEXT_PUBLIC_SITE_URL || "https://globaltrade-hub.com"}/products/${product.id}`,
    },
  })
}

/** 生成 Organization Schema (JSON-LD) */
export function organizationJsonLd(): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "GlobalTrade Hub",
    description: "Cross-border consulting services and digital goods platform",
    url: process.env.NEXT_PUBLIC_SITE_URL || "https://globaltrade-hub.com",
    contactPoint: {
      "@type": "ContactPoint",
      telephone: "+1-800-GLOBALTRADE",
      contactType: "customer service",
    },
    sameAs: [],
  })
}

/** 生成 BreadcrumbList Schema (JSON-LD) */
export function breadcrumbJsonLd(items: { name: string; url: string }[]): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  })
}

/** 将 JSON-LD 注入页面 head */
export function jsonLdScript(json: string): string {
  return `<script type="application/ld+json">${json}</script>`
}
