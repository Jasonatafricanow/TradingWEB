// Server-side message templates for outbound email and staff notifications.
// The text is stored with the row at event time (like order timeline text),
// so a resend or a later read shows exactly what was produced then.

type OrderRef = { order_no: string; total_amount: string | number; currency?: string | null };

function money(order: OrderRef) {
  return `${order.total_amount} ${order.currency || "USD"}`;
}

export const EMAIL_TEMPLATES = {
  passwordReset: {
    key: "password_reset",
    subject: "Reset your TradingWEB password",
    body: (resetUrl: string) => `Use this link within 15 minutes to reset your password: ${resetUrl}`,
  },
  orderConfirmation: {
    key: "order_confirmation",
    subject: (order: OrderRef) => `Order confirmation - ${order.order_no}`,
    body: (order: OrderRef, items: string[]) =>
      `Thank you for your order ${order.order_no}. Payment of ${money(order)} has been confirmed.`
      + (items.length ? `\nItems: ${items.join(", ")}` : ""),
  },
  orderShipped: {
    key: "order_shipped",
    subject: (order: OrderRef) => `Your order ${order.order_no} has shipped`,
    body: (order: OrderRef, tracking: { number?: string | null; carrier?: string | null }) =>
      `Your order ${order.order_no} is on its way.`
      + (tracking.number ? `\nTracking number: ${tracking.number}${tracking.carrier ? ` (${tracking.carrier})` : ""}` : ""),
  },
  orderDelivered: {
    key: "order_delivered",
    subject: (order: OrderRef) => `Your order ${order.order_no} was delivered`,
    body: (order: OrderRef) => `Your order ${order.order_no} has been delivered. Thank you for shopping with us.`,
  },
  orderCancelled: {
    key: "order_cancelled",
    subject: (order: OrderRef) => `Your order ${order.order_no} was cancelled`,
    body: (order: OrderRef) => `Your order ${order.order_no} has been cancelled.`,
  },
  dailyBriefing: {
    key: "daily_briefing",
  },
} as const;

export const STAFF_NOTIFICATIONS = {
  orderPaid: (order: OrderRef) => ({
    subject: `New paid order ${order.order_no}`,
    body: `Payment of ${money(order)} confirmed.`,
  }),
  paymentConflict: (order: OrderRef) => ({
    subject: `Payment conflict on order ${order.order_no}`,
    body: "A provider payment could not be applied to this order. Manual review is required.",
  }),
  refundRequested: (order: OrderRef, amount: string) => ({
    subject: `Refund requested for order ${order.order_no}`,
    body: `Requested amount: ${amount} ${order.currency || "USD"}.`,
  }),
  deliveryFailed: (order: OrderRef, reason: string | null) => ({
    subject: `Delivery failed for order ${order.order_no}`,
    body: reason ? `Reason: ${reason}` : "No reason given.",
  }),
} as const;
