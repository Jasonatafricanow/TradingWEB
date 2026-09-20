import { db } from '@/lib/db';
import { eq, asc, gte, isNotNull, and, sql } from 'drizzle-orm';
import { pageViews, whatsappClicks, orders } from '@/storage/database/shared/schema';
import { randomUUID } from 'node:crypto';

export interface PageViewRecord {
  path: string
  title?: string
  referrer?: string
  visitor_id?: string
  user_agent?: string
  ip_anonymized?: string
  country?: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
}

export interface TrafficSummary {
  totalPv: number
  totalUv: number
  productPageViews: number
  topPages: { path: string; count: number; title?: string }[]
  dailyTrend: { date: string; pv: number; uv: number }[]
  referrers: { source: string; count: number }[]
  whatsappClicks: number
  uniqueWaVisitors: number
  conversionRate: number
  checkoutCount: number
  paidOrderCount: number
  funnelSteps: { label: string; count: number; rate: number }[]
}

export interface WhatsAppClickRecord {
  visitor_id?: string
  product_id?: string
  variant_id?: string
  path: string
  locale?: string
  referrer?: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
}

export async function recordPageView(data: PageViewRecord) {
  try {
    const id = randomUUID();
    await db.insert(pageViews).values({
      id,
      path: data.path,
      title: data.title || null,
      referrer: data.referrer || null,
      visitor_id: data.visitor_id || null,
      user_agent: data.user_agent || null,
      ip_anonymized: data.ip_anonymized || null,
      country: data.country || null,
      utm_source: data.utm_source || null,
      utm_medium: data.utm_medium || null,
      utm_campaign: data.utm_campaign || null,
      utm_content: data.utm_content || null,
    });
  } catch (error) {
    throw error;
  }
}

export async function recordWhatsAppClick(data: WhatsAppClickRecord) {
  try {
    const id = randomUUID();
    await db.insert(whatsappClicks).values({
      id,
      visitor_id: data.visitor_id || null,
      product_id: data.product_id || null,
      variant_id: data.variant_id || null,
      path: data.path,
      locale: data.locale || null,
      referrer: data.referrer || null,
      utm_source: data.utm_source || null,
      utm_medium: data.utm_medium || null,
      utm_campaign: data.utm_campaign || null,
      utm_content: data.utm_content || null,
    });
  } catch (error) {
    throw error;
  }
}

