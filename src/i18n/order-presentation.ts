import { translate, type TranslationKeyWithoutParams } from "./core/catalog";
import { formatMoney, formatNumber } from "./core/format";
import type { Locale } from "./core/locale";

const ORDER_STATUS_KEYS = {
  pending: "orders.status.pending",
  paid: "orders.status.paid",
  processing: "orders.status.processing",
  shipped: "orders.status.shipped",
  delivering: "orders.status.delivering",
  delivered: "orders.status.delivered",
  delivery_failed: "orders.status.delivery_failed",
  completed: "orders.status.completed",
  cancelled: "orders.status.cancelled",
  refunded: "orders.status.refunded",
} as const satisfies Record<string, TranslationKeyWithoutParams>;

export function getOrderStatusLabel(locale: Locale, status: string): string {
  const key =
    ORDER_STATUS_KEYS[status as keyof typeof ORDER_STATUS_KEYS] ??
    "orders.status.unknown";
  return translate(locale, key);
}

export function formatOrderCancelConfirmation(
  locale: Locale,
  orderNumber: string,
): string {
  return translate(locale, "orders.cancel_confirm", { orderNumber });
}

export function formatOrderMoney(
  locale: Locale,
  value: number,
  currency: string | null | undefined,
): string {
  const normalizedCurrency = currency?.trim().toUpperCase() ?? "";
  if (/^[A-Z]{3}$/.test(normalizedCurrency)) {
    try {
      return formatMoney(locale, value, normalizedCurrency);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
    }
  }

  return `${formatNumber(locale, value, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${translate(locale, "orders.currency_unavailable")}`;
}
