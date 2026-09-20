/**
 * Order Receiver
 *
 * 接收 ImportOrdersEnvelope，按 record 写入 orders + order_items。
 *
 * 三层引用解析：
 * 1. customer：record.customer_source_id → users.id（查 external_source_mappings；
 *    没匹配上时按 ctx.customer_link_strategy 三选一处理）
 * 2. product：line_items[].product_source_id → products.id（必须先跑过 products import，
 *    否则订单导入这一条会进 errors 列表）
 * 3. variant：line_items[].variant_source_id → product_variants.id（可空）
 *
 * 性能：批次开始时一次性 bulkFindMappings 把所有 product/variant mapping 拉到内存，
 *       减少订单数 × 行项数的 N+1 查询。
 *
 * 已知 v1 限制：
 * - validate endpoint 默认保持轻量 pure validation；传 check_references=true 时会查 mappings 暴露商品/变体引用缺失。
 * - 重导订单（已有 mapping）时 order_items 走"先删全部再插"；删除和重插包在单条订单 transaction 内。
 * - order_items.product_type 由 products.type 预取填充，缺失时兜底 physical。
 */
import { db } from "@/lib/db";
import {
  orders,
  orderItems,
  products,
  users,
  coupons,
  importSessions,
  importJobs,
} from "@/storage/database/shared/schema";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { ValidationError } from "@/lib/errors";
import type {
  ImportOrdersEnvelope,
  ImportOrderRecord,
  ImportBatchResult,
  ImportRecordError,
  CustomerLinkStrategy,
} from "@/types/import-contract";
import {
  findMapping,
  upsertMapping,
  bulkFindMappings,
  type DbLike,
  type MappingLookup,
} from "./source-mapping";
import { validateOrders } from "./validator";
import type { ReceiverContext } from "./product-receiver";
import { refreshImportSessionStatus } from "./session-service";

const SOURCE_TYPE_ORDER = "order";
const SOURCE_TYPE_ORDER_ITEM = "order_item";
const SOURCE_TYPE_CUSTOMER = "customer";
const SOURCE_TYPE_PRODUCT = "product";
const SOURCE_TYPE_VARIANT = "variant";

export interface OrderReceiverContext extends ReceiverContext {
  customer_link_strategy: CustomerLinkStrategy;
}

export interface ReceiveOrdersOptions {
  dryRun?: boolean;
}

function buildBuyerName(record: ImportOrderRecord): string | null {
  const first = record.billing_address?.first_name ?? record.shipping_address?.first_name;
  const last = record.billing_address?.last_name ?? record.shipping_address?.last_name;
  const name = [first, last].filter(Boolean).join(" ").trim();
  return name === "" ? null : name;
}

async function findUserIdByEmail(
  email: string,
  dbLike: DbLike = db,
): Promise<string | null> {
  const rows = await dbLike
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return rows[0]?.id ?? null;
}

async function ensureGuestUserId(
  ctx: OrderReceiverContext,
  dbLike: DbLike = db,
): Promise<string> {
  const email = `guest@${ctx.source_store}.local`;
  const existing = await findUserIdByEmail(email, dbLike);
  if (existing) return existing;

  const id = randomUUID();
  await dbLike.insert(users).values({
    id,
    email,
    name: `Guest (${ctx.source_store})`,
    password_hash: null,
    is_active: false, // 占位账号，不应能登录
  });
  return id;
}

/** 按 customer_link_strategy 解析订单的 user_id；null 表示按策略跳过 */
async function resolveOrderUserId(
  ctx: OrderReceiverContext,
  record: ImportOrderRecord,
  dbLike: DbLike = db,
): Promise<string | null> {
  if (record.customer_source_id) {
    const mapping = await findMapping({
      source: ctx.source,
      source_store: ctx.source_store,
      source_type: SOURCE_TYPE_CUSTOMER,
      source_id: record.customer_source_id,
    }, dbLike);
    if (mapping) return mapping.local_id;
  }

  switch (ctx.customer_link_strategy) {
    case "auto_create_user": {
      if (!record.email) return null;
      const existing = await findUserIdByEmail(record.email, dbLike);
      if (existing) {
        // 复用现有用户；如果有 customer_source_id 也补上 mapping
        if (record.customer_source_id) {
          await upsertMapping(
            {
              source: ctx.source,
              source_store: ctx.source_store,
              source_type: SOURCE_TYPE_CUSTOMER,
              source_id: record.customer_source_id,
            },
            { table: "users", id: existing },
            { email: record.email, auto_linked_from_order: record.source_id },
            dbLike,
          );
        }
        return existing;
      }
      const id = randomUUID();
      await dbLike.insert(users).values({
        id,
        email: record.email,
        name: buildBuyerName(record),
        password_hash: null,
        is_active: true,
      });
      if (record.customer_source_id) {
        await upsertMapping(
          {
            source: ctx.source,
            source_store: ctx.source_store,
            source_type: SOURCE_TYPE_CUSTOMER,
            source_id: record.customer_source_id,
          },
          { table: "users", id },
          { email: record.email, auto_created_from_order: record.source_id },
          dbLike,
        );
      }
      return id;
    }
    case "guest_placeholder":
      return await ensureGuestUserId(ctx, dbLike);
    case "skip_unmatched":
      return null;
    default:
      return null;
  }
}

function parseImportedDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function normalizeDiscountCodes(record: ImportOrderRecord): string[] {
  return [...new Set(
    (record.discount_codes ?? [])
      .map((code) => code.trim().toUpperCase())
      .filter(Boolean),
  )];
}

async function resolveOrderCouponId(
  record: ImportOrderRecord,
  dbLike: DbLike = db,
): Promise<string | null> {
  const codes = normalizeDiscountCodes(record);
  if (codes.length !== 1) return null;

  const rows = await dbLike
    .select({ id: coupons.id })
    .from(coupons)
    .where(eq(coupons.code, codes[0]))
    .limit(1);
  return rows[0]?.id ?? null;
}

function deriveOrderStatus(financialStatus: string): string {
  if (financialStatus === "refunded") return "refunded";
  if (financialStatus === "voided") return "cancelled";
  if (financialStatus === "paid" || financialStatus === "partially_refunded") return "paid";
  return "pending";
}

function derivePaymentStatus(financialStatus: string): string {
  if (financialStatus === "refunded") return "refunded";
  if (financialStatus === "paid" || financialStatus === "partially_refunded") return "paid";
  return "unpaid";
}

interface UpsertOrderResult {
  order_id: string;
  is_update: boolean;
}

async function upsertOrderRow(
  ctx: OrderReceiverContext,
  record: ImportOrderRecord,
  userId: string,
  dbLike: DbLike = db,
): Promise<UpsertOrderResult> {
  const mapping = await findMapping({
    source: ctx.source,
    source_store: ctx.source_store,
    source_type: SOURCE_TYPE_ORDER,
    source_id: record.source_id,
  }, dbLike);
  const orderId = mapping?.local_id ?? randomUUID();
  const financialStatus = record.financial_status ?? "pending";
  const importedCreatedAt = parseImportedDate(record.created_at);
  const couponId = await resolveOrderCouponId(record, dbLike);
  const discountCodes = normalizeDiscountCodes(record);

  const orderData = {
    user_id: userId,
    order_no: record.order_number,
    status: deriveOrderStatus(financialStatus),
    financial_status: financialStatus,
    fulfillment_status: record.fulfillment_status ?? "unfulfilled",
    total_amount: record.total_price,
    currency: record.currency ?? "USD",
    payment_status: derivePaymentStatus(financialStatus),
    buyer_email: record.email ?? null,
    buyer_name: buildBuyerName(record),
    buyer_phone:
      record.billing_address?.phone ?? record.shipping_address?.phone ?? null,
    shipping_address: (record.shipping_address ?? null) as never,
    billing_address: (record.billing_address ?? null) as never,
    notes: record.note ?? null,
    tags: discountCodes.length > 0
      ? discountCodes.join(", ")
      : null,
    coupon_id: couponId,
    discount_amount: record.discount_amount ?? null,
    ...(importedCreatedAt ? { created_at: importedCreatedAt } : {}),
    updated_at: new Date(),
  } as const;

  if (mapping) {
    await dbLike.update(orders).set(orderData).where(eq(orders.id, orderId));
  } else {
    await dbLike.insert(orders).values({ id: orderId, ...orderData });
  }

  await upsertMapping(
    {
      source: ctx.source,
      source_store: ctx.source_store,
      source_type: SOURCE_TYPE_ORDER,
      source_id: record.source_id,
    },
    { table: "orders", id: orderId },
    record,
    dbLike,
  );

  return { order_id: orderId, is_update: mapping !== null };
}

async function insertOrderItems(
  ctx: OrderReceiverContext,
  orderId: string,
  record: ImportOrderRecord,
  productMappings: Map<string, MappingLookup>,
  variantMappings: Map<string, MappingLookup>,
  productTypes: Map<string, string>,
  dbLike: DbLike = db,
): Promise<void> {
  for (let j = 0; j < record.line_items.length; j++) {
    const item = record.line_items[j];
    if (!item.product_source_id) {
      throw new ValidationError(
        `line_items[${j}] 缺 product_source_id，无法关联本地商品`,
      );
    }
    const productMapping = productMappings.get(item.product_source_id);
    if (!productMapping) {
      throw new ValidationError(
        `line_items[${j}] 关联的商品 ${item.product_source_id} 还没导入；请先跑 products import 再跑 orders`,
      );
    }
    const productId = productMapping.local_id;

    let variantId: string | null = null;
    if (item.variant_source_id) {
      const variantMapping = variantMappings.get(item.variant_source_id);
      if (variantMapping) variantId = variantMapping.local_id;
    }

    const itemId = randomUUID();
    const subtotal = (Number(item.price) * item.quantity).toFixed(2);
    await dbLike.insert(orderItems).values({
      id: itemId,
      order_id: orderId,
      product_id: productId,
      variant_id: variantId,
      product_title: item.title,
      // TODO：反查 products 表拿真实 product_type；v1 默认 physical
      product_type: productTypes.get(productId) ?? "physical",
      sku: item.sku ?? null,
      quantity: item.quantity,
      unit_price: item.price,
      subtotal,
    });

    await upsertMapping(
      {
        source: ctx.source,
        source_store: ctx.source_store,
        source_type: SOURCE_TYPE_ORDER_ITEM,
        source_id: `${record.source_id}:item:${j}`,
      },
      { table: "order_items", id: itemId },
      item,
      dbLike,
    );
  }
}

