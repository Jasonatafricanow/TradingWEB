import { NextResponse } from "next/server";
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware";
import {
  bulkDeleteProducts,
  bulkUpdateProductsCatalog,
  bulkUpdateProductsStatus,
  listAdminProducts,
} from "@/services/admin/products-service";
import { db } from "@/lib/db";
import { randomUUID } from "node:crypto";
import { categories, products } from "@/storage/database/shared/schema";
import { eq } from "drizzle-orm";
import { ValidationError } from "@/lib/errors";
import { normalizeProductPayload } from "@/services/admin/product-payload";

const PRODUCT_STATUSES = new Set(["active", "inactive", "sold"]);
const TAG_MODES = new Set(["add", "remove", "replace"]);

function cleanProductIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new ValidationError("ids must be an array");
  }
  const ids = Array.from(new Set(value.map((id) => String(id || "").trim()).filter(Boolean)));
  if (ids.length === 0) {
    throw new ValidationError("Select at least one product");
  }
  if (ids.length > 200) {
    throw new ValidationError("Bulk operation supports up to 200 products at a time");
  }
  return ids;
}

function hasOwn(input: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function cleanOptionalText(value: unknown, maxLength: number, label: string): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (text.length > maxLength) {
    throw new ValidationError(`${label} must be ${maxLength} characters or less`);
  }
  return text;
}

function cleanTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean)));
  }
  return Array.from(new Set(String(value || "").split(/[,，\n]/).map((item) => item.trim()).filter(Boolean)));
}

export async function GET(request: Request) {
  try {
    await requireStaffRole(request, ['admin', 'operator']);
    const { searchParams } = new URL(request.url);
    const page = Number(searchParams.get("page"));
    const pageSize = Number(searchParams.get("pageSize"));
    const result = await listAdminProducts({
      search: searchParams.get("search") || undefined,
      type: searchParams.get("type") || undefined,
      status: searchParams.get("status") || undefined,
      view: searchParams.get("view") || undefined,
      page: Number.isFinite(page) ? page : undefined,
      pageSize: Number.isFinite(pageSize) ? pageSize : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    await requireStaffRole(request, ['admin', 'operator']);
    const user = await requireUser(request);
    const body = await request.json();

    // 客户端校验：变体存在时 price 可省略（后端自动推导）
    const hasVariants = Array.isArray(body.variants) && body.variants.length > 0;
    const priceMissing = body.price === undefined || body.price === null || body.price === "";

    if (!body.title || !body.category_id || !body.type) {
      return NextResponse.json({ error: "title, category_id, and type are required" }, { status: 400 });
    }
    if (priceMissing && !hasVariants) {
      return NextResponse.json({ error: "price is required when no variants are provided" }, { status: 400 });
    }

    const sellerId = body.seller_id || user.staffId || user.id;
    const variants = hasVariants ? body.variants : null;

    // 事务化：商品 + 变体原子写入，失败整单回滚
    const data = await db.transaction(async (tx) => {
      const productId = randomUUID();

      // 兜底价：有变体时取最低变体价，否则用原始 price
      let effectivePrice = priceMissing ? "0.00" : String(body.price);
      if (variants && variants.length > 0) {
        const variantPrices = variants
          .map((v: { price?: string | number }) => Number(v.price))
          .filter((n: number) => Number.isFinite(n) && n >= 0);
        if (variantPrices.length === 0) {
          throw new ValidationError("所有变体均无合法价格（价格不能为空、非数字或负数）");
        }
        effectivePrice = Math.min(...variantPrices).toFixed(2);
      }

      // 构建商品 payload（去掉 variants）
      const productPayload: Record<string, unknown> = {
        ...body,
        id: productId,
        price: effectivePrice,
        seller_id: sellerId,
      };
      delete productPayload.variants;

      await tx.insert(products).values(normalizeProductPayload(productPayload) as typeof products.$inferInsert);

      // 写入变体（如果有）
      if (variants && variants.length > 0) {
        const { bulkSaveVariantsWithTx } = await import("@/services/products/variant-service");
        await bulkSaveVariantsWithTx(productId, variants, tx);
      }

      const [created] = await tx.select().from(products).where(eq(products.id, productId)).limit(1);
      return created;
    });

    return NextResponse.json({ data });
  } catch (err) {
    console.error("[POST /api/admin/products] 创建商品失败:", err);
    return errorResponse(err);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireStaffRole(request, ['admin', 'operator']);
    const body = await request.json();
    const action = String(body.action || "").trim();
    const ids = cleanProductIds(body.ids);

    if (action === "set_status") {
      const status = String(body.status || "").trim();
      if (!PRODUCT_STATUSES.has(status)) {
        throw new ValidationError("Invalid product status");
      }
      const result = await bulkUpdateProductsStatus(ids, status);
      return NextResponse.json({ success: true, data: result });
    }

    if (action === "update_catalog") {
      const rawFields = body.fields && typeof body.fields === "object"
        ? body.fields as Record<string, unknown>
        : {};
      const fields: {
        category_id?: string;
        vendor?: string | null;
        collection?: string | null;
      } = {};

      if (hasOwn(rawFields, "category_id")) {
        const categoryId = cleanOptionalText(rawFields.category_id, 36, "category_id");
        if (!categoryId) throw new ValidationError("category_id cannot be empty");
        const [category] = await db.select({ id: categories.id }).from(categories).where(eq(categories.id, categoryId)).limit(1);
        if (!category) throw new ValidationError("Category does not exist");
        fields.category_id = categoryId;
      }
      if (hasOwn(rawFields, "vendor")) {
        fields.vendor = cleanOptionalText(rawFields.vendor, 150, "vendor");
      }
      if (hasOwn(rawFields, "collection")) {
        fields.collection = cleanOptionalText(rawFields.collection, 150, "collection");
      }

      let tags: { mode: "add" | "remove" | "replace"; values: string[] } | undefined;
      if (body.tags && typeof body.tags === "object") {
        const rawTags = body.tags as Record<string, unknown>;
        const mode = String(rawTags.mode || "").trim();
        if (!TAG_MODES.has(mode)) throw new ValidationError("Invalid tag update mode");
        const values = cleanTags(rawTags.values);
        if (values.length === 0) throw new ValidationError("Enter at least one tag");
        if (values.some((tag) => tag.length > 80)) throw new ValidationError("Each tag must be 80 characters or less");
        tags = { mode: mode as "add" | "remove" | "replace", values };
      }

      if (Object.keys(fields).length === 0 && !tags) {
        throw new ValidationError("Choose at least one catalog field to update");
      }

      const result = await bulkUpdateProductsCatalog(ids, { ...fields, tags });
      return NextResponse.json({ success: true, data: result });
    }

    if (action === "delete") {
      const result = await bulkDeleteProducts(ids);
      return NextResponse.json({ success: true, data: result });
    }

    throw new ValidationError("Unsupported bulk product action");
  } catch (err) {
    return errorResponse(err);
  }
}
