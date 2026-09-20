/**
 * Product Receiver
 *
 * 接收 ImportProductsEnvelope，按 record 单独事务写入 products + product_variants + product_images + inventory。
 * 走 external_source_mappings 幂等 UPSERT，同源同 source_id 二次推送会更新而不是新建。
 *
 * 决策 1（图片异步镜像）：图片入 product_images 时 src 和 original_url 都是 sender 推过来的 URL，
 *   mirror_status 默认 'pending'，后台 worker 异步下载到自有存储再 update src + mirror_status='mirrored'。
 *
 * 决策 2（多店）：source_store 只在 mapping 表里出现，不和 stores 表关联。
 *
 * 已知限制（v1）：
 * - 图片按 product source_id + index 合成 mapping；如果 Shopify 端重排图片，receiver 会按新顺序更新同 index 图片。
 * - inventory 默认进"最早创建的 active warehouse"。多仓库分配看后续 admin 调拨。
 */
import { db } from "@/lib/db";
import {
  products,
  productVariants,
  productImages,
  categories,
  warehouses,
  inventory,
  importJobs,
  importSessions,
} from "@/storage/database/shared/schema";
import { and, asc, eq } from "drizzle-orm";
import { randomUUID, createHash } from "node:crypto";
import { ValidationError } from "@/lib/errors";
import { upsertUrlRedirect } from "@/services/admin/redirect-service";
import type {
  ImportProductsEnvelope,
  ImportProductRecord,
  ImportBatchResult,
  ImportRecordError,
  ImportSource,
} from "@/types/import-contract";
import { findMapping, upsertMapping, type DbLike } from "./source-mapping";
import { validateProducts } from "./validator";
import { refreshImportSessionStatus } from "./session-service";

export interface ReceiverContext {
  session_id: string;
  source: ImportSource;
  source_store: string;
  seller_id: string; // staff/user 触发本次导入
}

export interface ReceiveProductsOptions {
  dryRun?: boolean;
}

const SOURCE_TYPE_PRODUCT = "product";
const SOURCE_TYPE_VARIANT = "variant";
const SOURCE_TYPE_IMAGE = "image";
const SOURCE_TYPE_REDIRECT = "redirect";

function shortHash(input: string): string {
  return createHash("sha1").update(input).digest("hex").slice(0, 8);
}

function generateSlug(title: string): string {
  return (title || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180) || "item";
}

/** 找 default warehouse；没有则抛 ValidationError 提示先建仓库 */
async function getDefaultWarehouseId(): Promise<string> {
  const rows = await db
    .select({ id: warehouses.id })
    .from(warehouses)
    .where(eq(warehouses.is_active, true))
    .orderBy(asc(warehouses.created_at))
    .limit(1);
  if (rows.length === 0) {
    throw new ValidationError(
      "至少要有一个 active warehouse 才能导入商品（admin → 仓储物流 → 仓库 → 新建）",
    );
  }
  return rows[0].id;
}

/**
 * 按 name 查 category；找不到则按 record.type 自动创建。
 * 注：name 不是 unique，所以 INSERT 没法走 onDuplicateKeyUpdate；用 SELECT 兜底。
 */
async function ensureCategoryId(
  name: string | null | undefined,
  productType: string,
  dbLike: DbLike = db,
): Promise<string> {
  const trimmed = (name || "").trim();
  if (!trimmed) {
    // 没指定分类时挂到 "未分类"
    return ensureCategoryId("未分类", productType, dbLike);
  }

  const existing = await dbLike
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.name, trimmed))
    .limit(1);
  if (existing.length > 0) {
    return existing[0].id;
  }

  const id = randomUUID();
  let slug = generateSlug(trimmed);
  // 分类 slug 也是 unique，撞了就补 hash
  const clash = await dbLike
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.slug, slug))
    .limit(1);
  if (clash.length > 0) {
    slug = `${slug}-${shortHash(trimmed)}`;
  }

  await dbLike.insert(categories).values({
    id,
    name: trimmed,
    slug,
    type: productType || "physical",
    level: 0,
    is_active: true,
  });
  return id;
}

