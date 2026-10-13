import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/contexts/auth-context", () => ({ getStoredToken: () => "session-token" }))

import { openAuthenticatedHtml } from "@/lib/client-api"

describe("openAuthenticatedHtml (order invoice)", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock)
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    fetchMock.mockReset()
  })

  it("sends the session token and shows the invoice in the opened tab", async () => {
    fetchMock.mockResolvedValue(new Response("<html>INVOICE</html>", { status: 200 }))
    const target = { location: { href: "" }, close: vi.fn() }

    await openAuthenticatedHtml("/api/orders/o-1/invoice", target)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/orders/o-1/invoice")
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer session-token")
    expect(target.location.href).toMatch(/^blob:/)
    const { resolveObjectURL } = await import("node:buffer")
    await expect(resolveObjectURL(target.location.href)!.text()).resolves.toBe("<html>INVOICE</html>")
    expect(target.close).not.toHaveBeenCalled()
  })

  it("closes the blank tab and reports failure when the route refuses", async () => {
    fetchMock.mockResolvedValue(new Response("Unauthorized", { status: 401 }))
    const target = { location: { href: "" }, close: vi.fn() }

    await expect(openAuthenticatedHtml("/api/orders/o-1/invoice", target)).rejects.toThrow("HTTP 401")
    expect(target.close).toHaveBeenCalled()
    expect(target.location.href).toBe("")
  })
})
