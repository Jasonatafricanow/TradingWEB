import { describe, expect, it, vi } from "vitest";

import { getPosRangeReport, parsePosReportQuery, type PosReportRepository } from "../pos-report-service";

const operator = { accountUserId: "user-1", staffId: "staff-1", storeId: "store-1", deviceId: "device-1", permissions: ["checkout"] };

describe("POS range report", () => {
  it("validates range and store-scoped filters", () => {
    expect(parsePosReportQuery(new URL("https://example.test/?date_from=2026-07-01&date_to=2026-07-07&source=all"))).toEqual({
      dateFrom: "2026-07-01", dateTo: "2026-07-07", source: null, storeId: undefined, staffId: undefined,
    });
    expect(() => parsePosReportQuery(new URL("https://example.test/?date_from=bad&date_to=2026-07-07"))).toThrow(/date_from/i);
    expect(() => parsePosReportQuery(new URL("https://example.test/?date_from=2026-07-08&date_to=2026-07-07"))).toThrow(/date_from.*date_to/i);
  });

  it("reconciles all 120 orders rather than a first-page subset", async () => {
    const orders = Array.from({ length: 120 }, (_, index) => ({
      id: `order-${index + 1}`,
      totalCents: 1000,
      createdAt: new Date(`2026-07-${String((index % 3) + 1).padStart(2, "0")}T10:00:00.000Z`),
      staffId: index % 2 ? "staff-1" : "staff-2",
      staffName: index % 2 ? "Alice" : "Bob",
    }));
    const refunds = Array.from({ length: 20 }, (_, index) => ({ orderId: `order-${index + 1}`, amountCents: 200, createdAt: new Date("2026-07-03T12:00:00.000Z"), orderTotalCents: 1000, staffId: index % 2 ? "staff-1" : "staff-2", staffName: index % 2 ? "Alice" : "Bob" }));
    const repository: PosReportRepository = {
      getStore: vi.fn(async () => ({ id: "store-1", name: "Main Store", timezoneOffset: "+00:00" })),
      load: vi.fn(async () => ({
        orders,
        refunds,
        refundsForOrdersCents: 4000,
        payments: orders.map((order) => ({ orderId: order.id, method: "cash", label: "Cash", amountCents: 1000, orderTotalCents: 1000 })),
        items: orders.map((order) => ({ name: "Product", quantity: 1, amountCents: 1000 })),
      })),
    };

    const report = await getPosRangeReport({
      operator,
      query: { dateFrom: "2026-07-01", dateTo: "2026-07-03", source: null },
      repository,
    });

    expect(report).toMatchObject({ gross: "1200.00", refunded: "40.00", net: "1160.00", order_count: 120, aov: "10.00" });
    expect(report.refunds_for_orders_in_period).toBe("40.00");
    expect(report.by_payment_method.reduce((sum, row) => sum + Number(row.net_amount), 0)).toBe(1160);
    expect(report.daily.reduce((sum, row) => sum + Number(row.net_amount), 0)).toBe(1160);
    expect(report.by_staff.reduce((sum, row) => sum + Number(row.net_amount), 0)).toBe(1160);
    expect(report.top_items[0]).toEqual({ name: "Product", quantity: 120, gross_amount: "1200.00" });
    expect(repository.load).toHaveBeenCalledWith(expect.objectContaining({ storeId: "store-1", from: new Date("2026-07-01T00:00:00.000Z"), toExclusive: new Date("2026-07-04T00:00:00.000Z") }));
  });

  it("reconciles a refund issued in range for an order sold before the range", async () => {
    const repository: PosReportRepository = {
      getStore: vi.fn(async () => ({ id: "store-1", name: "Main Store", timezoneOffset: "+00:00" })),
      load: vi.fn(async () => ({
        orders: [{ id: "current", totalCents: 1000, createdAt: new Date("2026-07-03T10:00:00.000Z"), staffId: "staff-1", staffName: "Alice" }],
        refunds: [{ orderId: "old", amountCents: 200, createdAt: new Date("2026-07-03T12:00:00.000Z"), orderTotalCents: 1000, paymentMethod: "cash", staffId: "staff-2", staffName: "Bob" }],
        refundsForOrdersCents: 0,
        payments: [{ orderId: "current", method: "cash", label: "Cash", amountCents: 1000, orderTotalCents: 1000 }],
        refundPayments: [{ orderId: "old", method: "cash", label: "Cash", amountCents: 1000, orderTotalCents: 1000 }],
        items: [],
      })),
    };

    const report = await getPosRangeReport({ operator, query: { dateFrom: "2026-07-03", dateTo: "2026-07-03", source: "pos" }, repository });

    expect(report).toMatchObject({ gross: "10.00", refunded: "2.00", refunds_for_orders_in_period: "0.00", net: "8.00" });
    expect(report.by_payment_method).toEqual([{ method: "cash", label: "Cash", gross_amount: "10.00", refunded_amount: "2.00", net_amount: "8.00" }]);
    expect(report.by_staff.reduce((sum, row) => sum + Number(row.net_amount), 0)).toBe(8);
    expect(report.by_staff).toContainEqual({ staff_id: "staff-2", name: "Bob", order_count: 0, gross_amount: "0.00", refunded_amount: "2.00", net_amount: "-2.00" });
  });

  it("rejects a forged store filter before loading report rows", async () => {
    const repository: PosReportRepository = { getStore: vi.fn(), load: vi.fn() };
    await expect(getPosRangeReport({
      operator,
      query: { dateFrom: "2026-07-01", dateTo: "2026-07-01", source: "pos", storeId: "store-2" },
      repository,
    })).rejects.toMatchObject({ status: 403 });
    expect(repository.getStore).not.toHaveBeenCalled();
  });
});
