import { db } from '@/lib/db';
import { eq, desc, and, isNull, ne } from 'drizzle-orm';
import { orders, orderItems, products, productVariants, inventory } from '@/storage/database/shared/schema';
import { recordOrderPayment } from './order-payment-service';
import { randomUUID } from 'node:crypto';
import { consumeCouponInTransaction, validateCoupon } from '@/services/admin/coupon-service';
import { ValidationError } from '@/lib/errors';
import { emptyToNull, moneyOrZero, dateOrNull, logDbError } from '@/lib/sanitize';
import { OrderStatus, FinancialStatus, PaymentStatus } from '@/lib/enums';
import { deductInventoryForOrderInTransaction } from './order-stock-service';
import { insertOrderTimeline } from './order-timeline';

interface PricedOrderItem {
  id: string;
  order_id: string;
  product_id: string;
  variant_id: string | null;
  product_title: string;
  product_type: string;
  quantity: number;
  unit_price: string;
  subtotal: string;
  sku: string | null;
  delivery_method: string | null;
}

function generateOrderNo(): string {
  const now = new Date();
  const dateStr = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return 'ORD' + dateStr + random;
}

export async function createOrder(input: {
  user_id: string;
  items: { product_id: string; quantity: number; variant_id?: string | null; delivery_method?: string | null }[];
  buyer_email?: string;
  buyer_name?: string;
  buyer_phone?: string;
  payment_method?: string;
  coupon_code?: string;
  source?: string;
  delivery_zone_id?: string;
  shipping_cost?: string;
  delivery_date?: string;
  delivery_time_slot?: string;
}) {
  const orderId = randomUUID();
  const orderNo = generateOrderNo();
  const normalizedItems = input.items.map((item) => ({
    product_id: item.product_id,
    variant_id: item.variant_id || null,
    quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
    delivery_method: item.delivery_method || null,
  }));

  if (normalizedItems.length === 0) {
    throw new Error('Order must include at least one item');
  }

  // ── COD 风控 ──
  const isOfflinePayment = input.payment_method && input.payment_method !== 'paypal' && input.payment_method !== 'stripe';
  if (isOfflinePayment) {
    // 1. 手机号必填
    if (!input.buyer_phone || !input.buyer_phone.trim()) {
      throw new Error('Phone number is required for offline payment methods');
    }
    // 2. 同一邮箱+手机号每天 COD 上限 3 单
    const phoneKey = input.buyer_phone.trim();
    const emailKey = (input.buyer_email || '').trim();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
const [countRows] = await db.$client.execute(
      `SELECT COUNT(*) as cnt FROM orders
       WHERE buyer_phone = ? AND buyer_email = ?
         AND payment_method NOT IN ('paypal','stripe')
         AND created_at >= ?
         AND status != 'cancelled'`,
      [phoneKey, emailKey, today]
    );
    const cnt = Number((countRows as { cnt: number }[])[0]?.cnt ?? 0);
    if (cnt >= 3) {
      throw new Error('Daily offline order limit reached for this phone/email');
    }
  }

  const pricedItems: PricedOrderItem[] = [];
  for (const item of normalizedItems) {
    const [product] = await db
      .select()
      .from(products)
      .where(and(eq(products.id, item.product_id), eq(products.status, 'active')))
      .limit(1);

    if (!product) {
      throw new Error(`Product not available: ${item.product_id}`);
    }

    // 检查该商品是否有变体，有变体则必须传 variant_id
    const productVariantsList = await db
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(eq(productVariants.product_id, item.product_id))
      .limit(1);

    if (productVariantsList.length > 0 && !item.variant_id) {
      throw new ValidationError(`Product "${product.title}" has variants — please select a specific variant`);
    }

    let unitPrice = Number(product.price);
    let sku: string | null = null;

    // ── delivery_method 校验 ──
    const { parseDeliveryMethods } = await import("@/config/delivery-methods");
    const allowedMethods = parseDeliveryMethods(product.delivery_method);

    let finalDeliveryMethod: string | null = null;
    if (allowedMethods.length >= 2) {
      // 商品支持多种交付方式 → 必须显式选择
      if (!item.delivery_method) {
        throw new ValidationError(
          `Product "${product.title}" has multiple delivery methods — please select one`
        );
      }
      if (!allowedMethods.includes(item.delivery_method)) {
        throw new ValidationError(
          `"${item.delivery_method}" is not an allowed delivery method for "${product.title}". Allowed: ${allowedMethods.join(", ")}`
        );
      }
      finalDeliveryMethod = item.delivery_method;
    } else if (allowedMethods.length === 1) {
      // 只有一种交付方式 → 自动使用（除非用户显式传了且在列表中）
      if (item.delivery_method && !allowedMethods.includes(item.delivery_method)) {
        throw new ValidationError(
          `"${item.delivery_method}" is not an allowed delivery method for "${product.title}". Allowed: ${allowedMethods.join(", ")}`
        );
      }
      finalDeliveryMethod = item.delivery_method && allowedMethods.includes(item.delivery_method)
        ? item.delivery_method
        : allowedMethods[0];
    }
    // allowedMethods.length === 0 → finalDeliveryMethod = null

    if (item.variant_id) {
      const [variant] = await db
        .select()
        .from(productVariants)
        .where(and(eq(productVariants.id, item.variant_id), eq(productVariants.product_id, item.product_id)))
        .limit(1);

      if (!variant) {
        throw new Error(`Variant not available: ${item.variant_id}`);
      }
      unitPrice = Number(variant.price);
      sku = variant.sku || null;

      if (product.type === 'physical') {
        const stockRows = await db.select({ stock: inventory.stock }).from(inventory).where(and(
          eq(inventory.product_id, item.product_id),
          eq(inventory.variant_id, item.variant_id),
        ));
        const availableStock = stockRows.reduce((sum, row) => sum + Number(row.stock || 0), 0);
        if (availableStock < item.quantity) {
          throw new Error(`Insufficient stock for variant: ${item.variant_id}`);
        }
      }
    } else if (product.type === 'physical') {
      const stockRows = await db
        .select({ stock: inventory.stock })
        .from(inventory)
        .where(and(eq(inventory.product_id, item.product_id), isNull(inventory.variant_id)));
      const availableStock = stockRows.reduce((sum, row) => sum + Number(row.stock || 0), 0);

      if (availableStock < item.quantity) {
        throw new Error(`Insufficient stock for product: ${item.product_id}`);
      }
    }

    const subtotal = unitPrice * item.quantity;
    pricedItems.push({
      id: randomUUID(),
      order_id: orderId,
      product_id: item.product_id,
      variant_id: item.variant_id,
      product_title: product.title,
      product_type: product.type,
      quantity: item.quantity,
      unit_price: unitPrice.toFixed(2),
      subtotal: subtotal.toFixed(2),
      sku,
      delivery_method: finalDeliveryMethod,
    });
  }

  const subtotal = pricedItems.reduce((sum, item) => sum + Number(item.subtotal), 0);

  // ── Coupon ──
  let couponId: string | null = null;
  let discountAmount = 0;
  if (input.coupon_code && input.coupon_code.trim()) {
    try {
      const v = await validateCoupon(input.coupon_code.trim(), subtotal);
      if (v.valid && v.coupon && v.discount && v.discount > 0) {
        couponId = v.coupon.id;
        discountAmount = Math.min(v.discount, subtotal);
      }
    } catch {
      // 优惠码校验失败：忽略，按原价下单
    }
  }

  const shippingCost = Number(input.shipping_cost || 0);
  const totalAmount = Math.max(0, subtotal - discountAmount + shippingCost).toFixed(2);

  await db.transaction(async (tx) => {
    await tx.insert(orders).values({
      id: orderId,
      order_no: orderNo,
      user_id: input.user_id,
      source: input.source || 'web',
      delivery_zone_id: emptyToNull(input.delivery_zone_id),
      shipping_cost: moneyOrZero(input.shipping_cost),
      delivery_date: dateOrNull(input.delivery_date),
      delivery_time_slot: emptyToNull(input.delivery_time_slot),
      status: OrderStatus.Pending,
      financial_status: FinancialStatus.Pending,
      payment_status: PaymentStatus.Unpaid,
      payment_method: emptyToNull(input.payment_method),
      total_amount: totalAmount,
      buyer_email: emptyToNull(input.buyer_email),
      buyer_name: emptyToNull(input.buyer_name),
      buyer_phone: emptyToNull(input.buyer_phone),
      coupon_id: couponId,
      discount_amount: discountAmount > 0 ? discountAmount.toFixed(2) : null,
    });

    for (const item of pricedItems) {
      await tx.insert(orderItems).values(item);
    }
  });

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  return order;
}