export async function getTrafficSummary(days: number = 30): Promise<TrafficSummary> {
  const since = new Date(Date.now() - days * 86400000);

  const [totalRow] = await db.select({ count: sql<number>`count(*)` }).from(pageViews)
    .where(gte(pageViews.created_at, since));

  const uvRows = await db.select({ visitor_id: pageViews.visitor_id }).from(pageViews)
    .where(and(gte(pageViews.created_at, since), isNotNull(pageViews.visitor_id)));

  const uniqueVisitors = new Set(uvRows.map(v => v.visitor_id).filter(Boolean)).size;

  const pageData = await db.select({
    path: pageViews.path,
    title: pageViews.title,
    referrer: pageViews.referrer,
  }).from(pageViews).where(gte(pageViews.created_at, since));

  const pageCount = new Map<string, { count: number; title?: string }>();
  for (const v of pageData) {
    const existing = pageCount.get(v.path) || { count: 0, title: v.title || undefined };
    existing.count++;
    pageCount.set(v.path, existing);
  }

  const topPages = Array.from(pageCount.entries())
    .map(([path, val]) => ({ path, count: val.count, title: val.title }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const dailyRows = await db.select({
    created_at: pageViews.created_at,
    visitor_id: pageViews.visitor_id,
  }).from(pageViews).where(gte(pageViews.created_at, since)).orderBy(asc(pageViews.created_at));

  const dailyMap = new Map<string, { pv: number; visitors: Set<string> }>();
  for (const v of dailyRows) {
    const date = new Date(v.created_at).toISOString().split('T')[0];
    const entry = dailyMap.get(date) || { pv: 0, visitors: new Set<string>() };
    entry.pv++;
    if (v.visitor_id) entry.visitors.add(v.visitor_id);
    dailyMap.set(date, entry);
  }

  const dailyTrend = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, val]) => ({ date, pv: val.pv, uv: val.visitors.size }));

  const referrerCount = new Map<string, number>();
  for (const v of pageData) {
    let source = '直接访问';
    if (v.referrer) {
      try {
        const url = new URL(v.referrer);
        source = url.hostname;
      } catch {
        source = '其他';
      }
    }
    referrerCount.set(source, (referrerCount.get(source) || 0) + 1);
  }

  const referrers = Array.from(referrerCount.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);

  // WhatsApp 点击统计
  const [waRow] = await db.select({ count: sql<number>`count(*)` }).from(whatsappClicks)
    .where(gte(whatsappClicks.created_at, since));
  const waClicks = Number(waRow?.count || 0);

  // 商品页 PV（路径以 /products/ 开头）
  const [prodRow] = await db.select({ count: sql<number>`count(*)` }).from(pageViews)
    .where(and(gte(pageViews.created_at, since), sql`${pageViews.path} LIKE '/products/%'`));
  const productPageViews = Number(prodRow?.count || 0);

  // 唯一 WA 点击访客
  const waVisitorRows = await db.select({ visitor_id: whatsappClicks.visitor_id }).from(whatsappClicks)
    .where(and(gte(whatsappClicks.created_at, since), isNotNull(whatsappClicks.visitor_id)));
  const uniqueWaVisitors = new Set(waVisitorRows.map(v => v.visitor_id).filter(Boolean)).size;

  // 转化率 = 唯一 WA 访客 / 商品页 UV（至少有商品页浏览的访客才算有机会转化）
  const productUvRows = await db.select({ visitor_id: pageViews.visitor_id }).from(pageViews)
    .where(and(gte(pageViews.created_at, since), isNotNull(pageViews.visitor_id), sql`${pageViews.path} LIKE '/products/%'`));
  const uniqueProductViewers = new Set(productUvRows.map(v => v.visitor_id).filter(Boolean)).size;
  const conversionRate = uniqueProductViewers > 0 ? (uniqueWaVisitors / uniqueProductViewers) * 100 : 0;

  // 漏斗: Checkout → Paid Order
  const [checkoutRow] = await db.select({ count: sql<number>`count(*)` }).from(orders)
    .where(gte(orders.created_at, since));
  const checkoutCount = Number(checkoutRow?.count || 0);

  const [paidRow] = await db.select({ count: sql<number>`count(*)` }).from(orders)
    .where(and(gte(orders.created_at, since), sql`status IN ('paid', 'completed')`));
  const paidOrderCount = Number(paidRow?.count || 0);

  const totalPv = Number(totalRow?.count || 0);
  const funnelSteps = [
    { label: 'PV', count: totalPv, rate: 100 },
    { label: '商品页浏览', count: productPageViews, rate: totalPv > 0 ? Math.round((productPageViews / totalPv) * 10000) / 100 : 0 },
    { label: 'WhatsApp 点击', count: waClicks, rate: productPageViews > 0 ? Math.round((waClicks / productPageViews) * 10000) / 100 : 0 },
    { label: '下单', count: checkoutCount, rate: totalPv > 0 ? Math.round((checkoutCount / totalPv) * 10000) / 100 : 0 },
    { label: '已支付', count: paidOrderCount, rate: checkoutCount > 0 ? Math.round((paidOrderCount / checkoutCount) * 10000) / 100 : 0 },
  ];

  return {
    totalPv,
    totalUv: uniqueVisitors,
    productPageViews,
    topPages,
    dailyTrend,
    referrers,
    whatsappClicks: waClicks,
    uniqueWaVisitors,
    conversionRate: Math.round(conversionRate * 100) / 100,
    checkoutCount,
    paidOrderCount,
    funnelSteps,
  };
}
