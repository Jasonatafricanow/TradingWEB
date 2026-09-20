import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { products, productVariants } from "@/storage/database/shared/schema";
import { formatCents, parseMoneyToCents } from "./order-money";

export type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface PricingProduct {
  id: string;
  title: string;
  type: string;
  price: string;
  status: string;
}

export interface PricingVariant {
  id: string;
  title: string | null;
  sku: string | null;
  price: string;
}

export interface PricingRepository {
  getProduct(productId: string, tx?: DbTx): Promise<PricingProduct | null>;
  getVariant(productId: string, variantId: string, tx?: DbTx): Promise<PricingVariant | null>;
  hasVariants(productId: string, tx?: DbTx): Promise<boolean>;
}

export interface PriceOrderInput {
  items: Array<{
    product_id: string;
    variant_id: string | null;
    quantity: number;
    line_discount: string;
  }>;
  order_discount: string;
  tax?: string;
  tax_rate_bps?: number;
}

export interface AuthoritativePriceLine {
  productId: string;
  variantId: string | null;
  title: string;
  productType: string;
  sku: string | null;
  unitPrice: string;
  quantity: number;
  lineDiscount: string;
  lineTotal: string;
}

export interface PricedOrder {
  lines: AuthoritativePriceLine[];
  subtotal: string;
  lineDiscountTotal: string;
  orderDiscount: string;
  tax: string;
  total: string;
}

export class OrderPricingError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "OrderPricingError";
  }
}

const databasePricingRepository: PricingRepository = {
  async getProduct(productId, tx) {
    const executor = tx ?? db;
    const [product] = await executor.select({
      id: products.id,
      title: products.title,
      type: products.type,
      price: products.price,
      status: products.status,
    }).from(products).where(eq(products.id, productId)).limit(1);
    return product ?? null;
  },
  async getVariant(productId, variantId, tx) {
    const executor = tx ?? db;
    const [variant] = await executor.select({
      id: productVariants.id,
      title: productVariants.title,
      sku: productVariants.sku,
      price: productVariants.price,
    }).from(productVariants).where(and(
      eq(productVariants.product_id, productId),
      eq(productVariants.id, variantId),
    )).limit(1);
    return variant ?? null;
  },
  async hasVariants(productId, tx) {
    const executor = tx ?? db;
    const rows = await executor.select({ id: productVariants.id })
      .from(productVariants)
      .where(eq(productVariants.product_id, productId))
      .limit(1);
    return rows.length > 0;
  },
};

function nonNegativeMoney(value: string, code: string): number {
  const cents = parseMoneyToCents(value);
  if (cents < 0) throw new OrderPricingError(code);
  return cents;
}

export async function priceOrder(
  input: PriceOrderInput,
  repository: PricingRepository = databasePricingRepository,
  tx?: DbTx,
): Promise<PricedOrder> {
  if (input.items.length === 0) throw new OrderPricingError("ORDER_ITEMS_REQUIRED");

  const lines: AuthoritativePriceLine[] = [];
  let subtotalCents = 0;
  let lineDiscountTotalCents = 0;

  for (const item of input.items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new OrderPricingError("QUANTITY_INVALID");
    }
    const product = await repository.getProduct(item.product_id, tx);
    if (!product || product.status !== "active") throw new OrderPricingError("PRODUCT_NOT_SALEABLE");

    const hasVariants = await repository.hasVariants(item.product_id, tx);
    if (hasVariants && !item.variant_id) throw new OrderPricingError("VARIANT_REQUIRED");

    const variant = item.variant_id
      ? await repository.getVariant(item.product_id, item.variant_id, tx)
      : null;
    if (item.variant_id && !variant) throw new OrderPricingError("VARIANT_NOT_SALEABLE");

    const unitPriceCents = nonNegativeMoney(variant?.price ?? product.price, "UNIT_PRICE_INVALID");
    const grossCents = unitPriceCents * item.quantity;
    if (!Number.isSafeInteger(grossCents)) throw new OrderPricingError("LINE_TOTAL_INVALID");
    const lineDiscountCents = nonNegativeMoney(item.line_discount, "LINE_DISCOUNT_INVALID");
    if (lineDiscountCents > grossCents) {
      throw new OrderPricingError("LINE_DISCOUNT_EXCEEDS_GROSS");
    }

    subtotalCents += grossCents;
    lineDiscountTotalCents += lineDiscountCents;
    lines.push({
      productId: product.id,
      variantId: variant?.id ?? null,
      title: variant?.title ? `${product.title} - ${variant.title}` : product.title,
      productType: product.type,
      sku: variant?.sku ?? null,
      unitPrice: formatCents(unitPriceCents),
      quantity: item.quantity,
      lineDiscount: formatCents(lineDiscountCents),
      lineTotal: formatCents(grossCents - lineDiscountCents),
    });
  }

  const orderDiscountCents = nonNegativeMoney(input.order_discount, "ORDER_DISCOUNT_INVALID");
  const afterLines = subtotalCents - lineDiscountTotalCents;
  if (orderDiscountCents > afterLines) {
    throw new OrderPricingError("ORDER_DISCOUNT_EXCEEDS_TOTAL");
  }
  let taxCents: number;
  if (input.tax_rate_bps !== undefined) {
    if (!Number.isInteger(input.tax_rate_bps) || input.tax_rate_bps < 0 || input.tax_rate_bps > 10_000) {
      throw new OrderPricingError("TAX_RATE_INVALID");
    }
    taxCents = Math.round(((afterLines - orderDiscountCents) * input.tax_rate_bps) / 10_000);
  } else {
    taxCents = nonNegativeMoney(input.tax ?? "0.00", "TAX_INVALID");
  }
  const totalCents = afterLines - orderDiscountCents + taxCents;

  return {
    lines,
    subtotal: formatCents(subtotalCents),
    lineDiscountTotal: formatCents(lineDiscountTotalCents),
    orderDiscount: formatCents(orderDiscountCents),
    tax: formatCents(taxCents),
    total: formatCents(totalCents),
  };
}
