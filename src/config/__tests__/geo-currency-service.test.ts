import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  detectCurrencyFromHeaders,
  fetchCurrencyForIp,
  getClientIpFromHeaders,
  getCountryCodeFromHeaders,
  getCurrencyFromGeoPayload,
} from "../../services/geo-currency-service"

describe("geo currency helpers", () => {
  it("reads visitor country from CDN headers", () => {
    const headers = new Headers({
      "cf-ipcountry": "mz",
      "x-forwarded-for": "203.0.113.10",
    })

    assert.strictEqual(getCountryCodeFromHeaders(headers), "MZ")
  })

  it("normalizes geolocation API currency payloads", () => {
    assert.strictEqual(getCurrencyFromGeoPayload({ country: "MZ", currency: "MZN" }), "MZN")
    assert.strictEqual(getCurrencyFromGeoPayload({ country_code: "CN", currency: "CNY" }), "CNY")
    assert.strictEqual(getCurrencyFromGeoPayload({ country: "US", currency: "ABC" }), "USD")
    assert.strictEqual(getCurrencyFromGeoPayload({ country: "ZZ", currency: "ABC" }), "USD")
  })

  it("extracts the first public client IP from forwarding headers", () => {
    assert.strictEqual(getClientIpFromHeaders(new Headers({ "x-forwarded-for": "203.0.113.10, 10.0.0.1" })), "203.0.113.10")
    assert.strictEqual(getClientIpFromHeaders(new Headers({ "x-forwarded-for": "192.168.1.10" })), null)
    assert.strictEqual(getClientIpFromHeaders(new Headers({ "x-real-ip": "127.0.0.1" })), null)
  })

  it("detects currency from CDN country before using IP lookup", async () => {
    const detected = await detectCurrencyFromHeaders(new Headers({ "cf-ipcountry": "CN" }), async () => {
      throw new Error("fetch should not run")
    })

    assert.deepStrictEqual(detected, { currency: "CNY", countryCode: "CN", source: "cdn-country" })
  })

  it("uses IP geolocation as a fallback", async () => {
    const fetcher = async (url: string | URL | Request) => {
      assert.strictEqual(String(url), "https://geo.example/203.0.113.10/json/")
      return new Response(JSON.stringify({ country: "MZ", currency: "MZN" }), { status: 200 })
    }

    const currency = await fetchCurrencyForIp(
      "203.0.113.10",
      fetcher as typeof fetch,
      "https://geo.example/{ip}/json/",
    )

    assert.strictEqual(currency, "MZN")
  })

  it("falls back to USD when IP geolocation is unavailable", async () => {
    const fetcher = async () => {
      throw new Error("network unavailable")
    }

    const currency = await fetchCurrencyForIp(
      "203.0.113.10",
      fetcher as typeof fetch,
      "https://geo.example/{ip}/json/",
    )

    assert.strictEqual(currency, "USD")
  })
})
