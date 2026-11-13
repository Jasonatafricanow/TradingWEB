import { db } from '@/lib/db';
import { getActiveStrategy } from '@/services/affiliate/strategies';
import { randomUUID } from 'node:crypto';

export const commissionService = {
  checkEligibility(affiliateId: string) {
    return getActiveStrategy().checkWithdrawEligibility(affiliateId);
  },
  async requestPayout(affiliateId: string, amount: number) {
    try {
      const strategy = getActiveStrategy();
      const result = await strategy.processPayout(affiliateId, amount);
      if (!result.approved) return result;
      const [affRows] = await db.$client.execute('SELECT balance FROM affiliates WHERE id = ?', [affiliateId]);
      const affiliate = (affRows as Record<string, any>[])[0];
      await db.$client.execute(
        'UPDATE affiliates SET balance = ? WHERE id = ?',
        [(parseFloat(affiliate.balance) - result.finalAmount).toFixed(2), affiliateId]
      );
      const refId = randomUUID();
      await db.$client.execute(
        "INSERT INTO referrals (id, affiliate_id, order_id, commission, rate, status, kind) VALUES (?, ?, ?, ?, ?, ?, 'payout')",
        [refId, affiliateId, 'PAYOUT_' + Date.now(), result.finalAmount, 0, 'pending']
      );
      return result;
    } catch (error) {
      throw error;
    }
  },
  async processExit(affiliateId: string) {
    try {
      const strategy = getActiveStrategy();
      const settlement = await strategy.processExitSettlement(affiliateId);
      if (!settlement.eligible) return settlement;
      if (settlement.finalPayout > 0) {
        const refId = randomUUID();
        await db.$client.execute(
          "INSERT INTO referrals (id, affiliate_id, order_id, commission, rate, status, paid_at, kind) VALUES (?, ?, ?, ?, ?, ?, ?, 'payout')",
          [refId, affiliateId, 'EXIT_' + Date.now(), settlement.finalPayout.toFixed(2), 0, 'paid', new Date().toISOString()]
        );
      }
      await db.$client.execute(
        'UPDATE affiliates SET status = ?, balance = ?, exit_settlement = ?, exit_settled_at = ?, deactivated_at = ? WHERE id = ?',
        ['deactivated', '0.00', settlement.finalPayout.toFixed(2), new Date().toISOString(), new Date().toISOString(), affiliateId]
      );
      return settlement;
    } catch (error) {
      throw error;
    }
  },
  getExtra(affiliateId: string) {
    return getActiveStrategy().getDashboardExtra(affiliateId);
  },
};
