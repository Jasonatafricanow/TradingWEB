import { describe, expect, it } from "vitest";

import { checkoutIdempotencyKey, clearCheckoutAttempt } from "@/lib/checkout-attempt";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => { map.delete(key); },
    setItem: (key, value) => { map.set(key, value); },
  };
}

let counter = 0;
const newKey = () => `key-${++counter}`;
const body = JSON.stringify({ buyerName: "Ana", buyerPhone: "+351 900", items: [{ product_id: "p1", quantity: 1 }] });

describe("checkout idempotency key", () => {
  it("reuses the key for the same order body after a reload", () => {
    const storage = memoryStorage();
    const first = checkoutIdempotencyKey(body, { storage, newKey, now: 1000 });
    // a reload re-reads the same sessionStorage
    expect(checkoutIdempotencyKey(body, { storage, newKey, now: 5000 })).toBe(first);
  });

  it("issues a new key when the order body changes or the record expired", () => {
    const storage = memoryStorage();
    const first = checkoutIdempotencyKey(body, { storage, newKey, now: 0 });
    const changed = checkoutIdempotencyKey(body.replace('"quantity":1', '"quantity":2'), { storage, newKey, now: 1 });
    expect(changed).not.toBe(first);
    const expired = checkoutIdempotencyKey(body.replace('"quantity":1', '"quantity":2'), { storage, newKey, now: 24 * 3600 * 1000 });
    expect(expired).not.toBe(changed);
  });

  it("stores only a hash, never the buyer's details", () => {
    const storage = memoryStorage();
    checkoutIdempotencyKey(body, { storage, newKey, now: 0 });
    const stored = storage.getItem("tw.checkout.attempt") ?? "";
    expect(stored).not.toContain("Ana");
    expect(stored).not.toContain("900");
  });

  it("starts fresh after the order reached the result page", () => {
    const storage = memoryStorage();
    const first = checkoutIdempotencyKey(body, { storage, newKey, now: 0 });
    clearCheckoutAttempt(storage);
    expect(checkoutIdempotencyKey(body, { storage, newKey, now: 1 })).not.toBe(first);
  });

  it("still works when storage is unavailable", () => {
    expect(checkoutIdempotencyKey(body, { storage: null, newKey })).toMatch(/^key-/);
  });
});
