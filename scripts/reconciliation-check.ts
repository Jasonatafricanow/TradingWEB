/**
 * P4-03 订单/库存/支付对账
 *
 * 对 DB_* 环境变量指向的库做数据一致性检查:
 *  1. 订单金额 vs 明细合计(含折扣)          [严重]
 *  2. 无明细的订单                            [提示,历史手工单常见]
 *  3. paid 实物单缺库存出库流水               [提示,P1-04 上线前的历史单会命中]
 *  4. 库存流水 before/after 与 quantity 自洽  [严重]
 *  5. 取消单已扣库存但未回补                  [严重]
 *  6. 支付状态矛盾组合                        [严重]
 *  7. POS 订单完整性(store/paid/fulfilled/时间线) [严重]
 *
 * 用法:pnpm tsx scripts/reconciliation-check.ts
 * 退出码:严重类有发现 → 1;仅提示类 → 0。
 */
import { db } from '@/lib/db';
import { paidOrderCondition } from '@/services/orders/paid-criteria';

type SqlParam = string | number | null;

async function q(sqlStr: string, params: SqlParam[] = []): Promise<Record<string, unknown>[]> {
  const [rows] = await db.$client.execute(sqlStr, params);
  return rows as Record<string, unknown>[];
}

interface CheckResult {
  name: string;
  severity: 'critical' | 'info';
  count: number;
  samples: string[];
}

const results: CheckResult[] = [];

function report(name: string, severity: CheckResult['severity'], rows: Record<string, unknown>[], sampleKey = 'order_no') {
  results.push({
    name,
    severity,
    count: rows.length,
    samples: rows.slice(0, 5).map((r) => String(r[sampleKey] ?? r.id ?? '?')),
  });
}

async function main() {
  const PAID = paidOrderCondition('o');

  // 1. 订单金额 vs 明细合计(含折扣和运费)
  report('订单金额 ≠ 明细合计 - 折扣 + 运费', 'critical', await q(
    `SELECT o.order_no FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     GROUP BY o.id, o.order_no, o.total_amount, o.discount_amount, o.shipping_cost
     HAVING ABS(SUM(oi.subtotal) + COALESCE(o.shipping_cost, 0) - COALESCE(o.discount_amount, 0) - o.total_amount) > 0.01`
  ));

  // 2. 无明细订单(提示:后台手工单/导入单可能没有明细)
  report('无明细的订单', 'info', await q(
    `SELECT o.order_no FROM orders o
     WHERE NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id)`
  ));

  // 2b. 优惠券使用计数与实际订单数不一致
  report('优惠券 used_count 与实际使用不一致', 'critical', await q(
    `SELECT c.code as order_no FROM coupons c
     LEFT JOIN orders o ON o.coupon_id = c.id AND o.status IN ('paid', 'completed')
     GROUP BY c.id, c.code, c.used_count
     HAVING c.used_count != COUNT(o.id)`
  ));

  // 3. paid 实物单缺出库流水(P1-04 之前的历史单会命中,属预期)
  report('paid 实物单缺库存出库流水', 'info', await q(
    `SELECT o.order_no FROM orders o
     WHERE ${PAID} AND o.status != 'cancelled'
       AND EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.product_type = 'physical')
       AND NOT EXISTS (SELECT 1 FROM inventory_transactions t
                       WHERE t.reference_type = 'order' AND t.reference_id = o.id AND t.type = 'out')`
  ));

  // 4. 库存流水自洽:出库应 before - after = quantity,入库/补货应 after - before = quantity
  report('库存流水 before/after 与数量不自洽', 'critical', await q(
    `SELECT t.id, CONCAT(t.type, ' ', t.product_id) as order_no FROM inventory_transactions t
     WHERE (t.type = 'out' AND t.before_stock - t.after_stock != t.quantity)
        OR (t.type IN ('in', 'restock') AND t.after_stock - t.before_stock != t.quantity)`
  ));

  // 5. 取消单已扣库存但未回补
  report('取消单已扣库存未回补', 'critical', await q(
    `SELECT o.order_no FROM orders o
     WHERE o.status = 'cancelled'
       AND EXISTS (SELECT 1 FROM inventory_transactions t
                   WHERE t.reference_type = 'order' AND t.reference_id = o.id AND t.type = 'out')
       AND NOT EXISTS (SELECT 1 FROM inventory_transactions t
                       WHERE t.reference_type = 'order' AND t.reference_id = o.id AND t.type = 'in')`
  ));

  // 6. 支付状态矛盾组合
  report('支付状态矛盾(status=paid/completed 但 payment 未 paid)', 'critical', await q(
    `SELECT o.order_no FROM orders o
     WHERE o.status IN ('paid', 'completed')
       AND COALESCE(o.payment_status, 'unpaid') != 'paid'
       AND COALESCE(o.financial_status, 'pending') != 'paid'`
  ));
  report('支付状态矛盾(payment_status=paid 但 status 仍 pending)', 'critical', await q(
    `SELECT o.order_no FROM orders o
     WHERE o.payment_status = 'paid' AND o.status = 'pending'`
  ));

  // 7. POS 订单完整性
  report('POS 单缺门店/未收款/未履约', 'critical', await q(
    `SELECT o.order_no FROM orders o
     WHERE o.source = 'pos'
       AND (o.store_id IS NULL
            OR COALESCE(o.payment_status, 'unpaid') != 'paid'
            OR COALESCE(o.fulfillment_status, 'unfulfilled') != 'fulfilled'
            OR o.status = 'pending')`
  ));
  report('POS 单缺销售/换货 replacement 时间线', 'critical', await q(
    `SELECT o.order_no FROM orders o
     WHERE o.source = 'pos'
       AND NOT EXISTS (
         SELECT 1 FROM order_timeline tl
         WHERE tl.order_id = o.id
           AND tl.action IN ('pos_sale', 'pos_exchange_replacement')
       )`
  ));

  // 8. 负库存(系统不变量:所有扣减路径都禁止把库存打成负数)
  // 注:之前版本试图做"现库存 = 流水累计"推算,但没有期初余额基线时,
  // 任何直接铺底的库存(导入/绝对值设置/手工 INSERT)都会误报,且 products 表
  // 商品表并无 stock 列；inventory 是所有渠道唯一库存事实来源。
  report('库存行为负数', 'critical', await q(
    `SELECT CONCAT('inventory:', i.id) as order_no FROM inventory i WHERE i.stock < 0`
  ));
  report('库存变体归属不匹配', 'critical', await q(
    `SELECT CONCAT('variant-scope:', i.id) as order_no
     FROM inventory i JOIN product_variants v ON v.id = i.variant_id
     WHERE i.product_id <> v.product_id`
  ));

  // ── 输出 ──
  console.log('\n══ 对账结果 ══\n');
  let criticalTotal = 0;
  for (const r of results) {
    const flag = r.count === 0 ? '✓' : r.severity === 'critical' ? '✗' : '⚠';
    console.log(`${flag} [${r.severity}] ${r.name}: ${r.count}`);
    if (r.count > 0 && r.samples.length > 0) {
      console.log(`    样本: ${r.samples.join(', ')}${r.count > r.samples.length ? ' ...' : ''}`);
    }
    if (r.severity === 'critical') criticalTotal += r.count;
  }
  console.log('');
  if (criticalTotal > 0) {
    console.log(`✗ 严重不一致共 ${criticalTotal} 条,需要人工处理`);
    process.exit(1);
  }
  console.log('✓ 无严重不一致');
  process.exit(0);
}

main().catch((e) => {
  console.error('对账脚本异常:', e);
  process.exit(2);
});
