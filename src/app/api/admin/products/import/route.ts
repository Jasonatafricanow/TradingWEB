import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole, errorResponse } from "@/services/auth/auth-middleware";
import { db } from "@/lib/db";
import { products, productVariants, categories } from "@/storage/database/shared/schema";
import { randomUUID } from "node:crypto";
import { normalizeProductPayload } from "@/services/admin/product-payload";

interface ImportProduct {
  title: string;
  title_en?: string;
  title_pt?: string;
  description?: string;
  description_en?: string;
  description_pt?: string;
  price: string | number;
  compare_at_price?: string | number;
  cost_price?: string | number;
  category?: string;
  status?: string;
  type?: string;
  delivery_method?: string;
  duration?: string;
  barcode?: string;
  vendor?: string;
  collection?: string;
  tags?: string;
  meta_title?: string;
  meta_title_pt?: string;
  meta_description?: string;
  meta_description_pt?: string;
  variants?: string;
}

interface ParsedVariant {
  title?: string | null;
  sku?: string | null;
  barcode?: string | null;
  price?: string | number | null;
  compare_at_price?: string | number | null;
  cost?: string | number | null;
  weight?: string | number | null;
  weight_unit?: string | null;
  stock?: string | number | null;
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
  image?: string | null;
  is_default?: boolean | string | number | null;
}

function pickString(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null) return String(value).trim();
  }
  return "";
}

function optionalDecimal(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error(`${field} must be a non-negative number`);
  }
  return numeric.toFixed(2);
}

function stockOrZero(value: unknown): number {
  if (value === undefined || value === null || value === "") return 0;
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 0) {
    throw new Error("Variant stock must be a non-negative integer");
  }
  return numeric;
}

function boolValue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return ["1", "true", "yes", "y"].includes(value.trim().toLowerCase());
  return false;
}

function scalarValue(value: unknown): string | number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" || typeof value === "number") return value;
  return String(value);
}

function boolLikeValue(value: unknown): boolean | string | number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean" || typeof value === "string" || typeof value === "number") return value;
  return String(value);
}

function parseVariants(raw: string, fallbackPrice: number): ParsedVariant[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) throw new Error("Variants JSON must be an array");
    return parsed.map((item) => {
      if (!item || typeof item !== "object") throw new Error("Each variant must be an object");
      const obj = item as Record<string, unknown>;
      return {
        title: obj.title ? String(obj.title) : null,
        sku: obj.sku ? String(obj.sku) : null,
        barcode: obj.barcode ? String(obj.barcode) : null,
        price: scalarValue(obj.price) ?? fallbackPrice,
        compare_at_price: scalarValue(obj.compare_at_price),
        cost: scalarValue(obj.cost),
        weight: scalarValue(obj.weight),
        weight_unit: obj.weight_unit ? String(obj.weight_unit) : null,
        stock: scalarValue(obj.stock) ?? scalarValue(obj.inventory_quantity) ?? 0,
        option1: obj.option1 ? String(obj.option1) : null,
        option2: obj.option2 ? String(obj.option2) : null,
        option3: obj.option3 ? String(obj.option3) : null,
        image: obj.image ? String(obj.image) : null,
        is_default: boolLikeValue(obj.is_default),
      };
    });
  }

  return trimmed.split(";").filter(Boolean).map((item) => {
    const parts = item.split(":").map((s) => s.trim());
    return {
      title: parts[0] || null,
      price: parts[1] || fallbackPrice,
      stock: parts[2] || 0,
      sku: parts[3] || null,
      barcode: parts[4] || null,
      compare_at_price: parts[5] || null,
      cost: parts[6] || null,
      weight: parts[7] || null,
      weight_unit: parts[8] || null,
      image: parts[9] || null,
      is_default: parts[10] || null,
      option1: parts[11] || null,
      option2: parts[12] || null,
      option3: parts[13] || null,
    };
  });
}

