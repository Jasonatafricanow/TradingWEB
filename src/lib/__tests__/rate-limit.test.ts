import { afterEach, describe, it } from "node:test"
import assert from "node:assert/strict"
import { getClientIp } from "../rate-limit"

const originalTrustProxyHeaders = process.env.TRUST_PROXY_HEADERS

function restoreEnv() {
  if (originalTrustProxyHeaders === undefined) {
    delete process.env.TRUST_PROXY_HEADERS
  } else {
    process.env.TRUST_PROXY_HEADERS = originalTrustProxyHeaders
  }
}

describe("getClientIp", () => {
  afterEach(restoreEnv)

  it("does not trust spoofable proxy headers by default", () => {
    delete process.env.TRUST_PROXY_HEADERS

    const request = new Request("http://localhost/api/test", {
      headers: {
        "x-forwarded-for": "203.0.113.10, 198.51.100.20",
        "x-real-ip": "198.51.100.30",
      },
    })

    assert.strictEqual(getClientIp(request), "unknown")
  })

  it("uses proxy headers only when explicitly enabled", () => {
    process.env.TRUST_PROXY_HEADERS = "true"

    const request = new Request("http://localhost/api/test", {
      headers: {
        "x-forwarded-for": "203.0.113.10, 198.51.100.20",
        "x-real-ip": "198.51.100.30",
      },
    })

    assert.strictEqual(getClientIp(request), "203.0.113.10")
  })
})
