import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { PRODUCT_TYPE_DEFS } from "@/config/product-types";
import { db } from "@/lib/db";
import { categories, products, productTypes } from "@/storage/database/shared/schema";

const BUILTIN_CODES = PRODUCT_TYPE_DEFS.map((type) => type.code);

export interface ProductTypeInput {
  code: string;
  label: string;
  label_en?: string | null;
  description?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

interface ProductTypeListRow {
  id: string;
  code: string;
  label: string;
  label_en: string | null;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  is_builtin: boolean;
  product_count: number;
  category_count: number;
}

export function validateProductTypeCode(code: string): string | null {
  if (!/^[a-z][a-z0-9_-]{1,30}$/.test(code)) {
    return "Code must start with a letter, contain only lowercase letters, numbers, underscores, or hyphens, 2-31 chars";
  }
  return null;
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function countUsage(code: string) {
  const [productCount] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(products)
    .where(eq(products.type, code));
  const [categoryCount] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(categories)
    .where(eq(categories.type, code));

  return {
    product_count: Number(productCount?.count || 0),
    category_count: Number(categoryCount?.count || 0),
  };
}

function builtinRows() {
  return PRODUCT_TYPE_DEFS.map((type) => ({
    id: `builtin-${type.code}`,
    code: type.code,
    label: type.label,
    label_en: type.label_en,
    description: type.description,
    sort_order: type.sort_order,
    is_active: type.is_active,
    is_builtin: true,
    product_count: 0,
    category_count: 0,
  }));
}

export async function listProductTypes(args?: { active?: boolean }) {
  try {
    const rows = await db
      .select()
      .from(productTypes)
      .where(isNull(productTypes.deleted_at))
      .orderBy(asc(productTypes.sort_order));

    const map = new Map<string, ProductTypeListRow>();
    for (const row of builtinRows()) {
      map.set(row.code, row);
    }
    for (const row of rows) {
      map.set(row.code, {
        id: row.id,
        code: row.code,
        label: row.label,
        label_en: row.label_en,
        description: row.description,
        sort_order: row.sort_order,
        is_active: row.is_active,
        is_builtin: BUILTIN_CODES.includes(row.code),
        product_count: 0,
        category_count: 0,
      });
    }

    const merged = Array.from(map.values()).sort((a, b) => a.sort_order - b.sort_order);
    const withUsage = await Promise.all(
      merged.map(async (row) => ({ ...row, ...(await countUsage(row.code)) }))
    );
    const filtered = args?.active ? withUsage.filter((row) => row.is_active) : withUsage;

    return { data: filtered, error: null };
  } catch (error) {
    const fallback = args?.active ? builtinRows().filter((row) => row.is_active) : builtinRows();
    return {
      data: fallback,
      error: null,
      warning: error instanceof Error ? error.message : "product_types table unavailable; using built-in fallback",
    };
  }
}

export async function createProductType(input: ProductTypeInput) {
  const existing = await getProductTypeByCode(input.code);
  if (existing) {
    throw new Error(`code "${input.code}" already exists`);
  }

  const id = randomUUID();
  await db.insert(productTypes).values({
    id,
    code: input.code,
    label: input.label,
    label_en: input.label_en || null,
    description: input.description || null,
    sort_order: toNumber(input.sort_order),
    is_active: input.is_active ?? true,
  });

  const [created] = await db.select().from(productTypes).where(eq(productTypes.id, id)).limit(1);
  return created;
}

export async function getProductTypeByCode(code: string) {
  const [row] = await db
    .select()
    .from(productTypes)
    .where(eq(productTypes.code, code))
    .limit(1);
  return row || null;
}

export async function getProductType(id: string) {
  const [row] = await db
    .select()
    .from(productTypes)
    .where(and(eq(productTypes.id, id), isNull(productTypes.deleted_at)))
    .limit(1);
  return row || null;
}

export async function updateProductType(id: string, input: Partial<ProductTypeInput>) {
  const existing = await getProductType(id);
  if (!existing) return null;

  if (input.is_active === false) {
    const usage = await countUsage(existing.code);
    if (usage.product_count > 0 || usage.category_count > 0) {
      throw new Error("Cannot disable product type while products or categories still use it.");
    }
  }

  const updates: Record<string, unknown> = { updated_at: new Date() };
  if (input.label !== undefined) updates.label = input.label;
  if (input.label_en !== undefined) updates.label_en = input.label_en || null;
  if (input.description !== undefined) updates.description = input.description || null;
  if (input.sort_order !== undefined) updates.sort_order = toNumber(input.sort_order);
  if (input.is_active !== undefined) updates.is_active = Boolean(input.is_active);

  await db.update(productTypes).set(updates).where(eq(productTypes.id, id));
  return getProductType(id);
}

export async function deleteProductType(id: string) {
  const existing = await getProductType(id);
  if (!existing) return false;
  if (BUILTIN_CODES.includes(existing.code)) {
    throw new Error("Cannot delete built-in product types.");
  }
  const usage = await countUsage(existing.code);
  if (usage.product_count > 0 || usage.category_count > 0) {
    throw new Error("Cannot delete product type while products or categories still use it.");
  }
  await db.update(productTypes).set({ deleted_at: new Date(), is_active: false }).where(eq(productTypes.id, id));
  return true;
}
