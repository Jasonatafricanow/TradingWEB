import { createHash } from "node:crypto";

import { z } from "zod";

import { PosApiError } from "./pos-errors";

const identifier = z.string().trim().min(1).max(160);
const paymentMethodCode = z.string().trim().min(1).max(64);
const decimal = z.string().regex(/^(?:0|[1-9]\d{0,7})\.\d{2}$/, "must fit DECIMAL(10,2) and have exactly two fractional digits");
const positiveDecimal = decimal.refine((value) => value !== "0.00", "must be greater than zero");
const nonNegativeDecimal = decimal;

const posPaymentSchema = z.object({
  method: paymentMethodCode,
  label: z.string().trim().min(1).max(100),
  amount: positiveDecimal,
  reference: z.string().trim().max(200).nullable(),
}).strict();

const posReturnItemSchema = z.object({
  order_item_id: identifier,
  quantity: z.number().int().positive(),
  restock: z.boolean(),
}).strict();

function hasUniqueReturnItems(items: Array<{ order_item_id: string }>): boolean {
  return new Set(items.map((item) => item.order_item_id)).size === items.length;
}

const fulfillmentSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("in_store") }).strict(),
  z.object({
    method: z.literal("pickup"),
    contact_name: z.string().trim().min(1).max(100),
    phone: z.string().trim().min(1).max(50),
    pickup_at: z.string().datetime({ offset: true }).optional(),
  }).strict(),
  z.object({
    method: z.literal("ship"),
    contact_name: z.string().trim().min(1).max(100),
    phone: z.string().trim().min(1).max(50),
    address: z.string().trim().min(1).max(500),
  }).strict(),
]);

export const posCheckoutRequestV1Schema = z.object({
  idempotency_key: identifier,
  store_id: identifier,
  currency: z.string().regex(/^[A-Z]{3}$/, "must be a three-letter uppercase currency code"),
  staff_id: identifier,
  customer_id: identifier.nullable(),
  note: z.string().trim().max(1000).nullable(),
  fulfillment: fulfillmentSchema,
  items: z.array(z.object({
    product_id: identifier,
    variant_id: identifier.nullable(),
    quantity: z.number().int().positive(),
    line_discount: decimal,
  }).strict()).min(1),
  order_discount: decimal,
  pricing_preview: z.object({
    subtotal: decimal,
    discount: decimal,
    tax: decimal,
    total: decimal,
  }).strict(),
  pricing_version: z.string().trim().min(1).max(160),
  payments: z.array(posPaymentSchema).min(1),
}).strict();

export type PosCheckoutRequestV1 = z.infer<typeof posCheckoutRequestV1Schema>;

export const posRefundRequestSchema = z.object({
  idempotency_key: identifier,
  store_id: identifier,
  return_items: z.array(posReturnItemSchema).min(1).refine(hasUniqueReturnItems, "return_items must not contain duplicate order_item_id values"),
  reason: z.string().trim().min(1).max(1000),
  approval_token: z.string().trim().min(1).max(500).nullable(),
}).strict();

export const posExchangeRequestSchema = z.object({
  idempotency_key: identifier,
  store_id: identifier,
  original_order_id: identifier,
  return_items: z.array(posReturnItemSchema).min(1).refine(hasUniqueReturnItems, "return_items must not contain duplicate order_item_id values"),
  replacement: posCheckoutRequestV1Schema,
  difference_payment: z.array(posPaymentSchema),
  approval_token: z.string().trim().min(1).max(500).nullable(),
}).strict().superRefine((value, context) => {
  if (value.replacement.store_id !== value.store_id) {
    context.addIssue({
      code: "custom",
      path: ["replacement", "store_id"],
      message: "replacement.store_id must match store_id",
    });
  }
});

export type PosPaymentInput = z.infer<typeof posPaymentSchema>;
export type PosReturnItemInput = z.infer<typeof posReturnItemSchema>;
export type PosRefundRequest = z.infer<typeof posRefundRequestSchema>;
export type PosExchangeRequest = z.infer<typeof posExchangeRequestSchema>;

const inventoryAdjustmentSchema = z.object({
  idempotency_key: identifier,
  store_id: identifier,
  product_id: identifier,
  variant_id: identifier.nullable(),
  location_id: identifier.nullable(),
  delta: z.number().int().refine((value) => value !== 0, "must not be zero"),
  reason: z.enum(["count", "damage", "receive", "correction"]),
  note: z.string().trim().max(1000).nullable(),
  approval_token: z.string().trim().min(1).max(500).nullable(),
}).strict();

const purchaseOrderItemSchema = z.object({
  product_id: identifier,
  variant_id: identifier.nullable(),
  ordered_qty: z.number().int().positive(),
  unit_cost: nonNegativeDecimal,
}).strict();

