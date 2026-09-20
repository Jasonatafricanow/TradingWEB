import { NextResponse } from "next/server";
import { getProductById } from "@/services/products/product-service";
import { getVariants } from "@/services/products/variant-service";
import { asc, eq } from "drizzle-orm";
import { IS_DEMO_MODE } from "@/config/constants";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await getProductById(id);
    if (!data) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // 附带变体价格区间，方便前台渲染价格范围
    const variantsResult = await getVariants(id);
    const variantPrices = (variantsResult.data || [])
      .map((v: { price?: string | number }) => Number(v.price))
      .filter((n: number) => Number.isFinite(n) && n >= 0);

    const price_range = variantPrices.length > 0
      ? { min: Math.min(...variantPrices).toFixed(2), max: Math.max(...variantPrices).toFixed(2) }
      : null;

    const images = IS_DEMO_MODE
      ? []
      : await (async () => {
          const [{ db }, { productImages }] = await Promise.all([
            import("@/lib/db"),
            import("@/storage/database/shared/schema"),
          ]);
          return db
            .select({
              id: productImages.id,
              src: productImages.src,
              original_url: productImages.original_url,
              alt: productImages.alt,
              variant_id: productImages.variant_id,
              position: productImages.position,
              mirror_status: productImages.mirror_status,
            })
            .from(productImages)
            .where(eq(productImages.product_id, id))
            .orderBy(asc(productImages.position), asc(productImages.created_at));
        })();

    return NextResponse.json({ data: { ...(data as object), price_range, images } });
  } catch (err) {
    const message = err instanceof Error ? (err as Error).message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
