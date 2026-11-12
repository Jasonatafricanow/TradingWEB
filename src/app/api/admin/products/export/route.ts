import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole, errorResponse } from "@/services/auth/auth-middleware";
import { db } from "@/lib/db";
import { products, productVariants, categories, inventory } from "@/storage/database/shared/schema";
import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { csvStream } from "@/lib/csv";

export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);

    const url = new URL(request.url);
    const categoryFilter = url.searchParams.get("category");
    const statusFilter = url.searchParams.get("status");

    const conditions: SQL[] = [];
    if (statusFilter && statusFilter !== "all") conditions.push(eq(products.status, statusFilter));
    if (categoryFilter && categoryFilter !== "all") conditions.push(eq(products.category_id, categoryFilter));

    const allCategories = await db.select().from(categories);
    const catMap = new Map(allCategories.map((c) => [c.id, c.name || ""]));

    const headers = [
      "Title",
      "Title_EN",
      "Title_PT",
      "Description",
      "Description_EN",
      "Description_PT",
      "Price",
      "Compare_At_Price",
      "Cost_Price",
      "Category",
      "Status",
      "Type",
      "Delivery_Method",
      "Duration",
      "Barcode",
      "Vendor",
      "Collection",
      "Tags",
      "Meta_Title",
      "Meta_Title_PT",
      "Meta_Description",
      "Meta_Description_PT",
      "Variants",
    ];


    // Filters run in SQL and variants/stock load once per page, not per product.
    const fetchPage = async (offset: number, limit: number) => {
      const page = await db.select().from(products)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(asc(products.created_at), asc(products.id))
        .limit(limit).offset(offset);
      if (page.length === 0) return [];
      const ids = page.map((product) => product.id);
      const variantRows = await db.select().from(productVariants)
        .where(inArray(productVariants.product_id, ids))
        .orderBy(asc(productVariants.product_id), asc(productVariants.position));
      const stockRows = await db.select({
        variantId: inventory.variant_id,
        stock: sql<number>`COALESCE(SUM(${inventory.stock}), 0)`,
      }).from(inventory).where(inArray(inventory.product_id, ids)).groupBy(inventory.variant_id);
      const stockByVariant = new Map(stockRows.map((row) => [row.variantId, Number(row.stock)]));
      const variantsByProduct = new Map<string, typeof variantRows>();
      for (const variant of variantRows) {
        const list = variantsByProduct.get(variant.product_id) ?? [];
        list.push(variant);
        variantsByProduct.set(variant.product_id, list);
      }

      return page.map((product) => {
        const vRecords = variantsByProduct.get(product.id) ?? [];
        const variantsStr = vRecords.length === 0 ? "" : JSON.stringify(vRecords.map((v) => ({
          title: v.title || "",
          sku: v.sku || "",
          barcode: v.barcode || "",
          price: v.price,
          compare_at_price: v.compare_at_price || "",
          cost: v.cost || "",
          stock: stockByVariant.get(v.id) ?? 0,
          weight: v.weight || "",
          weight_unit: v.weight_unit || "kg",
          option1: v.option1 || "",
          option2: v.option2 || "",
          option3: v.option3 || "",
          image: v.image || "",
          is_default: Boolean(v.is_default),
        })));
        return [
          product.title,
          product.title_en || "",
          product.title_pt || "",
          product.description || "",
          product.description_en || "",
          product.description_pt || "",
          product.price,
          product.compare_at_price || "",
          product.cost_price || "",
          catMap.get(product.category_id) || "",
          product.status,
          product.type,
          product.delivery_method || "",
          product.duration || "",
          product.barcode || "",
          product.vendor || "",
          product.collection || "",
          product.tags || "",
          product.meta_title || "",
          product.meta_title_pt || "",
          product.meta_description || "",
          product.meta_description_pt || "",
          variantsStr,
        ];
      });
    };

    return new NextResponse(csvStream(headers, fetchPage), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="products-export.csv"',
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
