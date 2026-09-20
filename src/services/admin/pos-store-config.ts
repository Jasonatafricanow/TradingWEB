export function parsePosTaxRateBps(value: unknown): number {
  if (typeof value !== "string" && typeof value !== "number") return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  const bps = Math.round(parsed <= 1 ? parsed * 10_000 : parsed * 100);
  return Math.min(bps, 10_000);
}
