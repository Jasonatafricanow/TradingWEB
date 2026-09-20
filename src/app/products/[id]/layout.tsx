import { db } from "@/lib/db";
import { products } from "@/storage/database/shared/schema";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";

type Props = {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id } = await params;
    const [product] = await db
      .select({
        id: products.id,
        title: products.title,
        title_en: products.title_en,
        title_pt: products.title_pt,
        description: products.description,
        description_en: products.description_en,
        description_pt: products.description_pt,
        meta_title: products.meta_title,
        meta_title_pt: products.meta_title_pt,
        meta_description: products.meta_description,
        meta_description_pt: products.meta_description_pt,
        image_key: products.image_key,
      })
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    if (!product) {
      return { title: "Product Not Found" };
    }

    // Fallback: _pt → _en → base
    const title = product.meta_title_pt || product.meta_title || product.title_pt || product.title_en || product.title;
    const description = product.meta_description_pt || product.meta_description || product.description_pt || product.description_en || product.description || "";

    return {
      title,
      description: description.slice(0, 160),
      openGraph: {
        title: `${title} | GlobalTrade Hub`,
        description: description.slice(0, 160),
        type: "website",
        images: product.image_key
          ? [{ url: product.image_key }]
          : undefined,
      },
    };
  } catch {
    return { title: "Product" };
  }
}

export default function ProductLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
