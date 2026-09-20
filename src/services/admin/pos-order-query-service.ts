import { randomUUID } from "node:crypto";

import { and, desc, eq, gte, like, lte, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db";
import { orderTimeline, orders } from "@/storage/database/shared/schema";
import type { PosOperatorContext } from "./pos-operator-session-service";

export type PickupFulfillmentStatus = "unfulfilled" | "preparing" | "ready" | "picked_up";

export interface PosOrderQuery {
  page: number;
  pageSize: number;
  source: "pos" | "web" | null;
  storeId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
  customerId?: string;
  fulfillmentStatus?: string;
}

export interface PosOrderListRow {
  id: string;
  order_no: string;
  created_at: Date | string;
  source: string;
  store_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  status: string;
  financial_status: string | null;
  fulfillment_status: string | null;
  total: string;
  refunded_total: string;
  item_count: number;
  pickup_contact_name: string | null;
  pickup_phone: string | null;
  pickup_store_id: string | null;
  pickup_ready_at: Date | string | null;
  picked_up_at: Date | string | null;
}

export interface PosOrderPageItem extends Omit<PosOrderListRow, "created_at" | "pickup_ready_at" | "picked_up_at"> {
  created_at: string;
  fulfillment_status: string;
  financial_status: string;
  pickup_ready_at: string | null;
  picked_up_at: string | null;
}

export interface Page<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
  has_more: boolean;
}

export interface PickupOrderRow {
  id: string;
  store_id: string | null;
  fulfillment_status: string | null;
  pickup_store_id: string | null;
}

export interface PickupTransaction {
  lockOrder(orderId: string): Promise<PickupOrderRow | null>;
  updateFulfillment(orderId: string, values: {
    fulfillment_status: PickupFulfillmentStatus;
    pickup_ready_at?: Date;
    picked_up_at?: Date;
    updated_at: Date;
  }): Promise<void>;
  addTimeline(entry: {
    order_id: string;
    action: string;
    description: string;
    old_value: string;
    new_value: string;
    operator_id: string;
  }): Promise<void>;
}

export interface PosOrderQueryRepository {
  list(query: PosOrderQuery & { storeId: string; offset: number; limit: number }): Promise<{ rows: PosOrderListRow[]; total: number }>;
  withTransaction<T>(work: (transaction: PickupTransaction) => Promise<T>): Promise<T>;
}

export interface PosOrderDetail extends PosOrderPageItem {
  note: string | null;
  subtotal: string;
  discount_total: string;
  tax_total: string;
  items: Array<Record<string, unknown>>;
  payments: Array<Record<string, unknown>>;
}

export interface PosOrderDetailRepository {
  get(orderId: string, storeId: string): Promise<(PosOrderListRow & {
    note: string | null;
    subtotal: string;
    discount_total: string;
    tax_total: string;
    items: Array<Record<string, unknown>>;
    payments: Array<Record<string, unknown>>;
  }) | null>;
}

export class PosOrderQueryError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) {
    super(message);
  }
}

export class PosFulfillmentError extends PosOrderQueryError {}

function positiveInteger(value: string | null, fallback: number, name: string): number {
  if (value === null || value === "") return fallback;
  if (!/^\d+$/.test(value)) throw new PosOrderQueryError("ORDER_QUERY_INVALID", `${name} must be a positive integer`, 400);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new PosOrderQueryError("ORDER_QUERY_INVALID", `${name} must be a positive integer`, 400);
  return parsed;
}

