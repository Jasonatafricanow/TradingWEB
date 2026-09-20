import { DEFAULT_LOCALE, type LocaleCode } from "@/config/locale"

type LocaleStorage = Pick<Storage, "getItem" | "setItem">

const LOCALE_STORAGE_KEY = "locale"
const SUPPORTED_LOCALES = new Set<LocaleCode>(["zh", "en", "pt"])

export function isSupportedLocale(value: unknown): value is LocaleCode {
  return typeof value === "string" && SUPPORTED_LOCALES.has(value as LocaleCode)
}

export function getHydrationLocale(): LocaleCode {
  return DEFAULT_LOCALE
}

export function readStoredLocale(storage: LocaleStorage | null | undefined): LocaleCode | null {
  try {
    const stored = storage?.getItem(LOCALE_STORAGE_KEY)
    return isSupportedLocale(stored) ? stored : null
  } catch {
    return null
  }
}

export function writeStoredLocale(storage: LocaleStorage | null | undefined, locale: LocaleCode): void {
  if (!isSupportedLocale(locale)) return
  try {
    storage?.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    // Ignore storage failures so language switching never breaks rendering.
  }
}
