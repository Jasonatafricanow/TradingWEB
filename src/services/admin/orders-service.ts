import { db } from '@/lib/db';
import { eq, desc } from 'drizzle-orm';
import { orders } from '@/storage/database/shared/schema';
import { paidOrderCondition } from '@/services/orders/paid-criteria';
import { markOrderPaidIfNotAlready } from '@/services/orders/order-service';
import { runOrderPaidSideEffects } from '@/services/orders/order-paid-effects';
import { restoreInventoryForOrder } from '@/services/orders/order-stock-service';
import { addOrderTimeline } from '@/services/orders/order-timeline';

interface PaginationParams {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  view?: string;
}

// P1-01 Saved Views:每个视图对应一段 WHERE 条件(orders 别名 o)
const PAID = paidOrderCondition('o');
const UNFULFILLED = "(o.fulfillment_status IS NULL OR o.fulfillment_status IN ('unfulfilled','partial'))";

export const ORDER_VIEWS: Record<string, string> = {
  // 历史行 payment_status/financial_status 可能为 NULL,用 COALESCE 避免三值逻辑漏行
  unpaid: `o.status = 'pending' AND COALESCE(o.payment_status,'unpaid') != 'paid' AND COALESCE(o.financial_status,'pending') != 'paid'`,
  paid_unfulfilled: `${PAID} AND o.status != 'cancelled' AND ${UNFULFILLED}`,
  to_ship: `${PAID} AND o.status != 'cancelled' AND ${UNFULFILLED} AND EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.delivery_method = 'shipping')`,
  processing: `o.status = 'processing'`,
  refunding: `EXISTS (SELECT 1 FROM refunds r WHERE r.order_id = o.id AND r.status IN ('pending','approved'))`,
  offline_pending: `o.payment_method IS NOT NULL AND o.payment_method NOT IN ('paypal','stripe') AND COALESCE(o.payment_status,'unpaid') != 'paid' AND o.status != 'cancelled'`,
  pos: `o.source = 'pos'`,
  // Maputo 本地配送视图
  today_delivery: `o.delivery_date IS NOT NULL AND o.delivery_date = CURDATE() AND o.status NOT IN ('cancelled','delivered','delivery_failed')`,
  delivering: `o.status = 'delivering'`,
  delivered: `o.status = 'delivered'`,
  delivery_failed: `o.status = 'delivery_failed'`,
};

