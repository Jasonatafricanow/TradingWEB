import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireStaffRole: vi.fn(),
  createOperatorSession: vi.fn(),
  requirePosOperatorSession: vi.fn(),
  revokeOperatorSession: vi.fn(),
  issueApprovalToken: vi.fn(),
  discoverPosApprovers: vi.fn(),
  getPosBootstrap: vi.fn(),
  searchPosCatalog: vi.fn(),
}));

vi.mock("@/services/auth/auth-middleware", () => ({
  requireUser: mocks.requireUser,
  requireStaffRole: mocks.requireStaffRole,
  errorResponse: (error: unknown) => Response.json({ error: String(error) }, { status: 500 }),
}));
vi.mock("@/services/admin/pos-operator-session-service", () => ({
  createOperatorSession: mocks.createOperatorSession,
  requirePosOperatorSession: mocks.requirePosOperatorSession,
  revokeOperatorSession: mocks.revokeOperatorSession,
  PosOperatorSessionError: class PosOperatorSessionError extends Error {
    constructor(public readonly code: string, public readonly status: number) {
      super(code);
    }
  },
}));
vi.mock("@/services/admin/pos-approval-service", () => ({ issueApprovalToken: mocks.issueApprovalToken }));
vi.mock("@/services/admin/pos-approver-discovery-service", () => ({ discoverPosApprovers: mocks.discoverPosApprovers }));
vi.mock("@/services/admin/pos-bootstrap-service", () => ({ getPosBootstrap: mocks.getPosBootstrap }));
vi.mock("@/services/admin/pos-service", () => ({ searchPosCatalog: mocks.searchPosCatalog }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "user-1", email: "a@example.test", role: "operator", staffId: "account-staff" });
  mocks.requireStaffRole.mockResolvedValue(undefined);
});

