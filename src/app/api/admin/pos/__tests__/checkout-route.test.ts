import { beforeEach, describe, expect, it, vi } from "vitest";

import { PosApiError } from "@/services/admin/pos-errors";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requirePosOperatorSession: vi.fn(),
  posCheckout: vi.fn(),
}));

vi.mock("@/services/auth/auth-middleware", () => ({
  requireUser: mocks.requireUser,
  requireStaffRole: vi.fn(),
  errorResponse: (error: unknown) => Response.json({ error: String(error) }, { status: 500 }),
}));
vi.mock("@/services/admin/pos-operator-session-service", () => ({
  requirePosOperatorSession: mocks.requirePosOperatorSession,
}));
vi.mock("@/services/admin/pos-service", () => ({
  posCheckout: mocks.posCheckout,
  PosCheckoutError: class PosCheckoutError extends Error {},
}));

function body(overrides: Record<string, unknown> = {}) {
  return {
    idempotency_key: "android-checkout-001",
    store_id: "store-1",
    currency: "USD",
    staff_id: "staff-1",
    customer_id: null,
    note: null,
    fulfillment: { method: "in_store" },
    items: [{ product_id: "product-1", variant_id: null, quantity: 1, line_discount: "0.00" }],
    order_discount: "0.00",
    pricing_preview: { subtotal: "10.00", discount: "0.00", tax: "0.00", total: "10.00" },
    pricing_version: "pricing-v1",
    payments: [{ method: "cash", label: "Cash", amount: "10.00", reference: null }],
    ...overrides,
  };
}

function request(payload: unknown = body()) {
  return new Request("https://example.test/api/admin/pos/checkout", {
    method: "POST",
    headers: {
      authorization: "Bearer jwt",
      "content-type": "application/json",
      "X-POS-Operator-Session": "operator-token",
      "X-POS-Device-ID": "android-install-1",
    },
    body: JSON.stringify(payload),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({
    id: "user-1",
    email: "operator@example.test",
    role: "operator",
    staffId: "account-staff-1",
  });
  mocks.requirePosOperatorSession.mockResolvedValue({
    accountUserId: "user-1",
    staffId: "staff-1",
    storeId: "store-1",
    deviceId: "android-install-1",
    permissions: ["checkout"],
  });
  mocks.posCheckout.mockResolvedValue({ id: "order-1", source: "pos", total: "10.00" });
});

describe("POST /api/admin/pos/checkout", () => {
  it("returns a typed missing-account failure", async () => {
    mocks.requireUser.mockRejectedValueOnce(Object.assign(new Error("Not authenticated"), { status: 401 }));
    const { POST } = await import("../checkout/route");
    const response = await POST(request() as never);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "AUTHENTICATION_REQUIRED" } });
    expect(mocks.requirePosOperatorSession).not.toHaveBeenCalled();
  });

  it("returns the typed missing-operator-session failure", async () => {
    mocks.requirePosOperatorSession.mockRejectedValueOnce(Object.assign(new Error("Operator session required"), {
      code: "OPERATOR_SESSION_REQUIRED",
      status: 401,
    }));
    const { POST } = await import("../checkout/route");
    const response = await POST(request() as never);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "OPERATOR_SESSION_REQUIRED" } });
    expect(mocks.posCheckout).not.toHaveBeenCalled();
  });

  it.each([
    [{ staff_id: "forged" }],
    [{ store_id: "forged" }],
  ])("rejects request/operator mismatch %#", async (overrides) => {
    const { POST } = await import("../checkout/route");
    const response = await POST(request(body(overrides)) as never);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "OPERATOR_MISMATCH" } });
    expect(mocks.posCheckout).not.toHaveBeenCalled();
  });

  it("rejects an invalid checkout request", async () => {
    const { POST } = await import("../checkout/route");
    const response = await POST(request(body({ idempotency_key: "", items: [] })) as never);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "CHECKOUT_REQUEST_INVALID" } });
  });

  it("preserves a typed pricing conflict", async () => {
    mocks.posCheckout.mockRejectedValueOnce(new PosApiError("PRICING_CHANGED", "Pricing changed", 409, false, { total: "11.00" }));
    const { POST } = await import("../checkout/route");
    const response = await POST(request() as never);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: { code: "PRICING_CHANGED", message: "Pricing changed", retryable: false, details: { total: "11.00" } },
    });
  });

  it("returns 201 and binds account plus operator to the parsed DTO", async () => {
    const { POST } = await import("../checkout/route");
    const response = await POST(request() as never);
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ data: { id: "order-1", source: "pos", total: "10.00" } });
    expect(mocks.requireUser).toHaveBeenCalledTimes(1);
    expect(mocks.posCheckout).toHaveBeenCalledWith(expect.objectContaining({
      idempotency_key: "android-checkout-001",
      account_user_id: "user-1",
      operator: expect.objectContaining({ staffId: "staff-1", storeId: "store-1" }),
    }));
  });

  it("allows a manager account to operate the POS", async () => {
    mocks.requireUser.mockResolvedValueOnce({
      id: "user-1",
      email: "manager@example.test",
      role: "manager",
      staffId: "staff-1",
    });
    const { POST } = await import("../checkout/route");
    const response = await POST(request() as never);
    expect(response.status).toBe(201);
  });
});