interface PaginatedResult {
  data: Record<string, unknown>[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export async function listAllOrders() {
  try {
    const data = await db.select().from(orders).orderBy(desc(orders.created_at));
    return { data: data || [], error: null };
  } catch (error) {
    return { data: [], error };
  }
}

export async function listOrdersPaginated(params: PaginationParams = {}): Promise<PaginatedResult> {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(1, params.limit || 20));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const bindings: any[] = [];

  if (params.view && params.view !== 'all' && ORDER_VIEWS[params.view]) {
    conditions.push(`(${ORDER_VIEWS[params.view]})`);
  }

  if (params.status && params.status !== 'all') {
    conditions.push('o.status = ?');
    bindings.push(params.status);
  }

  if (params.search) {
    conditions.push('(o.order_no LIKE ? OR o.buyer_email LIKE ? OR o.buyer_name LIKE ?)');
    const q = `%${params.search}%`;
    bindings.push(q, q, q);
  }

  if (params.date_from) {
    conditions.push('o.created_at >= ?');
    bindings.push(params.date_from);
  }

  if (params.date_to) {
    conditions.push('o.created_at <= ?');
    bindings.push(params.date_to + ' 23:59:59');
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const sortWhitelist = ['created_at', 'total_amount', 'status', 'order_no', 'updated_at', 'buyer_email', 'buyer_name'];
  const sortBy = sortWhitelist.includes(params.sort_by || '') ? params.sort_by! : 'created_at';
  const sortOrder = params.sort_order === 'asc' ? 'ASC' : 'DESC';

  try {
    const [countRows] = await db.$client.execute(
      `SELECT COUNT(*) as total FROM orders o ${whereClause}`,
      bindings
    );
    const total = Number((countRows as Record<string, unknown>[])[0]?.total || 0);

    const [rows] = await db.$client.execute(
      `SELECT o.* FROM orders o ${whereClause} ORDER BY o.${sortBy} ${sortOrder} LIMIT ? OFFSET ?`,
      [...bindings, String(limit), String(offset)]
    );

    return {
      data: (rows as Record<string, unknown>[]) || [],
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    };
  } catch (error) {
    throw error;
  }
}

/** 各 Saved View 的订单数,给列表页 Tab 角标用;并行执行,单视图失败降级为 0 */
export async function getOrderViewCounts(): Promise<Record<string, number>> {
  const entries: [string, string | null][] = [['all', null], ...Object.entries(ORDER_VIEWS)];
  const results = await Promise.all(
    entries.map(async ([view, condition]) => {
      try {
        const [rows] = await db.$client.execute(
          `SELECT COUNT(*) as cnt FROM orders o${condition ? ` WHERE ${condition}` : ''}`
        );
        return [view, Number((rows as Record<string, unknown>[])[0]?.cnt || 0)] as const;
      } catch {
        // refunds/source 等依赖缺失时该视图计数降级为 0
        return [view, 0] as const;
      }
    })
  );
  return Object.fromEntries(results);
}

export async function getOrderStats() {
  try {
    const [totalRow] = await db.$client.execute(
      "SELECT COUNT(*) as total FROM orders"
    );
    const total = Number((totalRow as Record<string, unknown>[])[0]?.total || 0);

    const [pendingRow] = await db.$client.execute(
      "SELECT COUNT(*) as total FROM orders WHERE status IN ('pending','paid','processing')"
    );
    const pending = Number((pendingRow as Record<string, unknown>[])[0]?.total || 0);

    const [todayRow] = await db.$client.execute(
      "SELECT COUNT(*) as count, COALESCE(SUM(total_amount),0) as revenue FROM orders WHERE DATE(created_at) = CURDATE()"
    );
    const todayCount = Number((todayRow as Record<string, unknown>[])[0]?.count || 0);
    const todayRevenue = Number((todayRow as Record<string, unknown>[])[0]?.revenue || 0);

    const [monthRow] = await db.$client.execute(
      "SELECT COUNT(*) as count, COALESCE(SUM(total_amount),0) as revenue FROM orders WHERE YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE())"
    );
    const monthCount = Number((monthRow as Record<string, unknown>[])[0]?.count || 0);
    const monthRevenue = Number((monthRow as Record<string, unknown>[])[0]?.revenue || 0);

    const [statusBreakdown] = await db.$client.execute(
      "SELECT status, COUNT(*) as count, COALESCE(SUM(total_amount),0) as revenue FROM orders GROUP BY status ORDER BY count DESC"
    );

    return {
      total,
      pending,
      todayOrders: todayCount,
      todayRevenue,
      monthOrders: monthCount,
      monthRevenue,
      statusBreakdown: (statusBreakdown as Record<string, unknown>[]) || [],
    };
  } catch (error) {
    throw error;
  }
}

export async function getAdminOrderDetail(orderId: string) {
  try {
    const [orderRows] = await db.$client.execute(
      'SELECT * FROM orders WHERE id = ? LIMIT 1',
      [orderId]
    );
    const order = (orderRows as Record<string, unknown>[])[0];
    if (!order) return null;

    const [items] = await db.$client.execute(
      'SELECT * FROM order_items WHERE order_id = ?',
      [orderId]
    );

    let timeline: Record<string, unknown>[] = [];
    try {
      const [tlRows] = await db.$client.execute(
        'SELECT * FROM order_timeline WHERE order_id = ? ORDER BY created_at DESC LIMIT 50',
        [orderId]
      );
      timeline = (tlRows as Record<string, unknown>[]) || [];
    } catch {
      // timeline table may not exist yet
    }

    let refundRecords: Record<string, unknown>[] = [];
    try {
      const [rfRows] = await db.$client.execute(
        'SELECT * FROM refunds WHERE order_id = ? ORDER BY created_at DESC',
        [orderId]
      );
      refundRecords = (rfRows as Record<string, unknown>[]) || [];
    } catch {
      // refunds table may not exist yet
    }

    let shipmentRecords: Record<string, unknown>[] = [];
    try {
      const [shRows] = await db.$client.execute(
        'SELECT * FROM shipments WHERE order_id = ? ORDER BY created_at DESC',
        [orderId]
      );
      shipmentRecords = (shRows as Record<string, unknown>[]) || [];
    } catch {
      // shipments table may not exist yet
    }

    let customerOrders: Record<string, unknown>[] = [];
    const buyerEmail = order.buyer_email as string | null;
    const userId = order.user_id as string | null;

    if (buyerEmail || userId) {
      try {
        if (buyerEmail) {
          const [coRows] = await db.$client.execute(
            "SELECT id, order_no, status, total_amount, created_at FROM orders WHERE buyer_email = ? AND id != ? ORDER BY created_at DESC LIMIT 10",
            [buyerEmail, orderId]
          );
          customerOrders = (coRows as Record<string, unknown>[]) || [];
        } else if (userId) {
          const [coRows] = await db.$client.execute(
            'SELECT id, order_no, status, total_amount, created_at FROM orders WHERE user_id = ? AND id != ? ORDER BY created_at DESC LIMIT 10',
            [userId, orderId]
          );
          customerOrders = (coRows as Record<string, unknown>[]) || [];
        }
      } catch {
        // non-critical
      }
    }

    return {
      ...order,
      items: items || [],
      timeline: timeline || [],
      refunds: refundRecords,
      shipments: shipmentRecords,
      customer_orders: customerOrders || [],
    };
  } catch (error) {
    throw error;
  }
}

export async function updateAdminOrder(id: string, data: Record<string, unknown>) {
  try {
    const [current] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!current) return null;
    const operatorId = (data._operator_id as string) || null;

    const updates: Record<string, unknown> = {};
    if (data.status !== undefined) updates.status = data.status;
    if (data.paymentStatus !== undefined) {
      // orders 表既有 payment_status 又有 financial_status —— 前端 GET 时显示
      // 的是 payment_status，所以这里必须同步写入两列，否则管理员保存后
      // 页面看不到变化。
      updates.payment_status = data.paymentStatus;
      updates.financial_status = data.paymentStatus;
    }
    if (data.fulfillmentStatus !== undefined) updates.fulfillment_status = data.fulfillmentStatus;
    if (data.notes !== undefined) updates.notes = data.notes;
    if (data.buyer_name !== undefined) updates.buyer_name = data.buyer_name;
    if (data.buyer_email !== undefined) updates.buyer_email = data.buyer_email;
    if (data.buyer_phone !== undefined) updates.buyer_phone = data.buyer_phone;
    if (data.tracking_number !== undefined) updates.tracking_number = data.tracking_number;
    if (data.payment_method !== undefined) updates.payment_method = data.payment_method || null;
    if (data.payment_id !== undefined) updates.payment_id = data.payment_id;
    updates.updated_at = new Date();

    // 敏感转换 1:改成已付款必须走统一 paid 管道(原子翻转 + 扣库存/优惠券/时间线),
    // 不允许 PUT 裸写字段绕过 P1-04 的副作用。
    if (data.paymentStatus === 'paid' && current.payment_status !== 'paid') {
      const { transitioned, order: paidOrder } = await markOrderPaidIfNotAlready(id, {
        payment_id: (data.payment_id as string) || `manual:${operatorId || 'admin'}`,
      });
      if (transitioned && paidOrder) {
        await runOrderPaidSideEffects(paidOrder, { source: 'admin_update', operatorId });
      }
      // paid 管道已原子写入这几列,从裸更新里剔除
      delete updates.payment_status;
      delete updates.financial_status;
      delete updates.payment_id;
    }

    await db.update(orders).set(updates).where(eq(orders.id, id));

    // 敏感转换 2:取消订单要幂等回补已扣库存
    if (data.status === 'cancelled' && current.status !== 'cancelled') {
      try {
        await restoreInventoryForOrder(id, { operatorId, reason: '订单取消回补库存' });
      } catch (e) {
        console.error('[orders-service] restore inventory on cancel failed:', e);
      }
    }

    // 状态变更时间线(以数据库当前值为旧值,不依赖前端传 _old_status)
    if (data.status !== undefined && data.status !== current.status) {
      await addOrderTimeline({
        order_id: id,
        action: 'status_change',
        description: `Status changed from ${current.status} to ${data.status}`,
        old_value: current.status,
        new_value: String(data.status),
        operator_id: operatorId,
      });
    }

    return await getAdminOrderDetail(id);
  } catch (error) {
    throw error;
  }
}
