import { db } from '@/lib/db';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import { products, inventory } from '@/storage/database/shared/schema';
import { randomUUID } from 'node:crypto';
import { IS_DEMO_MODE } from '@/config/constants';

interface MockProduct {
  id: string; title?: string; title_en?: string; title_pt?: string; title_ja?: string; title_es?: string;
  description?: string; description_en?: string; description_pt?: string; description_ja?: string; description_es?: string;
  price: string; category_id?: string; category_name?: string; type?: string; status?: string;
  duration?: string | null; delivery_method?: string; cost_price?: string; compare_at_price?: string;
  barcode?: string | null; vendor?: string | null; collection?: string | null; tags?: string | null;
  created_at: string; [key: string]: unknown;
}

interface AdminProductFilters {
  search?: string;
  type?: string;
  status?: string;
  view?: string;
  page?: number;
  pageSize?: number;
}

interface BulkCatalogUpdate {
  category_id?: string;
  vendor?: string | null;
  collection?: string | null;
  tags?: {
    mode: "add" | "remove" | "replace";
    values: string[];
  };
}

const MOCK_PRODUCTS: MockProduct[] = [
  { id: 'prod-1', title: '跨境电商战略咨询', title_en: 'Cross-Border E-Commerce Strategy', title_ja: '越境EC戦略', title_es: 'Estrategia de Comercio Electrónico Transfronterizo', description: '一对一专业咨询', description_en: 'One-on-one consulting', description_ja: '一対一の専門コンサルティング', description_es: 'Consultoría individual', price: '299.00', category_id: 'cat-1', category_name: '商业咨询', type: 'service', status: 'active', duration: '60min', delivery_method: 'online', cost_price: '150.00', vendor: 'GlobalTrade', tags: 'consulting,strategy', created_at: new Date().toISOString() },
  { id: 'prod-2', title: '市场进入策略分析', title_en: 'Market Entry Strategy', title_ja: '市場参入戦略', title_es: 'Estrategia de Entrada al Mercado', description: '深入分析目标市场', description_en: 'In-depth market analysis', description_ja: 'ターゲット市場の詳細分析', description_es: 'Análisis profundo del mercado', price: '499.00', category_id: 'cat-1', category_name: '商业咨询', type: 'service', status: 'active', duration: '90min', delivery_method: 'online', cost_price: '250.00', created_at: new Date().toISOString() },
  { id: 'prod-9', title: '商业计划书模板', title_en: 'Business Plan Template', title_ja: 'ビジネスプランテンプレート', title_es: 'Plantilla de Plan de Negocios', description: '专业商业计划书模板', description_en: 'Professional business plan template', description_ja: 'プロフェッショナルなビジネスプランテンプレート', description_es: 'Plantilla profesional de plan de negocios', price: '29.00', category_id: 'cat-4', category_name: '数字模板', type: 'virtual', status: 'active', duration: null, delivery_method: 'download', cost_price: '10.00', created_at: new Date().toISOString() },
  { id: 'prod-10', title: '财务模型 Excel 模板', title_en: 'Financial Model Excel Template', category_name: '数字模板', type: 'virtual', status: 'active', price: '49.00', delivery_method: 'download', duration: null, created_at: new Date().toISOString() },
  { id: 'prod-12', title: '跨境电商实战课程', category_name: '在线课程', type: 'virtual', status: 'active', price: '199.00', delivery_method: 'email', duration: null, created_at: new Date().toISOString() },
];

function normalizeAdminProductRow(row: Record<string, unknown>) {
  const categoryId = row.category_ref_id ? String(row.category_ref_id) : "";
  return {
    ...row,
    categories: categoryId
      ? {
          id: categoryId,
          name: String(row.category_name || ""),
          name_en: String(row.category_name_en || ""),
          type: String(row.category_type || ""),
        }
      : null,
  };
}

const PRODUCT_VIEW_CONDITIONS: Record<string, string> = {
  active: "p.status = 'active'",
  inactive: "p.status = 'inactive'",
  sold: "p.status = 'sold'",
  needs_media: "(NULLIF(TRIM(COALESCE(p.image_key, '')), '') IS NULL AND NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id = p.id))",
  needs_seo: "(NULLIF(TRIM(COALESCE(p.meta_title, '')), '') IS NULL OR NULLIF(TRIM(COALESCE(p.meta_description, '')), '') IS NULL)",
  needs_pt: "(NULLIF(TRIM(COALESCE(p.title_pt, '')), '') IS NULL OR NULLIF(TRIM(COALESCE(p.description_pt, '')), '') IS NULL)",
  missing_cost: "(p.cost_price IS NULL OR p.cost_price <= 0)",
  out_of_stock: `(
    p.type = 'physical'
    AND (SELECT COALESCE(SUM(inv_sum.stock), 0) FROM inventory inv_sum WHERE inv_sum.product_id = p.id) <= 0
  )`,
};

