import { db } from '@/lib/db';
import { eq, desc } from 'drizzle-orm';
import { orders, profiles } from '@/storage/database/shared/schema';

/** 根据订单数据计算客户分层 */
export function computeCustomerTier(params: {
  totalOrders: number;
  totalSpent: number;
  lastOrderAt: Date | string | null;
  createdAt: Date | string | null;
}): string {
  const { totalOrders, totalSpent, lastOrderAt, createdAt } = params;
  const spent = Number(totalSpent) || 0;
  const ordersCount = Number(totalOrders) || 0;

  if (ordersCount === 0) return 'new';

  // VIP: 消费 ≥$500 或 ≥5 单
  if (spent >= 500 || ordersCount >= 5) return 'vip';

  // Active: 30 天内有订单
  if (lastOrderAt) {
    const daysSinceLastOrder = Math.floor(
      (Date.now() - new Date(lastOrderAt).getTime()) / 86400000
    );
    if (daysSinceLastOrder <= 30) return 'active';

    // At Risk: 31-90 天未下单
    if (daysSinceLastOrder <= 90) return 'at_risk';

    // Lost: >90 天未下单
    return 'lost';
  }

  return 'new';
}

export async function listCustomers(options?: {
  limit?: number;
  offset?: number;
  search?: string;
}) {
  const limit = Math.min(200, Math.max(1, options?.limit ?? 50));
  const offset = Math.max(0, options?.offset ?? 0);
  const search = options?.search?.trim();
  const searchClause = search ? ` AND (u.email LIKE ? OR u.name LIKE ? OR u.id LIKE ?)` : "";
  const searchParams = search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [];
  try {
    try {
      const [countRows] = await db.$client.execute(
        `SELECT COUNT(*) AS total FROM users u WHERE 1=1${searchClause}`,
        searchParams,
      );
      const total = Number((countRows as Array<{ total: number | string }>)[0]?.total ?? 0);

      const [rows] = await db.$client.execute(
        `SELECT u.id as user_id, u.email, u.name, u.created_at,
          COALESCE(p.tags, '') as tags,
          (SELECT COUNT(*) FROM orders WHERE orders.user_id = u.id) as total_orders,
          CAST((SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE orders.user_id = u.id) AS DECIMAL(10,2)) as total_spent,
          (SELECT MAX(created_at) FROM orders WHERE orders.user_id = u.id) as last_order_at
        FROM users u
        LEFT JOIN profiles p ON u.email = p.email
        WHERE 1=1${searchClause}
        ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
        [...searchParams, String(limit), String(offset)]
      );
      const data = (rows as Record<string, unknown>[] || []).map((row) => ({
        ...row,
        tier: computeCustomerTier({
          totalOrders: Number(row.total_orders || 0),
          totalSpent: Number(row.total_spent || 0),
          lastOrderAt: row.last_order_at as string | null,
          createdAt: row.created_at as string | null,
        }),
      }));
      return { data, total, error: null };
    } catch {
      const orderSearchClause = search
        ? ` AND (MAX(buyer_email) LIKE ? OR MAX(buyer_name) LIKE ? OR user_id LIKE ?)`
        : "";
      const [countRows] = await db.$client.execute(
        `SELECT COUNT(DISTINCT user_id) AS total FROM orders WHERE 1=1${search ? " AND (buyer_email LIKE ? OR buyer_name LIKE ? OR user_id LIKE ?)" : ""}`,
        search ? searchParams : [],
      );
      const total = Number((countRows as Array<{ total: number | string }>)[0]?.total ?? 0);

      const [rows] = await db.$client.execute(
        `SELECT user_id as user_id, MAX(buyer_email) as email, MAX(buyer_name) as name,
          COUNT(*) as total_orders,
          CAST(COALESCE(SUM(total_amount), 0) AS DECIMAL(10,2)) as total_spent,
          MIN(created_at) as first_order_at, MAX(created_at) as last_order_at
        FROM orders WHERE 1=1${orderSearchClause}
        GROUP BY user_id ORDER BY last_order_at DESC LIMIT ? OFFSET ?`,
        [...searchParams, String(limit), String(offset)]
      );
      const data = (rows as Record<string, unknown>[] || []).map((row) => ({
        ...row,
        tags: '',
        tier: computeCustomerTier({
          totalOrders: Number(row.total_orders || 0),
          totalSpent: Number(row.total_spent || 0),
          lastOrderAt: row.last_order_at as string | null,
          createdAt: row.first_order_at as string | null,
        }),
      }));
      return { data, total, error: null };
    }
  } catch (error) {
    return { data: [], total: 0, error: null };
  }
}

export async function getCustomerDetail(userId: string) {
  try {
    let user: Record<string, any> | null = null;
    try {
      const [rows] = await db.$client.execute(
        `SELECT u.*,
          p.phone, p.whatsapp, p.display_name as profile_name, p.locale, p.currency, p.tags,
          (SELECT COUNT(*) FROM orders WHERE orders.user_id = u.id) as total_orders,
          (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE orders.user_id = u.id) as total_spent,
          (SELECT MAX(created_at) FROM orders WHERE orders.user_id = u.id) as last_order_at
        FROM users u LEFT JOIN profiles p ON u.email = p.email WHERE u.id = ? LIMIT 1`,
        [userId]
      );
      user = (rows as Record<string, any>[])[0];
    } catch {
      const [rows] = await db.$client.execute(
        `SELECT user_id, COUNT(*) as total_orders,
          CAST(COALESCE(SUM(total_amount), 0) AS DECIMAL(10,2)) as total_spent,
          MIN(created_at) as first_order_at, MAX(created_at) as last_order_at
        FROM orders WHERE user_id = ? GROUP BY user_id LIMIT 1`,
        [userId]
      );
      user = (rows as Record<string, any>[])[0];
    }
    if (!user) return null;

    user.tier = computeCustomerTier({
      totalOrders: Number(user.total_orders || 0),
      totalSpent: Number(user.total_spent || 0),
      lastOrderAt: user.last_order_at || null,
      createdAt: user.created_at || user.first_order_at || null,
    });

    const userOrders = await db.select().from(orders)
      .where(eq(orders.user_id, userId))
      .orderBy(desc(orders.created_at));

    return { ...user, orders: userOrders };
  } catch (error) {
    throw error;
  }
}

export async function updateCustomerTags(userId: string, tags: string) {
  try {
    // Find the user's email first
    const [userRows] = await db.$client.execute(
      'SELECT email FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    const user = (userRows as { email?: string }[])[0];
    if (!user?.email) throw new Error('User not found');

    // Upsert profile tags
    await db.$client.execute(
      `INSERT INTO profiles (id, email, tags, created_at)
       VALUES (UUID(), ?, ?, NOW())
       ON DUPLICATE KEY UPDATE tags = VALUES(tags), updated_at = NOW()`,
      [user.email, tags]
    );
    return { success: true };
  } catch (error) {
    throw error;
  }
}

export async function getCustomerStats() {
  let total = 0;
  try {
    try {
      const [totalRow] = await db.$client.execute("SELECT COUNT(*) as count FROM users");
      total = Number((totalRow as Record<string, unknown>[])[0]?.count || 0);
    } catch {
      // users table may not exist
    }

    const [ordersRow] = await db.$client.execute(
      'SELECT COUNT(DISTINCT user_id) as count FROM orders WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)'
    );
    const active = Number((ordersRow as Record<string, unknown>[])[0]?.count || 0);

    const [revenueRow] = await db.$client.execute(
      'SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE status = ?',
      ['paid']
    );
    const totalRevenue = Number((revenueRow as Record<string, unknown>[])[0]?.total || 0);

    return { totalCustomers: total, activeCustomers: active, totalRevenue };
  } catch (error) {
    throw error;
  }
}