export async function POST(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const body = await request.json();
    const { products: importProducts }: { products: ImportProduct[] } = body;

    if (!importProducts || !Array.isArray(importProducts) || importProducts.length === 0) {
      return NextResponse.json({ error: "No products provided" }, { status: 400 });
    }

    // Fetch all categories for lookup
    const allCategories = await db.select().from(categories);
    const categoryMap = new Map<string, string>();
    for (const cat of allCategories) {
      if (cat.name) categoryMap.set(cat.name.toLowerCase(), cat.id);
      if (cat.name_en) categoryMap.set(cat.name_en.toLowerCase(), cat.id);
    }

    let imported = 0;
    let failed = 0;
    const errors: { row: number; error: string }[] = [];

    for (let i = 0; i < importProducts.length; i++) {
      const rawRow = importProducts[i] as unknown as Record<string, unknown>;
      const row: ImportProduct = {
        title: pickString(rawRow, "title", "Title"),
        title_en: pickString(rawRow, "title_en", "Title_EN", "Title EN"),
        title_pt: pickString(rawRow, "title_pt", "Title_PT", "Title PT"),
        description: pickString(rawRow, "description", "Description"),
        description_en: pickString(rawRow, "description_en", "Description_EN", "Description EN"),
        description_pt: pickString(rawRow, "description_pt", "Description_PT", "Description PT"),
        price: pickString(rawRow, "price", "Price"),
        compare_at_price: pickString(rawRow, "compare_at_price", "Compare_At_Price", "Compare At Price", "Compare-at Price"),
        cost_price: pickString(rawRow, "cost_price", "Cost_Price", "Cost Price"),
        category: pickString(rawRow, "category", "Category"),
        status: pickString(rawRow, "status", "Status").toLowerCase(),
        type: pickString(rawRow, "type", "Type").toLowerCase(),
        delivery_method: pickString(rawRow, "delivery_method", "Delivery_Method", "Delivery Method"),
        duration: pickString(rawRow, "duration", "Duration"),
        barcode: pickString(rawRow, "barcode", "Barcode", "Variant Barcode"),
        vendor: pickString(rawRow, "vendor", "Vendor"),
        collection: pickString(rawRow, "collection", "Collection"),
        tags: pickString(rawRow, "tags", "Tags"),
        meta_title: pickString(rawRow, "meta_title", "Meta_Title", "Meta Title"),
        meta_title_pt: pickString(rawRow, "meta_title_pt", "Meta_Title_PT", "Meta Title PT"),
        meta_description: pickString(rawRow, "meta_description", "Meta_Description", "Meta Description"),
        meta_description_pt: pickString(rawRow, "meta_description_pt", "Meta_Description_PT", "Meta Description PT"),
        variants: pickString(rawRow, "variants", "Variants"),
      };
      try {
        // Validate required fields
        if (!row.title || !row.title.trim()) {
          errors.push({ row: i + 1, error: "Title is required" });
          failed++;
          continue;
        }
        if (row.price === undefined || row.price === null || row.price === "") {
          errors.push({ row: i + 1, error: "Price is required" });
          failed++;
          continue;
        }
        const parsedPrice = parseFloat(String(row.price));
        if (!Number.isFinite(parsedPrice)) {
          errors.push({ row: i + 1, error: "Price must be a valid number" });
          failed++;
          continue;
        }

        // Resolve category_id from name
        let categoryId: string | null = null;
        if (row.category && row.category.trim()) {
          const found = categoryMap.get(row.category.trim().toLowerCase());
          if (found) categoryId = found;
        }
        if (!categoryId) {
          errors.push({ row: i + 1, error: "Category is required and must match an existing category" });
          failed++;
          continue;
        }

        const productId = randomUUID();
        const variantItems = row.variants && row.variants.trim()
          ? parseVariants(row.variants, parsedPrice)
          : [];
        if (variantItems.some((variant) => stockOrZero(variant.stock) !== 0)) {
          throw new Error("Variant stock requires a location-aware inventory import");
        }

        // Insert product
        await db.insert(products).values(normalizeProductPayload({
          id: productId,
          title: row.title.trim(),
          title_en: row.title_en?.trim() || null,
          title_pt: row.title_pt?.trim() || null,
          description: row.description || null,
          description_en: row.description_en || null,
          description_pt: row.description_pt || null,
          price: parsedPrice.toString(),
          compare_at_price: row.compare_at_price,
          cost_price: row.cost_price,
          category_id: categoryId || "",
          type: row.type || "service",
          status: row.status || "active",
          delivery_method: row.delivery_method || null,
          duration: row.duration || null,
          barcode: row.barcode,
          vendor: row.vendor,
          collection: row.collection,
          tags: row.tags,
          meta_title: row.meta_title?.trim() || null,
          meta_title_pt: row.meta_title_pt?.trim() || null,
          meta_description: row.meta_description?.trim() || null,
          meta_description_pt: row.meta_description_pt?.trim() || null,
          seller_id: "admin",
          created_at: new Date(),
          updated_at: new Date(),
        }) as typeof products.$inferInsert);

        // Handle variants string
        if (variantItems.length > 0) {
          const explicitDefaultIndex = variantItems.findIndex((v) => boolValue(v.is_default));
          for (let j = 0; j < variantItems.length; j++) {
            const variant = variantItems[j];
            await db.insert(productVariants).values({
              id: randomUUID(),
              product_id: productId,
              title: variant.title || null,
              sku: variant.sku || null,
              barcode: variant.barcode || null,
              price: optionalDecimal(variant.price ?? parsedPrice, `Variant #${j + 1} price`) || parsedPrice.toFixed(2),
              compare_at_price: optionalDecimal(variant.compare_at_price, `Variant #${j + 1} compare_at_price`),
              cost: optionalDecimal(variant.cost, `Variant #${j + 1} cost`),
              weight: optionalDecimal(variant.weight, `Variant #${j + 1} weight`),
              weight_unit: variant.weight_unit || "kg",
              option1: variant.option1 || null,
              option2: variant.option2 || null,
              option3: variant.option3 || null,
              image: variant.image || null,
              is_default: explicitDefaultIndex >= 0 ? j === explicitDefaultIndex : j === 0,
              position: j + 1,
            } as typeof productVariants.$inferInsert);
          }
        }

        imported++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        errors.push({ row: i + 1, error: msg });
        failed++;
      }
    }

    return NextResponse.json({
      imported,
      failed,
      total: importProducts.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
