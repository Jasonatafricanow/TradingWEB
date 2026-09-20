export const SUPPORTED_LOCALES = ["zh", "en", "pt"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

const supportedLocaleSet = new Set<string>(SUPPORTED_LOCALES);

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === "string" && supportedLocaleSet.has(value);
}
