import { db } from '@/lib/db';
import { eq, asc } from 'drizzle-orm';
import { paymentMethods } from '@/storage/database/shared/schema';
import { randomUUID } from 'node:crypto';

const RESERVED_CODES = ['paypal', 'stripe', 'manual'];

export interface PaymentMethodInput {
  code: string;
  name: string;
  name_en?: string;
  type: 'online_gateway' | 'offline_manual';
  enabled?: boolean;
  sort_order?: number;
}

export function validatePaymentMethodCode(code: string): string | null {
  if (!/^[a-z][a-z0-9_]{1,30}$/.test(code)) {
    return 'Code must start with a letter, contain only lowercase/numbers/underscore, 2-31 chars';
  }
  if (RESERVED_CODES.includes(code)) {
    return `"${code}" is a reserved code`;
  }
  return null;
}

export async function listPaymentMethods(args?: { enabled?: boolean }) {
  try {
    const q = db.select().from(paymentMethods).orderBy(asc(paymentMethods.sort_order));
    if (args?.enabled !== undefined) {
      // Drizzle doesn't easily do dynamic where, use raw SQL for filter
      const [rows] = await db.$client.execute(
        args.enabled
          ? 'SELECT * FROM payment_methods WHERE enabled = TRUE ORDER BY sort_order ASC'
          : 'SELECT * FROM payment_methods ORDER BY sort_order ASC'
      );
      return { data: rows || [], error: null };
    }
    const data = await q;
    return { data: data || [], error: null };
  } catch (error) {
    return { data: [], error };
  }
}

export async function getPaymentMethod(id: string) {
  try {
    const [data] = await db.select().from(paymentMethods).where(eq(paymentMethods.id, id)).limit(1);
    return data || null;
  } catch {
    return null;
  }
}

export async function createPaymentMethod(input: PaymentMethodInput) {
  const id = randomUUID();
  await db.insert(paymentMethods).values({
    id,
    code: input.code,
    name: input.name,
    name_en: input.name_en || null,
    type: input.type,
    enabled: input.enabled ?? true,
    sort_order: input.sort_order ?? 0,
  } as any);
  const [data] = await db.select().from(paymentMethods).where(eq(paymentMethods.id, id)).limit(1);
  return data;
}

export async function updatePaymentMethod(id: string, input: Partial<PaymentMethodInput>) {
  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.name_en !== undefined) updates.name_en = input.name_en;
  if (input.type !== undefined) updates.type = input.type;
  if (input.enabled !== undefined) updates.enabled = input.enabled;
  if (input.sort_order !== undefined) updates.sort_order = input.sort_order;
  // code is immutable — never update

  if (Object.keys(updates).length === 0) return getPaymentMethod(id);

  await db.update(paymentMethods).set(updates as any).where(eq(paymentMethods.id, id));
  return getPaymentMethod(id);
}

export async function deletePaymentMethod(id: string) {
  // Soft delete: set enabled=false
  await db.update(paymentMethods).set({ enabled: false } as any).where(eq(paymentMethods.id, id));
}
