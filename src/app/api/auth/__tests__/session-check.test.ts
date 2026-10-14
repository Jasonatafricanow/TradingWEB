import { describe, expect, it } from "vitest"

import { isSessionRejected } from "@/lib/session-check"

describe("isSessionRejected (stored session check)", () => {
  it("ends the session only when the server rejects the token", () => {
    expect(isSessionRejected(401)).toBe(true)
    expect(isSessionRejected(403)).toBe(true)
  })

  it("keeps the session on transient server errors", () => {
    for (const status of [500, 502, 503, 504, 429]) {
      expect(isSessionRejected(status)).toBe(false)
    }
  })
})
