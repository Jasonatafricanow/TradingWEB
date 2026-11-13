import { describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => [] as Array<{ sql: string; params: unknown[] }>);
vi.mock("@/lib/db", () => ({
  db: { $client: { execute: vi.fn(async (sql: string, params: unknown[]) => {
    calls.push({ sql, params });
    return [[{ value: sql.includes("SUM(total_amount)") ? "125.50" : calls.length }]];
  }) } },
}));

import { generateDailyBriefing } from "@/services/cron/briefing-service";

describe("daily briefing", () => {
  it("reports the whole previous day from real queries and leaves page views unavailable", async () => {
    const result = await generateDailyBriefing(new Date(2026, 10, 12, 8, 0, 0));
    expect(result.date).toBe("2026-11-11");
    expect(result.revenue).toBe(125.5);
    expect(result.pageViews).toBeNull();

    const ranged = calls.filter((call) => call.params.length === 2);
    for (const call of ranged) {
      const [start, end] = call.params as Date[];
      expect(start).toBeInstanceOf(Date); // not ISO strings compared against DATETIME
      expect(start.getDate()).toBe(11);
      expect(end.getTime() - start.getTime()).toBe(24 * 3600 * 1000);
    }
    const revenue = calls.find((call) => call.sql.includes("SUM(total_amount)"))!;
    expect(revenue.sql).toContain("payment_status IN ('paid', 'refunded')");
    expect(revenue.sql).not.toContain("status = ?");
    expect(calls.some((call) => call.sql.includes("low_stock_threshold"))).toBe(true);
    expect(calls.some((call) => call.sql.includes("abandoned_carts"))).toBe(true);
  });
});