export async function receiveOrders(
  ctx: OrderReceiverContext,
  envelope: ImportOrdersEnvelope,
  opts: ReceiveOrdersOptions = {},
): Promise<ImportBatchResult> {
  if (envelope.source !== ctx.source || envelope.source_store !== ctx.source_store) {
    throw new ValidationError(
      `envelope source/source_store 和 session 不匹配：envelope=${envelope.source}/${envelope.source_store}，session=${ctx.source}/${ctx.source_store}`,
    );
  }

  const errors: ImportRecordError[] = [...validateOrders(envelope)];
  const invalidIndices = new Set<number>();
  for (const e of errors) {
    if (
      e.code === "VALIDATION_FAILED" ||
      e.code === "DUPLICATE_SOURCE_ID" ||
      e.code === "MISSING_REFERENCE"
    ) {
      invalidIndices.add(e.record_index);
    }
  }

  if (opts.dryRun) {
    return {
      ok: errors.length === 0,
      job_type: "orders",
      total: envelope.records.length,
      success: envelope.records.length - invalidIndices.size,
      failed: invalidIndices.size,
      errors,
    };
  }

  // 批量预查 product/variant mapping
  const productSourceIds = new Set<string>();
  const variantSourceIds = new Set<string>();
  for (const r of envelope.records) {
    for (const li of r.line_items) {
      if (li.product_source_id) productSourceIds.add(li.product_source_id);
      if (li.variant_source_id) variantSourceIds.add(li.variant_source_id);
    }
  }
  const productMappings = await bulkFindMappings(
    ctx.source,
    ctx.source_store,
    SOURCE_TYPE_PRODUCT,
    [...productSourceIds],
  );
  const variantMappings = await bulkFindMappings(
    ctx.source,
    ctx.source_store,
    SOURCE_TYPE_VARIANT,
    [...variantSourceIds],
  );
  const productIds = [...new Set([...productMappings.values()].map((m) => m.local_id))];
  const productTypes = new Map<string, string>();
  if (productIds.length > 0) {
    const productRows = await db
      .select({ id: products.id, type: products.type })
      .from(products)
      .where(inArray(products.id, productIds));
    for (const p of productRows) {
      productTypes.set(p.id, p.type);
    }
  }

  const jobId = randomUUID();
  await db.insert(importJobs).values({
    id: jobId,
    session_id: ctx.session_id,
    job_type: "orders",
    status: "running",
    total_rows: envelope.records.length,
  });
  await db
    .update(importSessions)
    .set({ status: "running", finished_at: null })
    .where(eq(importSessions.id, ctx.session_id));

  let success = 0;
  let failed = invalidIndices.size;

  for (let i = 0; i < envelope.records.length; i++) {
    if (invalidIndices.has(i)) continue;
    const record = envelope.records[i];
    try {
      const skipped = await db.transaction(async (tx) => {
        const userId = await resolveOrderUserId(ctx, record, tx);
        if (!userId) return true;

        const { order_id: orderId, is_update: isUpdate } = await upsertOrderRow(
          ctx,
          record,
          userId,
          tx,
        );

        if (isUpdate) {
          await tx.delete(orderItems).where(eq(orderItems.order_id, orderId));
        }
        await insertOrderItems(
          ctx,
          orderId,
          record,
          productMappings,
          variantMappings,
          productTypes,
          tx,
        );

        return false;
      });

      if (skipped) {
        failed++;
        errors.push({
          record_index: i,
          source_id: record.source_id,
          code: "MISSING_REFERENCE",
          field: "customer_source_id",
          message: `customer ${record.customer_source_id ?? "<missing>"} 没找到，按 skip_unmatched 策略跳过`,
        });
        continue;
      }
      success++;
    } catch (e) {
      failed++;
      const isValidation = e instanceof ValidationError;
      errors.push({
        record_index: i,
        source_id: record.source_id,
        code: isValidation ? "MISSING_REFERENCE" : "INTERNAL_ERROR",
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
    job_type: "orders",
    total: envelope.records.length,
    success,
    failed,
    errors,
  };
}
