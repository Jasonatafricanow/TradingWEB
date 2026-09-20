import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireStaffRole: vi.fn(),
  getStaffById: vi.fn(),
  getStore: vi.fn(),
  updateStaff: vi.fn(),
}));

vi.mock("@/services/auth/auth-middleware", () => ({
  requireUser: mocks.requireUser,
  requireStaffRole: mocks.requireStaffRole,
  errorResponse: (error: unknown) => Response.json(
    { error: error instanceof Error ? error.message : String(error) },
    { status: (error as { status?: number }).status ?? 500 },
  ),
}));
vi.mock("@/services/admin/staff-service", () => ({
  getStaffById: mocks.getStaffById,
  updateStaff: mocks.updateStaff,
  deleteStaff: vi.fn(),
}));
vi.mock("@/services/admin/store-service", () => ({
  getStore: mocks.getStore,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "user-1", email: "admin@example.test", role: "admin", staffId: "admin-1" });
  mocks.requireStaffRole.mockResolvedValue(undefined);
  mocks.getStaffById.mockResolvedValue({
    id: "staff-1",
    email: "operator@example.test",
    store_id: "store-1",
    pos_enabled: true,
    pos_pin_configured: true,
  });
  mocks.getStore.mockResolvedValue({ data: { id: "store-1", status: "active" }, error: null });
  mocks.updateStaff.mockResolvedValue({
    id: "staff-1",
    email: "operator@example.test",
    store_id: "store-1",
    pos_enabled: true,
    pos_permissions: ["checkout"],
    pos_pin_configured: true,
  });
});

describe("staff POS configuration route", () => {
  it("accepts explicit POS fields and keeps the PIN write-only", async () => {
    const { PUT } = await import("../../staff/[id]/route");
    const response = await PUT(new Request("https://example.test", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        store_id: "store-1",
        pos_enabled: true,
        pos_permissions: ["checkout"],
        pos_pin: "123456",
      }),
    }) as never, { params: Promise.resolve({ id: "staff-1" }) });

    expect(response.status).toBe(200);
    expect(mocks.updateStaff).toHaveBeenCalledWith("staff-1", {
      store_id: "store-1",
      pos_enabled: true,
      pos_permissions: ["checkout"],
      pos_pin: "123456",
    });
    const payload = await response.json();
    expect(payload.data).not.toHaveProperty("pos_pin");
    expect(payload.data).not.toHaveProperty("pos_pin_hash");
  });

  it("allows admins to assign the manager role required for approvals", async () => {
    const { PUT } = await import("../../staff/[id]/route");
    const response = await PUT(new Request("https://example.test", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "manager" }),
    }) as never, { params: Promise.resolve({ id: "staff-1" }) });
    expect(response.status).toBe(200);
    expect(mocks.updateStaff).toHaveBeenCalledWith("staff-1", { role: "manager" });
  });

  it("allows Task 11 least-privilege inventory and purchase permissions", async () => {
    const permissions = [
      "inventory_read", "inventory_adjust", "inventory_transfer",
      "purchase_order_read", "purchase_order_create", "purchase_order_receive",
    ];
    const { PUT } = await import("../../staff/[id]/route");
    const response = await PUT(new Request("https://example.test", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pos_permissions: permissions }),
    }) as never, { params: Promise.resolve({ id: "staff-1" }) });
    expect(response.status).toBe(200);
    expect(mocks.updateStaff).toHaveBeenCalledWith("staff-1", { pos_permissions: permissions });
  });

  it("preserves the existing discount and stock adjustment permission vocabulary", async () => {
    const permissions = ["checkout", "discount", "stock_adjust"];
    const { PUT } = await import("../../staff/[id]/route");
    const response = await PUT(new Request("https://example.test", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pos_permissions: permissions }),
    }) as never, { params: Promise.resolve({ id: "staff-1" }) });
    expect(response.status).toBe(200);
    expect(mocks.updateStaff).toHaveBeenCalledWith("staff-1", { pos_permissions: permissions });
  });

  it.each([
    [{ pos_pin: "123" }],
    [{ pos_pin: "123456789" }],
    [{ pos_pin: "12ab" }],
    [{ pos_permissions: ["checkout", 1] }],
    [{ pos_permissions: ["unknown"] }],
    [{ pos_permissions: [""] }],
    [{ store_id: 123 }],
    [{ store_id: "" }],
  ])("rejects invalid POS input %#", async (body) => {
    const { PUT } = await import("../../staff/[id]/route");
    const response = await PUT(new Request("https://example.test", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as never, { params: Promise.resolve({ id: "staff-1" }) });

    expect(response.status).toBe(400);
    expect(mocks.updateStaff).not.toHaveBeenCalled();
  });

  it("rejects an unknown store assignment", async () => {
    mocks.getStore.mockResolvedValueOnce({ data: null, error: null });
    const { PUT } = await import("../../staff/[id]/route");
    const response = await PUT(new Request("https://example.test", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ store_id: "missing-store" }),
    }) as never, { params: Promise.resolve({ id: "staff-1" }) });

    expect(response.status).toBe(404);
    expect(mocks.updateStaff).not.toHaveBeenCalled();
  });

  it.each([
    [
      { id: "staff-1", email: "operator@example.test", store_id: null, pos_pin_configured: true },
      { pos_enabled: true },
    ],
    [
      { id: "staff-1", email: "operator@example.test", store_id: "store-1", pos_pin_configured: false },
      { pos_enabled: true },
    ],
  ])("rejects enabling POS without a complete store and PIN configuration %#", async (target, body) => {
    mocks.getStaffById.mockResolvedValueOnce(target);
    const { PUT } = await import("../../staff/[id]/route");
    const response = await PUT(new Request("https://example.test", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as never, { params: Promise.resolve({ id: "staff-1" }) });

    expect(response.status).toBe(400);
    expect(mocks.updateStaff).not.toHaveBeenCalled();
  });
});
