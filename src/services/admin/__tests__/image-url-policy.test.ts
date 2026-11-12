import { describe, expect, it } from "vitest";
import { isAllowedImageUrl } from "@/lib/image-url";
describe("image receiver URL policy", () => {
  it.each(["http://cdn.shopify.com/a.png", "https://cdn.shopify.com.evil.test/a.png", "https://127.0.0.1/a.png", "https://cdn.shopify.com@evil.test/a.png", "https://cdn.shopify.com:8443/a.png", "file:///tmp/a.png"])("rejects %s", value => expect(isAllowedImageUrl(value)).toBe(false));
  it("allows exact HTTPS hosts and explicitly enabled local uploads", () => {
    expect(isAllowedImageUrl("https://cdn.shopify.com/a.png")).toBe(true);
    expect(isAllowedImageUrl("/uploads/a.png")).toBe(false);
    expect(isAllowedImageUrl("/uploads/a.png", true)).toBe(true);
    expect(isAllowedImageUrl("/uploads/../private", true)).toBe(false);
  });
});
