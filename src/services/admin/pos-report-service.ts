import { db } from "@/lib/db";
import type { PosOperatorContext } from "./pos-operator-session-service";

export interface PosReportQuery {
  dateFrom: string;
  dateTo: string;
  source: "pos" | "web" | null;
  storeId?: string;
  staffId?: string;
}

interface ReportOrder {
  id: string;
  totalCents: number;
  createdAt: Date;
  staffId: string | null;
  staffName: string;
  paymentMethod?: string | null;
}

interface ReportRefund {
  orderId: string;
  amountCents: number;
  createdAt: Date;
  orderTotalCents: number;
  paymentMethod?: string | null;
  staffId: string | null;
  staffName: string;
}
interface ReportPayment { orderId: string; method: string; label: string; amountCents: number; orderTotalCents: number }
interface ReportItem { name: string; quantity: number; amountCents: number }

export interface PosReportFacts {
  orders: ReportOrder[];
  refunds: ReportRefund[];
  refundsForOrdersCents: number;
  payments: ReportPayment[];
  refundPayments?: ReportPayment[];
  items: ReportItem[];
}

export interface PosReportRepository {
  getStore(storeId: string): Promise<{ id: string; name: string; timezoneOffset: string } | null>;
  load(input: {
    storeId: string;
    from: Date;
    toExclusive: Date;
    source: "pos" | "web" | null;
    staffId?: string;
  }): Promise<PosReportFacts>;
}

export class PosReportError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) { super(message); }
}

export interface PosRangeReport {
  store: { id: string; name: string; timezone_offset: string };
  date_from: string;
  date_to: string;
  source: "pos" | "web" | "all";
  gross: string;
  refunded: string;
  refunds_for_orders_in_period: string;
  net: string;
  order_count: number;
  aov: string;
  by_payment_method: Array<{ method: string; label: string; gross_amount: string; refunded_amount: string; net_amount: string }>;
  by_staff: Array<{ staff_id: string | null; name: string; order_count: number; gross_amount: string; refunded_amount: string; net_amount: string }>;
  top_items: Array<{ name: string; quantity: number; gross_amount: string }>;
  daily: Array<{ date: string; order_count: number; gross_amount: string; refunded_amount: string; net_amount: string }>;
  hourly: Array<{ hour: number; order_count: number; gross_amount: string }>;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function text(value: string | null, name: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > 160) throw new PosReportError("REPORT_QUERY_INVALID", `${name} is too long`, 400);
  return trimmed;
}

export function parsePosReportQuery(url: URL): PosReportQuery {
  const dateFrom = url.searchParams.get("date_from") ?? "";
  const dateTo = url.searchParams.get("date_to") ?? "";
  if (!DATE.test(dateFrom)) throw new PosReportError("REPORT_QUERY_INVALID", "date_from must use YYYY-MM-DD", 400);
  if (!DATE.test(dateTo)) throw new PosReportError("REPORT_QUERY_INVALID", "date_to must use YYYY-MM-DD", 400);
  if (dateFrom > dateTo) throw new PosReportError("REPORT_QUERY_INVALID", "date_from must not be after date_to", 400);
  const rawSource = url.searchParams.get("source") ?? "pos";
  if (!new Set(["pos", "web", "all"]).has(rawSource)) throw new PosReportError("REPORT_QUERY_INVALID", "source must be pos, web or all", 400);
  return {
    dateFrom,
    dateTo,
    source: rawSource === "all" ? null : rawSource as "pos" | "web",
    storeId: text(url.searchParams.get("store_id"), "store_id"),
    staffId: text(url.searchParams.get("staff_id"), "staff_id"),
  };
}

function offsetMinutes(value: string): number {
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(value);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -minutes : minutes;
}

function localMidnightUtc(date: string, offset: number): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) - offset * 60_000);
}

function plusDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function localParts(value: Date, offset: number): { date: string; hour: number } {
  const shifted = new Date(value.getTime() + offset * 60_000);
  return { date: shifted.toISOString().slice(0, 10), hour: shifted.getUTCHours() };
}

function money(cents: number): string { return (cents / 100).toFixed(2); }