export async function getOrder(orderId: string) {
  try {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) return null;
    const items = await db.select().from(orderItems).where(eq(orderItems.order_id, orderId));
    return { ...order, items, order_items: items };
  } catch (error) {
    throw error;
  }
}

export async function getOrderByNo(orderNo: string) {
  try {
    const [order] = await db.select().from(orders).where(eq(orders.order_no, orderNo)).limit(1);
    if (!order) return null;
    const items = await db.select().from(orderItems).where(eq(orderItems.order_id, order.id));
    return { ...order, items, order_items: items };
  } catch (error) {
    throw error;
  }
}

export async function listUserOrders(userId: string, status?: string) {
  try {
    const where = status
      ? and(eq(orders.user_id, userId), eq(orders.status, status))
      : eq(orders.user_id, userId);
    const data = await db.select().from(orders)
      .where(where)
      .orderBy(desc(orders.created_at));

    const withItems = await Promise.all(
      data.map(async (order) => {
        const items = await db.select().from(orderItems).where(eq(orderItems.order_id, order.id));
        return { ...order, items, order_items: items };
      })
    );
    return { data: withItems, error: null };
  } catch (error) {
    return { data: [], error };
  }
}

export async function getOrderForPayment(orderId: string, userId: string) {
  const order = await getOrder(orderId);
  if (!order || order.user_id !== userId) return null;
  return order;
}

