import { describe, expect, it } from "vitest";

import {
  hashOpaqueToken,
  hashPosPin,
  issueOpaqueToken,
  verifyPosPin,
} from "../pos-operator-crypto";

describe("POS opaque tokens", () => {
  it("issues distinct tokens and stores deterministic SHA-256 hashes", () => {
    const first = issueOpaqueToken();
    const second = issueOpaqueToken();
    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(40);
    expect(hashOpaqueToken(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashOpaqueToken(first)).toBe(hashOpaqueToken(first));
  });
});

describe("POS PIN hashing", () => {
  it("uses a different salt for the same PIN", () => {
    const first = hashPosPin("1234");
    const second = hashPosPin("1234");
    expect(first).not.toBe(second);
    expect(first).toMatch(/^pbkdf2_sha256\$210000\$/);
    expect(verifyPosPin("1234", first)).toBe(true);
    expect(verifyPosPin("9999", first)).toBe(false);
  });

  it("fails closed for malformed hashes and invalid PIN shapes", () => {
    expect(verifyPosPin("1234", "broken")).toBe(false);
    expect(() => hashPosPin("12")).toThrow("PIN_FORMAT_INVALID");
    expect(() => hashPosPin("abcd")).toThrow("PIN_FORMAT_INVALID");
  });
});
