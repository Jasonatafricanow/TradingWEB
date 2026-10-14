import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ getPayload: vi.fn() }))

vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    async verifyIdToken() {
      return { getPayload: mocks.getPayload }
    }
  },
}))
vi.mock("@/lib/db", () => ({ db: {} }))

import { verifyGoogleToken } from "@/lib/oauth"

describe("verifyGoogleToken", () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "client-id"
    mocks.getPayload.mockReset()
  })

  it("rejects unverified emails so they cannot link to an existing account", async () => {
    mocks.getPayload.mockReturnValue({ email: "admin@example.com", email_verified: false, sub: "g-1" })
    await expect(verifyGoogleToken("token")).rejects.toThrow("not verified")

    mocks.getPayload.mockReturnValue({ email: "admin@example.com", sub: "g-1" })
    await expect(verifyGoogleToken("token")).rejects.toThrow("not verified")
  })

  it("returns a normalized email for verified accounts", async () => {
    mocks.getPayload.mockReturnValue({ email: "Buyer@Example.com", email_verified: true, sub: "g-2", name: "Buyer" })
    await expect(verifyGoogleToken("token")).resolves.toMatchObject({
      email: "buyer@example.com",
      googleId: "g-2",
    })
  })
})
