import { db } from '@/lib/db';
import { toCsv } from '@/lib/csv';
import { paidOrderCondition } from '@/services/orders/paid-criteria';

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86400000);
}

export interface SalesSummary {
  totalRevenue: number;
  totalOrders: number;
  totalRefunds: number;
  refundRate: number;
  avgOrderValue: number;
}

export interface ProductRank {
  product_id: string;
  product_title: string;
  product_type: string;
  total_quantity: number;
  total_revenue: number;
  order_count: number;
}

export interface RevenueTrendPoint {
  date: string;
  revenue: number;
  orders: number;
}

export interface ChannelBreakdown {
  source: string;
  label: string;
  total_revenue: number;
  total_orders: number;
  avg_order_value: number;
  revenue_share: number;
}

const CHANNEL_LABELS: Record<string, string> = {
  web: 'Online Store',
  pos: 'POS',
  import: 'Imported Orders',
  facebook: 'Facebook',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  direct: 'Direct Visit',
};

function normalizeChannel(value: unknown): string {
  const source = String(value ?? '').trim().toLowerCase();
  return source || 'web';
}

export async function getSalesSummary(days = 30): Promise<SalesSummary> {
  const start = daysAgo(days);

  const [rows] = await db.$client.execute(
    `SELECT COUNT(*) as total_orders, COALESCE(SUM(total_amount), 0) as total_revenue, ` +
    `COALESCE(AVG(total_amount), 0) as avg_order_value ` +
    `FROM orders WHERE created_at >= ? AND ${paidOrderCondition()}`,
    [start]
  );
  const summary = (rows as Record<string, unknown>[])[0] || {};
  const totalRevenue = Number(summary.total_revenue || 0);
  const totalOrders = Number(summary.total_orders || 0);

  // refunds 表在旧库可能不存在,查询失败时退款指标降级为 0
  let totalRefunds = 0;
  try {
    const [refundRows] = await db.$client.execute(
      `SELECT COALESCE(SUM(amount), 0) as total_refunds FROM refunds ` +
      `WHERE created_at >= ? AND status IN ('approved','completed')`,
      [start]
    );
    totalRefunds = Number((refundRows as Record<string, unknown>[])[0]?.total_refunds || 0);
  } catch {
    totalRefunds = 0;
  }

  return {
    totalRevenue,
    totalOrders,
    totalRefunds,
    refundRate: totalRevenue > 0 ? totalRefunds / totalRevenue : 0,
    avgOrderValue: Number(summary.avg_order_value || 0),
  };
}

export async function getChannelBreakdown(days: number): Promise<ChannelBreakdown[]> {
  const [rows] = await db.$client.execute(
    `SELECT COALESCE(NULLIF(source, ''), 'web') as source, COUNT(*) as total_orders, ` +
    `COALESCE(SUM(total_amount), 0) as total_revenue, COALESCE(AVG(total_amount), 0) as avg_order_value ` +
    `FROM orders WHERE created_at >= ? AND ${paidOrderCondition()} ` +
    `GROUP BY COALESCE(NULLIF(source, ''), 'web') ORDER BY total_revenue DESC`,
    [daysAgo(days)]
  );
  const parsed = (rows as Record<string, unknown>[]).map((r) => {
    const source = normalizeChannel(r.source);
    return {
      source,
      label: CHANNEL_LABELS[source] ?? source,
      total_revenue: Number(r.total_revenue || 0),
      total_orders: Number(r.total_orders || 0),
      avg_order_value: Number(r.avg_order_value || 0),
      revenue_share: 0,
    };
  });
  const totalRevenue = parsed.reduce((sum, item) => sum + item.total_revenue, 0);
  return parsed.map((item) => ({
    ...item,
    revenue_share: totalRevenue > 0 ? item.total_revenue / totalRevenue : 0,
  }));
}

export async function getProductSalesRank(days: number, limit = 50): Promise<ProductRank[]> {
  const [rows] = await db.$client.execute(
    `SELECT oi.product_id, oi.product_title, oi.product_type, ` +
    `SUM(oi.quantity) as total_quantity, COALESCE(SUM(oi.subtotal), 0) as total_revenue, ` +
    `COUNT(DISTINCT oi.order_id) as order_count ` +
    `FROM order_items oi JOIN orders o ON oi.order_id = o.id ` +
    `WHERE o.created_at >= ? AND ${paidOrderCondition('o')} ` +
    `GROUP BY oi.product_id, oi.product_title, oi.product_type ` +
    `ORDER BY total_revenue DESC LIMIT ?`,
    [daysAgo(days), String(limit)]
  );
  return (rows as Record<string, unknown>[]).map((r) => ({
    product_id: String(r.product_id ?? ''),
    product_title: String(r.product_title ?? ''),
    product_type: String(r.product_type ?? ''),
    total_quantity: Number(r.total_quantity || 0),
    total_revenue: Number(r.total_revenue || 0),
    order_count: Number(r.order_count || 0),
  }));
}

export async function getRevenueTrend(days: number): Promise<RevenueTrendPoint[]> {
  const [rows] = await db.$client.execute(
    `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') as date, COUNT(*) as orders, ` +
    `COALESCE(SUM(total_amount), 0) as revenue ` +
    `FROM orders WHERE created_at >= ? AND ${paidOrderCondition()} ` +
    `GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d') ORDER BY date ASC`,
    [daysAgo(days)]
  );
  return (rows as Record<string, unknown>[]).map((r) => ({
    date: String(r.date ?? ''),
    revenue: Number(r.revenue || 0),
    orders: Number(r.orders || 0),
  }));
}

export async function exportSalesCsv(days: number): Promise<string> {
  const [summary, ranks, channels] = await Promise.all([
    getSalesSummary(days),
    getProductSalesRank(days),
    getChannelBreakdown(days),
  ]);

  const rows: unknown[][] = [
    ['Metric', 'Value'],
    ['Days', days],
    ['Total Revenue', summary.totalRevenue.toFixed(2)],
    ['Total Orders', summary.totalOrders],
    ['Avg Order Value', summary.avgOrderValue.toFixed(2)],
    ['Total Refunds', summary.totalRefunds.toFixed(2)],
    ['Refund Rate', `${(summary.refundRate * 100).toFixed(1)}%`],
    [],
    ['Channel', 'Revenue', 'Orders', 'Avg Order Value', 'Revenue Share'],
    ...channels.map((c) => [
      c.label,
      c.total_revenue.toFixed(2),
      c.total_orders,
      c.avg_order_value.toFixed(2),
      `${(c.revenue_share * 100).toFixed(1)}%`,
    ]),
    [],
    ['Rank', 'Product ID', 'Product Title', 'Product Type', 'Total Quantity', 'Total Revenue', 'Order Count'],
    ...ranks.map((r, i) => [
      i + 1,
      r.product_id,
      r.product_title,
      r.product_type,
      r.total_quantity,
      r.total_revenue.toFixed(2),
      r.order_count,
    ]),
  ];

  return toCsv(rows);
}
