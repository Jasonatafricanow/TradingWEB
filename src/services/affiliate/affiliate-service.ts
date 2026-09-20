import { db } from '@/lib/db';
import { eq, lt } from 'drizzle-orm';
import { orders } from '@/storage/database/shared/schema';
import { randomUUID } from 'node:crypto';

export function generateAffiliateCode(name: string): string {
  const clean = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6);
  const suffix = Math.random().toString(36).substring(2, 4).toUpperCase();
  return clean + suffix;
}

/** 后台手动创建推广者 */
export async function adminCreateAffiliate(input: {
  email: string
  nickname: string
  rate?: number
  status?: 'active' | 'pending'
}) {
  const code = generateAffiliateCode(input.nickname);
  const id = randomUUID();
  const userId = `manual-${randomUUID().slice(0, 8)}`;
  const rate = (input.rate || 5).toFixed(2);
  const status = input.status || 'active';
  try {
    await db.$client.execute(
      'INSERT INTO affiliates (id, user_id, email, code, nickname, rate, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, userId, input.email, code, input.nickname, rate, status]
    );
  } catch (error) {
    const err = error as { message?: string };
    if (err?.message?.includes('duplicate')) throw new Error('推广码或邮箱已存在');
    throw error;
  }
  const [rows] = await db.$client.execute('SELECT * FROM affiliates WHERE id = ?', [id]);
  return (rows as Record<string, any>[])[0];
}

export async function applyAffiliate(userId: string, nickname: string) {
  try {
    const [existingRows] = await db.$client.execute('SELECT * FROM affiliates WHERE user_id = ? LIMIT 1', [userId]);
    const existing = (existingRows as Record<string, any>[])[0];
    if (existing) return existing;

    const code = generateAffiliateCode(nickname);
    const id = randomUUID();
    await db.$client.execute(
      'INSERT INTO affiliates (id, user_id, code, nickname, status) VALUES (?, ?, ?, ?, ?)',
      [id, userId, code, nickname, 'pending']
    );
    const [rows] = await db.$client.execute('SELECT * FROM affiliates WHERE id = ?', [id]);
    return (rows as Record<string, any>[])[0];
  } catch (error) {
    const err = error as { message?: string };
    if (err?.message?.includes('duplicate')) throw new Error('推广码生成冲突，请重试');
    throw error;
  }
}

export async function getMyAffiliate(userId: string): Promise<Record<string, any> | null> {
  const [rows] = await db.$client.execute('SELECT * FROM affiliates WHERE user_id = ? LIMIT 1', [userId]);
  return (rows as Record<string, any>[])[0] || null;
}

export async function getAffiliateDashboard(affiliateId: string): Promise<Record<string, any>> {
  const [[affRows], [refRows], [earnRows]] = await Promise.all([
    db.$client.execute('SELECT * FROM affiliates WHERE id = ?', [affiliateId]),
    db.$client.execute('SELECT * FROM referrals WHERE affiliate_id = ?', [affiliateId]),
    db.$client.execute('SELECT commission FROM referrals WHERE affiliate_id = ? AND status = ?', [affiliateId, 'approved']),
  ]);
  const affiliate = (affRows as Record<string, any>[])[0];
  const referrals = refRows as Record<string, any>[];
  const earnings = earnRows as Record<string, any>[];
  return {
    affiliate,
    totalReferrals: referrals.length || 0,
    pendingCommission: referrals.filter((r) => r.status === 'pending').reduce((s: number, r) => s + parseFloat((r.commission as string) || '0'), 0),
    approvedCommission: earnings.reduce((s: number, r) => s + parseFloat((r.commission as string) || '0'), 0),
  };
}

