import {
  translate,
  type TranslationKeyWithoutParams,
} from "./core/catalog";
import type { Locale } from "./core/locale";

export type SystemShellTranslator = (
  key: TranslationKeyWithoutParams,
) => string;

export const SYSTEM_SHELL_KEYS = {
  admin: "nav.dashboard",
  products: "nav.products",
  "product-types": "nav.product_types",
  pos: "nav.pos",
  orders: "nav.orders",
  "payment-methods": "nav.payment_methods",
  categories: "nav.categories",
  customers: "nav.customers",
  reviews: "nav.reviews",
  recommendations: "nav.recommendations",
  coupons: "nav.coupons",
  affiliates: "nav.affiliates",
  notifications: "nav.notifications",
  refunds: "nav.refunds",
  "abandoned-carts": "nav.abandoned_carts",
  warehouses: "nav.warehouses",
  inventory: "nav.inventory",
  stores: "nav.stores",
  shipments: "nav.shipments",
  "shipping-templates": "nav.shipping_templates",
  "email-templates": "nav.email_templates",
  seed: "nav.seed_data",
  media: "nav.media",
  staff: "nav.staff",
  "audit-logs": "nav.audit_logs",
  settings: "nav.settings",
  sales: "nav.sales",
  traffic: "nav.traffic",
  briefing: "nav.briefing",
  memberships: "nav.memberships",
  redirects: "nav.redirects",
  import: "nav.imports",
  imports: "nav.imports",
  export: "nav.export",
  dashboard: "nav.dashboard",
} as const satisfies Record<string, TranslationKeyWithoutParams>;

export const SAFE_AUTH_ERROR_KEY =
  "common.unexpected_error" as const satisfies TranslationKeyWithoutParams;

export function getAdminSegmentLabel(
  t: SystemShellTranslator,
  segment: string,
): string {
  if (/^\d+$/.test(segment)) return `#${segment}`;
  const key = SYSTEM_SHELL_KEYS[segment as keyof typeof SYSTEM_SHELL_KEYS];
  return t(key ?? "shell.details");
}

export function formatTableRange(
  locale: Locale,
  input: Readonly<{ start: number; end: number; total: number }>,
): string {
  return translate(locale, "admin.table.range", input);
}

export function safeAuthError(t: SystemShellTranslator): string {
  return t(SAFE_AUTH_ERROR_KEY);
}
