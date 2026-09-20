import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  CURRENCIES,
  DEFAULT_RATES,
  convertPrice,
  getCurrencyForCountry,
  isCurrencyCode,
  normalizeCurrencyRates,
} from "../currency"

describe("currency defaults", () => {
  it("keeps USD and CNY as permanent supported currencies", () => {
    const codes = CURRENCIES.map((currency) => currency.code)

    assert.ok(codes.includes("USD"))
    assert.ok(codes.includes("CNY"))
    assert.ok(isCurrencyCode("USD"))
    assert.ok(isCurrencyCode("CNY"))
  })

  it("maps known visitor countries to supported default currencies", () => {
    assert.strictEqual(getCurrencyForCountry("US"), "USD")
    assert.strictEqual(getCurrencyForCountry("CN"), "CNY")
    assert.strictEqual(getCurrencyForCountry("MZ"), "MZN")
    assert.strictEqual(getCurrencyForCountry("BR"), "BRL")
    assert.strictEqual(getCurrencyForCountry("GB"), "GBP")
    assert.strictEqual(getCurrencyForCountry("DE"), "EUR")
  })

  it("uses a supported geolocation currency before falling back by country", () => {
    assert.strictEqual(getCurrencyForCountry("US", "MZN"), "MZN")
    assert.strictEqual(getCurrencyForCountry("US", "ABC"), "USD")
    assert.strictEqual(getCurrencyForCountry(null, "CNY"), "CNY")
    assert.strictEqual(getCurrencyForCountry(null, null), "USD")
  })

  it("normalizes dynamic rates while preserving static fallbacks", () => {
    const rates = normalizeCurrencyRates({
      USD: 1,
      CNY: 6.8,
      MZN: 63.558581,
      ABC: 999,
      EUR: "bad",
    })

    assert.strictEqual(rates.USD, 1)
    assert.strictEqual(rates.CNY, 6.8)
    assert.strictEqual(rates.MZN, 63.558581)
    assert.strictEqual(rates.EUR, DEFAULT_RATES.EUR)
    assert.strictEqual(convertPrice(596, rates.MZN), 37880.91)
  })
})