describe("POS operator routes", () => {
  it("returns typed authentication and authorization failures", async () => {
    const { GET } = await import("../bootstrap/route");

    mocks.requireStaffRole.mockRejectedValueOnce(Object.assign(new Error("Not authenticated"), { status: 401 }));
    const unauthenticated = await GET(new Request("https://example.test?store_id=store-1") as never);
    expect(unauthenticated.status).toBe(401);
    await expect(unauthenticated.json()).resolves.toMatchObject({
      error: { code: "AUTHENTICATION_REQUIRED", retryable: false },
    });

    mocks.requireStaffRole.mockRejectedValueOnce(Object.assign(new Error("Insufficient permissions"), { status: 403 }));
    const forbidden = await GET(new Request("https://example.test?store_id=store-1") as never);
    expect(forbidden.status).toBe(403);
    await expect(forbidden.json()).resolves.toMatchObject({
      error: { code: "FORBIDDEN", retryable: false },
    });
  });

  it("returns a typed 400 for invalid JSON", async () => {
    const { POST } = await import("../operator-sessions/route");
    const response = await POST(new Request("https://example.test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }) as never);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_JSON", retryable: false },
    });
  });

  it("creates an account-bound operator session", async () => {
    mocks.createOperatorSession.mockResolvedValue({ token: "raw", operator: { staffId: "staff-1" }, expiresAt: "later" });
    const { POST } = await import("../operator-sessions/route");
    const response = await POST(new Request("https://example.test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ staff_id: "staff-1", store_id: "store-1", device_id: "android-install-1", pin: "1234" }),
    }) as never);
    expect(response.status).toBe(201);
    expect(mocks.createOperatorSession).toHaveBeenCalledWith({
      accountUserId: "user-1",
      staffId: "staff-1",
      storeId: "store-1",
      deviceId: "android-install-1",
      pin: "1234",
    });
    expect(mocks.requireStaffRole).toHaveBeenCalledWith(expect.anything(), ["admin", "manager", "operator"]);
  });

  it("returns and revokes the current account session", async () => {
    mocks.requirePosOperatorSession.mockResolvedValue({ staffId: "staff-1", storeId: "store-1" });
    mocks.revokeOperatorSession.mockResolvedValue(true);
    const current = await import("../operator-sessions/current/route");
    const request = new Request("https://example.test", { headers: {
      "X-POS-Operator-Session": "raw",
      "X-POS-Device-ID": "android-install-1",
    } });
    const getResponse = await current.GET(request as never);
    expect(getResponse.status).toBe(200);
    const deleteResponse = await current.DELETE(request as never);
    expect(deleteResponse.status).toBe(200);
    expect(mocks.revokeOperatorSession).toHaveBeenCalledWith("raw", "user-1");
  });

  it("issues approval from the authenticated current operator", async () => {
    mocks.requirePosOperatorSession.mockResolvedValue({ staffId: "manager-1", storeId: "store-1" });
    mocks.issueApprovalToken.mockResolvedValue({ token: "approval", expiresAt: "later" });
    const { POST } = await import("../approvals/route");
    const response = await POST(new Request("https://example.test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operation: "refund", resource_hash: "a".repeat(64), store_id: "store-1" }),
    }) as never);
    expect(response.status).toBe(201);
    expect(mocks.issueApprovalToken).toHaveBeenCalledWith({
      approvedByStaffId: "manager-1",
      storeId: "store-1",
      operation: "refund",
      resourceHash: "a".repeat(64),
    });
  });

  it("discovers only public approver identities after account and operator-session authentication", async () => {
    mocks.requirePosOperatorSession.mockResolvedValue({ staffId: "clerk-1", storeId: "store-1" });
    mocks.discoverPosApprovers.mockResolvedValue([
      { id: "manager-1", name: "Manager One", role: "manager" },
    ]);
    const { GET } = await import("../approvers/route");
    const response = await GET(new NextRequest("https://example.test/api/admin/pos/approvers?store_id=store-1"));

    expect(response.status).toBe(200);
    expect(mocks.requireStaffRole).toHaveBeenCalledWith(expect.anything(), ["admin", "manager", "operator"]);
    expect(mocks.requireUser).toHaveBeenCalled();
    expect(mocks.requirePosOperatorSession).toHaveBeenCalledWith(expect.anything(), "user-1");
    expect(mocks.discoverPosApprovers).toHaveBeenCalledWith("store-1");
    await expect(response.json()).resolves.toEqual({
      data: [{ id: "manager-1", name: "Manager One", role: "manager" }],
    });
  });

  it("rejects approver discovery without a valid session or when the requested store differs", async () => {
    const { GET } = await import("../approvers/route");
    mocks.requirePosOperatorSession.mockRejectedValueOnce(
      Object.assign(new Error("OPERATOR_SESSION_REQUIRED"), { code: "OPERATOR_SESSION_REQUIRED", status: 401 }),
    );
    const missing = await GET(new NextRequest("https://example.test/api/admin/pos/approvers?store_id=store-1"));
    expect(missing.status).toBe(401);
    expect(mocks.discoverPosApprovers).not.toHaveBeenCalled();

    mocks.requirePosOperatorSession.mockResolvedValueOnce({ staffId: "clerk-1", storeId: "store-1" });
    const mismatch = await GET(new NextRequest("https://example.test/api/admin/pos/approvers?store_id=store-2"));
    expect(mismatch.status).toBe(403);
    await expect(mismatch.json()).resolves.toMatchObject({
      error: { code: "OPERATOR_STORE_MISMATCH", retryable: false },
    });
    expect(mocks.discoverPosApprovers).not.toHaveBeenCalled();
  });

  it("returns Android-safe bootstrap configuration", async () => {
    mocks.getPosBootstrap.mockResolvedValue({ contract_version: "pos-v1", currency: "USD" });
    const { GET } = await import("../bootstrap/route");
    const response = await GET(new Request("https://example.test?store_id=store-1") as never);
    expect(response.status).toBe(200);
    expect(mocks.getPosBootstrap).toHaveBeenCalledWith("store-1");
  });

  it("lets an empty POS catalog query load the initial product list", async () => {
    mocks.searchPosCatalog.mockResolvedValue([{ product_id: "product-1" }]);
    const { GET } = await import("../catalog/route");
    const response = await GET(new NextRequest("https://example.test/api/admin/pos/catalog?q=&store_id=store-1"));

    expect(response.status).toBe(200);
    expect(mocks.searchPosCatalog).toHaveBeenCalledWith("", "store-1");
    await expect(response.json()).resolves.toEqual({ data: [{ product_id: "product-1" }] });
  });
});
