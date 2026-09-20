/**
 * 商品服务 — 统一使用 Drizzle ORM（MySQL）
 */
import { IS_DEMO_MODE } from '@/config/constants';

// ─── Demo 模式 mock 数据 ───────────────────────────────────────────────────
const DEMO_PRODUCTS = [
  {
    id: 'prod-1',
    title: '跨境电商战略咨询',
    title_en: 'Cross-Border E-Commerce Strategy',
    title_pt: 'Estratégia de E-Commerce Transfronteiriço',
    description: '一对一专业咨询，帮助企业制定跨境电商战略',
    description_en: 'One-on-one consulting to build your cross-border e-commerce strategy',
    description_pt: 'Consultoria individual para estratégia de e-commerce transfronteiriço',
    price: '299.00',
    category_id: 'cat-1',
    type: 'service',
    status: 'active',
    duration: '60min',
    delivery_method: 'online',
    image_key: null,
    created_at: new Date().toISOString(),
    categories: { id: 'cat-1', name: '商业咨询', name_en: 'Business Consulting', name_ja: null, name_es: null },
  },
  {
    id: 'prod-2',
    title: '市场进入策略分析',
    title_en: 'Market Entry Strategy Analysis',
    title_pt: 'Análise de Estratégia de Entrada no Mercado',
    description: '深入分析目标市场，提供可落地的进入策略',
    description_en: 'In-depth analysis of target markets with actionable entry strategies',
    description_pt: 'Análise aprofundada de mercados-alvo com estratégias de entrada acionáveis',
    price: '499.00',
    category_id: 'cat-1',
    type: 'service',
    status: 'active',
    duration: '90min',
    delivery_method: 'online',
    image_key: null,
    created_at: new Date().toISOString(),
    categories: { id: 'cat-1', name: '商业咨询', name_en: 'Business Consulting', name_ja: null, name_es: null },
  },
  {
    id: 'prod-3',
    title: '供应链优化方案',
    title_en: 'Supply Chain Optimization',
    title_pt: 'Otimização da Cadeia de Suprimentos',
    description: '评估并优化跨境供应链，降低物流成本',
    description_en: 'Evaluate and optimize your cross-border supply chain to reduce logistics costs',
    description_pt: 'Avalie e otimize sua cadeia de suprimentos para reduzir custos logísticos',
    price: '799.00',
    category_id: 'cat-1',
    type: 'service',
    status: 'active',
    duration: '120min',
    delivery_method: 'online',
    image_key: null,
    created_at: new Date().toISOString(),
    categories: { id: 'cat-1', name: '商业咨询', name_en: 'Business Consulting', name_ja: null, name_es: null },
  },
  {
    id: 'prod-9',
    title: '商业计划书模板',
    title_en: 'Business Plan Template',
    title_pt: 'Modelo de Plano de Negócios',
    description: '专业商业计划书模板，适用于跨境贸易融资场景',
    description_en: 'Professional business plan template for cross-border trade financing',
    description_pt: 'Modelo profissional de plano de negócios para financiamento de comércio',
    price: '29.00',
    category_id: 'cat-4',
    type: 'virtual',
    status: 'active',
    duration: null,
    delivery_method: 'download',
    image_key: null,
    created_at: new Date().toISOString(),
    categories: { id: 'cat-4', name: '数字模板', name_en: 'Digital Templates', name_ja: null, name_es: null },
  },
  {
    id: 'prod-10',
    title: '财务模型 Excel 模板',
    title_en: 'Financial Model Excel Template',
    title_pt: 'Modelo Excel de Modelo Financeiro',
    description: '专业财务建模模板，涵盖损益、现金流、资产负债表',
    description_en: 'Professional financial modeling template covering P&L, cash flow, and balance sheet',
    description_pt: 'Modelo de modelagem financeira cobrindo DRE, fluxo de caixa e balanço',
    price: '49.00',
    category_id: 'cat-4',
    type: 'virtual',
    status: 'active',
    duration: null,
    delivery_method: 'download',
    image_key: null,
    created_at: new Date().toISOString(),
    categories: { id: 'cat-4', name: '数字模板', name_en: 'Digital Templates', name_ja: null, name_es: null },
  },
  {
    id: 'prod-12',
    title: '跨境电商实战课程',
    title_en: 'Cross-Border E-Commerce Masterclass',
    title_pt: 'Curso Prático de E-Commerce Transfronteiriço',
    description: '系统讲解跨境电商全流程，包含平台选品、运营推广、合规税务',
    description_en: 'Comprehensive course covering platform selection, operations, and compliance',
    description_pt: 'Curso abrangente cobrindo seleção de plataforma, operações e conformidade',
    price: '199.00',
    category_id: 'cat-5',
    type: 'virtual',
    status: 'active',
    duration: null,
    delivery_method: 'email',
    image_key: null,
    created_at: new Date().toISOString(),
    categories: { id: 'cat-5', name: '在线课程', name_en: 'Online Courses', name_ja: null, name_es: null },
  },
];

export async function listActiveProducts(options?: { type?: string; category?: string; limit?: number }) {
  const limit = options?.limit && Number.isFinite(options.limit)
    ? Math.min(100, Math.max(1, Math.floor(options.limit)))
    : undefined;
  // ═══════ DEMO MODE ═══════
  if (IS_DEMO_MODE) {
    let data = DEMO_PRODUCTS;
    if (options?.type) data = data.filter((p) => p.type === options.type);
    if (options?.category) data = data.filter((p) => p.category_id === options.category);
    if (limit) data = data.slice(0, limit);
    return { data };
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
            COALESCE(pv.max_price, p.price) as price_max
     FROM products p
     LEFT JOIN categories c ON p.category_id = c.id
     LEFT JOIN (
       SELECT product_id,
         MIN(price) as min_price,
         MAX(price) as max_price
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
    return DEMO_PRODUCTS.find((p) => p.id === id) ?? null;
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
