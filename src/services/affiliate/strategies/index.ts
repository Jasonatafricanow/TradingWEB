import type { CommissionStrategy } from "@/services/affiliate/strategies/types"
import { defaultStrategy } from "@/services/affiliate/strategies/default-strategy"

const strategies = new Map<string, CommissionStrategy>()

export function registerStrategy(name: string, strategy: CommissionStrategy) {
  strategies.set(name, strategy)
}

export function getActiveStrategy(): CommissionStrategy {
  const name = process.env.AFFILIATE_STRATEGY || "default"
  return strategies.get(name) || strategies.get("default")!
}

registerStrategy("default", defaultStrategy as unknown as CommissionStrategy)