function allocateRefunds(orders: ReportOrder[], refunds: ReportRefund[], payments: ReportPayment[], refundPayments: ReportPayment[] = []) {
  const refundsByOrder = new Map<string, number>();
  for (const refund of refunds) refundsByOrder.set(refund.orderId, (refundsByOrder.get(refund.orderId) ?? 0) + refund.amountCents);
  const paymentsByOrder = new Map<string, ReportPayment[]>();
  for (const payment of payments) {
    const list = paymentsByOrder.get(payment.orderId) ?? [];
    list.push(payment);
    paymentsByOrder.set(payment.orderId, list);
  }
  const saleOrderIds = new Set(orders.map((order) => order.id));
  for (const payment of refundPayments) {
    if (saleOrderIds.has(payment.orderId)) continue;
    const list = paymentsByOrder.get(payment.orderId) ?? [];
    list.push(payment);
    paymentsByOrder.set(payment.orderId, list);
  }
  for (const order of orders) {
    if (!paymentsByOrder.has(order.id)) {
      paymentsByOrder.set(order.id, [{
        orderId: order.id,
        method: order.paymentMethod ?? "unknown",
        label: order.paymentMethod ?? "Unknown",
        amountCents: order.totalCents,
        orderTotalCents: order.totalCents,
      }]);
    }
  }
  const rows: Array<ReportPayment & { refundedCents: number }> = [];
  const refundFacts = new Map(refunds.map((refund) => [refund.orderId, refund]));
  for (const refund of refunds) {
    if (!paymentsByOrder.has(refund.orderId)) {
      paymentsByOrder.set(refund.orderId, [{
        orderId: refund.orderId,
        method: refund.paymentMethod ?? "unknown",
        label: refund.paymentMethod ?? "Unknown",
        amountCents: refund.orderTotalCents,
        orderTotalCents: refund.orderTotalCents,
      }]);
    }
  }
  const orderIds = new Set([...orders.map((order) => order.id), ...refunds.map((refund) => refund.orderId)]);
  for (const orderId of orderIds) {
    const group = paymentsByOrder.get(orderId) ?? [];
    const sale = orders.find((order) => order.id === orderId);
    const orderTotalCents = sale?.totalCents ?? refundFacts.get(orderId)?.orderTotalCents ?? group[0]?.orderTotalCents ?? 0;
    const refund = Math.min(refundsByOrder.get(orderId) ?? 0, orderTotalCents);
    let allocated = 0;
    group.forEach((payment, index) => {
      const refundedCents = index === group.length - 1
        ? refund - allocated
        : Math.floor(refund * payment.amountCents / Math.max(1, orderTotalCents));
      allocated += refundedCents;
      rows.push({ ...payment, amountCents: sale ? payment.amountCents : 0, refundedCents });
    });
  }
  return { rows, refundsByOrder };
}

