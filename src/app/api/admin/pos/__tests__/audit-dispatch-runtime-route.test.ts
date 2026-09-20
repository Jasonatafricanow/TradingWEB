import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ dispatchAuditOutbox: vi.fn() }));

vi.mock("@/services/admin/pos-audit-outbox-service", () => ({
  dispatchAuditOutbox: mocks.dispatchAuditOutbox,
}));

function request(secret?: string) {
  return new Request("https://example.test/api/cron/pos-audit-outbox", {
    method: "POST",
    headers: secret ? { authorization: `Bearer ${secret}` } : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "task-10-secret");
});

describe("POST /api/cron/pos-audit-outbox", () => {
  it("rejects an unauthenticated dispatcher invocation", async () => {
    const { POST } = await import("../../../cron/pos-audit-outbox/route");
    const response = await POST(request() as never);

    expect(response.status).toBe(401);
    expect(mocks.dispatchAuditOutbox).not.toHaveBeenCalled();
  });

  it("dispatches pending audits through the authenticated runtime entrypoint", async () => {
    mocks.dispatchAuditOutbox.mockResolvedValue({ processed: 2, failed: 1 });
    const { POST } = await import("../../../cron/pos-audit-outbox/route");
    const response = await POST(request("task-10-secret") as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { processed: 2, failed: 1 } });
    expect(mocks.dispatchAuditOutbox).toHaveBeenCalledWith();
  });
});
