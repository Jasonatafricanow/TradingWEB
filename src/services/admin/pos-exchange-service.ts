import { randomUUID } from 'node:crypto';

import { asc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { allocateInventory } from '@/services/inventory/inventory-allocation-service';
import { formatCents, parseMoneyToCents } from '@/services/orders/order-money';
import { recordOrderPayment } from '@/services/orders/order-payment-service';
import { priceOrder, type DbTx, type PricedOrder } from '@/services/orders/order-pricing-service';
import { orderItems, orders, orderTimeline, paymentMethods, posExchanges, stores } from '@/storage/database/shared/schema';
import {
  hashPosRequest,
  type PosExchangeRequest,
  type PosOrderDto,
  type PosPaymentInput,
} from './pos-contracts';
import { PosApiError } from './pos-errors';
import type { IdempotencyCompletion, IdempotencyInput } from './pos-idempotency-service';
import { runIdempotent } from './pos-idempotency-service';
import type { PosOperatorContext } from './pos-operator-session-service';
import type { PosCheckoutStore } from './pos-service';
import { parsePosTaxRateBps } from './pos-store-config';
import {
  approvalHash,
  assertPosReturnOperator,
  databasePosReturnDependencies,
  preparePosReturn,
  type PosReturnDependencies,
} from './refund-service';

export interface PosExchangeInput extends PosExchangeRequest {
  account_user_id: string;
  operator: PosOperatorContext;
}

export interface PosExchangeResult {
  exchange_id: string;
  original_order_id: string;
  replacement_order: PosOrderDto;
  refund_amount: string;
  new_order_amount: string;
  difference_amount: string;
}

interface CreateReplacementInput {
  request: PosExchangeInput['replacement'];
  priced: PricedOrder;
  store: PosCheckoutStore;
  accountUserId: string;
  operatorId: string;
  payments: PosPaymentInput[];
  now: Date;
  shiftId: string | null;
}

export interface PosExchangeDependencies extends PosReturnDependencies {
  runIdempotent<T>(input: IdempotencyInput, work: () => Promise<T>, completion?: IdempotencyCompletion<T>): Promise<T>;
  transaction<T>(work: (tx: DbTx) => Promise<T>): Promise<T>;
  getStore(storeId: string): Promise<PosCheckoutStore | null>;
  priceReplacement(input: PosExchangeInput['replacement'], taxRateBps: number, tx: DbTx): Promise<PricedOrder>;
  createReplacement(input: CreateReplacementInput, tx: DbTx): Promise<PosOrderDto>;
  allocateReplacement(input: { storeId: string; priced: PricedOrder; operatorId: string; orderId: string; storeName: string }, tx: DbTx): Promise<void>;
  recordDifferencePayment(input: { orderId: string; payments: PosPaymentInput[]; operatorId: string }, tx: DbTx): Promise<void>;
  insertExchange(input: {
    id: string; idempotencyKey: string; storeId: string; originalOrderId: string; replacementOrderId: string;
    refundId: string; refundAmount: string; newOrderAmount: string; differenceAmount: string; operatorId: string; createdAt: Date;
  }, tx: DbTx): Promise<void>;
}

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function generatePosOrderNo(): string {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `POS${date}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function preview(priced: PricedOrder) {
  return {
    subtotal: priced.subtotal,
    discount: formatCents(parseMoneyToCents(priced.lineDiscountTotal) + parseMoneyToCents(priced.orderDiscount)),
    tax: priced.tax,
    total: priced.total,
  };
}

const databaseExchangeDependencies: PosExchangeDependencies = {
  ...databasePosReturnDependencies,
  runIdempotent,
  transaction: (work) => db.transaction(work),
  async getStore(storeId) {
    const [store] = await db.select({ id: stores.id, name: stores.name, status: stores.status, metadata: stores.metadata })
      .from(stores).where(eq(stores.id, storeId)).limit(1);
    if (!store) return null;
    const methods = await db.select({ code: paymentMethods.code }).from(paymentMethods)
      .where(eq(paymentMethods.enabled, true)).orderBy(asc(paymentMethods.sort_order));
    const metadata = metadataObject(store.metadata);
    return {
      id: store.id,
      name: store.name,
      status: store.status,
      currency: typeof metadata.currency === 'string' ? metadata.currency : 'USD',
      taxRateBps: parsePosTaxRateBps(metadata.tax_rate),
      pricingVersion: typeof metadata.pricing_version === 'string' ? metadata.pricing_version : 'pos-v1',
      paymentMethods: methods.map((method) => method.code),
    };
  },
  priceReplacement: (input, taxRateBps, tx) => priceOrder({
    items: input.items,
    order_discount: input.order_discount,
    tax_rate_bps: taxRateBps,
  }, undefined, tx),
  async createReplacement(input, tx) {
    const orderId = randomUUID();
    const orderNo = generatePosOrderNo();
    const fulfillmentStatus = input.request.fulfillment.method === 'in_store' ? 'fulfilled' : 'unfulfilled';
    const pickupAt = input.request.fulfillment.method === 'pickup' ? input.request.fulfillment.pickup_at ?? null : null;
    await tx.insert(orders).values({
      id: orderId,
      order_no: orderNo,
      user_id: input.request.customer_id ?? 'pos-guest',
      store_id: input.store.id,
      shift_id: input.shiftId,
      staff_id: input.operatorId,
      account_user_id: input.accountUserId,
      source: 'pos',
      client_ref: input.request.idempotency_key,
      status: 'completed',
      financial_status: 'paid',
      payment_status: 'paid',
      fulfillment_status: fulfillmentStatus,
      total_amount: input.priced.total,
      currency: input.store.currency,
      payment_method: input.payments.length === 1 ? input.payments[0].method : 'split',
      payment_id: `pos:${input.operatorId}`,
      buyer_name: 'contact_name' in input.request.fulfillment ? input.request.fulfillment.contact_name : null,
      buyer_phone: 'phone' in input.request.fulfillment ? input.request.fulfillment.phone : null,
      pickup_contact_name: input.request.fulfillment.method === 'pickup' ? input.request.fulfillment.contact_name : null,
      pickup_phone: input.request.fulfillment.method === 'pickup' ? input.request.fulfillment.phone : null,
      pickup_store_id: input.request.fulfillment.method === 'pickup' ? input.store.id : null,
      delivery_date: pickupAt?.slice(0, 10) ?? null,
      delivery_time_slot: pickupAt?.slice(11, 16) ?? null,
      shipping_address: input.request.fulfillment.method === 'ship' ? { address: input.request.fulfillment.address } : null,
      notes: input.request.note,
      discount_amount: preview(input.priced).discount,
      created_at: input.now,
    });
    const dtoItems: PosOrderDto['items'] = [];
    for (const line of input.priced.lines) {
      const itemId = randomUUID();
      await tx.insert(orderItems).values({
        id: itemId,
        order_id: orderId,
        product_id: line.productId,
        variant_id: line.variantId,
        product_title: line.title,
        product_type: line.productType,
        sku: line.sku,
        quantity: line.quantity,
        unit_price: line.unitPrice,
        subtotal: line.lineTotal,
        delivery_method: input.request.fulfillment.method,
      });
      dtoItems.push({
        id: itemId, product_id: line.productId, variant_id: line.variantId, name: line.title, sku: line.sku,
        quantity: line.quantity, unit_price: line.unitPrice, line_discount: line.lineDiscount,
        delivery_method: input.request.fulfillment.method,
      });
    }
    return {
      id: orderId,
      order_no: orderNo,
      created_at: input.now.toISOString(),
      source: 'pos',
      status: 'completed',
      financial_status: 'paid',
      fulfillment_status: fulfillmentStatus,
      subtotal: input.priced.subtotal,
      discount_total: preview(input.priced).discount,
      tax_total: input.priced.tax,
      total: input.priced.total,
      refunded_total: '0.00',
      pickup_contact_name: input.request.fulfillment.method === 'pickup' ? input.request.fulfillment.contact_name : null,
      pickup_phone: input.request.fulfillment.method === 'pickup' ? input.request.fulfillment.phone : null,
      pickup_store_id: input.request.fulfillment.method === 'pickup' ? input.store.id : null,
      pickup_ready_at: null,
      picked_up_at: null,
      items: dtoItems,
      payments: input.payments,
    };
  },
  async allocateReplacement(input, tx) {
    await allocateInventory({
      storeId: input.storeId,
      lines: input.priced.lines,
      operatorId: input.operatorId,
      referenceType: 'order',
      referenceId: input.orderId,
      note: `POS exchange replacement (${input.storeName})`,
    }, undefined, tx);
  },
  async recordDifferencePayment(input, tx) {
    for (const payment of input.payments) {
      await recordOrderPayment({
        orderId: input.orderId,
        channel: 'pos',
        method: payment.method,
        label: payment.label,
        amount: payment.amount,
        reference: payment.reference,
        providerTransactionId: null,
        status: 'recorded',
        recordedBy: input.operatorId,
      }, tx);
    }
  },
  async insertExchange(input, tx) {
    await tx.insert(posExchanges).values({
      id: input.id,
      idempotency_key: input.idempotencyKey,
      store_id: input.storeId,
      original_order_id: input.originalOrderId,
      replacement_order_id: input.replacementOrderId,
      refund_id: input.refundId,
      refund_amount: input.refundAmount,
      new_order_amount: input.newOrderAmount,
      difference_amount: input.differenceAmount,
      approval_token_id: null,
      operator_id: input.operatorId,
      created_at: input.createdAt,
    });
  },
};

function sumPayments(payments: PosPaymentInput[]): number {
  return payments.reduce((sum, payment) => sum + parseMoneyToCents(payment.amount), 0);
}

export async function exchangePosOrder(
  input: PosExchangeInput,
  dependencies: PosExchangeDependencies = databaseExchangeDependencies,
): Promise<PosExchangeResult> {
  assertPosReturnOperator(input, 'exchange');
  if (!input.approval_token) throw new PosApiError('APPROVAL_REQUIRED', 'A one-time approval token is required', 403);
  if (input.replacement.staff_id !== input.operator.staffId || input.replacement.store_id !== input.store_id) {
    throw new PosApiError('OPERATOR_MISMATCH', 'Operator session does not match replacement request', 403);
  }
  const store = await dependencies.getStore(input.store_id);
  if (!store) throw new PosApiError('STORE_NOT_FOUND', 'Store not found', 404);
  if (store.status !== 'active') throw new PosApiError('STORE_INACTIVE', 'Store is not active', 409);
  if (input.replacement.currency !== store.currency) throw new PosApiError('CURRENCY_MISMATCH', 'Replacement currency does not match store currency', 409);
  if (input.replacement.pricing_version !== store.pricingVersion) throw new PosApiError('PRICING_VERSION_CHANGED', 'Pricing version changed', 409);
  for (const payment of input.difference_payment) {
    if (!store.paymentMethods.includes(payment.method) && !payment.method.startsWith('custom_')) {
      throw new PosApiError('PAYMENT_METHOD_NOT_ALLOWED', `Payment method is not allowed: ${payment.method}`, 400);
    }
  }
  const resourceHash = approvalHash(input as unknown as Record<string, unknown>);

  return dependencies.runIdempotent({
    key: input.idempotency_key,
    operation: 'exchange',
    storeId: input.store_id,
    requestHash: resourceHash,
  }, () => dependencies.transaction(async (tx) => {
    const approvedBy = await dependencies.consumeApprovalToken(input.approval_token!, 'exchange', resourceHash, input.store_id, tx);
    const shiftId = await dependencies.findOpenShiftId(input.store_id, tx);
    const prepared = await preparePosReturn({
      orderId: input.original_order_id,
      storeId: input.store_id,
      returnItems: input.return_items,
    }, dependencies, tx);
    const priced = await dependencies.priceReplacement(input.replacement, store.taxRateBps, tx);
    const authoritative = preview(priced);
    if (JSON.stringify(authoritative) !== JSON.stringify(input.replacement.pricing_preview)) {
      throw new PosApiError('PRICING_CHANGED', 'Authoritative replacement pricing changed', 409, false, authoritative);
    }
    if (sumPayments(input.replacement.payments) !== parseMoneyToCents(priced.total)) {
      throw new PosApiError('PAYMENT_TOTAL_MISMATCH', 'Replacement payment preview must equal the authoritative total', 409);
    }
    const differenceCents = parseMoneyToCents(priced.total) - parseMoneyToCents(prepared.amount);
    const requiredDifferenceCents = Math.max(0, differenceCents);
    if (sumPayments(input.difference_payment) !== requiredDifferenceCents) {
      throw new PosApiError('DIFFERENCE_PAYMENT_MISMATCH', 'Difference payments must equal the positive exchange difference', 409, false, {
        difference_amount: formatCents(differenceCents),
      });
    }
    const creditCents = Math.min(parseMoneyToCents(prepared.amount), parseMoneyToCents(priced.total));
    const actualPayments: PosPaymentInput[] = [
      ...(creditCents > 0 ? [{ method: 'exchange_credit', label: 'Exchange credit', amount: formatCents(creditCents), reference: input.original_order_id }] : []),
      ...input.difference_payment,
    ];
    const exchangeId = dependencies.newId();
    const refundId = dependencies.newId();
    for (const line of prepared.requested) {
      if (line.input.restock) {
        await dependencies.restockReturn(line.item, line.input.quantity, input.store_id, input.operator.staffId, refundId, tx);
      }
    }
    const now = dependencies.now();
    const replacement = await dependencies.createReplacement({
      request: input.replacement,
      priced,
      store,
      accountUserId: input.account_user_id,
      operatorId: input.operator.staffId,
      payments: actualPayments,
      now,
      shiftId,
    }, tx);
    await dependencies.allocateReplacement({
      storeId: store.id,
      priced,
      operatorId: input.operator.staffId,
      orderId: replacement.id,
      storeName: store.name,
    }, tx);
    await dependencies.recordDifferencePayment({ orderId: replacement.id, payments: actualPayments, operatorId: input.operator.staffId }, tx);
    await dependencies.insertRefund({
      id: refundId,
      orderId: prepared.order.id,
      accountUserId: input.account_user_id,
      amount: prepared.amount,
      reason: 'POS exchange',
      restocked: input.return_items.every((item) => item.restock),
      operatorId: input.operator.staffId,
      approvedBy,
      shiftId,
      createdAt: now,
    }, tx);
    await dependencies.insertExchange({
      id: exchangeId,
      idempotencyKey: input.idempotency_key,
      storeId: input.store_id,
      originalOrderId: prepared.order.id,
      replacementOrderId: replacement.id,
      refundId,
      refundAmount: prepared.amount,
      newOrderAmount: priced.total,
      differenceAmount: formatCents(differenceCents),
      operatorId: input.operator.staffId,
      createdAt: now,
    }, tx);
    for (const line of prepared.requested) {
      await dependencies.insertReturnItem({
        id: dependencies.newId(), refundId, orderItemId: line.item.id, quantity: line.input.quantity,
        restock: line.input.restock, createdAt: now,
      }, tx);
    }
    await dependencies.updateOriginalOrder({
      orderId: prepared.order.id,
      refundedTotal: prepared.refundedTotal,
      fullyRefunded: prepared.refundedTotal === prepared.order.total,
    }, tx);
    await dependencies.insertTimeline({
      id: dependencies.newId(), order_id: prepared.order.id, action: 'pos_exchange_return',
      description: `Exchange ${exchangeId}`, new_value: prepared.amount, operator_id: input.operator.staffId, created_at: now,
    }, tx);
    await dependencies.insertTimeline({
      id: dependencies.newId(), order_id: replacement.id, action: 'pos_exchange_replacement',
      description: `Exchange ${exchangeId}`, old_value: prepared.order.id, new_value: priced.total,
      operator_id: input.operator.staffId, created_at: now,
    }, tx);
    await dependencies.enqueueAuditEvent(tx, {
      eventType: 'pos.exchange.completed',
      entityType: 'exchange',
      entityId: exchangeId,
      storeId: input.store_id,
      operatorId: input.operator.staffId,
      payload: {
        original_order_id: prepared.order.id,
        replacement_order_id: replacement.id,
        refund_amount: prepared.amount,
        difference_amount: formatCents(differenceCents),
        shift_id: shiftId,
      },
    });
    return {
      exchange_id: exchangeId,
      original_order_id: prepared.order.id,
      replacement_order: replacement,
      refund_amount: prepared.amount,
      new_order_amount: priced.total,
      difference_amount: formatCents(differenceCents),
    };
  }), {
    responseStatus: 201,
    resourceType: 'exchange',
    resourceId: (result) => result.exchange_id,
  });
}
