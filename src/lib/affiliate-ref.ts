/**
 * Referral code from a ?ref= link, kept in the browser for the attribution
 * window. The last link clicked wins. The server still checks that the
 * affiliate is active and not the buyer, and the commission window when paid.
 */
const KEY = "tw.affiliate_ref";
const DAY_MS = 24 * 60 * 60 * 1000;

export function captureAffiliateRef(search: string, now = Date.now()): void {
  try {
    const code = new URLSearchParams(search).get("ref")?.trim();
    if (!code || !/^[A-Za-z0-9_-]{1,50}$/.test(code)) return;
    localStorage.setItem(KEY, JSON.stringify({ code, at: now }));
  } catch {
    /* storage unavailable */
  }
}

export function readAffiliateRef(attributionDays: number, now = Date.now()): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as { code?: unknown; at?: unknown };
    if (typeof value.code !== "string" || typeof value.at !== "number") return null;
    if (now - value.at > attributionDays * DAY_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return value.code;
  } catch {
    return null;
  }
}
