import { DEFAULT_CURRENCY, getCurrencyForCountry, type CurrencyCode } from "@/config/currency"

const DEFAULT_IP_GEOLOCATION_API_URL = "https://ipapi.co/{ip}/json/"

function normalizeCountry(value: string | null): string | null {
  const normalized = value?.trim().toUpperCase()
  if (!normalized || normalized === "XX" || normalized === "T1") return null
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null
}

function firstHeader(headers: Headers, names: string[]): string | null {
  for (const name of names) {
    const value = headers.get(name)
    if (value) return value
  }
  return null
}

export function getCountryCodeFromHeaders(headers: Headers): string | null {
  return normalizeCountry(firstHeader(headers, [
    "cf-ipcountry",
    "x-vercel-ip-country",
    "x-country-code",
    "x-appengine-country",
  ]))
}

export function getClientIpFromHeaders(headers: Headers): string | null {
  const value = firstHeader(headers, ["cf-connecting-ip", "x-real-ip", "x-forwarded-for"])
  const first = value?.split(",")[0]?.trim()
  if (!first || first === "::1" || first === "127.0.0.1") return null
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(first)) return null
  return first
}

export function getCurrencyFromGeoPayload(payload: unknown): CurrencyCode {
  if (!payload || typeof payload !== "object") return DEFAULT_CURRENCY
  const record = payload as Record<string, unknown>
  const country = typeof record.country === "string"
    ? record.country
    : typeof record.country_code === "string"
      ? record.country_code
      : null
  const currency = typeof record.currency === "string" ? record.currency : null
  return getCurrencyForCountry(country, currency)
}

export async function fetchCurrencyForIp(
  ip: string,
  fetcher: typeof fetch = fetch,
  apiUrlTemplate = process.env.IP_GEOLOCATION_API_URL || DEFAULT_IP_GEOLOCATION_API_URL,
): Promise<CurrencyCode> {
  const url = apiUrlTemplate.replace("{ip}", encodeURIComponent(ip))
  try {
    const response = await fetcher(url, {
      headers: { accept: "application/json", "user-agent": "tradingweb-currency/1.0" },
      cache: "no-store",
    })
    if (!response.ok) return DEFAULT_CURRENCY
    return getCurrencyFromGeoPayload(await response.json())
  } catch {
    return DEFAULT_CURRENCY
  }
}

export async function detectCurrencyFromHeaders(
  headers: Headers,
  fetcher: typeof fetch = fetch,
): Promise<{ currency: CurrencyCode; countryCode: string | null; source: "cdn-country" | "ipapi" | "fallback" }> {
  const countryCode = getCountryCodeFromHeaders(headers)
  if (countryCode) {
    return { currency: getCurrencyForCountry(countryCode), countryCode, source: "cdn-country" }
  }

  const ip = getClientIpFromHeaders(headers)
  if (ip) {
    return { currency: await fetchCurrencyForIp(ip, fetcher), countryCode: null, source: "ipapi" }
  }

  return { currency: DEFAULT_CURRENCY, countryCode: null, source: "fallback" }
}
