import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), requirePosOperatorSession: vi.fn(), getPosRangeReport: vi.fn() }));
vi.mock("@/services/auth/auth-middleware", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/services/admin/pos-operator-session-service", () => ({ requirePosOperatorSession: mocks.requirePosOperatorSession }));
vi.mock("@/services/admin/pos-report-service", async (load) => ({ ...await load<typeof import("@/services/admin/pos-report-service")>(), getPosRangeReport: mocks.getPosRangeReport }));

import { GET } from "../reports/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "user-1", staffId: "staff-1", role: "operator" });
  mocks.requirePosOperatorSession.mockResolvedValue({ accountUserId: "user-1", staffId: "staff-1", storeId: "store-1", permissions: ["checkout"] });
});

describe("POS report route", () => {
  it("binds authenticated operator and parsed range", async () => {
    mocks.getPosRangeReport.mockResolvedValue({ order_count: 120 });
    const response = await GET(new Request("https://example.test/api/admin/pos/reports?date_from=2026-07-01&date_to=2026-07-30&source=all") as never);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { order_count: 120 } });
    expect(mocks.getPosRangeReport).toHaveBeenCalledWith(expect.objectContaining({ query: expect.objectContaining({ dateFrom: "2026-07-01", dateTo: "2026-07-30", source: null }) }));
  });

  it("returns typed 400 before report execution for invalid dates", async () => {
    const response = await GET(new Request("https://example.test/api/admin/pos/reports?date_from=bad&date_to=2026-07-30") as never);
    expect(response.status).toBe(400);
    expect(mocks.getPosRangeReport).not.toHaveBeenCalled();
  });
});
