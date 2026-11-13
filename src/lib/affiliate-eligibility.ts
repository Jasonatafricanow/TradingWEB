const ELIGIBILITY_REASONS = ["min_payout_not_reached", "affiliate_not_found", "eligibility_check_failed"] as const

/** Payout eligibility comes back as a reason code; anything unknown is shown as sent. */
export function eligibilityReason(t: (key: string) => string, reason?: string) {
  if (!reason) return ""
  return (ELIGIBILITY_REASONS as readonly string[]).includes(reason) ? t(`affiliate.reason.${reason}`) : reason
}
