import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const { execute, sendEmail } = vi.hoisted(() => ({ execute: vi.fn(), sendEmail: vi.fn() }))
vi.mock("@/lib/db", () => ({ db: { $client: { execute } } }))
vi.mock("@/services/notifications/email-service", () => ({ sendPasswordResetEmail: sendEmail }))
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true }), getClientIp: () => "127.0.0.1" }))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubEnv("NODE_ENV", "production")
  vi.stubEnv("DB_HOST", "test-db")
  vi.stubEnv("JWT_SECRET", "test-password-reset-secret-0123456789abcdef")
  execute.mockResolvedValue([[{ id: "u1", email: "buyer@example.com", password_hash: null }]])
  sendEmail.mockResolvedValue({ delivered: true })
})
afterEach(() => vi.unstubAllEnvs())
async function reset() {
  const { POST } = await import("../forgot-password/route")
  return POST(new NextRequest("https://untrusted.example/api/auth/forgot-password", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "buyer@example.com" }),
  }))
}

describe("password reset destination configuration", () => {
  it.each(["", "   ", "not-a-url", "javascript:alert(1)", "https://user:secret@example.com", "https://example.com/?redirect=other", "https://example.com/#fragment"])("fails closed before looking up an account: %s", async (url) => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", url)
    const response = await reset()
    expect(response.status).toBe(503)
    expect(execute).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })
  it("uses the configured site and removes a trailing slash", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://staging.example.com/")
    expect((await reset()).status).toBe(200)
    expect(sendEmail).toHaveBeenCalledWith("buyer@example.com", expect.stringMatching(/^https:\/\/staging\.example\.com\/auth\/reset-password\?token=/))
  })
  it("does not disclose account existence with a valid configuration", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://staging.example.com")
    const known = await (await reset()).json()
    execute.mockResolvedValue([[]])
    const unknown = await (await reset()).json()
    expect(unknown).toEqual(known)
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })
  it("keeps the relative demo link when no site is configured", async () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("DB_HOST", "")
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "")
    const response = await reset()
    expect(response.status).toBe(200)
    expect((await response.json()).data.reset_url).toMatch(/^\/auth\/reset-password\?token=/)
    expect(execute).not.toHaveBeenCalled()
  })
})