function getViewCondition(view?: string) {
  if (!view || view === "all") return null;
  return PRODUCT_VIEW_CONDITIONS[view] || null;
}

function calculateMockViewCounts(data: MockProduct[]) {
  return {
    all: data.length,
    active: data.filter((product) => product.status === "active").length,
    inactive: data.filter((product) => product.status === "inactive").length,
    sold: data.filter((product) => product.status === "sold").length,
    needs_media: data.filter((product) => !product.image_key).length,
    needs_seo: data.filter((product) => !product.meta_title || !product.meta_description).length,
    needs_pt: data.filter((product) => !product.title_pt || !product.description_pt).length,
    missing_cost: data.filter((product) => !product.cost_price || Number(product.cost_price) <= 0).length,
    out_of_stock: data.filter((product) => product.type === "physical" && Number(product.stock || 0) <= 0).length,
  };
}

async function getProductViewCounts() {
  const [rows] = await db.$client.execute(
    `SELECT
      COUNT(*) AS all_count,
      SUM(CASE WHEN ${PRODUCT_VIEW_CONDITIONS.active} THEN 1 ELSE 0 END) AS active_count,
      SUM(CASE WHEN ${PRODUCT_VIEW_CONDITIONS.inactive} THEN 1 ELSE 0 END) AS inactive_count,
      SUM(CASE WHEN ${PRODUCT_VIEW_CONDITIONS.sold} THEN 1 ELSE 0 END) AS sold_count,
      SUM(CASE WHEN ${PRODUCT_VIEW_CONDITIONS.needs_media} THEN 1 ELSE 0 END) AS needs_media_count,
      SUM(CASE WHEN ${PRODUCT_VIEW_CONDITIONS.needs_seo} THEN 1 ELSE 0 END) AS needs_seo_count,
      SUM(CASE WHEN ${PRODUCT_VIEW_CONDITIONS.needs_pt} THEN 1 ELSE 0 END) AS needs_pt_count,
      SUM(CASE WHEN ${PRODUCT_VIEW_CONDITIONS.missing_cost} THEN 1 ELSE 0 END) AS missing_cost_count,
      SUM(CASE WHEN ${PRODUCT_VIEW_CONDITIONS.out_of_stock} THEN 1 ELSE 0 END) AS out_of_stock_count
    FROM products p`
  );
  const row = (rows as Array<Record<string, string | number | null>>)[0] || {};
  return {
    all: Number(row.all_count || 0),
    active: Number(row.active_count || 0),
    inactive: Number(row.inactive_count || 0),
    sold: Number(row.sold_count || 0),
    needs_media: Number(row.needs_media_count || 0),
    needs_seo: Number(row.needs_seo_count || 0),
    needs_pt: Number(row.needs_pt_count || 0),
    missing_cost: Number(row.missing_cost_count || 0),
    out_of_stock: Number(row.out_of_stock_count || 0),
  };
}

