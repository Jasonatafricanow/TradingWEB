import { db } from '@/lib/db';
import { eq, gte, and } from 'drizzle-orm';
import { orders } from '@/storage/database/shared/schema';
import { sql } from 'drizzle-orm';
import { paidOrderCondition, paidOrderWhere } from '@/services/orders/paid-criteria';

async function queryNumber(sqlText: string, params: Array<string | number | Date | null> = []): Promise<number> {
  const [rows] = await db.$client.execute(sqlText, params);
  const row = (rows as Record<string, unknown>[])[0];
  const value = row?.value ?? row?.count ?? row?.total ?? 0;
  return Number(value || 0);
}

export async function getDashboardStats() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfYear = new Date(today.getFullYear(), 0, 1);

    // Today's stats
    const [todayOrders] = await db.select({ count: sql`count(*)` }).from(orders)
      .where(and(gte(orders.created_at, today)));
    const [todayRevenue] = await db.select({ total: sql`COALESCE(SUM(total_amount), 0)` }).from(orders)
      .where(and(gte(orders.created_at, today), paidOrderWhere()));

    // Monthly stats
    const [monthOrders] = await db.select({ count: sql`count(*)` }).from(orders)
      .where(and(gte(orders.created_at, startOfMonth)));
    const [monthRevenue] = await db.select({ total: sql`COALESCE(SUM(total_amount), 0)` }).from(orders)
      .where(and(gte(orders.created_at, startOfMonth), paidOrderWhere()));
    const [monthPending] = await db.select({ count: sql`count(*)` }).from(orders)
      .where(and(gte(orders.created_at, startOfMonth), eq(orders.status, 'pending')));

    // Yearly stats
    const [yearRevenue] = await db.select({ total: sql`COALESCE(SUM(total_amount), 0)` }).from(orders)
      .where(and(gte(orders.created_at, startOfYear), paidOrderWhere()));

    // Total customers
    const [customerRow] = await db.$client.execute('SELECT COUNT(*) as count FROM users');
    const totalCustomers = Number((customerRow as Record<string, unknown>[])[0]?.count || 0);

    // Recent orders
    const recentOrders = await db.select().from(orders)
      .orderBy(sql`created_at DESC`).limit(10);

    const paid = paidOrderCondition('o');
    const unfulfilled = "(o.fulfillment_status IS NULL OR o.fulfillment_status IN ('unfulfilled','partial'))";
    const [
      pendingFulfillment,
      pendingRefunds,
      lowStockItems,
      failedImportJobs,
      runningImportSessions,
      todayPosRevenue,
      offlinePendingOrders,
      todayDelivery,
      deliveryFailed,
      needsPtProducts,
    ] = await Promise.all([
      queryNumber(
        `SELECT COUNT(*) AS value
         FROM orders o
         WHERE ${paid}
           AND o.status != 'cancelled'
           AND ${unfulfilled}`
      ),
      queryNumber(
        "SELECT COUNT(*) AS value FROM refunds WHERE status IN ('pending','approved')"
      ),
      queryNumber(
        "SELECT COUNT(*) AS value FROM inventory WHERE stock <= low_stock_threshold"
      ),
      queryNumber(
        "SELECT COUNT(*) AS value FROM import_jobs WHERE status = 'failed'"
      ),
      queryNumber(
        "SELECT COUNT(*) AS value FROM import_sessions WHERE status IN ('open','running')"
      ),
      queryNumber(
        `SELECT COALESCE(SUM(o.total_amount), 0) AS value
         FROM orders o
         WHERE o.source = 'pos'
           AND o.created_at >= ?
           AND ${paid}`,
        [today.toISOString()]
      ),
      queryNumber(
        `SELECT COUNT(*) AS value
         FROM orders o
         WHERE o.payment_method IS NOT NULL
           AND o.payment_method NOT IN ('paypal','stripe')
           AND COALESCE(o.payment_status,'unpaid') != 'paid'
           AND o.status != 'cancelled'`
      ),
      queryNumber(
        `SELECT COUNT(*) AS value FROM orders
         WHERE delivery_date = CURDATE()
           AND status NOT IN ('cancelled','delivered','delivery_failed')`
      ),
      queryNumber(
        `SELECT COUNT(*) AS value FROM orders WHERE status = 'delivery_failed'`
      ),
      queryNumber(
        `SELECT COUNT(*) AS value FROM products
         WHERE NULLIF(TRIM(COALESCE(title_pt, '')), '') IS NULL
           OR NULLIF(TRIM(COALESCE(description_pt, '')), '') IS NULL`
      ),
    ]);

    return {
      todayOrders: Number(todayOrders?.count || 0),
      todayRevenue: Number(todayRevenue?.total || 0),
      monthOrders: Number(monthOrders?.count || 0),
      monthRevenue: Number(monthRevenue?.total || 0),
      monthPending: Number(monthPending?.count || 0),
      yearRevenue: Number(yearRevenue?.total || 0),
      totalCustomers,
      pendingFulfillment,
      pendingRefunds,
      lowStockItems,
      failedImportJobs,
      runningImportSessions,
      todayPosRevenue,
      offlinePendingOrders,
      todayDelivery,
      deliveryFailed,
      needsPtProducts,
      recentOrders,
    };
  } catch (error) {
    throw error;
  }
}

export async function getRevenueChart(days: number = 30) {
  try {
    const since = new Date(Date.now() - days * 86400000);
    const [rows] = await db.$client.execute(
      'SELECT DATE(created_at) as date, COUNT(*) as orders, COALESCE(SUM(total_amount), 0) as revenue ' +
      `FROM orders WHERE created_at >= ? AND ${paidOrderCondition()} GROUP BY DATE(created_at) ORDER BY date`,
      [since.toISOString()]
    );
    return { data: rows || [], error: null };
  } catch (error) {
    return { data: [], error };
  }
}
