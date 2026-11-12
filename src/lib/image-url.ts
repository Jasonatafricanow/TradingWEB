/** Exact-host allowlist shared by all server-side image receivers. */
export function isAllowedImageUrl(value: unknown, allowLocal = false): boolean {
  if (typeof value !== "string") return false;
  if (allowLocal && /^\/(?:uploads|images)\//.test(value) && !value.includes("\\") && !value.includes("..")) return true;
  try {
    const url = new URL(value);
    const hosts = ["cdn.shopify.com", "images.unsplash.com", ...(process.env.IMAGE_ALLOWED_HOSTS || "").split(",")].map(host => host.trim().toLowerCase()).filter(Boolean);
    return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") && hosts.includes(url.hostname.toLowerCase());
  } catch { return false; }
}
