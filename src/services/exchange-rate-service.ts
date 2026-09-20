import { DEFAULT_RATES, normalizeCurrencyRates, type CurrencyCode } from "@/config/currency"

const DEFAULT_EXCHANGE_RATE_API_URL = "https://open.er-api.com/v6/latest/USD"
const SETTINGS_KEY = "currency.rates"

export interface ExchangeRatesSnapshot {
  base: "USD"
  provider: string
  updatedAt: string
  fetchedAt: string
  rates: Record<CurrencyCode, number>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function parseExchangeRateApiResponse(payload: unknown): ExchangeRatesSnapshot {
  if (!isRecord(payload)) {
    throw new Error("Exchange rate provider returned an invalid payload")
  }
  if (payload.result !== "success") {
    throw new Error("Exchange rate provider returned an error")
  }
  if (payload.base_code !== "USD") {
    throw new Error("Expected USD base currency")
  }
  if (!isRecord(payload.rates)) {
    throw new Error("Exchange rate provider returned no rates")
  }

  return {
    base: "USD",
    provider: typeof payload.provider === "string" ? payload.provider : "unknown",
    updatedAt: typeof payload.time_last_update_utc === "string" ? payload.time_last_update_utc : new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
    rates: normalizeCurrencyRates(payload.rates),
  }
}

export async function fetchLatestExchangeRates(
  fetcher: typeof fetch = fetch,
  apiUrl = process.env.EXCHANGE_RATE_API_URL || DEFAULT_EXCHANGE_RATE_API_URL,
): Promise<ExchangeRatesSnapshot> {
  const response = await fetcher(apiUrl, {
    headers: { accept: "application/json" },
    cache: "no-store",
  })
  if (!response.ok) {
    throw new Error(`Exchange rate provider responded ${response.status}`)
  }
  return parseExchangeRateApiResponse(await response.json())
}

export async function getCachedExchangeRates(): Promise<ExchangeRatesSnapshot | null> {
  try {
    const { db } = await import("@/lib/db")
    const [rows] = await db.$client.execute(
      "SELECT `value` FROM `site_settings` WHERE `key` = ? LIMIT 1",
      [SETTINGS_KEY],
    )
    const first = (rows as { value: string | null }[])[0]
    if (!first?.value) return null
    const parsed = JSON.parse(first.value) as ExchangeRatesSnapshot
    return {
      ...parsed,
      rates: normalizeCurrencyRates(parsed.rates || {}),
    }
  } catch {
    return null
  }
}

export async function saveExchangeRates(snapshot: ExchangeRatesSnapshot): Promise<void> {
  const { db } = await import("@/lib/db")
  await db.$client.execute(
    "INSERT INTO `site_settings` (`key`, `value`) VALUES (?, ?) " +
      "ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)",
    [SETTINGS_KEY, JSON.stringify(snapshot)],
  )
}

export async function getEffectiveExchangeRates(): Promise<ExchangeRatesSnapshot> {
  const cached = await getCachedExchangeRates()
  if (cached) return cached

  return {
    base: "USD",
    provider: "static-fallback",
    updatedAt: "static-fallback",
    fetchedAt: new Date().toISOString(),
    rates: DEFAULT_RATES,
  }
}

export async function refreshExchangeRates(): Promise<ExchangeRatesSnapshot> {
  const snapshot = await fetchLatestExchangeRates()
  await saveExchangeRates(snapshot)
  return snapshot
}
