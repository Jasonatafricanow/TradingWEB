import { createHmac } from "node:crypto"
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  hashPassword, hashPasswordAsync, verifyPassword, verifyPasswordAsync,
  verifyToken,
  DEFAULT_JWT_SECRET,
  resolveJwtSecret,
  safeTimingEqualString,
} from "../auth-local"

describe("auth-local security helpers", () => {
  it("rejects missing or default JWT secrets in production", () => {
    assert.throws(
      () => resolveJwtSecret({ NODE_ENV: "production" }),
      /JWT_SECRET must be configured/,
    )
    assert.throws(
      () => resolveJwtSecret({ NODE_ENV: "production", JWT_SECRET: DEFAULT_JWT_SECRET }),
      /JWT_SECRET must be configured/,
    )
  })

  it("keeps the default JWT secret available only outside production", () => {
    assert.strictEqual(resolveJwtSecret({ NODE_ENV: "development" }), DEFAULT_JWT_SECRET)
  })

  it("compares strings without throwing on unequal lengths", () => {
    assert.strictEqual(safeTimingEqualString("abc", "abc"), true)
    assert.strictEqual(safeTimingEqualString("abc", "abd"), false)
    assert.strictEqual(safeTimingEqualString("abc", "abcd"), false)
  })
})

describe("signed JWT expiration", () => {
  function signed(exp: unknown) {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(JSON.stringify({ sub: "test", exp })).toString("base64url");
    return `${header}.${body}.${createHmac("sha256", resolveJwtSecret()).update(`${header}.${body}`).digest("base64url")}`;
  }
  it("rejects missing, nonnumeric, fractional and expired exp", () => {
    for (const exp of [undefined, null, "9999999999", 9999999999.5, 0, Math.floor(Date.now() / 1000)]) {
      assert.equal(verifyToken(signed(exp)), null);
    }
    assert.ok(verifyToken(signed(Math.floor(Date.now() / 1000) + 60)));
  });
});

it("rejects short production secrets", () => {
  assert.throws(() => resolveJwtSecret({ NODE_ENV: "production", JWT_SECRET: "abc" }));
});
it("asynchronous password derivation preserves existing hashes", async () => {
  assert.equal(await verifyPasswordAsync("password", hashPassword("password")), true);
  const hash = await hashPasswordAsync("password");
  assert.equal(verifyPassword("password", hash), true);
  assert.equal(await verifyPasswordAsync("wrong", hash), false);
});