/** 商品 slug 唯一性：撞了用 source_id hash 兜底（同源重导也稳定） */
async function ensureUniqueProductSlug(
  baseSlug: string,
  sourceId: string,
  existingProductId: string | null,
  dbLike: DbLike = db,
): Promise<string> {
  const slug = baseSlug;
  const clash = await dbLike
    .select({ id: products.id })
    .from(products)
    .where(eq(products.slug, slug))
    .limit(1);
  if (clash.length === 0) return slug;
  if (existingProductId && clash[0].id === existingProductId) return slug;
  return `${baseSlug}-${shortHash(sourceId)}`;
}

/** 从 variants 推主价（最低变体价）；没有变体取 0 */
function deriveMasterPrice(record: ImportProductRecord): string {
  if (record.variants && record.variants.length > 0) {
    const prices = record.variants
      .map((v) => Number(v.price))
      .filter((n) => Number.isFinite(n) && n >= 0);
    if (prices.length > 0) return Math.min(...prices).toFixed(2);
  }
  return "0.00";
}

/** 写一条 product 记录（INSERT or UPDATE），返回 product_id + slug */
async function upsertProductRow(
  ctx: ReceiverContext,
  record: ImportProductRecord,
  dbLike: DbLike = db,
): Promise<{ productId: string; slug: string }> {
  const mapping = await findMapping({
    source: ctx.source,
    source_store: ctx.source_store,
    source_type: SOURCE_TYPE_PRODUCT,
    source_id: record.source_id,
  }, dbLike);

  const categoryId = await ensureCategoryId(record.category, record.type || "physical", dbLike);
  const baseSlug = generateSlug(record.title);
  const productId = mapping?.local_id ?? randomUUID();
  const slug = await ensureUniqueProductSlug(baseSlug, record.source_id, mapping?.local_id ?? null, dbLike);
  const masterPrice = deriveMasterPrice(record);

  const tags = Array.isArray(record.tags) && record.tags.length > 0
    ? record.tags.join(", ")
    : null;

  const titleI18n = record.title_i18n ?? {};
  const productData = {
    title: record.title,
    title_en: titleI18n.en ?? null,
    title_ja: titleI18n.ja ?? null,
    title_es: titleI18n.es ?? null,
    description: record.description ?? null,
    slug,
    price: masterPrice,
    compare_at_price: record.compare_at_price ?? null,
    category_id: categoryId,
    type: record.type || "physical",
    seller_id: ctx.seller_id,
    status: record.status === "draft" || record.status === "inactive" ? "inactive" : "active",
    barcode: record.barcode ?? null,
    vendor: record.vendor ?? null,
    collection: record.collection ?? null,
    tags,
    meta_title: record.seo?.meta_title ?? null,
    meta_description: record.seo?.meta_description ?? null,
    updated_at: new Date(),
  } as const;

  if (mapping) {
    await dbLike.update(products).set(productData).where(eq(products.id, productId));
  } else {
    await dbLike.insert(products).values({ id: productId, ...productData });
  }

  await upsertMapping(
    {
      source: ctx.source,
      source_store: ctx.source_store,
      source_type: SOURCE_TYPE_PRODUCT,
      source_id: record.source_id,
    },
    { table: "products", id: productId },
    record,
    dbLike,
  );

  return { productId, slug };
}

