import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { paymentMethods, stores } from "@/storage/database/shared/schema";

export class PosBootstrapError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code);
    this.name = "PosBootstrapError";
  }
}

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function getPosBootstrap(storeId: string) {
  const [store] = await db.select({
    id: stores.id,
    name: stores.name,
    status: stores.status,
    metadata: stores.metadata,
  }).from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) throw new PosBootstrapError("STORE_NOT_FOUND", 404);
  if (store.status !== "active") throw new PosBootstrapError("STORE_INACTIVE", 409);

  const methods = await db.select({
    code: paymentMethods.code,
    label: paymentMethods.name,
    type: paymentMethods.type,
  }).from(paymentMethods).where(eq(paymentMethods.enabled, true)).orderBy(asc(paymentMethods.sort_order));
  const metadata = metadataObject(store.metadata);
  return {
    contract_version: "pos-v1",
    store: { id: store.id, name: store.name },
    currency: typeof metadata.currency === "string" ? metadata.currency : "USD",
    tax_rate: typeof metadata.tax_rate === "string" ? metadata.tax_rate : "0.00",
    promotions: Array.isArray(metadata.promotions) ? metadata.promotions : [],
    pricing_version: typeof metadata.pricing_version === "string" ? metadata.pricing_version : "pos-v1",
    payment_methods: methods,
    operator_session_ttl_seconds: 28_800,
    approval_ttl_seconds: 300,
  };
}
