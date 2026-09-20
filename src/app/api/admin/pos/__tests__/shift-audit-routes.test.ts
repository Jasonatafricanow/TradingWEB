import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requirePosOperatorSession: vi.fn(),
  openShift: vi.fn(),
  getCurrentShift: vi.fn(),
  recordCashMovement: vi.fn(),
  closeShift: vi.fn(),
  uploadAuditBatch: vi.fn(),
}));

vi.mock("@/services/auth/auth-middleware", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/services/admin/pos-operator-session-service", () => ({
  requirePosOperatorSession: mocks.requirePosOperatorSession,
}));
vi.mock("@/services/admin/pos-shift-service", () => ({
  openShift: mocks.openShift,
  getCurrentShift: mocks.getCurrentShift,
  recordCashMovement: mocks.recordCashMovement,
  closeShift: mocks.closeShift,
}));
vi.mock("@/services/admin/pos-audit-outbox-service", () => ({ uploadAuditBatch: mocks.uploadAuditBatch }));

const operator = {
  accountUserId: "user-1", staffId: "staff-1", storeId: "store-1", deviceId: "device-1", permissions: ["checkout"],
};

function post(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "user-1", staffId: "staff-1", role: "operator" });
  mocks.requirePosOperatorSession.mockResolvedValue(operator);
});

describe("Task 10 POS routes", () => {
  it("opens a shift from the authenticated operator context", async () => {
    mocks.openShift.mockResolvedValue({ id: "shift-1", status: "open" });
    const { POST } = await import("../shifts/route");
    const response = await POST(post("https://example.test/api/admin/pos/shifts", { opening_float: "100.00" }) as never);

    expect(response.status).toBe(201);
    expect(mocks.openShift).toHaveBeenCalledWith({ opening_float: "100.00", operator });
  });

  it("recovers the current shift from the authenticated operator session", async () => {
    mocks.getCurrentShift.mockResolvedValue({ id: "shift-1", store_id: "store-1", status: "open" });
    const { GET } = await import("../shifts/current/route");
    const response = await GET(new Request("https://example.test/api/admin/pos/shifts/current") as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { id: "shift-1", store_id: "store-1", status: "open" } });
    expect(mocks.getCurrentShift).toHaveBeenCalledWith({ operator });
  });

  it("returns a stable null contract when the operator store has no open shift", async () => {
    mocks.getCurrentShift.mockResolvedValue(null);
    const { GET } = await import("../shifts/current/route");
    const response = await GET(new Request("https://example.test/api/admin/pos/shifts/current") as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: null });
  });

  it("records cash movement against the path shift and operator session", async () => {
    mocks.recordCashMovement.mockResolvedValue({ id: "movement-1" });
    const { POST } = await import("../shifts/[id]/cash-movements/route");
    const response = await POST(post("https://example.test/api/admin/pos/shifts/shift-1/cash-movements", {
      kind: "out", amount: "5.00", reason: "Courier", idempotency_key: "cash-1",
    }) as never, { params: Promise.resolve({ id: "shift-1" }) });

    expect(response.status).toBe(201);
    expect(mocks.recordCashMovement).toHaveBeenCalledWith(expect.objectContaining({
      shift_id: "shift-1", idempotency_key: "cash-1", operator,
    }));
  });

  it("closes the path shift using the idempotency key and server service", async () => {
    mocks.closeShift.mockResolvedValue({ id: "shift-1", status: "closed", expected_cash: "95.00" });
    const { POST } = await import("../shifts/[id]/close/route");
    const response = await POST(post("https://example.test/api/admin/pos/shifts/shift-1/close", {
      counted_cash: "95.00", idempotency_key: "close-1",
    }) as never, { params: Promise.resolve({ id: "shift-1" }) });

    expect(response.status).toBe(200);
    expect(mocks.closeShift).toHaveBeenCalledWith(expect.objectContaining({
      shift_id: "shift-1", counted_cash: "95.00", idempotency_key: "close-1", operator,
    }));
  });

  it("uploads device audit records under the authenticated device identity", async () => {
    const records = [{ id: "00000000-0000-4000-8000-000000000002" }];
    mocks.uploadAuditBatch.mockResolvedValue({ accepted: 1, duplicates: 0 });
    const { POST } = await import("../audit-logs/batch/route");
    const response = await POST(post("https://example.test/api/admin/pos/audit-logs/batch", { records }) as never);

    expect(response.status).toBe(200);
    expect(mocks.uploadAuditBatch).toHaveBeenCalledWith({ records, operator });
  });
});
