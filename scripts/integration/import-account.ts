import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { getUserCoupons } from "@/services/admin/membership-service";
import { receiveOrders } from "@/services/import/order-receiver";
import { receiveProducts } from "@/services/import/product-receiver";
import { createImportSession, getImportSessionDetail } from "@/services/import/session-service";
import { validateOrdersWithReferences } from "@/services/import/validator";
import { abandonedCarts, coupons, orders, orderItems, users, warehouses } from "@/storage/database/shared/schema";

async function main() {
  assert.match(process.env.DB_NAME ?? "", /(?:_test|_tmp)(?:$|_)/);
  const buyer = { id: randomUUID(), email: `${randomUUID()}@example.test` };
  await db.insert(users).values(buyer);
  await db.insert(warehouses).values({ name: "Import test warehouse" });
  const source = { source: "shopify", source_store: randomUUID() };
  const envelope = { ...source, schema_version: "1" };
  const session = async () => ({
    ...source, seller_id: buyer.id, customer_link_strategy: "auto_create_user" as const,
    ...(await createImportSession(buyer, { ...source, expected_jobs: ["products", "orders"] })),
  });
  const first = await session();
  const second = await session();
  await assert.rejects(getImportSessionDetail(randomUUID()), { status: 404 });

  const product = (id: string) => ({
    source_id: id, title: `${source.source_store}-${id}`, category: "Test", type: "digital",
    images: [{ url: `https://cdn.shopify.com/${id}.jpg` }],
  });
  for (const [ctx, records] of [[first, [product("a"), product("b")]], [second, [product("a")]], [second, [product("a")]]] as const) {
    const result = await receiveProducts(ctx, { ...envelope, records: [...records] });
    assert.equal(result.ok, true, JSON.stringify(result.errors));
  }
  assert.equal((await getImportSessionDetail(first.session_id)).mirror_progress?.total, 2);
  assert.equal((await getImportSessionDetail(second.session_id)).mirror_progress?.total, 1);

  const line = { product_source_id: "a", price: "4.00", quantity: 1, title: "Digital item" };
  const record = { source_id: "order", email: buyer.email, order_number: randomUUID().slice(0, 24),
    total_price: "4.00", line_items: [line] };
  const good = await receiveOrders(second, { ...envelope, records: [record] });
  assert.equal(good.ok, true, JSON.stringify(good.errors));
  const [order] = await db.select().from(orders).where(eq(orders.order_no, record.order_number));
  const invalid = { ...envelope, records: [{ ...record, line_items: [{ ...line, variant_source_id: "unknown" }] }] };
  assert.equal((await validateOrdersWithReferences(invalid))[0]?.code, "MISSING_REFERENCE");
  assert.equal((await receiveOrders(second, invalid)).errors[0]?.code, "MISSING_REFERENCE");
  const items = await db.select().from(orderItems).where(eq(orderItems.order_id, order.id));
  assert.deepEqual(items.map(item => item.product_type), ["digital"]);

  const coupon = { id: randomUUID(), code: randomUUID(), type: "percentage", value: "10.00" };
  await db.insert(coupons).values(coupon);
  const grant = { user_id: buyer.id, coupon_id: coupon.id, coupon_sent: true };
  await db.insert(abandonedCarts).values([grant, grant]);
  assert.deepEqual((await getUserCoupons(buyer.id)).map(c => [c.code, c.discount, c.expires_at]), [[coupon.code, "10%", null]]);
  assert.deepEqual(await getUserCoupons(randomUUID()), []);
  await db.update(orders).set({ coupon_id: coupon.id, payment_status: "paid" }).where(eq(orders.id, order.id));
  assert.deepEqual(await getUserCoupons(buyer.id), []);
}

main().then(() => console.log("Import sessions, order references and account coupons passed."))
  .catch(error => { console.error(error); process.exitCode = 1; })
  .finally(async () => { if (process.env.DB_HOST) await db.$client.end(); });
