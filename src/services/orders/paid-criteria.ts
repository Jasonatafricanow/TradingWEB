import { sql, type SQL } from 'drizzle-orm';
import { orders } from '@/storage/database/shared/schema';

// 统一“已成交订单”口径:线上已支付(payment_status)、后台确认收款(financial_status)、
// 或已进入处理/完成流程(status)。所有报表、看板、扣库存判断都必须引用这里,
// 不要在各 service 里各自写 status='paid'。

/** 原生 SQL 片段版本,alias 为 orders 表别名(如 'o') */
export function paidOrderCondition(alias = ''): string {
  const p = alias ? `${alias}.` : '';
  return `(${p}payment_status = 'paid' OR ${p}financial_status = 'paid' OR ${p}status IN ('paid','processing','completed'))`;
}

/** Drizzle 查询版本,用于 .where(and(...)) */
export function paidOrderWhere(): SQL {
  return sql`(${orders.payment_status} = 'paid' OR ${orders.financial_status} = 'paid' OR ${orders.status} IN ('paid','processing','completed'))`;
}
