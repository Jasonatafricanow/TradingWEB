import { describe, expect, it, vi } from "vitest";

import { dispatchAuditOutbox, uploadAuditBatch } from "../pos-audit-outbox-service";

const event = {
  id: "00000000-0000-4000-8000-000000000001",
  eventType: "pos.checkout.completed",
  entityType: "order",
  entityId: "order-1",
  storeId: "store-1",
  operatorId: "staff-1",
  payload: { total: "10.00" },
  attempts: 0,
};

describe("POS audit outbox", () => {
  it("rejects malformed device batches as a typed client error", async () => {
    await expect(uploadAuditBatch({
      records: [{ id: "not-a-uuid", hash: "bad" }],
      operator: {
        accountUserId: "user-1", staffId: "staff-1", storeId: "store-1", deviceId: "device-1", permissions: [],
      },
    })).rejects.toMatchObject({ code: "AUDIT_BATCH_REQUEST_INVALID", status: 400 });
  });

  it("retains a failed event, schedules retry, then delivers it exactly once", async () => {
    let pending = true;
    const auditIds = new Set<string>();
    const deps = {
      listDueEvents: vi.fn(async () => pending ? [event] : []),
      insertAuditLog: vi.fn()
        .mockRejectedValueOnce(new Error("audit unavailable"))
        .mockImplementationOnce(async (row: { id: string }) => { auditIds.add(row.id); }),
      markProcessed: vi.fn(async () => { pending = false; }),
      markFailed: vi.fn().mockResolvedValue(undefined),
    };
    const now = new Date("2026-07-18T10:00:00.000Z");

    await expect(dispatchAuditOutbox({ limit: 10, now }, deps as never)).resolves.toEqual({ processed: 0, failed: 1 });
    expect(deps.markFailed).toHaveBeenCalledWith(event.id, 1, expect.any(Date));
    expect(pending).toBe(true);

    await expect(dispatchAuditOutbox({ limit: 10, now: new Date("2026-07-18T11:00:00.000Z") }, deps as never))
      .resolves.toEqual({ processed: 1, failed: 0 });
    await dispatchAuditOutbox({ limit: 10, now: new Date("2026-07-18T12:00:00.000Z") }, deps as never);
    expect(auditIds).toEqual(new Set([event.id]));
    expect(deps.insertAuditLog).toHaveBeenCalledTimes(2);
  });

  it("converges after audit insert succeeds but marking processed fails", async () => {
    let pending = true;
    const auditIds = new Set<string>();
    const deps = {
      listDueEvents: vi.fn(async () => pending ? [event] : []),
      insertAuditLog: vi.fn(async (row: { id: string }) => {
        if (auditIds.has(row.id)) {
          throw Object.assign(new Error("duplicate audit identity"), { code: "ER_DUP_ENTRY", errno: 1062 });
        }
        auditIds.add(row.id);
      }),
      markProcessed: vi.fn()
        .mockRejectedValueOnce(new Error("processed marker unavailable"))
        .mockImplementationOnce(async () => { pending = false; }),
      markFailed: vi.fn().mockResolvedValue(undefined),
    };

    await expect(dispatchAuditOutbox({ now: new Date("2026-07-18T10:00:00.000Z") }, deps as never))
      .resolves.toEqual({ processed: 0, failed: 1 });
    expect(auditIds).toEqual(new Set([event.id]));
    expect(pending).toBe(true);

    await expect(dispatchAuditOutbox({ now: new Date("2026-07-18T11:00:00.000Z") }, deps as never))
      .resolves.toEqual({ processed: 1, failed: 0 });
    expect(auditIds).toEqual(new Set([event.id]));
    expect(pending).toBe(false);
    expect(deps.insertAuditLog).toHaveBeenCalledTimes(2);
  });

  it("deduplicates stable local UUIDs and binds uploads to the operator device", async () => {
    const seen = new Map<string, Record<string, unknown>>();
    const insertDeviceAudit = vi.fn(async (row: Record<string, unknown> & { id: string }) => {
      if (seen.has(row.id)) return false;
      seen.set(row.id, row);
      return true;
    });
    const record = {
      id: "00000000-0000-4000-8000-000000000002",
      event_type: "cart.item.added",
      entity_type: "cart",
      entity_id: null,
      payload: { sku: "SKU-1" },
      hash: "a".repeat(64),
      prev_hash: null,
      occurred_at: "2026-07-18T09:00:00.000Z",
    };
    const operator = {
      accountUserId: "user-1", staffId: "staff-1", storeId: "store-1", deviceId: "device-1", permissions: [],
    };

    const result = await uploadAuditBatch({ records: [record, record], operator }, {
      insertDeviceAudit,
      findDeviceAuditById: vi.fn(async (id: string) => seen.get(id) ?? null),
      now: () => new Date("2026-07-18T10:00:00.000Z"),
    } as never);

    expect(result).toEqual({ accepted: 1, duplicates: 1 });
    expect(insertDeviceAudit).toHaveBeenCalledWith(expect.objectContaining({
      id: record.id, deviceId: "device-1", storeId: "store-1", operatorId: "staff-1",
      uploadedAt: new Date("2026-07-18T10:00:00.000Z"),
    }));
  });

  it("rejects conflicting reuse of a device audit UUID", async () => {
    const existing = {
      id: "00000000-0000-4000-8000-000000000002",
      deviceId: "device-1",
      storeId: "store-1",
      operatorId: "staff-1",
      eventType: "cart.item.added",
      entityType: "cart",
      entityId: null,
      payload: { sku: "SKU-1" },
      hash: "a".repeat(64),
      prevHash: null,
      occurredAt: new Date("2026-07-18T09:00:00.000Z"),
      uploadedAt: new Date("2026-07-18T09:01:00.000Z"),
    };
    const operator = {
      accountUserId: "user-1", staffId: "staff-1", storeId: "store-1", deviceId: "device-1", permissions: [],
    };

    await expect(uploadAuditBatch({ records: [{
      id: existing.id,
      event_type: existing.eventType,
      entity_type: existing.entityType,
      entity_id: existing.entityId,
      payload: { sku: "FORGED" },
      hash: existing.hash,
      prev_hash: existing.prevHash,
      occurred_at: existing.occurredAt.toISOString(),
    }], operator }, {
      insertDeviceAudit: vi.fn().mockResolvedValue(false),
      findDeviceAuditById: vi.fn().mockResolvedValue(existing),
      now: () => new Date("2026-07-18T10:00:00.000Z"),
    } as never)).rejects.toMatchObject({ code: "AUDIT_UUID_CONFLICT", status: 409 });
  });
});
