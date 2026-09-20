/** 提现资格 */
export interface WithdrawEligibility {
  eligible: boolean
  reason?: string
  maxWithdrawable: number
  achieved: number
  required: number
}

/** 退出结算 */
export interface ExitSettlement {
  eligible: boolean
  reason?: string
  finalPayout: number
  originalLocked: number
  settlementNote: string
}

/** 仪表盘额外数据 */
export interface DashboardExtra {
  pushedOrders: number
  targetOrders: number
  lockDate: string | null
  canWithdraw: boolean
  daysLeft: number
  canExit: boolean
}

/**
 * 佣金策略接口
 * 可替换实现以支持不同的分佣规则（如 ToB 阶梯佣金）
 */
export interface CommissionStrategy {
  readonly name: string
  readonly version: string

  calculateCommission(order: { total_amount: number; buyer_id: string }, affiliate: { id: string; user_id: string; rate: number }): Promise<number>
  checkWithdrawEligibility(affiliateId: string): Promise<WithdrawEligibility>
  processPayout(affiliateId: string, amount: number): Promise<{ approved: boolean; reason?: string; finalAmount: number }>
  processExitSettlement(affiliateId: string): Promise<ExitSettlement>
  getDashboardExtra(affiliateId: string): Promise<DashboardExtra>
}
