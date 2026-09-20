import { db } from '@/lib/db';
import { and, eq, desc, isNull } from 'drizzle-orm';
import { posOperatorSessions, staff } from '@/storage/database/shared/schema';
import { randomUUID } from 'node:crypto';
import { IS_DEMO_MODE } from '@/config/constants';
import { hashPosPin } from './pos-operator-crypto';
import { planStaffPosUpdate, type StaffPosSnapshot } from './staff-pos-policy';

export interface PublicStaffRecord extends Record<string, unknown> {
  id: string;
  email: string | null;
  pos_pin_configured: boolean;
}

export function toPublicStaff(record: Record<string, unknown>): PublicStaffRecord {
  const {
    pos_pin: _posPin,
    pos_pin_hash,
    pos_pin_failed_attempts: _posPinFailedAttempts,
    pos_pin_last_failed_at: _posPinLastFailedAt,
    pos_pin_locked_until: _posPinLockedUntil,
    ...publicRecord
  } = record;
  void _posPinFailedAttempts;
  void _posPinLastFailedAt;
  void _posPinLockedUntil;
  void _posPin;
  return {
    ...publicRecord,
    id: String(record.id),
    email: typeof record.email === 'string' ? record.email : null,
    pos_pin_configured: typeof pos_pin_hash === 'string' && pos_pin_hash.length > 0,
  };
}

interface StaffRecord {
  id: string; user_id?: string; name: string; email: string; role: string; phone?: string;
  is_active: boolean; last_login_at?: string; created_at: string;
}

const MOCK_STAFF: StaffRecord[] = [
  { id: 'staff-1', user_id: 'demo-user-001', name: '管理员', email: 'admin@globaltrade.com', role: 'admin', phone: '+25884000001', is_active: true, last_login_at: new Date().toISOString(), created_at: new Date(Date.now() - 86400000 * 30).toISOString() },
  { id: 'staff-2', name: '运营小张', email: 'zhang@globaltrade.com', role: 'operator', phone: '+25884000002', is_active: true, last_login_at: new Date(Date.now() - 86400000 * 2).toISOString(), created_at: new Date(Date.now() - 86400000 * 20).toISOString() },
  { id: 'staff-3', name: '客服小李', email: 'li@globaltrade.com', role: 'support', phone: '+25884000003', is_active: true, last_login_at: new Date(Date.now() - 86400000).toISOString(), created_at: new Date(Date.now() - 86400000 * 10).toISOString() },
  { id: 'staff-4', name: '前员工小赵', email: 'zhao@globaltrade.com', role: 'operator', is_active: false, created_at: new Date(Date.now() - 86400000 * 60).toISOString() },
];

export interface StaffInput {
  name: string
  email: string
  role: string
  phone?: string
  user_id?: string
}

export interface StaffUpdate {
  name?: string
  role?: string
  phone?: string
  is_active?: boolean
  store_id?: string | null
  pos_enabled?: boolean
  pos_permissions?: string[]
  pos_pin?: string
}

export interface StaffUpdateRepository {
  findSecuritySnapshot(id: string): Promise<(StaffPosSnapshot & Record<string, unknown>) | null>
  update(id: string, values: Record<string, unknown>): Promise<Record<string, unknown>>
  revokeActiveSessions(staffId: string, revokedAt: Date): Promise<void>
}