async function upsertVariantRow(
  ctx: ReceiverContext,
  productId: string,
  record: ImportProductRecord,
  variantIndex: number,
  dbLike: DbLike = db,
): Promise<string> {
  const v = record.variants![variantIndex];
  const mapping = await findMapping({
    source: ctx.source,
    source_store: ctx.source_store,
    source_type: SOURCE_TYPE_VARIANT,
    source_id: v.source_id,
  }, dbLike);
  const variantId = mapping?.local_id ?? randomUUID();

  const options = v.options ?? {};
  const optionKeys = Object.keys(options);

  const variantData = {
    product_id: productId,
    title: v.title ?? null,
    sku: v.sku ?? null,
    barcode: v.barcode ?? null,
    price: String(v.price),
    compare_at_price: v.compare_at_price ?? null,
    cost: v.cost ?? null,
    weight: v.weight ?? null,
    weight_unit: v.weight_unit ?? "kg",
    option1: optionKeys[0] ? (options[optionKeys[0]] ?? null) : null,
    option2: optionKeys[1] ? (options[optionKeys[1]] ?? null) : null,
    option3: optionKeys[2] ? (options[optionKeys[2]] ?? null) : null,
    position: variantIndex + 1,
    is_default: v.is_default ?? variantIndex === 0,
    image: v.image ?? null,
    updated_at: new Date(),
  } as const;

  if (mapping) {
    await dbLike.update(productVariants).set(variantData).where(eq(productVariants.id, variantId));
  } else {
    await dbLike.insert(productVariants).values({ id: variantId, ...variantData });
  }

  await upsertMapping(
    {
      source: ctx.source,
      source_store: ctx.source_store,
      source_type: SOURCE_TYPE_VARIANT,
      source_id: v.source_id,
    },
    { table: "product_variants", id: variantId },
    v,
    dbLike,
  );

  return variantId;
}

