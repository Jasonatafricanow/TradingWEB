// src/lib/rate-limit.ts - In-memory rate limiter for Next.js API routes

type StoreEntry = { count: number; resetAt: number };
const store = new Map<string, StoreEntry>();

// Clean expired entries every 5 min
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of store)
    if (v.resetAt < now) store.delete(k);
}, 300_000);
cleanupTimer.unref?.();

export interface RateLimitConfig {
  windowMs: number;
  max: number;
  message?: string;
}

const defaults: RateLimitConfig = { windowMs: 60_000, max: 60 };

export function checkRateLimit(
  identifier: string,
  config?: Partial<RateLimitConfig>,
) {
  const cfg = { ...defaults, ...config };
  const now = Date.now();
  const entry = store.get(identifier);

  if (!entry || entry.resetAt < now) {
    store.set(identifier, { count: 1, resetAt: now + cfg.windowMs });
    return { allowed: true, remaining: cfg.max - 1, resetAt: now + cfg.windowMs };
  }

  entry.count++;
  if (entry.count > cfg.max) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }
  return { allowed: true, remaining: cfg.max - entry.count, resetAt: entry.resetAt };
}

export function shouldTrustProxyHeaders(): boolean {
  return process.env.TRUST_PROXY_HEADERS === "true";
}

export function getClientIp(req: Request): string {
  if (!shouldTrustProxyHeaders()) return "unknown";

  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

export const RATE_LIMITS = {
  auth: { windowMs: 60_000, max: 10, message: "Too many auth attempts" },
  payment: { windowMs: 60_000, max: 20, message: "Too many payment requests" },
  api: { windowMs: 60_000, max: 60 },
  webhook: { windowMs: 60_000, max: 120 },
} as const;
