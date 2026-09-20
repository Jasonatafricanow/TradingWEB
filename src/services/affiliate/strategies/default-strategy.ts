import { db } from '@/lib/db';
import { eq, gte } from 'drizzle-orm';
import { orders } from '@/storage/database/shared/schema';

export const defaultStrategy = {
  name: 'default',
  version: '1.0.0',

  async calculateCommission(order: { id: string; total_amount: number; buyer_id: string }, affiliate: { rate?: string; max_commission?: string }): Promise<number> {
    const rate = parseFloat(affiliate.rate || '0') / 100;
    let commission = parseFloat(String(order.total_amount) || '0') * rate;
    if (affiliate.max_commission) {
      commission = Math.min(commission, parseFloat(affiliate.max_commission));
    }
    return Math.round(commission * 100) / 100;
  },

  async checkWithdrawEligibility(affiliateId: string): Promise<{ eligible: boolean; reason?: string }> {
    try {
      const [affRows] = await db.$client.execute('SELECT balance, min_payout FROM affiliates WHERE id = ?', [affiliateId]);
      const affiliate = (affRows as Record<string, any>[])[0];
      if (!affiliate) return { eligible: false, reason: 'Affiliate not found' };
      if (parseFloat(affiliate.balance || '0') < parseFloat(affiliate.min_payout || '10')) {
        return { eligible: false, reason: 'Minimum payout not reached' };
      }
      return { eligible: true };
    } catch (error) {
      return { eligible: false, reason: 'Error checking eligibility' };
    }
  },

  async processPayout(affiliateId: string, amount: number): Promise<{ approved: boolean; finalAmount: number; reason?: string }> {
    const eligibility = await this.checkWithdrawEligibility(affiliateId);
    if (!eligibility.eligible) return { approved: false, finalAmount: 0, reason: eligibility.reason };
    const [affRows] = await db.$client.execute('SELECT balance FROM affiliates WHERE id = ?', [affiliateId]);
    const affiliate = (affRows as Record<string, any>[])[0];
    const balance = parseFloat(affiliate.balance || '0');
    const finalAmount = Math.min(amount, balance);
    return { approved: true, finalAmount };
  },

  async processExitSettlement(affiliateId: string): Promise<{ eligible: boolean; finalPayout: number; reason?: string }> {
    try {
      const [affRows] = await db.$client.execute('SELECT balance FROM affiliates WHERE id = ?', [affiliateId]);
      const affiliate = (affRows as Record<string, any>[])[0];
      if (!affiliate) return { eligible: false, finalPayout: 0, reason: 'Affiliate not found' };
      const balance = parseFloat(affiliate.balance || '0');
      if (balance <= 0) return { eligible: true, finalPayout: 0 };
      return { eligible: true, finalPayout: balance };
    } catch (error) {
      return { eligible: false, finalPayout: 0, reason: 'Error processing exit' };
    }
  },

  getDashboardExtra(affiliateId: string): Record<string, any> {
    return {};
  },
};