export async function getPosRangeReport(input: {
  operator: PosOperatorContext;
  query: PosReportQuery;
  repository?: PosReportRepository;
}): Promise<PosRangeReport> {
  if (!input.operator.permissions.includes("checkout")) throw new PosReportError("REPORT_FORBIDDEN", "Report permission required", 403);
  if (input.query.storeId && input.query.storeId !== input.operator.storeId) throw new PosReportError("REPORT_STORE_MISMATCH", "Report store does not match operator store", 403);
  const repository = input.repository ?? databaseRepository;
  const store = await repository.getStore(input.operator.storeId);
  if (!store) throw new PosReportError("STORE_NOT_FOUND", "Store not found", 404);
  const offset = offsetMinutes(store.timezoneOffset);
  const from = localMidnightUtc(input.query.dateFrom, offset);
  const toExclusive = localMidnightUtc(plusDays(input.query.dateTo, 1), offset);
  const facts = await repository.load({ storeId: store.id, from, toExclusive, source: input.query.source, staffId: input.query.staffId });
  const grossCents = facts.orders.reduce((sum, order) => sum + order.totalCents, 0);
  const refundedCents = facts.refunds.reduce((sum, refund) => sum + refund.amountCents, 0);
  const netCents = grossCents - refundedCents;
  const { rows: paymentRows } = allocateRefunds(facts.orders, facts.refunds, facts.payments, facts.refundPayments);

  const paymentMap = new Map<string, { method: string; label: string; gross: number; refunded: number }>();
  for (const row of paymentRows) {
    const key = `${row.method}\u0000${row.label}`;
    const aggregate = paymentMap.get(key) ?? { method: row.method, label: row.label, gross: 0, refunded: 0 };
    aggregate.gross += row.amountCents;
    aggregate.refunded += row.refundedCents;
    paymentMap.set(key, aggregate);
  }

  const staffMap = new Map<string, { staff_id: string | null; name: string; count: number; gross: number; refunded: number }>();
  for (const order of facts.orders) {
    const key = order.staffId ?? "";
    const aggregate = staffMap.get(key) ?? { staff_id: order.staffId, name: order.staffName, count: 0, gross: 0, refunded: 0 };
    aggregate.count += 1;
    aggregate.gross += order.totalCents;
    staffMap.set(key, aggregate);
  }
  for (const refund of facts.refunds) {
    const key = refund.staffId ?? "";
    const aggregate = staffMap.get(key) ?? { staff_id: refund.staffId, name: refund.staffName, count: 0, gross: 0, refunded: 0 };
    aggregate.refunded += refund.amountCents;
    staffMap.set(key, aggregate);
  }

  const itemMap = new Map<string, { quantity: number; gross: number }>();
  for (const item of facts.items) {
    const aggregate = itemMap.get(item.name) ?? { quantity: 0, gross: 0 };
    aggregate.quantity += item.quantity;
    aggregate.gross += item.amountCents;
    itemMap.set(item.name, aggregate);
  }

  const dailyMap = new Map<string, { count: number; gross: number; refunded: number }>();
  for (let cursor = input.query.dateFrom; cursor <= input.query.dateTo; cursor = plusDays(cursor, 1)) dailyMap.set(cursor, { count: 0, gross: 0, refunded: 0 });
  for (const order of facts.orders) {
    const key = localParts(order.createdAt, offset).date;
    const day = dailyMap.get(key);
    if (day) { day.count += 1; day.gross += order.totalCents; }
  }
  for (const refund of facts.refunds) {
    const key = localParts(refund.createdAt, offset).date;
    const day = dailyMap.get(key);
    if (day) day.refunded += refund.amountCents;
  }

  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0, gross: 0 }));
  for (const order of facts.orders) {
    const bucket = hourly[localParts(order.createdAt, offset).hour];
    bucket.count += 1;
    bucket.gross += order.totalCents;
  }

  return {
    store: { id: store.id, name: store.name, timezone_offset: store.timezoneOffset },
    date_from: input.query.dateFrom,
    date_to: input.query.dateTo,
    source: input.query.source ?? "all",
    gross: money(grossCents),
    refunded: money(refundedCents),
    refunds_for_orders_in_period: money(facts.refundsForOrdersCents),
    net: money(netCents),
    order_count: facts.orders.length,
    aov: money(facts.orders.length ? Math.round(grossCents / facts.orders.length) : 0),
    by_payment_method: [...paymentMap.values()].map((row) => ({
      method: row.method, label: row.label, gross_amount: money(row.gross), refunded_amount: money(row.refunded), net_amount: money(row.gross - row.refunded),
    })).sort((a, b) => Number(b.net_amount) - Number(a.net_amount)),
    by_staff: [...staffMap.values()].map((row) => ({
      staff_id: row.staff_id, name: row.name, order_count: row.count, gross_amount: money(row.gross), refunded_amount: money(row.refunded), net_amount: money(row.gross - row.refunded),
    })).sort((a, b) => Number(b.net_amount) - Number(a.net_amount)),
    top_items: [...itemMap.entries()].map(([name, row]) => ({ name, quantity: row.quantity, gross_amount: money(row.gross) }))
      .sort((a, b) => b.quantity - a.quantity || Number(b.gross_amount) - Number(a.gross_amount)).slice(0, 20),
    daily: [...dailyMap.entries()].map(([date, row]) => ({ date, order_count: row.count, gross_amount: money(row.gross), refunded_amount: money(row.refunded), net_amount: money(row.gross - row.refunded) })),
    hourly: hourly.map((row) => ({ hour: row.hour, order_count: row.count, gross_amount: money(row.gross) })),
  };
}

function baseWhere(input: { storeId: string; from: Date; toExclusive: Date; source: "pos" | "web" | null; staffId?: string }, dateExpression: string) {
  const clauses = [`o.store_id = ?`, `${dateExpression} >= ?`, `${dateExpression} < ?`, `o.status != 'cancelled'`];
  const params: Array<string | Date> = [input.storeId, input.from, input.toExclusive];
  if (input.source) { clauses.push("o.source = ?"); params.push(input.source); }
  if (input.staffId) { clauses.push("o.payment_id = ?"); params.push(`pos:${input.staffId}`); }
  return { sql: clauses.join(" AND "), params };
}

function rows(value: unknown): Array<Record<string, unknown>> { return value as Array<Record<string, unknown>>; }

