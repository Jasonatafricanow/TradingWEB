// Keeps the checkout Idempotency-Key across reloads (TW-07).
//
// The key used to live in a React ref, so refreshing the page after a
// timed-out "Place order" produced a new key and a second order. The key is
// now kept in sessionStorage next to a hash of the order body: the same body
// in the same tab reuses the key (the server replays the first order), a
// changed body gets a new one. Only a hash is stored, never names,
// addresses or phone numbers. Cleared once the order reaches the result page.

const STORAGE_KEY = "tw.checkout.attempt";
const MAX_AGE_MS = 23 * 60 * 60 * 1000; // server keeps idempotency records for 24h

type Attempt = { hash: string; key: string; at: number };

function hashBody(body: string): string {
  // FNV-1a 32-bit twice with different seeds: identity check, not security.
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ body.length;
  for (let i = 0; i < body.length; i++) {
    const c = body.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x5bd1e995);
  }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}

function read(storage: Storage | null): Attempt | null {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Attempt;
    return typeof parsed?.key === "string" && typeof parsed?.hash === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function sessionStore(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function checkoutIdempotencyKey(
  body: string,
  options: { storage?: Storage | null; now?: number; newKey?: () => string } = {},
): string {
  const storage = options.storage === undefined ? sessionStore() : options.storage;
  const now = options.now ?? Date.now();
  const hash = hashBody(body);
  const existing = read(storage);
  if (existing && existing.hash === hash && now - existing.at < MAX_AGE_MS) return existing.key;
  const key = (options.newKey ?? (() => crypto.randomUUID()))();
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify({ hash, key, at: now } satisfies Attempt));
  } catch {
    // Private mode / quota: fall back to a per-call key (old behaviour).
  }
  return key;
}

export function clearCheckoutAttempt(storage: Storage | null = sessionStore()) {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