export async function requestPayout(affiliateId: string, amount: number): Promise<Record<string, any> | void> {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('提现金额无效');
  const payoutAmount = Math.round(amount * 100) / 100;
  const connection = await db.$client.getConnection();
  const id = randomUUID();
  const payoutOrderId = 'PAYOUT_' + Date.now();

  try {
    await connection.beginTransaction();
    const [affRows] = await connection.execute(
      'SELECT id, balance, status FROM affiliates WHERE id = ? FOR UPDATE',
      [affiliateId]
    );
    const affiliate = (affRows as Record<string, any>[])[0];
    if (!affiliate) throw new Error('推广者不存在');
    if (affiliate.status !== 'active') throw new Error('推广账号未激活');

    const balance = parseFloat(String(affiliate.balance || '0'));
    if (balance < payoutAmount) throw new Error('余额不足');

    await connection.execute(
      'UPDATE affiliates SET balance = ? WHERE id = ?',
      [(balance - payoutAmount).toFixed(2), affiliateId]
    );
    await connection.execute(
      'INSERT INTO referrals (id, affiliate_id, order_id, commission, rate, status) VALUES (?, ?, ?, ?, ?, ?)',
      [id, affiliateId, payoutOrderId, payoutAmount.toFixed(2), 0, 'pending']
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const [rows] = await db.$client.execute('SELECT * FROM referrals WHERE id = ?', [id]);
  return (rows as Record<string, any>[])[0];
}

export async function listAffiliates() {
  try {
    const [rows] = await db.$client.execute('SELECT a.*, u.email FROM affiliates a LEFT JOIN users u ON a.user_id = u.id ORDER BY a.created_at DESC');
    return { data: rows || [], error: null };
  } catch (error) {
    return { data: [], error };
  }
}

export async function reviewAffiliate(id: string, status: 'active' | 'suspended', adminId: string) {
  await db.$client.execute(
    'UPDATE affiliates SET status = ?, approved_by = ?, approved_at = ? WHERE id = ?',
    [status, adminId, status === 'active' ? new Date().toISOString() : null, id]
  );
  const [rows] = await db.$client.execute('SELECT * FROM affiliates WHERE id = ?', [id]);
  return (rows as Record<string, any>[])[0];
}

export async function listPayouts() {
  try {
    const [rows] = await db.$client.execute(
      'SELECT r.*, a.nickname, a.code FROM referrals r LEFT JOIN affiliates a ON r.affiliate_id = a.id WHERE r.status = ? AND r.order_id LIKE ? ESCAPE ? ORDER BY r.created_at DESC',
      ['pending', 'PAYOUT\\_%', '\\']
    );
    return { data: rows || [], error: null };
  } catch (error) {
    return { data: [], error };
  }
}

export async function approvePayout(id: string) {
  const [result] = await db.$client.execute(
    'UPDATE referrals SET status = ?, paid_at = ? WHERE id = ? AND status = ? AND order_id LIKE ? ESCAPE ?',
    ['paid', new Date().toISOString(), id, 'pending', 'PAYOUT\\_%', '\\']
  );
  if ((result as { affectedRows?: number }).affectedRows !== 1) {
    throw new Error('提现申请不存在或已处理');
  }
  const [rows] = await db.$client.execute('SELECT * FROM referrals WHERE id = ?', [id]);
  return (rows as Record<string, any>[])[0];
}

export async function rejectPayout(id: string) {
  const connection = await db.$client.getConnection();
  try {
    await connection.beginTransaction();
    const [refRows] = await connection.execute(
      'SELECT affiliate_id, commission FROM referrals WHERE id = ? AND status = ? AND order_id LIKE ? ESCAPE ? FOR UPDATE',
      [id, 'pending', 'PAYOUT\\_%', '\\']
    );
    const ref = (refRows as { affiliate_id: string; commission: string }[])[0];
    if (!ref) throw new Error('提现申请不存在或已处理');

    const [affRows] = await connection.execute('SELECT balance FROM affiliates WHERE id = ? FOR UPDATE', [ref.affiliate_id]);
    const affiliate = (affRows as { balance: string }[])[0];
    if (affiliate) {
      await connection.execute(
        'UPDATE affiliates SET balance = ? WHERE id = ?',
        [(parseFloat(affiliate.balance || '0') + parseFloat(ref.commission || '0')).toFixed(2), ref.affiliate_id]
      );
    }
    await connection.execute('UPDATE referrals SET status = ? WHERE id = ?', ['cancelled', id]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const [rows] = await db.$client.execute('SELECT * FROM referrals WHERE id = ?', [id]);
  return (rows as Record<string, any>[])[0];
}

export async function calculateCommission(orderId: string, affiliateCode: string) {
  const [orderRows] = await db.$client.execute('SELECT total_amount, affiliate_code FROM orders WHERE id = ?', [orderId]);
  const order = (orderRows as { total_amount: string; affiliate_code: string }[])[0];
  if (!order || order.affiliate_code !== affiliateCode) return;
  const [affRows] = await db.$client.execute('SELECT * FROM affiliates WHERE code = ?', [affiliateCode]);
  const affiliate = (affRows as Record<string, any>[])[0];
  if (!affiliate || affiliate.status !== 'active') return;
  const rate = parseFloat(affiliate.rate);
  const commission = parseFloat(order.total_amount) * (rate / 100);
  const refId = randomUUID();
  await db.$client.execute(
    'INSERT INTO referrals (id, affiliate_id, order_id, commission, rate, status) VALUES (?, ?, ?, ?, ?, ?)',
    [refId, affiliate.id, orderId, commission.toFixed(2), rate.toFixed(2), 'pending']
  );
  await db.$client.execute(
    'UPDATE affiliates SET balance = ?, total_earned = ? WHERE id = ?',
    [(parseFloat(affiliate.balance) + commission).toFixed(2), (parseFloat(affiliate.total_earned) + commission).toFixed(2), affiliate.id]
  );
}

export async function releasePendingCommissions() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const [result] = await db.$client.execute(
    'UPDATE referrals SET status = ? WHERE status = ? AND created_at < ?',
    ['approved', 'pending', thirtyDaysAgo]
  );
  return { released: ((result as { affectedRows?: number })?.affectedRows) || 0 };
}
