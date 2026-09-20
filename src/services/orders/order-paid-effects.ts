import type { orders } from '@/storage/database/shared/schema';
import { deductInventoryForOrder } from './order-stock-service';
import { addOrderTimeline } from './order-timeline';

// 订单首次翻转为 paid 后的统一副作用:核销优惠券、扣库存、写时间线。
// 只允许在 markOrderPaidIfNotAlready 返回 transitioned=true 时调用,
// callback / webhook / 后台 mark-paid / POS 都走这里,保证行为一致。
export async function runOrderPaidSideEffects(
  order: typeof orders.$inferSelect,
  opts: { source: string; operatorId?: string | null; storeId?: string | null }
) {
  if (order.coupon_id) {
    try {
      const { consumeCoupon } = await import('@/services/admin/coupon-service');
      await consumeCoupon(order.coupon_id);
    } catch (e) {
      console.error('[order-paid] consumeCoupon failed:', e);
    }
  }

  try {
    await deductInventoryForOrder(order.id, {
      operatorId: opts.operatorId ?? null,
      storeId: opts.storeId ?? order.store_id ?? null,
      source: opts.source,
    });
  } catch (e) {
    console.error('[order-paid] deductInventoryForOrder failed:', e);
  }

  await addOrderTimeline({
    order_id: order.id,
    action: 'paid',
    description: `支付确认(来源: ${opts.source})`,
    old_value: 'unpaid',
    new_value: 'paid',
    operator_id: opts.operatorId ?? null,
  });
}
