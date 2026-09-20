import { db } from '@/lib/db';
import { desc, like, eq, sql } from 'drizzle-orm';
import { auditLogs } from '@/storage/database/shared/schema';
import { randomUUID } from 'node:crypto';
import { IS_DEMO_MODE } from '@/config/constants';

// 模拟日志数据
const MOCK_LOGS: any[] = [];
function ensureMockSeeded() {
  if (MOCK_LOGS.length > 0) return;
  const actions = ['create', 'update', 'delete', 'login', 'logout'];
  const entities = ['product', 'order', 'category', 'staff', 'coupon', 'settings'];
  for (let i = 0; i < 50; i++) {
    const d = new Date();
    d.setHours(d.getHours() - Math.floor(Math.random() * 72));
    MOCK_LOGS.push({
      id: `log-${i}`,
      action: actions[Math.floor(Math.random() * actions.length)],
      entity_type: entities[Math.floor(Math.random() * entities.length)],
      entity_id: `uuid-${Math.random().toString(36).slice(2, 10)}`,
      user_id: `user-${Math.floor(Math.random() * 4)}`,
      details: { key: `value-${i}` },
      created_at: d.toISOString(),
    });
  }
}

export async function logAction(params: {
  userId?: string
  action: string
  entityType?: string
  entityId?: string
  details?: unknown
  ipAddress?: string
}) {
  const id = randomUUID();
  await db.insert(auditLogs).values({
    id,
    user_id: params.userId || null,
    action: params.action,
    entity_type: params.entityType || null,
    entity_id: params.entityId || null,
    details: params.details || null,
    ip_address: params.ipAddress || null,
  });
}

export async function listAuditLogs(opts?: {
  search?: string
  action?: string
  entityType?: string
  page?: number
  limit?: number
}) {
  const page = opts?.page || 1;
  const limit = opts?.limit || 50;
  const offset = (page - 1) * limit;

  try {
    if (IS_DEMO_MODE) {
      ensureMockSeeded();
      let filtered = [...MOCK_LOGS];

      if (opts?.search) {
        const q = opts.search.toLowerCase();
        filtered = filtered.filter((l) =>
          l.action.toLowerCase().includes(q) ||
          (l.entity_type || '').toLowerCase().includes(q) ||
          (l.entity_id || '').toLowerCase().includes(q) ||
          (l.user_id || '').toLowerCase().includes(q)
        );
      }
      if (opts?.action && opts.action !== 'all') {
        filtered = filtered.filter((l) => l.action === opts.action);
      }
      if (opts?.entityType && opts.entityType !== 'all') {
        filtered = filtered.filter((l) => l.entity_type === opts.entityType);
      }

      const total = filtered.length;
      filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const data = filtered.slice(offset, offset + limit);

      return { data, total, page, limit, error: null };
    }

    // Production mode
    const query = db.select().from(auditLogs);
    const countQuery = db.select({ count: sql<number>`count(*)` }).from(auditLogs);

    // Build where conditions
    const conditions: any[] = [];

    if (opts?.search) {
      const q = `%${opts.search}%`;
      conditions.push(
        sql`(${like(auditLogs.action, q)} OR ${like(auditLogs.entity_type, q)} OR ${like(auditLogs.entity_id, q)} OR ${like(auditLogs.user_id, q)})`
      );
    }
    if (opts?.action && opts.action !== 'all') {
      conditions.push(eq(auditLogs.action, opts.action));
    }
    if (opts?.entityType && opts.entityType !== 'all') {
      conditions.push(eq(auditLogs.entity_type, opts.entityType));
    }

    let finalQuery: any = query;
    let finalCountQuery: any = countQuery;
    if (conditions.length > 0) {
      finalQuery = finalQuery.where(sql.join(conditions, sql` AND `));
      finalCountQuery = finalCountQuery.where(sql.join(conditions, sql` AND `));
    }

    const [totalResult] = await finalCountQuery;
    const total = Number(totalResult?.count || 0);

    const data = await finalQuery
      .orderBy(desc(auditLogs.created_at))
      .limit(limit)
      .offset(offset);

    return { data: data || [], total, page, limit, error: null };
  } catch (error) {
    // Fallback to demo mock on DB error
    if (IS_DEMO_MODE) {
      ensureMockSeeded();
      return { data: MOCK_LOGS.slice(offset, offset + limit), total: MOCK_LOGS.length, page, limit, error: null };
    }
    return { data: [], total: 0, page, limit, error };
  }
}
