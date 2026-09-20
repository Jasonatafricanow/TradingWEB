import { translate, type TranslationKeyWithoutParams } from "./core/catalog";
import { formatMoney } from "./core/format";
import type { Locale } from "./core/locale";

const PRODUCT_TYPE_KEYS = {
  service: "catalog.type.service",
  virtual: "catalog.type.virtual",
  physical: "catalog.type.physical",
} as const satisfies Record<string, TranslationKeyWithoutParams>;

export function getCatalogProductTypeLabel(locale: Locale, type: string): string {
  return translate(
    locale,
    PRODUCT_TYPE_KEYS[type as keyof typeof PRODUCT_TYPE_KEYS] ?? "catalog.type.unknown",
  );
}

export function formatSalesMoney(
  locale: Locale,
  value: number,
  currency: string,
): string {
  return formatMoney(locale, value, currency.trim().toUpperCase());
}
