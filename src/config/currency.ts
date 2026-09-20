/**
 * 多币种配置
 */
export type CurrencyCode = "USD" | "CNY" | "BRL" | "EUR" | "GBP" | "MZN"

export interface CurrencyInfo {
  code: CurrencyCode
  name: string
  nameZh: string
  symbol: string
  locale: string
  flag: string
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: "USD", name: "US Dollar",      nameZh: "美元",       symbol: "$",  locale: "en-US", flag: "🇺🇸" },
  { code: "CNY", name: "Chinese Yuan",   nameZh: "人民币",     symbol: "¥",  locale: "zh-CN", flag: "🇨🇳" },
  { code: "BRL", name: "Brazilian Real", nameZh: "巴西雷亚尔", symbol: "R$", locale: "pt-BR", flag: "🇧🇷" },
  { code: "EUR", name: "Euro",           nameZh: "欧元",       symbol: "€",  locale: "de-DE", flag: "🇪🇺" },
  { code: "GBP", name: "British Pound",  nameZh: "英镑",       symbol: "£",  locale: "en-GB", flag: "🇬🇧" },
  { code: "MZN", name: "Metical",        nameZh: "梅蒂卡尔",   symbol: "Mt", locale: "pt-MZ", flag: "🇲🇿" },
]

export const DEFAULT_CURRENCY: CurrencyCode = "USD"

/** 默认汇率（以 USD 为基准，可在 admin 设置页面覆盖） */
export const DEFAULT_RATES: Record<CurrencyCode, number> = {
  USD: 1,
  CNY: 7.25,
  BRL: 5.15,
  EUR: 0.92,
  GBP: 0.79,
  MZN: 63.56,
}

export const SUPPORTED_CURRENCY_CODES = CURRENCIES.map((currency) => currency.code) as CurrencyCode[]

const EUR_COUNTRIES = new Set([
  "AT", "BE", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT", "LV",
  "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES",
])

const COUNTRY_CURRENCY_OVERRIDES: Record<string, CurrencyCode> = {
  BR: "BRL",
  CN: "CNY",
  GB: "GBP",
  MZ: "MZN",
  UK: "GBP",
  US: "USD",
}

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === "string" && SUPPORTED_CURRENCY_CODES.includes(value.toUpperCase() as CurrencyCode)
}

export function getCurrencyForCountry(
  countryCode?: string | null,
  detectedCurrency?: string | null,
): CurrencyCode {
  if (isCurrencyCode(detectedCurrency)) {
    return detectedCurrency.toUpperCase() as CurrencyCode
  }

  const normalizedCountry = countryCode?.trim().toUpperCase()
  if (!normalizedCountry) return DEFAULT_CURRENCY

  if (COUNTRY_CURRENCY_OVERRIDES[normalizedCountry]) {
    return COUNTRY_CURRENCY_OVERRIDES[normalizedCountry]
  }
  if (EUR_COUNTRIES.has(normalizedCountry)) {
    return "EUR"
  }
  return DEFAULT_CURRENCY
}

export function normalizeCurrencyRates(
  rates: Partial<Record<string, unknown>>,
  fallback: Record<CurrencyCode, number> = DEFAULT_RATES,
): Record<CurrencyCode, number> {
  return SUPPORTED_CURRENCY_CODES.reduce((normalized, code) => {
    const raw = rates[code]
    normalized[code] = typeof raw === "number" && Number.isFinite(raw) && raw > 0
      ? raw
      : fallback[code]
    return normalized
  }, {} as Record<CurrencyCode, number>)
}

/** 从 localStorage 读取偏好币种 */
export function getStoredCurrencyOrNull(): CurrencyCode | null {
  if (typeof window === "undefined") return null
  const stored = localStorage.getItem("preferred_currency") as CurrencyCode | null
  if (stored && CURRENCIES.find((c) => c.code === stored)) return stored
  return null
}

/** 从 localStorage 读取偏好币种；未设置时返回默认币种 */
export function getStoredCurrency(): CurrencyCode {
  const stored = getStoredCurrencyOrNull()
  if (stored) return stored
  return DEFAULT_CURRENCY
}

/** 保存偏好币种 */
export function setStoredCurrency(code: CurrencyCode) {
  if (typeof window !== "undefined") localStorage.setItem("preferred_currency", code)
}

/** 换算价格 */
export function convertPrice(usdAmount: number, rate: number): number {
  return Math.round((usdAmount * rate) * 100) / 100
}

/** 格式化价格 */
export function formatPrice(amount: number, currency: CurrencyCode): string {
  const info = CURRENCIES.find((c) => c.code === currency)
  try {
    return new Intl.NumberFormat(info?.locale || "en-US", {
      style: "currency",
      currency,
    }).format(amount)
  } catch {
    return `${info?.symbol || "$"}${amount.toFixed(2)}`
  }
}
