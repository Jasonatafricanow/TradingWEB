import { MetadataRoute } from "next"
import { db } from "@/lib/db"
import { products, categories } from "@/storage/database/shared/schema"
import { eq } from "drizzle-orm"
import { IS_DEMO_MODE } from "@/config/constants"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://globaltrade-hub.com"
  const entries: MetadataRoute.Sitemap = []

  // Static pages
  const staticPages = ["", "/products", "/orders", "/account", "/cart", "/checkout"]
  for (const page of staticPages) {
    entries.push({
      url: `${baseUrl}${page}`,
      lastModified: new Date(),
      changeFrequency: page === "" ? "weekly" : "monthly",
      priority: page === "" ? 1.0 : 0.6,
    })
  }

  if (IS_DEMO_MODE) {
    return entries
  }

  try {
    // Products - use Drizzle ORM with MySQL
    const activeProducts = await db
      .select({ id: products.id, updated_at: products.updated_at })
      .from(products)
      .where(eq(products.status, "active"))
      .limit(1000)

    for (const product of activeProducts) {
      entries.push({
        url: `${baseUrl}/products/${product.id}`,
        lastModified: new Date(product.updated_at || Date.now()),
        changeFrequency: "weekly",
        priority: 0.8,
      })
    }

    // Categories
    const allCategories = await db
      .select({ id: categories.id, updated_at: categories.updated_at })
      .from(categories)
      .limit(100)

    for (const cat of allCategories) {
      entries.push({
        url: `${baseUrl}/products?category=${cat.id}`,
        lastModified: new Date(cat.updated_at || Date.now()),
        changeFrequency: "monthly",
        priority: 0.5,
      })
    }
  } catch (err) {
    console.warn("Sitemap generation error:", err)
  }

  return entries
}