function optionalDate(value: string | null, name: string): Date | undefined {
  if (!value) return undefined;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T${name === "date_to" ? "23:59:59.999" : "00:00:00.000"}Z`)
    : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new PosOrderQueryError("ORDER_QUERY_INVALID", `${name} must be an ISO date`, 400);
  return parsed;
}

function optionalText(value: string | null, name: string, max: number): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > max) throw new PosOrderQueryError("ORDER_QUERY_INVALID", `${name} is too long`, 400);
  return trimmed;
}

export function parsePosOrderQuery(url: URL): PosOrderQuery {
  const page = positiveInteger(url.searchParams.get("page"), 1, "page");
  const pageSize = positiveInteger(url.searchParams.get("page_size"), 50, "page_size");
  if (pageSize > 100) throw new PosOrderQueryError("ORDER_QUERY_INVALID", "page_size must be at most 100", 400);
  const rawSource = url.searchParams.get("source") ?? "pos";
  if (!new Set(["pos", "web", "all"]).has(rawSource)) {
    throw new PosOrderQueryError("ORDER_QUERY_INVALID", "source must be pos, web or all", 400);
  }
  const dateFrom = optionalDate(url.searchParams.get("date_from"), "date_from");
  const dateTo = optionalDate(url.searchParams.get("date_to"), "date_to");
  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new PosOrderQueryError("ORDER_QUERY_INVALID", "date_from must not be after date_to", 400);
  }
  return {
    page,
    pageSize,
    source: rawSource === "all" ? null : rawSource as "pos" | "web",
    storeId: optionalText(url.searchParams.get("store_id"), "store_id", 160),
    dateFrom,
    dateTo,
    search: optionalText(url.searchParams.get("search"), "search", 200),
    customerId: optionalText(url.searchParams.get("customer_id"), "customer_id", 160),
    fulfillmentStatus: optionalText(url.searchParams.get("fulfillment_status"), "fulfillment_status", 20),
  };
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return parsed.toISOString();
}

function toPageItem(row: PosOrderListRow): PosOrderPageItem {
  return {
    ...row,
    customer_id: row.customer_id === "pos-guest" ? null : row.customer_id,
    created_at: iso(row.created_at)!,
    financial_status: row.financial_status ?? "pending",
    fulfillment_status: row.fulfillment_status ?? "unfulfilled",
    pickup_ready_at: iso(row.pickup_ready_at),
    picked_up_at: iso(row.picked_up_at),
  };
}

export async function listPosOrders(input: {
  operator: PosOperatorContext;
  query: PosOrderQuery;
  repository?: PosOrderQueryRepository;
}): Promise<Page<PosOrderPageItem>> {
  if (!input.operator.permissions.includes("checkout")) {
    throw new PosOrderQueryError("ORDER_READ_FORBIDDEN", "Order read permission required", 403);
  }
  if (input.query.storeId && input.query.storeId !== input.operator.storeId) {
    throw new PosOrderQueryError("ORDER_STORE_MISMATCH", "Order query store does not match operator store", 403);
  }
  const offset = (input.query.page - 1) * input.query.pageSize;
  const repository = input.repository ?? databaseRepository;
  const result = await repository.list({
    ...input.query,
    storeId: input.operator.storeId,
    offset,
    limit: input.query.pageSize,
  });
  return {
    items: result.rows.map(toPageItem),
    page: input.query.page,
    page_size: input.query.pageSize,
    total: result.total,
    has_more: offset + result.rows.length < result.total,
  };
}

export async function getPosOrder(input: {
  operator: PosOperatorContext;
  orderId: string;
  repository?: PosOrderDetailRepository;
}): Promise<PosOrderDetail> {
  if (!input.operator.permissions.includes("checkout")) {
    throw new PosOrderQueryError("ORDER_READ_FORBIDDEN", "Order read permission required", 403);
  }
  if (!input.orderId || input.orderId.length > 160) {
    throw new PosOrderQueryError("ORDER_ID_INVALID", "Order ID is invalid", 400);
  }
  const row = await (input.repository ?? databaseDetailRepository).get(input.orderId, input.operator.storeId);
  if (!row) throw new PosOrderQueryError("ORDER_NOT_FOUND", "Order not found", 404);
  return { ...toPageItem(row), note: row.note, subtotal: row.subtotal, discount_total: row.discount_total, tax_total: row.tax_total, items: row.items, payments: row.payments };
}

const NEXT_PICKUP_STATUS: Record<PickupFulfillmentStatus, PickupFulfillmentStatus | null> = {
  unfulfilled: "preparing",
  preparing: "ready",
  ready: "picked_up",
  picked_up: null,
};

function pickupStatus(value: string | null): PickupFulfillmentStatus {
  const normalized = value ?? "unfulfilled";
  if (!(normalized in NEXT_PICKUP_STATUS)) {
    throw new PosFulfillmentError("PICKUP_STATE_INVALID", `Order is in incompatible fulfillment state ${normalized}`, 409);
  }
  return normalized as PickupFulfillmentStatus;
}

export async function transitionPickupFulfillment(input: {
  operator: PosOperatorContext;
  orderId: string;
  nextStatus: PickupFulfillmentStatus;
  repository?: PosOrderQueryRepository;
  now?: Date;
}): Promise<{ id: string; fulfillment_status: PickupFulfillmentStatus }> {
  if (!input.operator.permissions.includes("checkout")) {
    throw new PosFulfillmentError("FULFILLMENT_FORBIDDEN", "Fulfillment permission required", 403);
  }
  const repository = input.repository ?? databaseRepository;
  const now = input.now ?? new Date();
  return repository.withTransaction(async (transaction) => {
    const order = await transaction.lockOrder(input.orderId);
    if (!order) throw new PosFulfillmentError("ORDER_NOT_FOUND", "Order not found", 404);
    if (order.store_id !== input.operator.storeId) {
      throw new PosFulfillmentError("ORDER_STORE_MISMATCH", "Order store does not match operator store", 403);
    }
    if (!order.pickup_store_id) {
      throw new PosFulfillmentError("ORDER_NOT_PICKUP", "Only pickup orders use the pickup state machine", 409);
    }
    const current = pickupStatus(order.fulfillment_status);
    if (NEXT_PICKUP_STATUS[current] !== input.nextStatus) {
      throw new PosFulfillmentError("PICKUP_TRANSITION_INVALID", `Cannot transition pickup from ${current} to ${input.nextStatus}`, 409);
    }
    const values: Parameters<PickupTransaction["updateFulfillment"]>[1] = {
      fulfillment_status: input.nextStatus,
      updated_at: now,
    };
    if (input.nextStatus === "ready") values.pickup_ready_at = now;
    if (input.nextStatus === "picked_up") values.picked_up_at = now;
    await transaction.updateFulfillment(order.id, values);
    await transaction.addTimeline({
      order_id: order.id,
      action: "pickup_fulfillment",
      description: `Pickup status changed from ${current} to ${input.nextStatus}`,
      old_value: current,
      new_value: input.nextStatus,
      operator_id: input.operator.staffId,
    });
    return { id: order.id, fulfillment_status: input.nextStatus };
  });
}

function conditionsFor(query: PosOrderQuery & { storeId: string }): SQL[] {
  const conditions: SQL[] = [eq(orders.store_id, query.storeId)];
  if (query.source) conditions.push(eq(orders.source, query.source));
  if (query.dateFrom) conditions.push(gte(orders.created_at, query.dateFrom));
  if (query.dateTo) conditions.push(lte(orders.created_at, query.dateTo));
  if (query.customerId) conditions.push(eq(orders.user_id, query.customerId));
  if (query.fulfillmentStatus) conditions.push(eq(orders.fulfillment_status, query.fulfillmentStatus));
  if (query.search) {
    const pattern = `%${query.search.replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push(or(
      like(orders.order_no, pattern),
      like(orders.buyer_name, pattern),
      like(orders.buyer_email, pattern),
      like(orders.buyer_phone, pattern),
    )!);
  }
  return conditions;
}