const databaseRepository: PosReportRepository = {
  async getStore(storeId) {
    const [result] = await db.$client.execute("SELECT id, name, metadata FROM stores WHERE id = ? LIMIT 1", [storeId]);
    const row = rows(result)[0];
    if (!row) return null;
    let metadata: Record<string, unknown> | null = null;
    try { metadata = typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata as Record<string, unknown> | null; } catch { metadata = null; }
    const timezoneOffset = typeof metadata?.timezone_offset === "string" && /^[+-]\d{2}:\d{2}$/.test(metadata.timezone_offset)
      ? metadata.timezone_offset : "+00:00";
    return { id: String(row.id), name: String(row.name), timezoneOffset };
  },
  async load(input) {
    const orderWhere = baseWhere(input, "o.created_at");
    const refundWhere = baseWhere(input, "r.created_at");
    const [orderResult, refundResult, refundForOrdersResult, paymentResult, refundPaymentResult, itemResult] = await Promise.all([
      db.$client.execute(
        `SELECT o.id, o.total_amount, o.created_at, o.payment_method,
                COALESCE(o.staff_id, CASE WHEN o.payment_id LIKE 'pos:%' THEN SUBSTRING(o.payment_id, 5) END) AS staff_id,
                COALESCE(s.name, 'Unassigned') AS staff_name
         FROM orders o LEFT JOIN staff s ON s.id = COALESCE(o.staff_id, CASE WHEN o.payment_id LIKE 'pos:%' THEN SUBSTRING(o.payment_id, 5) END)
         WHERE ${orderWhere.sql} ORDER BY o.created_at, o.id`, orderWhere.params,
      ),
      db.$client.execute(
        `SELECT r.order_id, r.amount, r.created_at, o.total_amount, o.payment_method,
                COALESCE(o.staff_id, CASE WHEN o.payment_id LIKE 'pos:%' THEN SUBSTRING(o.payment_id, 5) END) AS staff_id,
                COALESCE(s.name, 'Unassigned') AS staff_name
         FROM refunds r JOIN orders o ON o.id = r.order_id
         LEFT JOIN staff s ON s.id = COALESCE(o.staff_id, CASE WHEN o.payment_id LIKE 'pos:%' THEN SUBSTRING(o.payment_id, 5) END)
         WHERE r.status = 'completed' AND ${refundWhere.sql} ORDER BY r.created_at, r.id`, refundWhere.params,
      ),
      db.$client.execute(
        `SELECT COALESCE(SUM(r.amount), 0) AS amount FROM refunds r JOIN orders o ON o.id = r.order_id
         WHERE r.status = 'completed' AND ${orderWhere.sql}`, orderWhere.params,
      ),
      db.$client.execute(
        `SELECT p.order_id, p.method, p.label, p.amount, o.total_amount
         FROM order_payments p JOIN orders o ON o.id = p.order_id
         WHERE ${orderWhere.sql} ORDER BY p.order_id, p.created_at, p.id`, orderWhere.params,
      ),
      db.$client.execute(
        `SELECT p.order_id, p.method, p.label, p.amount, o.total_amount
         FROM order_payments p JOIN orders o ON o.id = p.order_id
         WHERE EXISTS (
           SELECT 1 FROM refunds r WHERE r.order_id = o.id AND r.status = 'completed' AND ${refundWhere.sql}
         ) ORDER BY p.order_id, p.created_at, p.id`, refundWhere.params,
      ),
      db.$client.execute(
        `SELECT oi.product_title AS name, SUM(oi.quantity) AS quantity, SUM(oi.subtotal) AS amount
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE ${orderWhere.sql} GROUP BY oi.product_title`, orderWhere.params,
      ),
    ]);
    const orderRows = rows(orderResult[0]);
    return {
      orders: orderRows.map((row) => ({
        id: String(row.id), totalCents: Math.round(Number(row.total_amount) * 100), createdAt: new Date(row.created_at as string | Date),
        staffId: row.staff_id === null ? null : String(row.staff_id), staffName: String(row.staff_name), paymentMethod: row.payment_method === null ? null : String(row.payment_method),
      })),
      refunds: rows(refundResult[0]).map((row) => ({
        orderId: String(row.order_id), amountCents: Math.round(Number(row.amount) * 100), createdAt: new Date(row.created_at as string | Date),
        orderTotalCents: Math.round(Number(row.total_amount) * 100), paymentMethod: row.payment_method === null ? null : String(row.payment_method),
        staffId: row.staff_id === null ? null : String(row.staff_id), staffName: String(row.staff_name),
      })),
      refundsForOrdersCents: Math.round(Number(rows(refundForOrdersResult[0])[0]?.amount ?? 0) * 100),
      payments: rows(paymentResult[0]).map((row) => ({
        orderId: String(row.order_id), method: String(row.method), label: String(row.label), amountCents: Math.round(Number(row.amount) * 100), orderTotalCents: Math.round(Number(row.total_amount) * 100),
      })),
      refundPayments: rows(refundPaymentResult[0]).map((row) => ({
        orderId: String(row.order_id), method: String(row.method), label: String(row.label), amountCents: Math.round(Number(row.amount) * 100), orderTotalCents: Math.round(Number(row.total_amount) * 100),
      })),
      items: rows(itemResult[0]).map((row) => ({ name: String(row.name), quantity: Number(row.quantity), amountCents: Math.round(Number(row.amount) * 100) })),
    };
  },
};