function hasUniqueProductVariants(items: Array<{ product_id: string; variant_id: string | null }>): boolean {
  return new Set(items.map((item) => `${item.product_id}\u0000${item.variant_id ?? ""}`)).size === items.length;
}

const purchaseOrderCreateSchema = z.object({
  idempotency_key: identifier,
  store_id: identifier,
  location_id: identifier.nullable(),
  supplier: z.string().trim().min(1).max(200),
  items: z.array(purchaseOrderItemSchema).min(1).max(200)
    .refine(hasUniqueProductVariants, "items must not contain duplicate product/variant lines"),
}).strict();

const purchaseOrderReceiveSchema = z.object({
  idempotency_key: identifier,
  store_id: identifier,
  approval_token: z.string().trim().min(1).max(500).nullable(),
}).strict();

const transferCreateSchema = z.object({
  idempotency_key: identifier,
  store_id: identifier,
  from_location_id: identifier,
  to_location_id: identifier,
  note: z.string().trim().max(1000).nullable(),
  items: z.array(z.object({
    product_id: identifier,
    variant_id: identifier.nullable(),
    quantity: z.number().int().positive(),
  }).strict()).min(1).max(200)
    .refine(hasUniqueProductVariants, "items must not contain duplicate product/variant lines"),
}).strict().superRefine((value, context) => {
  if (value.from_location_id === value.to_location_id) {
    context.addIssue({ code: "custom", path: ["to_location_id"], message: "must differ from from_location_id" });
  }
});

export type PosInventoryAdjustmentRequest = z.infer<typeof inventoryAdjustmentSchema>;
export type PosPurchaseOrderCreateRequest = z.infer<typeof purchaseOrderCreateSchema>;
export type PosPurchaseOrderReceiveRequest = z.infer<typeof purchaseOrderReceiveSchema>;
export type PosTransferCreateRequest = z.infer<typeof transferCreateSchema>;

export interface PosOrderDto {
  id: string;
  order_no: string;
  created_at: string;
  source: "pos";
  status: string;
  financial_status: string;
  fulfillment_status: string;
  subtotal: string;
  discount_total: string;
  tax_total: string;
  total: string;
  refunded_total: string;
  pickup_contact_name?: string | null;
  pickup_phone?: string | null;
  pickup_store_id?: string | null;
  pickup_ready_at?: string | null;
  picked_up_at?: string | null;
  items: Array<{
    id: string;
    product_id: string;
    variant_id: string | null;
    name: string;
    sku: string | null;
    quantity: number;
    unit_price: string;
    line_discount: string;
    delivery_method: string;
  }>;
  payments: Array<{
    method: string;
    label: string;
    amount: string;
    reference: string | null;
  }>;
}

export function parsePosCheckoutRequest(input: unknown): PosCheckoutRequestV1 {
  const result = posCheckoutRequestV1Schema.safeParse(input);
  if (result.success) return result.data;
  const details = result.error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
  const message = details.map((issue) => `${issue.path || "request"}: ${issue.message}`).join("; ");
  throw new PosApiError("CHECKOUT_REQUEST_INVALID", message, 400, false, details);
}

function parsePosContract<T>(schema: z.ZodType<T>, input: unknown, code: string): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const details = result.error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
  const message = details.map((issue) => `${issue.path || "request"}: ${issue.message}`).join("; ");
  throw new PosApiError(code, message, 400, false, details);
}

export function parsePosRefundRequest(input: unknown): PosRefundRequest {
  return parsePosContract(posRefundRequestSchema, input, "REFUND_REQUEST_INVALID");
}

export function parsePosExchangeRequest(input: unknown): PosExchangeRequest {
  return parsePosContract(posExchangeRequestSchema, input, "EXCHANGE_REQUEST_INVALID");
}

export function parsePosInventoryAdjustmentRequest(input: unknown): PosInventoryAdjustmentRequest {
  return parsePosContract(inventoryAdjustmentSchema, input, "INVENTORY_ADJUSTMENT_REQUEST_INVALID");
}

export function parsePosPurchaseOrderCreateRequest(input: unknown): PosPurchaseOrderCreateRequest {
  return parsePosContract(purchaseOrderCreateSchema, input, "PURCHASE_ORDER_REQUEST_INVALID");
}

export function parsePosPurchaseOrderReceiveRequest(input: unknown): PosPurchaseOrderReceiveRequest {
  return parsePosContract(purchaseOrderReceiveSchema, input, "PURCHASE_ORDER_RECEIVE_REQUEST_INVALID");
}

export function parsePosTransferCreateRequest(input: unknown): PosTransferCreateRequest {
  return parsePosContract(transferCreateSchema, input, "INVENTORY_TRANSFER_REQUEST_INVALID");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

export function hashPosRequest(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(input)), "utf8").digest("hex");
}
