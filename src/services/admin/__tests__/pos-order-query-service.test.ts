import { describe, expect, it, vi } from "vitest";

import {
  listPosOrders,
  getPosOrder,
  parsePosOrderQuery,
  transitionPickupFulfillment,
  type PosOrderQueryRepository,
} from "../pos-order-query-service";

const operator = {
  accountUserId: "account-1",
  staffId: "staff-1",
  storeId: "store-1",
  deviceId: "device-1",
  permissions: ["checkout"],
};

function order(index: number) {
  return {
    id: `order-${index}`,
    order_no: `POS-${String(index).padStart(4, "0")}`,
    created_at: new Date(Date.UTC(2026, 6, 1, 0, index)).toISOString(),
    source: index % 2 ? "web" : "pos",
    store_id: "store-1",
    customer_id: `customer-${index % 3}`,
    customer_name: `Customer ${index % 3}`,
    status: "completed",
    financial_status: "paid",
    fulfillment_status: "unfulfilled",
    total: "10.00",
    refunded_total: "0.00",
    item_count: 1,
    pickup_contact_name: null,
    pickup_phone: null,
    pickup_store_id: null,
    pickup_ready_at: null,
    picked_up_at: null,
  };
}

describe("POS order query", () => {
  it("validates filters and caps page_size at 100", () => {
    expect(parsePosOrderQuery(new URL("https://example.test/?page=2&page_size=100&source=all&search=abc"))).toMatchObject({
      page: 2,
      pageSize: 100,
      source: null,
      search: "abc",
    });
    expect(() => parsePosOrderQuery(new URL("https://example.test/?page_size=101"))).toThrowError(/page_size/i);
    expect(() => parsePosOrderQuery(new URL("https://example.test/?date_from=bad"))).toThrowError(/date_from/i);
    expect(parsePosOrderQuery(new URL("https://example.test/?date_from=2026-07-01&date_to=2026-07-21"))).toMatchObject({
      dateFrom: new Date("2026-07-01T00:00:00.000Z"),
      dateTo: new Date("2026-07-21T23:59:59.999Z"),
    });
    expect(() => parsePosOrderQuery(new URL("https://example.test/?date_from=2026-07-22&date_to=2026-07-21"))).toThrowError(/date_from.*date_to/i);
  });

  it("pages 120 omnichannel orders without gaps or duplicates", async () => {
    const all = Array.from({ length: 120 }, (_, index) => order(index + 1));
    const repository: PosOrderQueryRepository = {
      list: vi.fn(async ({ offset, limit }) => ({ rows: all.slice(offset, offset + limit), total: all.length })),
      withTransaction: vi.fn(),
    };

    const first = await listPosOrders({ operator, query: { page: 1, pageSize: 50, source: null }, repository });
    const second = await listPosOrders({ operator, query: { page: 2, pageSize: 50, source: null }, repository });
    const third = await listPosOrders({ operator, query: { page: 3, pageSize: 50, source: null }, repository });
    const ids = [...first.items, ...second.items, ...third.items].map((item) => item.id);

    expect(first).toMatchObject({ page: 1, page_size: 50, total: 120, has_more: true });
    expect(second.has_more).toBe(true);
    expect(third).toMatchObject({ page: 3, page_size: 50, total: 120, has_more: false });
    expect(ids).toHaveLength(120);
    expect(new Set(ids)).toHaveLength(120);
    expect(repository.list).toHaveBeenCalledWith(expect.objectContaining({ storeId: "store-1" }));
  });

  it("keeps customer history filtering on the server", async () => {
    const repository: PosOrderQueryRepository = {
      list: vi.fn(async (query) => ({ rows: [order(1)], total: 61 })),
      withTransaction: vi.fn(),
    };
    await listPosOrders({
      operator,
      query: { page: 2, pageSize: 50, source: null, customerId: "customer-1" },
      repository,
    });
    expect(repository.list).toHaveBeenCalledWith(expect.objectContaining({ customerId: "customer-1", offset: 50 }));
  });

  it("loads order detail through the operator store scope", async () => {
    const detail = { ...order(1), items: [], payments: [], note: null, subtotal: "10.00", discount_total: "0.00", tax_total: "0.00" };
    const repository = { get: vi.fn(async () => detail) };
    await expect(getPosOrder({ operator, orderId: "order-1", repository })).resolves.toMatchObject({ id: "order-1", pickup_ready_at: null });
    expect(repository.get).toHaveBeenCalledWith("order-1", "store-1");
  });
});

describe("pickup fulfillment state machine", () => {
  it("allows only the next pickup state and records timestamps/timeline atomically", async () => {
    const update = vi.fn();
    const timeline = vi.fn();
    const repository: PosOrderQueryRepository = {
      list: vi.fn(),
      withTransaction: vi.fn(async (work) => work({
        lockOrder: vi.fn(async () => ({
          id: "order-1",
          store_id: "store-1",
          fulfillment_status: "preparing",
          pickup_store_id: "store-1",
        })),
        updateFulfillment: update,
        addTimeline: timeline,
      })),
    };

    const result = await transitionPickupFulfillment({ operator, orderId: "order-1", nextStatus: "ready", repository, now: new Date("2026-07-21T20:00:00Z") });
    expect(result.fulfillment_status).toBe("ready");
    expect(update).toHaveBeenCalledWith("order-1", expect.objectContaining({ fulfillment_status: "ready", pickup_ready_at: new Date("2026-07-21T20:00:00Z") }));
    expect(timeline).toHaveBeenCalledWith(expect.objectContaining({ old_value: "preparing", new_value: "ready", operator_id: "staff-1" }));
  });

  it("rejects skips, non-pickup orders and cross-store orders with 409/403", async () => {
    const repositoryFor = (row: Record<string, unknown>): PosOrderQueryRepository => ({
      list: vi.fn(),
      withTransaction: vi.fn(async (work) => work({
        lockOrder: vi.fn(async () => row as never),
        updateFulfillment: vi.fn(),
        addTimeline: vi.fn(),
      })),
    });

    await expect(transitionPickupFulfillment({
      operator, orderId: "order-1", nextStatus: "picked_up",
      repository: repositoryFor({ id: "order-1", store_id: "store-1", fulfillment_status: "preparing", pickup_store_id: "store-1" }),
    })).rejects.toMatchObject({ status: 409 });

    await expect(transitionPickupFulfillment({
      operator, orderId: "order-1", nextStatus: "preparing",
      repository: repositoryFor({ id: "order-1", store_id: "store-1", fulfillment_status: "unfulfilled", pickup_store_id: null }),
    })).rejects.toMatchObject({ status: 409 });

    await expect(transitionPickupFulfillment({
      operator, orderId: "order-1", nextStatus: "preparing",
      repository: repositoryFor({ id: "order-1", store_id: "store-2", fulfillment_status: "unfulfilled", pickup_store_id: "store-2" }),
    })).rejects.toMatchObject({ status: 403 });
  });
});
