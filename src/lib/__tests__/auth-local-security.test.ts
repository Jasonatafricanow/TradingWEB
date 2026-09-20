import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
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
