import { db } from '@/lib/db';
import { inventory, productVariants } from '@/storage/database/shared/schema';
import { eq, and, asc, notInArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { ValidationError } from '@/lib/errors';

export interface VariantInput {
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
  position?: number | null;
  is_default?: boolean | null;
  image?: string | null;
}

type VariantInsert = typeof productVariants.$inferInsert;
type VariantUpdate = Partial<typeof productVariants.$inferInsert>;
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function withInventoryStock(variant: typeof productVariants.$inferSelect) {
  const rows = await db.select({ stock: inventory.stock }).from(inventory).where(and(
    eq(inventory.product_id, variant.product_id),
    eq(inventory.variant_id, variant.id),
  ));
  return { ...variant, stock: rows.reduce((sum, row) => sum + Number(row.stock), 0) };
}

function blankToNull(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function optionalDecimal(value: unknown, field: string, rowLabel: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new ValidationError(`${rowLabel} ${field} must be a non-negative number`);
  }
  return numeric.toFixed(2);
}

function requiredDecimal(value: unknown, field: string, rowLabel: string): string {
  if (value === undefined || value === null || value === "") {
    throw new ValidationError(`${rowLabel} ${field} is required`);
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new ValidationError(`${rowLabel} ${field} must be a non-negative number`);
  }
  return numeric.toFixed(2);
}

function normalizedVariantValues(
  productId: string,
  input: VariantInput,
  index: number,
  isDefault: boolean,
): Omit<VariantInsert, "id" | "stock"> {
  const rowLabel = `Variant #${index + 1}`;
  return {
    product_id: productId,
    title: blankToNull(input.title),
    sku: blankToNull(input.sku),
    barcode: blankToNull(input.barcode),
    price: requiredDecimal(input.price, "price", rowLabel),
    compare_at_price: optionalDecimal(input.compare_at_price, "compare_at_price", rowLabel),
    cost: optionalDecimal(input.cost, "cost", rowLabel),
    weight: optionalDecimal(input.weight, "weight", rowLabel),
    weight_unit: blankToNull(input.weight_unit) || "kg",
    option1: blankToNull(input.option1),
    option2: blankToNull(input.option2),
    option3: blankToNull(input.option3),
    position: input.position ?? (index + 1),
    is_default: isDefault,
    image: blankToNull(input.image),
  };
}

/**
 * Get all active variants for a product, sorted by position
 */
export async function getVariants(productId: string) {
  try {
    const data = await db.select()
      .from(productVariants)
      .where(eq(productVariants.product_id, productId))
      .orderBy(asc(productVariants.position));
    const stockRows = await db.select({
      variantId: inventory.variant_id,
      stock: sql<number>`COALESCE(SUM(${inventory.stock}), 0)`,
    }).from(inventory).where(eq(inventory.product_id, productId)).groupBy(inventory.variant_id);
    const stockByVariant = new Map(stockRows.map((row) => [row.variantId, Number(row.stock)]));
    return { data: data.map((variant) => ({ ...variant, stock: stockByVariant.get(variant.id) ?? 0 })), error: null };
  } catch (error) {
    return { data: [], error };
  }
}

/**
 * Create a single variant
 */
export async function createVariant(productId: string, input: VariantInput) {
  const id = randomUUID();
  const values: Record<string, unknown> = {
    id,
    product_id: productId,
    position: 1,
  };

  if (input.title !== undefined) values.title = input.title;
  if (input.sku !== undefined) values.sku = input.sku;
  if (input.barcode !== undefined) values.barcode = input.barcode;
  if (input.price !== undefined) values.price = String(input.price);
  if (input.compare_at_price !== undefined) values.compare_at_price = String(input.compare_at_price);
  if (input.cost !== undefined) values.cost = String(input.cost);
  if (input.weight !== undefined) values.weight = String(input.weight);
  if (input.weight_unit !== undefined) values.weight_unit = input.weight_unit;
  if (input.option1 !== undefined) values.option1 = input.option1;
  if (input.option2 !== undefined) values.option2 = input.option2;
  if (input.option3 !== undefined) values.option3 = input.option3;
  if (input.position !== undefined) values.position = input.position;
  if (input.is_default !== undefined) values.is_default = input.is_default;
  if (input.image !== undefined) values.image = input.image;

  await db.insert(productVariants).values(values as VariantInsert);
  const [data] = await db.select().from(productVariants).where(eq(productVariants.id, id)).limit(1);
  return withInventoryStock(data);
}

/**
 * Update a single variant
 */
export async function updateVariant(id: string, input: VariantInput) {
  const values: Record<string, unknown> = {};

  if (input.title !== undefined) values.title = input.title;
  if (input.sku !== undefined) values.sku = input.sku;
  if (input.barcode !== undefined) values.barcode = input.barcode;
  if (input.price !== undefined) values.price = String(input.price);
  if (input.compare_at_price !== undefined) values.compare_at_price = String(input.compare_at_price);
  if (input.cost !== undefined) values.cost = String(input.cost);
  if (input.weight !== undefined) values.weight = String(input.weight);
  if (input.weight_unit !== undefined) values.weight_unit = input.weight_unit;
  if (input.option1 !== undefined) values.option1 = input.option1;
  if (input.option2 !== undefined) values.option2 = input.option2;
  if (input.option3 !== undefined) values.option3 = input.option3;
  if (input.position !== undefined) values.position = input.position;
  if (input.is_default !== undefined) values.is_default = input.is_default;
  if (input.image !== undefined) values.image = input.image;

  values.updated_at = new Date();

  await db.update(productVariants).set(values as VariantUpdate).where(eq(productVariants.id, id));
  const [data] = await db.select().from(productVariants).where(eq(productVariants.id, id)).limit(1);
  return withInventoryStock(data);
}

/**
 * 向后兼容：非事务版本的 bulkSaveVariants。
 * 新代码应优先使用 bulkSaveVariantsWithTx 配合外部事务。
 */
export async function bulkSaveVariants(
  productId: string,
  variants: Array<{
    id?: string | null;
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
    position?: number | null;
    is_default?: boolean | null;
    image?: string | null;
  }>
) {
  return await db.transaction(async (tx) => {
    return await bulkSaveVariantsWithTx(productId, variants, tx);
  });
}

/**
 * Delete a variant
 */
export async function deleteVariant(id: string) {
  await db.delete(productVariants).where(eq(productVariants.id, id));
}

/**
 * 事务安全版 bulkSaveVariants —— 接受外部 tx 参数，
 * 与商品创建/更新放在同一事务内，任一步失败整单回滚。
 *
 * 采用 upsert by id 策略（而非先删后插），保留已有 variant id，
 * 从而保护 order_items.variant_id 的外键完整性。
 */
export async function bulkSaveVariantsWithTx(
  productId: string,
  variants: Array<{
    id?: string | null;  // 已有 variant id（编辑时保留）
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
    position?: number | null;
    is_default?: boolean | null;
    image?: string | null;
  }>,
  tx: DbTransaction
) {
  // 1. 收集本次传入的 variant id（非空的）
  const incomingIds = new Set(
    variants.map((v) => v.id).filter((id): id is string => !!id)
  );

  // 2. 删除本次未传入的旧 variant（被用户移除的）
  if (variants.length > 0) {
    const deleteCondition = incomingIds.size > 0
      ? and(eq(productVariants.product_id, productId), notInArray(productVariants.id, [...incomingIds]))
      : eq(productVariants.product_id, productId);
    await tx.delete(productVariants).where(deleteCondition);
  }

  const explicitDefaultIndex = variants.findIndex((v) => v.is_default === true);

  // 3. upsert 每条 variant（严格逐条校验：空串/NaN/负数一律拒绝）
  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    const values = normalizedVariantValues(
      productId,
      v,
      i,
      explicitDefaultIndex >= 0 ? i === explicitDefaultIndex : i === 0,
    );

    if (v.id) {
      // 已有 variant：UPDATE（带 product_id 归属校验，防跨商品改挂）
      values.updated_at = new Date();
      const result = await tx
        .update(productVariants)
        .set(values as VariantUpdate)
        .where(
          and(
            eq(productVariants.id, v.id),
            eq(productVariants.product_id, productId)
          )
        );
      // MySQL: Drizzle 返回 [ResultSetHeader, undefined]
      const affectedRows = (result as unknown as [{ affectedRows: number }, unknown])[0]?.affectedRows ?? 0;
      if (affectedRows === 0) {
        throw new ValidationError(`Variant ${v.id} does not belong to product ${productId} — update rejected (409)`);
      }
    } else {
      // 新 variant：INSERT
      await tx.insert(productVariants).values({ id: randomUUID(), ...values } as VariantInsert);
    }
  }

  // 如果没有传入任何 variant → 由调用方（PUT 路由）在路由层处理删除逻辑
  // 此处不做隐式清空，避免与"未传 variants key"语义混淆

  return { count: variants.length };
}