export async function updateOrderStatus(orderId: string, status?: string, financial_status?: string, fulfillment_status?: string, payment_status?: string, payment_id?: string) {
  try {
    const updateData: Record<string, unknown> = {};
    if (status !== undefined) updateData.status = status;
    if (financial_status !== undefined) updateData.financial_status = financial_status;
    if (fulfillment_status !== undefined) updateData.fulfillment_status = fulfillment_status;
    if (payment_status !== undefined) updateData.payment_status = payment_status;
    if (payment_id !== undefined) updateData.payment_id = payment_id;

    await db.update(orders).set(updateData ).where(eq(orders.id, orderId));
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    return order;
  } catch (error) {
    throw error;
  }
}

export async function listAllOrders() {
  try {
    const data = await db.select().from(orders).orderBy(desc(orders.created_at));
    return { data: data || [], error: null };
  } catch (error) {
    return { data: [], error };
  }
}

export async function updateOrder(orderId: string, updates: Record<string, string>) {
  const status = updates?.status;
  const financial_status = updates?.financial_status;
  const fulfillment_status = updates?.fulfillment_status;
  const payment_status = updates?.payment_status;
  const payment_id = updates?.payment_id;
  return updateOrderStatus(orderId, status, financial_status, fulfillment_status, payment_status, payment_id);
}

export interface MarkOrderPaidResult {
  transitioned: boolean;
  conflict: boolean;
  order: typeof orders.$inferSelect | null;
}

interface MarkOrderPaidPayload {
  payment_id: string;
  financial_status?: string;
  source?: string;
  operator_id?: string | null;
  store_id?: string | null;
  /**
   * True only after an external provider has already confirmed/captured money.
   * If local finalization fails in that case, persist an explicit conflict
   * instead of pretending the order is normally paid.
   */
  external_payment_confirmed?: boolean;
}

