import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole, errorResponse } from "@/services/auth/auth-middleware";
import { db } from "@/lib/db";
import { products, productVariants, categories, inventory } from "@/storage/database/shared/schema";
import { eq, desc, asc, sql } from "drizzle-orm";
import { escapeCsvField } from "@/lib/csv";

export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);

    const url = new URL(request.url);
    const categoryFilter = url.searchParams.get("category");
    const statusFilter = url.searchParams.get("status");

    // Fetch all products
    let allProducts = await db.select().from(products).orderBy(desc(products.created_at));

    // Filter by status
    if (statusFilter && statusFilter !== "all") {
      allProducts = allProducts.filter((p) => p.status === statusFilter);
    }

    // Filter by category
    if (categoryFilter && categoryFilter !== "all") {
      allProducts = allProducts.filter((p) => p.category_id === categoryFilter);
    }

    // Get categories for lookup
    const allCategories = await db.select().from(categories);
    const catMap = new Map(allCategories.map((c) => [c.id, c.name || ""]));

    // Build CSV
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

    const csvRows = [headers.map(escapeCsvField).join(",")];

    for (const product of allProducts) {
      // Get variants for this product
      let variantsStr = "";
      try {
        const vRecords = await db
          .select()
          .from(productVariants)
          .where(eq(productVariants.product_id, product.id))
          .orderBy(asc(productVariants.position));
        const stockRows = await db.select({
          variantId: inventory.variant_id,
          stock: sql<number>`COALESCE(SUM(${inventory.stock}), 0)`,
        }).from(inventory).where(eq(inventory.product_id, product.id)).groupBy(inventory.variant_id);
        const stockByVariant = new Map(stockRows.map((row) => [row.variantId, Number(row.stock)]));
        if (vRecords.length > 0) {
          variantsStr = JSON.stringify(
            vRecords.map((v) => ({
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
            }))
          );
        }
      } catch {
        // skip variants on error
      }

      const categoryName = catMap.get(product.category_id) || "";

      const row = [
        product.title,
        product.title_en || "",
        product.title_pt || "",
        product.description || "",
        product.description_en || "",
        product.description_pt || "",
        product.price,
        product.compare_at_price || "",
        product.cost_price || "",
        categoryName,
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

      csvRows.push(row.map(escapeCsvField).join(","));
    }

    const csvContent = csvRows.join("\n");

    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="products-export.csv"',
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
