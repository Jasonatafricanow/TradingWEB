import { db } from '@/lib/db';
import { eq, gte } from 'drizzle-orm';
import { orders } from '@/storage/database/shared/schema';

const recentBriefings = new Set<string>();

async function queryWithRetry<T>(query: string, params: any[], maxRetries = 3): Promise<T> {
  let lastError: Error | null = null;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const { db } = await import("@/lib/db");
      const [rows] = await db.$client.execute(query, params);
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

export async function generateDailyBriefing() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const countRows = await queryWithRetry<Record<string, unknown>[]>(
      'SELECT COUNT(*) as count FROM orders WHERE created_at >= ? AND created_at < ?',
      [today.toISOString(), tomorrow.toISOString()]
    );
    const newOrders = Number((countRows as Record<string, unknown>[])[0]?.count || 0);

    const pendingRows = await queryWithRetry<Record<string, unknown>[]>(
      'SELECT COUNT(*) as count FROM orders WHERE status = ?',
      ['pending']
    );
    const pendingOrders = Number((pendingRows as Record<string, unknown>[])[0]?.count || 0);

    const revRows = await queryWithRetry<Record<string, unknown>[]>(
      'SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE created_at >= ? AND created_at < ? AND status = ?',
      [today.toISOString(), tomorrow.toISOString(), 'paid']
    );
    const revenue = Number((revRows as Record<string, unknown>[])[0]?.total || 0);

    return {
      date: today.toISOString().split('T')[0],
      newOrders,
      pendingOrders,
      revenue,
    };
  } catch (error) {
    throw error;
  }
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
      [startOfWeek.toISOString(), endOfWeek.toISOString()]
    );
    const ordersCount = Number((countRows as Record<string, unknown>[])[0]?.count || 0);

    const revRows = await queryWithRetry<Record<string, unknown>[]>(
      'SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE created_at >= ? AND created_at < ? AND status = ?',
      [startOfWeek.toISOString(), endOfWeek.toISOString(), 'paid']
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
export async function generateBriefing(days?: number) {
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
  pendingOrders?: number;
  revenue?: number;
  orders?: number;
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

