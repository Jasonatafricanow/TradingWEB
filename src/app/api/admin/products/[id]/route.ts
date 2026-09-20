import { NextResponse } from "next/server";
import { requireStaffRole, errorResponse } from "@/services/auth/auth-middleware";
import { deleteProduct } from "@/services/admin/products-service";
import { db } from "@/lib/db";
import { products } from "@/storage/database/shared/schema";
import { eq } from "drizzle-orm";
import { normalizeProductPayload } from "@/services/admin/product-payload";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaffRole(request, ['admin', 'operator']);
    const { id } = await params;
    const body = await request.json();

    // 区分三种语义：
    //   1. variants key 不存在 → 不触碰变体（保留旧 variants）
    //   2. variants: []      → 显式空数组，删除全部旧 variants，回退主价格
    //   3. variants: [...]   → upsert 变体，自动推导主价格
    const variantsKeyPresent = "variants" in body && body.variants !== undefined;
    const explicitEmptyArray = variantsKeyPresent && Array.isArray(body.variants) && body.variants.length === 0;
    const variants = variantsKeyPresent && Array.isArray(body.variants) && body.variants.length > 0
      ? body.variants
      : null;

    // 事务化：商品更新 + 变体写入原子执行
    const data = await db.transaction(async (tx) => {
      const updatePayload: Record<string, unknown> = { ...body };
      delete updatePayload.variants;
      delete updatePayload.id;

      if (variants && variants.length > 0) {
        // 情况 3：有变体 → 自动取最低价
        const variantPrices = variants
          .map((v: { price?: string | number }) => Number(v.price))
          .filter((n: number) => Number.isFinite(n) && n >= 0);
        if (variantPrices.length > 0) {
          updatePayload.price = Math.min(...variantPrices).toFixed(2);
        }
      } else if (explicitEmptyArray) {
        // 情况 2：显式空数组 → 保留用户手动填写的价格（不覆盖）
        // updatePayload.price 已经是 body.price（如果有的话），不做修改
      }
      // 情况 1（variants key 不存在）：不修改 price，保持原样

      await tx.update(products).set(normalizeProductPayload(updatePayload) as Partial<typeof products.$inferInsert>).where(eq(products.id, id));

      // 写入/删除变体
      if (explicitEmptyArray) {
        // 情况 2：删除全部旧变体
        const { productVariants } = await import("@/storage/database/shared/schema");
        await tx.delete(productVariants).where(eq(productVariants.product_id, id));
      } else if (variants !== null) {
        // 情况 3：upsert 变体
        const { bulkSaveVariantsWithTx } = await import("@/services/products/variant-service");
        await bulkSaveVariantsWithTx(id, variants, tx);
      }
      // 情况 1：不触碰变体

      const [updated] = await tx.select().from(products).where(eq(products.id, id)).limit(1);
      return updated;
    });

    return NextResponse.json({ data });
  } catch (err) {
    console.error("[PUT /api/admin/products/[id]] 更新商品失败:", err);
    return errorResponse(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaffRole(request, ['admin', 'operator']);
    const { id } = await params;

    await deleteProduct(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err);
  }
}
