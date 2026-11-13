/**
 * 商品服务 — 统一使用 Drizzle ORM（MySQL）
 * 演示模式下读取 src/lib/demo/catalog 的统一目录，与后台共用同一数据源。
 */
import { IS_DEMO_MODE } from '@/config/constants';
import { DEMO_PRODUCTS as CATALOG_PRODUCTS, demoProduct } from '@/lib/demo/catalog';

export async function listActiveProducts(options?: { type?: string; category?: string; limit?: number; sort?: string }) {
  const limit = options?.limit && Number.isFinite(options.limit)
    ? Math.min(100, Math.max(1, Math.floor(options.limit)))
    : undefined;
  // ═══════ DEMO MODE ═══════
  if (IS_DEMO_MODE) {
    let data: typeof CATALOG_PRODUCTS = [...CATALOG_PRODUCTS];
    if (options?.type) data = data.filter((p) => p.type === options.type);
    if (options?.category) data = data.filter((p) => p.category_id === options.category);
    const score = (p: (typeof data)[number]) => p.rating * Math.log10(p.sold_count + 10);
    if (options?.sort === 'popular') {
      data = [...data].sort((a, b) => b.sold_count - a.sold_count);
    } else if (options?.sort === 'featured') {
      // 实物优先并与服务/数字商品交错，保证首屏同时看到硬件与专业服务
      const physical = data.filter((p) => p.type === 'physical').sort((a, b) => score(b) - score(a));
      const others = data.filter((p) => p.type !== 'physical').sort((a, b) => score(b) - score(a));
      const mixed: typeof data = [];
      for (let i = 0; i < Math.max(physical.length, others.length); i++) {
        if (i < 4 && physical[i]) mixed.push(physical[i]);
        if (others[i]) mixed.push(others[i]);
        if (i >= 4 && physical[i]) mixed.push(physical[i]);
      }
      data = mixed;
    }
    const total = data.length;
    if (limit) data = data.slice(0, limit);
    return { data, total };
  }

  // ═══════ PRODUCTION MODE ═══════
  const { db } = await import('@/lib/db');

  const whereSql =
    'WHERE p.status = ?' +
    (options?.type ? ' AND p.type = ?' : '') +
    (options?.category ? ' AND p.category_id = ?' : '');
  const params: Array<string | number> = [
    'active',
    ...(options?.type ? [options.type] : []),
    ...(options?.category ? [options.category] : []),
  ];
  // LIMIT 参数必须以字符串绑定:mysql2 把 JS number 编码为 DOUBLE,部分 MySQL 版本拒收
  if (limit) params.push(String(limit));

  const [rows] = await db.$client.execute(
    `SELECT p.*, c.name as category_name, c.name_en as category_name_en,
            c.name_es as category_name_es, c.name_ja as category_name_ja,
            COALESCE(pv.min_price, p.price) as price_min,
            COALESCE(pv.max_price, p.price) as price_max,
            COALESCE(pv.variant_count, 0) as variant_count
     FROM products p
     LEFT JOIN categories c ON p.category_id = c.id
     LEFT JOIN (
       SELECT product_id,
         MIN(price) as min_price,
         MAX(price) as max_price,
         COUNT(*) as variant_count
       FROM product_variants
       GROUP BY product_id
     ) pv ON p.id = pv.product_id
     ${whereSql}
     ORDER BY p.created_at DESC
     ${limit ? 'LIMIT ?' : ''}`,
    params
  );

  return { data: (rows || []) as unknown[] };
}

export async function getProductById(id: string) {
  // ═══════ DEMO MODE ═══════
  if (IS_DEMO_MODE) {
    return demoProduct(id);
  }

  // ═══════ PRODUCTION MODE ═══════
  const { db } = await import('@/lib/db');

  const [rows] = await db.$client.execute(
    `SELECT p.*, c.name as category_name, c.name_en as category_name_en,
            c.name_es as category_name_es, c.name_ja as category_name_ja
     FROM products p
     LEFT JOIN categories c ON p.category_id = c.id
     WHERE p.id = ? LIMIT 1`,
    [id]
  );
  const list = rows as unknown[];
  if (list.length === 0) return null;
  return list[0];
}