/** inventory 表按 (product_id, variant_id, warehouse_id) 唯一性手动维护 */
async function upsertInventoryRow(
  productId: string,
  variantId: string,
  warehouseId: string,
  stock: number,
  dbLike: DbLike = db,
): Promise<void> {
  const existing = await dbLike
    .select({ id: inventory.id })
    .from(inventory)
    .where(
      and(
        eq(inventory.product_id, productId),
        eq(inventory.variant_id, variantId),
        eq(inventory.warehouse_id, warehouseId),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    await dbLike
      .update(inventory)
      .set({ stock, updated_at: new Date() })
      .where(eq(inventory.id, existing[0].id));
  } else {
    await dbLike.insert(inventory).values({
      id: randomUUID(),
      product_id: productId,
      variant_id: variantId,
      warehouse_id: warehouseId,
      stock,
    });
  }
}

/**
 * 图片按合成 source_id 幂等同步，避免首轮插图失败后重跑无法补图。
 * 决策 1：新图的 src 和 original_url 都先存 sender URL；mirror_status=pending 等 worker 处理。
 */
async function syncImagesForProduct(
  ctx: ReceiverContext,
  productId: string,
  record: ImportProductRecord,
  dbLike: DbLike = db,
): Promise<void> {
  if (!record.images || record.images.length === 0) return;
  for (let i = 0; i < record.images.length; i++) {
    const img = record.images[i];
    const imageSourceId = `${record.source_id}:image:${i}`;
    const mapping = await findMapping({
      source: ctx.source,
      source_store: ctx.source_store,
      source_type: SOURCE_TYPE_IMAGE,
      source_id: imageSourceId,
    }, dbLike);

    if (mapping) {
      await dbLike
        .update(productImages)
        .set({
          original_url: img.url,
          alt: img.alt ?? null,
          position: img.position ?? i + 1,
        })
        .where(eq(productImages.id, mapping.local_id));
      await upsertMapping(
        {
          source: ctx.source,
          source_store: ctx.source_store,
          source_type: SOURCE_TYPE_IMAGE,
          source_id: imageSourceId,
        },
        { table: "product_images", id: mapping.local_id },
        img,
        dbLike,
      );
      continue;
    }

    const imageId = randomUUID();
    await dbLike.insert(productImages).values({
      id: imageId,
      product_id: productId,
      src: img.url,
      original_url: img.url,
      mirror_status: "pending",
      alt: img.alt ?? null,
      position: img.position ?? i + 1,
    });
    // 把 product 级 image_id 挂进 mapping（用作 mirror_progress 聚合定位）
    await upsertMapping(
      {
        source: ctx.source,
        source_store: ctx.source_store,
        source_type: SOURCE_TYPE_IMAGE,
      source_id: imageSourceId,
      },
      { table: "product_images", id: imageId },
      img,
      dbLike,
    );
  }
}

async function syncRedirectsForProduct(
  ctx: ReceiverContext,
  record: ImportProductRecord,
  slug: string,
  dbLike: DbLike = db,
): Promise<void> {
  const legacyPaths = [...new Set((record.legacy_paths ?? []).filter(Boolean))];
  if (legacyPaths.length === 0) return;

  for (let i = 0; i < legacyPaths.length; i++) {
    const oldPath = legacyPaths[i];
    const redirect = await upsertUrlRedirect({
      old_path: oldPath,
      new_path: `/products/${slug}`,
      status_code: 301,
      source: ctx.source,
      source_store: ctx.source_store,
      source_id: `${record.source_id}:legacy_path:${i}`,
      is_active: true,
    }, dbLike);
    if (!redirect) continue;

    await upsertMapping(
      {
        source: ctx.source,
        source_store: ctx.source_store,
        source_type: SOURCE_TYPE_REDIRECT,
        source_id: `${record.source_id}:legacy_path:${i}`,
      },
      { table: "url_redirects", id: redirect.id },
      { product_source_id: record.source_id, old_path: oldPath, new_path: `/products/${slug}` },
      dbLike,
    );
  }
}

/** Main entry：批量接收 products */
export async function receiveProducts(
  ctx: ReceiverContext,
  envelope: ImportProductsEnvelope,
  opts: ReceiveProductsOptions = {},
): Promise<ImportBatchResult> {
  if (envelope.source !== ctx.source || envelope.source_store !== ctx.source_store) {
    throw new ValidationError(
      `envelope source/source_store 和 session 不匹配：envelope=${envelope.source}/${envelope.source_store}，session=${ctx.source}/${ctx.source_store}`,
    );
  }

  const errors: ImportRecordError[] = [...validateProducts(envelope)];
  // 哪些 record_index 已经被 validator 标错——这些不再尝试写库
  const invalidIndices = new Set<number>();
  for (const e of errors) {
    if (e.code === "VALIDATION_FAILED" || e.code === "DUPLICATE_SOURCE_ID") {
      invalidIndices.add(e.record_index);
    }
  }

  if (opts.dryRun) {
    // 不写 import_jobs，调用方（validate endpoint）只关心 errors
    return {
      ok: errors.length === 0,
      job_type: "products",
      total: envelope.records.length,
      success: envelope.records.length - invalidIndices.size,
      failed: invalidIndices.size,
      errors,
    };
  }

  // 真导入：建 import_jobs row（status=running）
  const jobId = randomUUID();
  await db.insert(importJobs).values({
    id: jobId,
    session_id: ctx.session_id,
    job_type: "products",
    status: "running",
    total_rows: envelope.records.length,
  });
  // 同步 session 状态
  await db
    .update(importSessions)
    .set({ status: "running", finished_at: null })
    .where(eq(importSessions.id, ctx.session_id));

  const warehouseId = await getDefaultWarehouseId();

  let success = 0;
  let failed = invalidIndices.size;

  for (let i = 0; i < envelope.records.length; i++) {
    if (invalidIndices.has(i)) continue;
    const record = envelope.records[i];
    try {
      await db.transaction(async (tx) => {
        const { productId, slug } = await upsertProductRow(ctx, record, tx);

        if (record.variants && record.variants.length > 0) {
          for (let j = 0; j < record.variants.length; j++) {
            const variantId = await upsertVariantRow(ctx, productId, record, j, tx);
            const stock = record.variants[j].inventory_quantity ?? 0;
            await upsertInventoryRow(productId, variantId, warehouseId, stock, tx);
          }
        }

        await syncImagesForProduct(ctx, productId, record, tx);
        await syncRedirectsForProduct(ctx, record, slug, tx);
      });

      success++;
    } catch (e) {
      failed++;
      errors.push({
        record_index: i,
        source_id: record.source_id,
        code: "INTERNAL_ERROR",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const allOk = failed === 0;
  await db
    .update(importJobs)
    .set({
      status: allOk ? "completed" : "failed",
      success_rows: success,
      failed_rows: failed,
      errors: errors.length > 0 ? (errors as never) : null,
      finished_at: new Date(),
    })
    .where(eq(importJobs.id, jobId));

  await refreshImportSessionStatus(ctx.session_id);

  return {
    ok: allOk,
    session_id: ctx.session_id,
    job_type: "products",
    total: envelope.records.length,
    success,
    failed,
    errors,
  };
}