function posPermissions(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

export async function applyStaffUpdate(
  id: string,
  input: StaffUpdate,
  repository: StaffUpdateRepository,
  now: Date = new Date(),
): Promise<PublicStaffRecord> {
  const current = await repository.findSecuritySnapshot(id);
  if (!current) throw new Error('Staff not found');

  const values: Record<string, unknown> = {};
  for (const field of ['name', 'role', 'phone'] as const) {
    if (input[field] !== undefined && input[field] !== current[field]) {
      values[field] = input[field];
    }
  }

  const security = planStaffPosUpdate(current, input, hashPosPin);
  Object.assign(values, security.values);
  const updated = Object.keys(values).length > 0
    ? await repository.update(id, values)
    : current;

  if (security.revokeSessions) {
    await repository.revokeActiveSessions(id, now);
  }
  return toPublicStaff(updated);
}

type StaffDatabase = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

function databaseRepository(database: StaffDatabase): StaffUpdateRepository {
  return {
    async findSecuritySnapshot(id) {
      const [record] = await database.select().from(staff).where(eq(staff.id, id)).limit(1);
      if (!record) return null;
      return {
        ...(record as unknown as Record<string, unknown>),
        store_id: record.store_id,
        is_active: record.is_active,
        pos_enabled: record.pos_enabled,
        pos_permissions: posPermissions(record.pos_permissions),
      };
    },
    async update(id, values) {
      await database.update(staff).set(values).where(eq(staff.id, id));
      const [record] = await database.select().from(staff).where(eq(staff.id, id)).limit(1);
      if (!record) throw new Error('Staff not found');
      return record as unknown as Record<string, unknown>;
    },
    async revokeActiveSessions(staffId, revokedAt) {
      await database.update(posOperatorSessions).set({ revoked_at: revokedAt }).where(and(
        eq(posOperatorSessions.staff_id, staffId),
        isNull(posOperatorSessions.revoked_at),
      ));
    },
  };
}

export async function listStaff() {
  try {
    if (IS_DEMO_MODE) return { data: MOCK_STAFF.map((item) => toPublicStaff(item as unknown as Record<string, unknown>)), error: null };
    const data = await db.select().from(staff).orderBy(desc(staff.created_at));
    return { data: (data || []).map((item) => toPublicStaff(item as unknown as Record<string, unknown>)), error: null };
  } catch (error) {
    if (IS_DEMO_MODE) return { data: MOCK_STAFF.map((item) => toPublicStaff(item as unknown as Record<string, unknown>)), error: null };
    return { data: [], error };
  }
}

export async function getStaffById(id: string) {
  try {
    if (IS_DEMO_MODE) {
      const item = MOCK_STAFF.find((s) => s.id === id);
      return item ? toPublicStaff(item as unknown as Record<string, unknown>) : null;
    }
    const [data] = await db.select().from(staff).where(eq(staff.id, id)).limit(1);
    return data ? toPublicStaff(data as unknown as Record<string, unknown>) : null;
  } catch (error) {
    throw error;
  }
}

export async function createStaff(input: StaffInput) {
  try {
    if (IS_DEMO_MODE) {
      const newStaff: StaffRecord = { id: `staff-${Date.now()}`, ...input, is_active: true, created_at: new Date().toISOString() };
      MOCK_STAFF.unshift(newStaff);
      return toPublicStaff(newStaff as unknown as Record<string, unknown>);
    }
    const [existing] = await db.select({ id: staff.id }).from(staff)
      .where(eq(staff.email, input.email)).limit(1);
    if (existing) throw new Error('该邮箱已被注册为员工');

    const id = randomUUID();
    // 查找是否已有同名邮箱的 users 记录
    let userId: string | null = null
    try {
      const [userRows] = await db.$client.execute(
        'SELECT id FROM users WHERE email = ? LIMIT 1',
        [input.email]
      )
      const users = userRows as { id: string }[]
      if (users.length > 0) userId = users[0].id
    } catch { /* users table may not exist */ }

    await db.insert(staff).values({
      id,
      name: input.name,
      email: input.email,
      role: input.role || 'support',
      phone: input.phone || null,
      user_id: userId,
    });
    const [data] = await db.select().from(staff).where(eq(staff.id, id)).limit(1);
    return data ? toPublicStaff(data as unknown as Record<string, unknown>) : null;
  } catch (error) {
    throw error;
  }
}

export async function updateStaff(id: string, input: StaffUpdate) {
  try {
    if (IS_DEMO_MODE) {
      const repository: StaffUpdateRepository = {
        async findSecuritySnapshot(staffId) {
          const item = MOCK_STAFF.find((entry) => entry.id === staffId);
          if (!item) return null;
          const record = item as unknown as Record<string, unknown>;
          return {
            ...record,
            store_id: typeof record.store_id === 'string' ? record.store_id : null,
            is_active: record.is_active !== false,
            pos_enabled: record.pos_enabled === true,
            pos_permissions: posPermissions(record.pos_permissions),
          };
        },
        async update(staffId, values) {
          const item = MOCK_STAFF.find((entry) => entry.id === staffId);
          if (!item) throw new Error('Staff not found');
          Object.assign(item, values);
          return item as unknown as Record<string, unknown>;
        },
        async revokeActiveSessions() {},
      };
      return applyStaffUpdate(id, input, repository);
    }
    return await db.transaction(async (tx) => applyStaffUpdate(id, input, databaseRepository(tx)));
  } catch (error) {
    throw error;
  }
}

export async function deleteStaff(id: string) {
  try {
    if (IS_DEMO_MODE) {
      const idx = MOCK_STAFF.findIndex((s) => s.id === id);
      if (idx !== -1) MOCK_STAFF.splice(idx, 1);
      return;
    }
    await db.delete(staff).where(eq(staff.id, id));
  } catch (error) {
    throw error;
  }
}