async function recordPaymentFinalizeConflict(
  orderId: string,
  payload: MarkOrderPaidPayload,
  cause: unknown,
): Promise<MarkOrderPaidResult> {
  return db.transaction(async (tx) => {
    const result = await tx.update(orders).set({
      status: "payment_conflict",
      financial_status: payload.financial_status || "paid",
      payment_status: "paid",
      payment_id: payload.payment_id,
      updated_at: new Date(),
    }).where(and(eq(orders.id, orderId), ne(orders.payment_status, "paid")));

    const affectedRows = (result as unknown as [{ affectedRows: number }, unknown])[0]?.affectedRows ?? 0;
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) return { transitioned: false, conflict: false, order: null };

    if (affectedRows >= 1) {
      await recordOrderPayment({
        orderId: order.id,
        channel: order.source === "pos" ? "pos" : "storefront",
        method: order.payment_method || "unknown",
        label: order.payment_method || "Unknown",
        amount: order.total_amount,
        reference: "payment_finalize_conflict",
        providerTransactionId: payload.payment_id,
        status: "recorded",
        recordedBy: payload.operator_id ?? null,
      }, tx);

      const reason = cause instanceof Error ? cause.message : String(cause);
      await insertOrderTimeline({
        order_id: order.id,
        action: "payment_conflict",
        description: `Payment confirmed but local finalization failed (${payload.source ?? "payment"}): ${reason.slice(0, 500)}`,
        old_value: "unpaid",
        new_value: "payment_conflict",
        operator_id: payload.operator_id ?? null,
      }, tx);
    }

    const [updated] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    return {
      transitioned: affectedRows >= 1,
      conflict: updated?.status === "payment_conflict",
      order: updated ?? null,
    };
  });
}

/**
 * Finalize a verified payment as one database transaction.
 *
 * The order row, inventory allocation, coupon consumption, payment ledger and
 * timeline commit together. A local failure rolls the transaction back.
 *
 * For externally captured payments, a rollback is followed by an explicit
 * payment_conflict state so the database never presents the order as a normal
 * paid order without the required local effects.
 */
export async function markOrderPaidIfNotAlready(
  orderId: string,
  payload: MarkOrderPaidPayload,
): Promise<MarkOrderPaidResult> {
  try {
    const result = await db.transaction(async (tx): Promise<MarkOrderPaidResult> => {
      const update = await tx.update(orders).set({
        status: "paid",
        financial_status: payload.financial_status || "paid",
        payment_status: "paid",
        payment_id: payload.payment_id,
        updated_at: new Date(),
      }).where(and(
        eq(orders.id, orderId),
        ne(orders.payment_status, "paid"),
        ne(orders.status, "cancelled"),
      ));

      const affectedRows = (update as unknown as [{ affectedRows: number }, unknown])[0]?.affectedRows ?? 0;
      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!order) return { transitioned: false, conflict: false, order: null };

      if (affectedRows < 1) {
        return {
          transitioned: false,
          conflict: order.status === "payment_conflict",
          order,
        };
      }

      const stock = await deductInventoryForOrderInTransaction(order.id, {
        operatorId: payload.operator_id ?? null,
        storeId: payload.store_id ?? order.store_id ?? null,
        source: payload.source ?? "payment",
      }, tx);

      if (order.coupon_id) {
        await consumeCouponInTransaction(order.coupon_id, tx);
      }

      await recordOrderPayment({
        orderId: order.id,
        channel: order.source === "pos" ? "pos" : "storefront",
        method: order.payment_method || "unknown",
        label: order.payment_method || "Unknown",
        amount: order.total_amount,
        reference: null,
        providerTransactionId: payload.payment_id,
        status: "recorded",
        recordedBy: payload.operator_id ?? null,
      }, tx);

      if (stock.deducted) {
        await insertOrderTimeline({
          order_id: order.id,
          action: "stock_deducted",
          description: `Inventory allocated for ${stock.items.length} item(s) (${payload.source ?? "payment"})`,
          operator_id: payload.operator_id ?? null,
        }, tx);
      }

      await insertOrderTimeline({
        order_id: order.id,
        action: "paid",
        description: `支付确认(来源: ${payload.source ?? "payment"})`,
        old_value: "unpaid",
        new_value: "paid",
        operator_id: payload.operator_id ?? null,
      }, tx);

      const [updated] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      return { transitioned: true, conflict: false, order: updated ?? order };
    });

    if (
      payload.external_payment_confirmed
      && result.order
      && result.order.payment_status !== "paid"
    ) {
      return recordPaymentFinalizeConflict(
        orderId,
        payload,
        new Error(`cannot finalize order from status ${result.order.status}`),
      );
    }
    return result;
  } catch (error) {
    if (!payload.external_payment_confirmed) throw error;
    return recordPaymentFinalizeConflict(orderId, payload, error);
  }
}