const databaseRepository: PosOrderQueryRepository = {
  async list(query) {
    const where = and(...conditionsFor(query));
    const [countRows, rows] = await Promise.all([
      db.select({ count: sql<number>`COUNT(*)` }).from(orders).where(where),
      db.select({
        id: orders.id,
        order_no: orders.order_no,
        created_at: orders.created_at,
        source: orders.source,
        store_id: orders.store_id,
        customer_id: orders.user_id,
        customer_name: orders.buyer_name,
        status: orders.status,
        financial_status: orders.financial_status,
        fulfillment_status: orders.fulfillment_status,
        total: orders.total_amount,
        refunded_total: orders.refunded_total,
        item_count: sql<number>`(SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi WHERE oi.order_id = ${orders.id})`,
        pickup_contact_name: orders.pickup_contact_name,
        pickup_phone: orders.pickup_phone,
        pickup_store_id: orders.pickup_store_id,
        pickup_ready_at: orders.pickup_ready_at,
        picked_up_at: orders.picked_up_at,
      }).from(orders).where(where).orderBy(desc(orders.created_at), desc(orders.id)).limit(query.limit).offset(query.offset),
    ]);
    return { rows: rows as PosOrderListRow[], total: Number(countRows[0]?.count ?? 0) };
  },
  withTransaction(work) {
    return db.transaction(async (transaction) => work({
      async lockOrder(orderId) {
        const [row] = await transaction.select({
          id: orders.id,
          store_id: orders.store_id,
          fulfillment_status: orders.fulfillment_status,
          pickup_store_id: orders.pickup_store_id,
        }).from(orders).where(eq(orders.id, orderId)).for("update");
        return row ?? null;
      },
      async updateFulfillment(orderId, values) {
        await transaction.update(orders).set(values).where(eq(orders.id, orderId));
      },
      async addTimeline(entry) {
        await transaction.insert(orderTimeline).values({ id: randomUUID(), ...entry });
      },
    }));
  },
};

