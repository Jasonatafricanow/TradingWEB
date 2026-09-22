/**
 * @deprecated Payment finalization is now handled atomically by
 * markOrderPaidIfNotAlready().
 *
 * Kept temporarily as a compatibility import for older callers. Critical
 * payment effects must not be executed after the paid transaction commits.
 */
export async function runOrderPaidSideEffects(
  _order?: unknown,
  _opts?: unknown,
): Promise<void> {
  return;
}
