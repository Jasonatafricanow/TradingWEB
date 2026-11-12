/**
 * Server-side API and audit-trail messages (English, machine-facing).
 * Clients localize by HTTP status / error code; these strings are diagnostics.
 */
export const API_MESSAGES = {
  emailLogNotFound: "Email log not found",
  emailResendNotAllowed: "This email cannot be resent from the log",
  cronUnauthorized: "Unauthorized",
  emailOutboxFailed: "Email outbox flush failed",
  invalidMembershipTier: "Invalid membership tier",
  storeAccessDenied: "Store access denied",
  invalidImageUrl: "Invalid image URL",
  signInBeforeLinking: "Sign in before linking",
  invalidIdempotencyKey: "Invalid idempotency key",
  orderNotFound: "Order not found",
  paypalCaptureUnavailable: "PayPal capture verification unavailable",
  refundReconciliationPending: "Refund reconciliation pending",
  legacyPosRetired: "Legacy POS checkout retired; use /api/admin/pos/checkout",
} as const;

export const IMPORT_MESSAGES = {
  unknownProductType: (type: string) => `Unknown product type: ${type}`,
  invalidProductStatus: (status: string) => `Status must be active or inactive: ${status}`,
  duplicateBarcode: (barcode: string) => `Product with barcode ${barcode} already exists; skipped`,
  variantStockIgnored: "Variant stock ignored; use the inventory import to set stock per location",
} as const;

export const TIMELINE_MESSAGES = {
  webReturnRestocked: (refundId: string) => `Refund ${refundId}: verified return lines restored to original stock locations`,
  stripeRefundReconciled: (chargeId: string, cumulative: string) => `Stripe charge ${chargeId}: cumulative refund ${cumulative}`,
} as const;
