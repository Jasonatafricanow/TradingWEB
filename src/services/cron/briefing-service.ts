import { db } from '@/lib/db';

async function queryWithRetry<T>(query: string, params: unknown[], maxRetries = 3): Promise<T> {
  let lastError: Error | null = null;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const { db } = await import("@/lib/db");
      const [rows] = await db.$client.execute(query, params as never[]);
      return rows as T;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (i < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
      }
    }
  }
  throw lastError || new Error("Query failed after retries");
}

/**
 * Yesterday's operating summary (the cron runs at 08:00 and reports the
 * previous day). Every number is read from the database; metrics with no
 * data source (page views) are null, never a made-up 0.
 */
export async function generateDailyBriefing(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 1);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const range = [start, end];

  const one = async (query: string, params: unknown[]) => {
    const rows = await queryWithRetry<Record<string, unknown>[]>(query, params);
    return Number(rows[0]?.value || 0);
  };

  const [newOrders, paidOrders, revenue, pendingOrders, lowStock, recoveredCarts] = await Promise.all([
    one('SELECT COUNT(*) AS value FROM orders WHERE created_at >= ? AND created_at < ?', range),
    // Paid = payment confirmed, whatever the later fulfilment status is.
    one("SELECT COUNT(*) AS value FROM orders WHERE created_at >= ? AND created_at < ? AND payment_status IN ('paid', 'refunded')", range),
    one("SELECT COALESCE(SUM(total_amount), 0) AS value FROM orders WHERE created_at >= ? AND created_at < ? AND payment_status IN ('paid', 'refunded')", range),
    one("SELECT COUNT(*) AS value FROM orders WHERE status = 'pending'", []),
    one('SELECT COUNT(*) AS value FROM inventory WHERE stock <= low_stock_threshold', []),
    one('SELECT COUNT(*) AS value FROM abandoned_carts WHERE recovered_at >= ? AND recovered_at < ?', range),
  ]);

  return {
    date: localDate(start),
    newOrders,
    paidOrders,
    revenue,
    pendingOrders,
    lowStock,
    recoveredCarts,
    pageViews: null as number | null,
  };
}

function localDate(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export async function generateWeeklyBriefing() {
  try {
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    const countRows = await queryWithRetry<Record<string, unknown>[]>(
      'SELECT COUNT(*) as count FROM orders WHERE created_at >= ? AND created_at < ?',
      [startOfWeek, endOfWeek]
    );
    const ordersCount = Number((countRows as Record<string, unknown>[])[0]?.count || 0);

    const revRows = await queryWithRetry<Record<string, unknown>[]>(
      'SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE created_at >= ? AND created_at < ? AND payment_status = ?',
      [startOfWeek, endOfWeek, 'paid']
    );
    const revenue = Number((revRows as Record<string, unknown>[])[0]?.total || 0);

    return {
      weekStart: startOfWeek.toISOString().split('T')[0],
      weekEnd: endOfWeek.toISOString().split('T')[0],
      orders: ordersCount,
      revenue,
    };
  } catch (error) {
    throw error;
  }
}
export async function generateBriefing() {
  return generateDailyBriefing();
}
/**
 * Render briefing data as a formatted HTML email template
 */
export function renderBriefingHtml(data: {
  date?: string;
  weekStart?: string;
  weekEnd?: string;
  newOrders?: number;
  paidOrders?: number;
  pendingOrders?: number;
  revenue?: number;
  orders?: number;
  lowStock?: number;
  recoveredCarts?: number;
}): string {
  const title = data.date
    ? "Daily Briefing - " + data.date
    : "Weekly Briefing - " + (data.weekStart || "") + " to " + (data.weekEnd || "");
  let rows = "";
  if (data.newOrders !== undefined) {
    rows += "<tr><td style=\"padding:8px 0;color:#64748b;\">New Orders</td><td style=\"text-align:right;font-weight:bold;color:#2563eb;\">" + data.newOrders + "</td></tr>";
  }
  if (data.revenue !== undefined) {
    rows += "<tr><td style=\"padding:8px 0;color:#64748b;\">Revenue</td><td style=\"text-align:right;font-weight:bold;color:#16a34a;\">$" + data.revenue.toFixed(2) + "</td></tr>";
  }
  if (data.pendingOrders !== undefined) {
    rows += "<tr><td style=\"padding:8px 0;color:#64748b;\">Pending Orders</td><td style=\"text-align:right;font-weight:bold;color:#d97706;\">" + data.pendingOrders + "</td></tr>";
  }
  if (data.paidOrders !== undefined) {
    rows += "<tr><td style=\"padding:8px 0;color:#64748b;\">Paid Orders</td><td style=\"text-align:right;font-weight:bold;color:#2563eb;\">" + data.paidOrders + "</td></tr>";
  }
  if (data.lowStock !== undefined) {
    rows += "<tr><td style=\"padding:8px 0;color:#64748b;\">Low Stock Items</td><td style=\"text-align:right;font-weight:bold;color:#dc2626;\">" + data.lowStock + "</td></tr>";
  }
  if (data.recoveredCarts !== undefined) {
    rows += "<tr><td style=\"padding:8px 0;color:#64748b;\">Recovered Carts</td><td style=\"text-align:right;font-weight:bold;color:#7c3aed;\">" + data.recoveredCarts + "</td></tr>";
  }
  if (data.orders !== undefined) {
    rows += "<tr><td style=\"padding:8px 0;color:#64748b;\">Orders</td><td style=\"text-align:right;font-weight:bold;color:#2563eb;\">" + data.orders + "</td></tr>";
  }
  return "<!DOCTYPE html><html><body style=\"font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;\">"
    + "<h2 style=\"color:#2563eb;\">GlobalTrade Hub</h2>"
    + "<h3 style=\"color:#64748b;\">" + title + "</h3>"
    + '<hr style=\"border:1px solid #e2e8f0;\">'
    + '<table style=\"width:100%;border-collapse:collapse;margin-top:16px;\">' + rows + "</table>"
    + '<hr style=\"border:1px solid #e2e8f0;margin-top:16px;\">'
    + '<p style=\"color:#94a3b8;font-size:12px;\">Generated automatically by GlobalTrade Hub</p>'
    + "</body></html>";
}

