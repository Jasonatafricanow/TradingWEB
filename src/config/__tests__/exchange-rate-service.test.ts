import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { fetchLatestExchangeRates, parseExchangeRateApiResponse } from "../../services/exchange-rate-service"

describe("parseExchangeRateApiResponse", () => {
  it("extracts supported USD-based rates and metadata", () => {
    const parsed = parseExchangeRateApiResponse({
      result: "success",
      provider: "https://www.exchangerate-api.com",
      time_last_update_utc: "Tue, 07 Jul 2026 00:02:31 +0000",
      base_code: "USD",
      rates: {
        USD: 1,
        CNY: 6.801784,
        EUR: 0.874637,
        GBP: 0.747968,
        BRL: 5.167088,
        MZN: 63.558581,
        ABC: 123,
      },
    })

    assert.strictEqual(parsed.base, "USD")
    assert.strictEqual(parsed.provider, "https://www.exchangerate-api.com")
    assert.strictEqual(parsed.updatedAt, "Tue, 07 Jul 2026 00:02:31 +0000")
    assert.strictEqual(parsed.rates.USD, 1)
    assert.strictEqual(parsed.rates.CNY, 6.801784)
    assert.strictEqual(parsed.rates.MZN, 63.558581)
    assert.deepStrictEqual(Object.keys(parsed.rates).sort(), ["BRL", "CNY", "EUR", "GBP", "MZN", "USD"])
  })

  it("rejects non-USD or failed provider responses", () => {
    assert.throws(
      () => parseExchangeRateApiResponse({ result: "error", base_code: "USD", rates: {} }),
      /Exchange rate provider returned an error/,
    )
    assert.throws(
      () => parseExchangeRateApiResponse({ result: "success", base_code: "EUR", rates: { USD: 1 } }),
      /Expected USD base currency/,
    )
  })

  it("fetches and parses rates from a configured API URL", async () => {
    const fetcher = async (url: string | URL | Request) => {
      assert.strictEqual(String(url), "https://rates.example/latest/USD")
      return new Response(JSON.stringify({
        result: "success",
        provider: "test-provider",
        time_last_update_utc: "Tue, 07 Jul 2026 00:02:31 +0000",
        base_code: "USD",
        rates: { USD: 1, CNY: 6.8, MZN: 63.5 },
      }), { status: 200 })
    }

    const snapshot = await fetchLatestExchangeRates(fetcher as typeof fetch, "https://rates.example/latest/USD")

    assert.strictEqual(snapshot.provider, "test-provider")
    assert.strictEqual(snapshot.rates.USD, 1)
    assert.strictEqual(snapshot.rates.CNY, 6.8)
    assert.strictEqual(snapshot.rates.MZN, 63.5)
  })
})
