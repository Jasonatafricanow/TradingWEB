import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), requireSession: vi.fn(), ingest: vi.fn() }));
vi.mock("@/services/auth/auth-middleware", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/services/admin/pos-operator-session-service", () => ({ requirePosOperatorSession: mocks.requireSession }));
vi.mock("@/services/admin/pos-telemetry-service", async (load) => ({ ...await load<typeof import("@/services/admin/pos-telemetry-service")>(), ingestPosTelemetry: mocks.ingest }));

import { POST } from "../telemetry/route";

describe("POS telemetry route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "user-1", staffId: "staff-1", role: "operator" });
    mocks.requireSession.mockResolvedValue({ staffId: "staff-1", storeId: "store-1", deviceId: "device-1" });
  });

  it("binds records to the authenticated operator device", async () => {
    const records = [{ id: "11111111-1111-4111-8111-111111111111", type: "sync_failed" }];
    mocks.ingest.mockResolvedValue({ accepted: 1, duplicates: 0 });
    const request = new Request("https://example.test/api/admin/pos/telemetry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ records }) });
    const response = await POST(request as never);
    expect(response.status).toBe(200);
    expect(mocks.ingest).toHaveBeenCalledWith(expect.objectContaining({ input: { records }, operator: expect.objectContaining({ deviceId: "device-1" }) }));
  });
});
