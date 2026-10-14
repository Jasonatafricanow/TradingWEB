import { createHash, timingSafeEqual } from "node:crypto"

function sameSecret(left: string, right: string): boolean {
  const leftDigest = createHash("sha256").update(left, "utf8").digest()
  const rightDigest = createHash("sha256").update(right, "utf8").digest()
  return timingSafeEqual(leftDigest, rightDigest)
}

/**
 * Shared CRON_SECRET check. Prefer the `x-cron-secret` or `Authorization:
 * Bearer` header; `?key=` is still accepted for existing schedulers but ends
 * up in access logs, so new jobs should not use it.
 */
export function isAuthorizedCronRequest(request: Request): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  const authorization = request.headers.get("authorization")
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null
  const provided =
    request.headers.get("x-cron-secret") ||
    bearer ||
    new URL(request.url).searchParams.get("key")
  return Boolean(provided && sameSecret(provided, expected))
}
