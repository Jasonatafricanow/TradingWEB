import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn().mockResolvedValue({
    id: "user-1", email: "manager@example.test", role: "manager", staffId: "manager-1",
  }),
  requireStaffRole: vi.fn().mockResolvedValue(undefined),
  listStaff: vi.fn().mockResolvedValue({
    data: [{ id: "manager-1", email: "manager@example.test", role: "manager", store_id: "store-1" }],
  }),
}));

vi.mock("@/services/auth/auth-middleware", () => ({
  requireUser: mocks.requireUser,
  requireStaffRole: mocks.requireStaffRole,
  errorResponse: vi.fn(),
}));
vi.mock("@/services/admin/staff-service", () => ({ listStaff: mocks.listStaff }));
vi.mock("@/services/admin/role-permissions-service", () => ({
  loadManagerGrant: vi.fn().mockResolvedValue({ all: false, sections: ["pos", "orders"] }),
}));

describe("current staff route", () => {
  it("allows the manager role used by POS operator sessions", async () => {
    const { GET } = await import("../../staff/me/route");
    const response = await GET(new Request("https://example.test/api/admin/staff/me"));

    expect(response.status).toBe(200);
    expect(mocks.requireStaffRole).toHaveBeenCalledWith(expect.anything(), ["admin", "manager", "operator", "support"]);
    // The sidebar shows a manager exactly the sections an admin granted.
    await expect(response.json()).resolves.toMatchObject({ data: { id: "manager-1", store_id: "store-1", sections: ["pos", "orders"] } });
  });
});