const databaseDetailRepository: PosOrderDetailRepository = {
  async get(orderId, storeId) {
    const [orderRows] = await db.$client.execute(
      `SELECT o.id, o.order_no, o.created_at, o.source, o.store_id,
              NULLIF(o.user_id, 'pos-guest') AS customer_id, o.buyer_name AS customer_name,
              o.status, o.financial_status, o.fulfillment_status,
              o.total_amount AS total, o.refunded_total,
              o.pickup_contact_name, o.pickup_phone, o.pickup_store_id,
              o.pickup_ready_at, o.picked_up_at, o.notes AS note,
              COALESCE(o.discount_amount, 0) AS discount_total,
              COALESCE((SELECT SUM(oi.unit_price * oi.quantity) FROM order_items oi WHERE oi.order_id = o.id), o.total_amount) AS subtotal,
              GREATEST(
                o.total_amount
                - COALESCE((SELECT SUM(oi.unit_price * oi.quantity) FROM order_items oi WHERE oi.order_id = o.id), o.total_amount)
                + COALESCE(o.discount_amount, 0)
                - COALESCE(o.shipping_cost, 0),
                0
              ) AS tax_total,
              COALESCE((SELECT SUM(oi.quantity) FROM order_items oi WHERE oi.order_id = o.id), 0) AS item_count
       FROM orders o
       WHERE o.id = ? AND o.store_id = ?
       LIMIT 1`,
      [orderId, storeId],
    );
    const row = (orderRows as Array<Record<string, unknown>>)[0];
    if (!row) return null;
    const [[itemRows], [paymentRows]] = await Promise.all([
      db.$client.execute(
        `SELECT id, product_id, variant_id, product_title AS name, sku, quantity,
                unit_price, GREATEST((unit_price * quantity) - subtotal, 0) AS line_discount, delivery_method
         FROM order_items WHERE order_id = ? ORDER BY created_at, id`,
        [orderId],
      ),
      db.$client.execute(
        `SELECT method, label, amount, reference
         FROM order_payments WHERE order_id = ? ORDER BY created_at, id`,
        [orderId],
      ),
    ]);
    return {
      id: String(row.id),
      order_no: String(row.order_no),
      created_at: row.created_at as Date | string,
      source: String(row.source),
      store_id: row.store_id === null ? null : String(row.store_id),
      customer_id: row.customer_id === null ? null : String(row.customer_id),
      customer_name: row.customer_name === null ? null : String(row.customer_name),
      status: String(row.status),
      financial_status: row.financial_status === null ? null : String(row.financial_status),
      fulfillment_status: row.fulfillment_status === null ? null : String(row.fulfillment_status),
      total: String(row.total),
      refunded_total: String(row.refunded_total),
      item_count: Number(row.item_count),
      pickup_contact_name: row.pickup_contact_name === null ? null : String(row.pickup_contact_name),
      pickup_phone: row.pickup_phone === null ? null : String(row.pickup_phone),
      pickup_store_id: row.pickup_store_id === null ? null : String(row.pickup_store_id),
      pickup_ready_at: row.pickup_ready_at as Date | string | null,
      picked_up_at: row.picked_up_at as Date | string | null,
      note: row.note === null ? null : String(row.note),
      subtotal: String(row.subtotal),
      discount_total: String(row.discount_total),
      tax_total: String(row.tax_total),
      items: itemRows as Array<Record<string, unknown>>,
      payments: paymentRows as Array<Record<string, unknown>>,
    };
  },
};