export async function listAdminProducts(options: AdminProductFilters = {}) {
  try {
    const page = Number.isFinite(options.page) && options.page && options.page > 0 ? Math.floor(options.page) : 1;
    const pageSize = Number.isFinite(options.pageSize) && options.pageSize && options.pageSize > 0
      ? Math.min(100, Math.floor(options.pageSize))
      : 20;

    if (IS_DEMO_MODE) {
      let data = [...MOCK_PRODUCTS];
      const viewCounts = calculateMockViewCounts(data);
      const search = options.search?.trim().toLowerCase();
      if (search) {
        data = data.filter((product) =>
          [product.title, product.title_en, product.title_pt, product.description, product.description_en, product.description_pt]
            .some((value) => String(value || "").toLowerCase().includes(search))
        );
      }
      if (options.type && options.type !== "all") data = data.filter((product) => product.type === options.type);
      if (options.status && options.status !== "all") data = data.filter((product) => product.status === options.status);
      if (options.view && options.view !== "all") {
        data = data.filter((product) => {
          if (options.view === "active") return product.status === "active";
          if (options.view === "inactive") return product.status === "inactive";
          if (options.view === "sold") return product.status === "sold";
          if (options.view === "needs_media") return !product.image_key;
          if (options.view === "needs_seo") return !product.meta_title || !product.meta_description;
          if (options.view === "needs_pt") return !product.title_pt || !product.description_pt;
          if (options.view === "missing_cost") return !product.cost_price || Number(product.cost_price) <= 0;
          if (options.view === "out_of_stock") return product.type === "physical" && Number(product.stock || 0) <= 0;
          return true;
        });
      }
      const total = data.length;
      const offset = (page - 1) * pageSize;
      return { data: data.slice(offset, offset + pageSize), total, page, pageSize, viewCounts, error: null };
    }

    const where: string[] = [];
    const params: Array<string | number> = [];
    const search = options.search?.trim();
    if (search) {
      const keyword = `%${search}%`;
      where.push("(p.title LIKE ? OR p.title_en LIKE ? OR p.title_pt LIKE ? OR p.description LIKE ? OR p.description_en LIKE ? OR p.description_pt LIKE ? OR p.barcode LIKE ? OR p.vendor LIKE ? OR p.collection LIKE ? OR p.tags LIKE ?)");
      params.push(keyword, keyword, keyword, keyword, keyword, keyword, keyword, keyword, keyword, keyword);
    }
    if (options.type && options.type !== "all") {
      where.push("p.type = ?");
      params.push(options.type);
    }
    if (options.status && options.status !== "all") {
      where.push("p.status = ?");
      params.push(options.status);
    }
    const viewCondition = getViewCondition(options.view);
    if (viewCondition) {
      where.push(viewCondition);
    }
    const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
    const viewCounts = await getProductViewCounts();

    const [countRows] = await db.$client.execute(
      `SELECT COUNT(*) as total FROM products p${whereSql}`,
      params
    );
    const total = Number(((countRows as Array<{ total?: number | string }>)[0]?.total) || 0);
    const offset = (page - 1) * pageSize;
    const [rows] = await db.$client.execute(
      'SELECT p.*, c.id as category_ref_id, c.name as category_name, c.name_en as category_name_en, c.type as category_type FROM products p ' +
      `LEFT JOIN categories c ON p.category_id = c.id${whereSql} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
      // LIMIT/OFFSET 必须以字符串绑定:mysql2 把 JS number 编码为 DOUBLE,部分 MySQL 版本拒收
      [...params, String(pageSize), String(offset)]
    );
    return {
      data: (rows as Record<string, unknown>[] || []).map(normalizeAdminProductRow),
      total,
      page,
      pageSize,
      viewCounts,
      error: null,
    };
  } catch (error) {
    if (IS_DEMO_MODE) return { data: MOCK_PRODUCTS, viewCounts: calculateMockViewCounts(MOCK_PRODUCTS), error: null };
    return { data: [], error };
  }
}

export async function createProduct(input: Record<string, unknown>) {
  try {
    if (IS_DEMO_MODE) {
      const newProduct = { id: `prod-${Date.now()}`, ...input, created_at: new Date().toISOString(), category_name: '' };
      MOCK_PRODUCTS.unshift(newProduct as MockProduct);
      return newProduct;
    }
    const id = randomUUID();
    await db.insert(products).values({ id, ...input } as typeof products.$inferInsert);
    const [data] = await db.select().from(products).where(eq(products.id, id)).limit(1);

    // 自动初始化 inventory 行（幂等：先查重，避免重复插入）
    try {
      const existing = await db.select().from(inventory)
        .where(and(eq(inventory.product_id, id), isNull(inventory.warehouse_id), isNull(inventory.variant_id)))
        .limit(1);
      if (existing.length === 0) {
        await db.insert(inventory).values({
          id: randomUUID(),
          product_id: id,
          stock: 0,
          low_stock_threshold: 10,
        } as typeof inventory.$inferInsert);
      }
    } catch { /* inventory init 失败不阻塞商品创建 */ }

    return data;
  } catch (error) {
    throw error;
  }
}

export async function updateProduct(id: string, input: Record<string, unknown>) {
  try {
    if (IS_DEMO_MODE) {
      const idx = MOCK_PRODUCTS.findIndex((p) => p.id === id);
      if (idx !== -1) Object.assign(MOCK_PRODUCTS[idx], input);
      return MOCK_PRODUCTS[idx] || null;
    }
    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) updateData[key] = value;
    }
    await db.update(products).set(updateData as Partial<typeof products.$inferInsert>).where(eq(products.id, id));
    const [data] = await db.select().from(products).where(eq(products.id, id)).limit(1);
    return data;
  } catch (error) {
    throw error;
  }
}

function uniqueProductIds(ids: string[]) {
  return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
}

function uniqueTags(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const tag = value.trim();
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }
  return result;
}

function parseTags(value: unknown) {
  return uniqueTags(String(value || "").split(/[,，\n]/));
}

function mergeTags(current: unknown, update: NonNullable<BulkCatalogUpdate["tags"]>) {
  const existing = parseTags(current);
  const incoming = uniqueTags(update.values);
  if (update.mode === "replace") return incoming.join(",");
  if (update.mode === "add") return uniqueTags([...existing, ...incoming]).join(",");

  const removeSet = new Set(incoming.map((tag) => tag.toLowerCase()));
  return existing.filter((tag) => !removeSet.has(tag.toLowerCase())).join(",");
}

export async function bulkUpdateProductsStatus(ids: string[], status: string) {
  const uniqueIds = uniqueProductIds(ids);
  if (uniqueIds.length === 0) return { updated: 0 };

  try {
    if (IS_DEMO_MODE) {
      for (const id of uniqueIds) {
        const product = MOCK_PRODUCTS.find((p) => p.id === id);
        if (product) product.status = status;
      }
      return { updated: uniqueIds.length };
    }

    await db.update(products)
      .set({ status, updated_at: new Date() } as Partial<typeof products.$inferInsert>)
      .where(inArray(products.id, uniqueIds));

    return { updated: uniqueIds.length };
  } catch (error) {
    throw error;
  }
}

export async function bulkUpdateProductsCatalog(ids: string[], input: BulkCatalogUpdate) {
  const uniqueIds = uniqueProductIds(ids);
  if (uniqueIds.length === 0) return { updated: 0 };

  try {
    if (IS_DEMO_MODE) {
      for (const id of uniqueIds) {
        const product = MOCK_PRODUCTS.find((p) => p.id === id);
        if (!product) continue;
        if (input.category_id !== undefined) product.category_id = input.category_id;
        if (input.vendor !== undefined) product.vendor = input.vendor;
        if (input.collection !== undefined) product.collection = input.collection;
        if (input.tags) product.tags = mergeTags(product.tags, input.tags);
      }
      return { updated: uniqueIds.length };
    }

    const commonUpdate: Partial<typeof products.$inferInsert> = { updated_at: new Date() };
    let hasCommonUpdate = false;
    if (input.category_id !== undefined) {
      commonUpdate.category_id = input.category_id;
      hasCommonUpdate = true;
    }
    if (input.vendor !== undefined) {
      commonUpdate.vendor = input.vendor;
      hasCommonUpdate = true;
    }
    if (input.collection !== undefined) {
      commonUpdate.collection = input.collection;
      hasCommonUpdate = true;
    }

    await db.transaction(async (tx) => {
      if (hasCommonUpdate) {
        await tx.update(products).set(commonUpdate).where(inArray(products.id, uniqueIds));
      }

      if (input.tags) {
        const rows = await tx
          .select({ id: products.id, tags: products.tags })
          .from(products)
          .where(inArray(products.id, uniqueIds));

        for (const row of rows) {
          await tx.update(products)
            .set({ tags: mergeTags(row.tags, input.tags), updated_at: new Date() } as Partial<typeof products.$inferInsert>)
            .where(eq(products.id, row.id));
        }
      }
    });

    return { updated: uniqueIds.length };
  } catch (error) {
    throw error;
  }
}

export async function deleteProduct(id: string) {
  try {
    if (IS_DEMO_MODE) {
      const idx = MOCK_PRODUCTS.findIndex((p) => p.id === id);
      if (idx !== -1) MOCK_PRODUCTS.splice(idx, 1);
      return;
    }
    await db.delete(products).where(eq(products.id, id));
  } catch (error) {
    throw error;
  }
}

export async function bulkDeleteProducts(ids: string[]) {
  const uniqueIds = uniqueProductIds(ids);
  if (uniqueIds.length === 0) return { deleted: 0 };

  try {
    if (IS_DEMO_MODE) {
      for (const id of uniqueIds) {
        const idx = MOCK_PRODUCTS.findIndex((p) => p.id === id);
        if (idx !== -1) MOCK_PRODUCTS.splice(idx, 1);
      }
      return { deleted: uniqueIds.length };
    }

    await db.delete(products).where(inArray(products.id, uniqueIds));
    return { deleted: uniqueIds.length };
  } catch (error) {
    throw error;
  }
}
