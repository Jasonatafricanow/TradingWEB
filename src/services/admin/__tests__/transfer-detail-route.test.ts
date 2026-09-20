import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireStaffRole: vi.fn().mockResolvedValue({}),
  requireUser: vi.fn().mockResolvedValue({ id: "manager-1" }),
  errorResponse: vi.fn((error: unknown) => Response.json({ error: String(error) }, { status: 500 })),
  getTransfer: vi.fn().mockResolvedValue({ id: "transfer-1" }),
  approveTransfer: vi.fn().mockResolvedValue(undefined),
  completeTransfer: vi.fn().mockResolvedValue(undefined),
  cancelTransfer: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/services/auth/auth-middleware", () => ({
  requireStaffRole: mocks.requireStaffRole,
  requireUser: mocks.requireUser,
  errorResponse: mocks.errorResponse,
}));

vi.mock("@/services/admin/transfer-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/admin/transfer-service")>();
  return {
    ...actual,
    getTransfer: mocks.getTransfer,
    approveTransfer: mocks.approveTransfer,
    completeTransfer: mocks.completeTransfer,
    cancelTransfer: mocks.cancelTransfer,
  };
});

import { TransferServiceError } from "@/services/admin/transfer-service";
import { GET, PATCH, PUT } from "@/app/api/admin/inventory/transfers/[id]/route";

const context = { params: Promise.resolve({ id: "transfer-1" }) };

describe("legacy transfer detail route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows read access to staff but reserves approval for managers and admins", async () => {
    await GET(new Request("http://localhost/api/admin/inventory/transfers/transfer-1"), context);
    expect(mocks.requireStaffRole).toHaveBeenCalledWith(expect.anything(), ["admin", "manager", "operator"]);

    await PUT(new Request("http://localhost/api/admin/inventory/transfers/transfer-1", { method: "PUT" }), context);
    expect(mocks.requireStaffRole).toHaveBeenLastCalledWith(expect.anything(), ["admin", "manager"]);
  });

  it("maps approval conflicts to the service status and machine-readable code", async () => {
    mocks.approveTransfer.mockRejectedValueOnce(new TransferServiceError("TRANSFER_STATE_CONFLICT", "conflict", 409));
    const response = await PUT(new Request("http://localhost/api/admin/inventory/transfers/transfer-1", { method: "PUT" }), context);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: { code: "TRANSFER_STATE_CONFLICT", message: "conflict" } });
  });

  it("protects complete and cancel actions and maps service errors", async () => {
    mocks.cancelTransfer.mockRejectedValueOnce(new TransferServiceError("TRANSFER_NOT_FOUND", "missing", 404));
    const response = await PATCH(new Request("http://localhost/api/admin/inventory/transfers/transfer-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    }), context);

    expect(mocks.requireStaffRole).toHaveBeenCalledWith(expect.anything(), ["admin", "manager"]);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: { code: "TRANSFER_NOT_FOUND", message: "missing" } });
  });
});
