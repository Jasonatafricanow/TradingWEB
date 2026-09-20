import { describe, expect, it, vi } from "vitest";

import { getPosTelemetryHealth, ingestPosTelemetry, type PosTelemetryRepository } from "../pos-telemetry-service";

const operator = { accountUserId: "user-1", staffId: "staff-1", storeId: "store-1", deviceId: "device-1", permissions: ["checkout"] };

describe("POS operational telemetry", () => {
  it("accepts only bounded allow-listed operational facts", async () => {
    const repository: PosTelemetryRepository = {
      insert: vi.fn(async (records) => ({ accepted: records.length, duplicates: 0 })),
      listRecent: vi.fn(),
    };
    const result = await ingestPosTelemetry({
      operator,
      input: { records: [{ id: "11111111-1111-4111-8111-111111111111", type: "sync_failed", code: "NETWORK", pending_count: 3, occurred_at: "2026-07-21T12:00:00.000Z" }] },
      repository,
    });
    expect(result).toEqual({ accepted: 1, duplicates: 0 });
    expect(repository.insert).toHaveBeenCalledWith([expect.objectContaining({ storeId: "store-1", deviceId: "device-1", type: "sync_failed", pendingCount: 3 })]);

    await ingestPosTelemetry({
      operator,
      input: { records: [{ id: "22222222-2222-4222-8222-222222222222", type: "print_failed", driver: "network", message: "Bearer abc token=secret PIN: 1234 user@example.com", occurred_at: "2026-07-21T12:00:00.000Z" }] },
      repository,
    });
    const stored = vi.mocked(repository.insert).mock.calls[1][0][0];
    expect(stored.message).not.toMatch(/abc|secret|1234|user@example/);

    await expect(ingestPosTelemetry({
      operator,
      input: { records: [{ id: "11111111-1111-4111-8111-111111111111", type: "print_failed", driver: "network", message: "failed", token: "secret", occurred_at: "2026-07-21T12:00:00.000Z" }] },
      repository,
    })).rejects.toMatchObject({ status: 400 });
  });

  it("summarizes recent failures and latest sync backlog", async () => {
    const repository: PosTelemetryRepository = {
      insert: vi.fn(),
      listRecent: vi.fn(async () => [
        { type: "sync_failed" as const, pendingCount: 7, occurredAt: new Date("2026-07-21T12:03:00.000Z") },
        { type: "print_failed" as const, occurredAt: new Date("2026-07-21T12:02:00.000Z") },
        { type: "sync_failed" as const, pendingCount: 2, occurredAt: new Date("2026-07-21T12:01:00.000Z") },
      ]),
    };

    await expect(getPosTelemetryHealth({ storeId: "store-1", repository })).resolves.toEqual({
      store_id: "store-1",
      window_hours: 24,
      event_count: 3,
      sync_backlog: 7,
      by_type: { sync_failed: 2, print_failed: 1, scanner_failed: 0, app_error: 0 },
      last_event_at: "2026-07-21T12:03:00.000Z",
    });
  });
});
