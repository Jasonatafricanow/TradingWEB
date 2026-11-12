import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ user: vi.fn(), role: vi.fn(), execute: vi.fn(), report: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { $client: { execute: mocks.execute } } }));
vi.mock("@/services/auth/auth-middleware", async original => ({ ...await original<typeof import("@/services/auth/auth-middleware")>(), requireUser: mocks.user, requireStaffRole: mocks.role }));
vi.mock("@/services/admin/pos-service", () => ({ getPosDailyReport: mocks.report }));
import { GET } from "@/app/api/admin/pos/daily-report/route";
beforeEach(() => { vi.clearAllMocks(); mocks.user.mockResolvedValue({ id: "user", staffId: "staff", role: "operator" }); mocks.role.mockResolvedValue(undefined); });
describe("daily report access", () => {
  it("rejects another store before reading orders", async () => {
    mocks.execute.mockResolvedValue([[{ store_id: "own-store" }]]);
    const response = await GET(new NextRequest("https://example.test/api?store_id=other-store&date=2026-11-12"));
    expect(response.status).toBe(403); expect(mocks.report).not.toHaveBeenCalled();
  });
  it("allows the same store without exposing buyer phone", async () => {
    mocks.execute.mockResolvedValue([[{ store_id: "own-store" }]]);
    mocks.report.mockResolvedValue({ orders: [{ buyer_phone: "123456789" }] });
    const response = await GET(new NextRequest("https://example.test/api?store_id=own-store&date=2026-11-12"));
    expect(response.status).toBe(200); expect((await response.json()).data.orders[0].buyer_phone).toBeNull();
  });
});
