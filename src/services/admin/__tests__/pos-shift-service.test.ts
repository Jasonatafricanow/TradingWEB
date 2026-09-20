import { describe, expect, it, vi } from "vitest";

import {
  closeShift,
  getCurrentShift,
  openShift,
  reconcileCashEntries,
  recordCashMovement,
  sumUnambiguousCashRefunds,
} from "../pos-shift-service";

const operator = {
  accountUserId: "user-1",
  staffId: "staff-1",
  storeId: "store-1",
  deviceId: "device-1",
  permissions: ["checkout"],
};

function dependencies() {
  const tx = { tx: true };
  const open = {
    id: "shift-1", storeId: "store-1", openedBy: "staff-1", closedBy: null,
    status: "open", openingFloat: "100.00", expectedCash: null, countedCash: null,
    differenceCash: null, openedAt: new Date("2026-07-18T08:00:00.000Z"), closedAt: null,
  };
  const deps = {
    transaction: vi.fn(async (work) => work(tx)),
    runIdempotent: vi.fn(async (_input, work) => work()),
    lockStore: vi.fn().mockResolvedValue(true),
    findOpenShift: vi.fn().mockResolvedValue(null),
    getOpenShift: vi.fn().mockResolvedValue(open),
    lockShift: vi.fn().mockResolvedValue(open),
    insertShift: vi.fn().mockResolvedValue(undefined),
    findCashMovementByKey: vi.fn().mockResolvedValue(null),
    insertCashMovement: vi.fn().mockResolvedValue(undefined),
    reconcileCash: vi.fn().mockResolvedValue({
      cashSalesCents: 12000,
      cashRefundsCents: 3000,
      cashInCents: 2000,
      cashOutCents: 500,
    }),
    updateClosedShift: vi.fn().mockResolvedValue(undefined),
    enqueueAuditEvent: vi.fn().mockResolvedValue(undefined),
    newId: vi.fn().mockReturnValueOnce("shift-1").mockReturnValueOnce("movement-1"),
    now: vi.fn().mockReturnValue(new Date("2026-07-18T18:00:00.000Z")),
  };
  return { deps, tx, open };
}

describe("POS shift lifecycle", () => {
  it("counts only unambiguous single-tender cash refunds", () => {
    expect(sumUnambiguousCashRefunds([
      { amount: "30.00", orderPaymentMethod: "cash" },
      { amount: "40.00", orderPaymentMethod: "split" },
      { amount: "50.00", orderPaymentMethod: null },
      { amount: "60.00", orderPaymentMethod: "card" },
    ])).toBe(3000);
  });

  it("reconciles the full cash lifecycle while excluding card sales", () => {
    expect(reconcileCashEntries({
      payments: [
        { method: "cash", amount: "120.00" },
        { method: "card", amount: "70.00" },
      ],
      refunds: [
        { amount: "30.00", orderPaymentMethod: "cash", isExchangeAccounting: false },
        { amount: "10.00", orderPaymentMethod: "split", isExchangeAccounting: false },
      ],
      movements: [
        { kind: "in", amount: "20.00" },
        { kind: "out", amount: "5.00" },
      ],
    })).toEqual({ cashSalesCents: 12000, cashRefundsCents: 3000, cashInCents: 2000, cashOutCents: 500 });
  });

  it("keeps cash unchanged for an equal-value cash exchange", () => {
    expect(reconcileCashEntries({
      payments: [
        { method: "cash", amount: "25.00" },
        { method: "exchange_credit", amount: "25.00" },
      ],
      refunds: [{ amount: "25.00", orderPaymentMethod: "cash", isExchangeAccounting: true }],
      movements: [],
    })).toEqual({ cashSalesCents: 2500, cashRefundsCents: 0, cashInCents: 0, cashOutCents: 0 });
  });

  it("counts only the paid cash difference for a higher-value exchange", () => {
    expect(reconcileCashEntries({
      payments: [
        { method: "cash", amount: "25.00" },
        { method: "exchange_credit", amount: "25.00" },
        { method: "cash", amount: "5.00" },
      ],
      refunds: [{ amount: "25.00", orderPaymentMethod: "cash", isExchangeAccounting: true }],
      movements: [],
    })).toEqual({ cashSalesCents: 3000, cashRefundsCents: 0, cashInCents: 0, cashOutCents: 0 });
  });

  it("does not invent a cash payout tender for a lower-value exchange", () => {
    expect(reconcileCashEntries({
      payments: [
        { method: "cash", amount: "25.00" },
        { method: "exchange_credit", amount: "20.00" },
      ],
      refunds: [{ amount: "25.00", orderPaymentMethod: "cash", isExchangeAccounting: true }],
      movements: [],
    })).toEqual({ cashSalesCents: 2500, cashRefundsCents: 0, cashInCents: 0, cashOutCents: 0 });
  });

  it("binds an opened shift to the authenticated operator store", async () => {
    const { deps, tx } = dependencies();
    const result = await openShift({ opening_float: "100.00", operator }, deps as never);

    expect(deps.lockStore).toHaveBeenCalledWith("store-1", tx);
    expect(deps.findOpenShift).toHaveBeenCalledWith("store-1", tx);
    expect(deps.insertShift).toHaveBeenCalledWith(expect.objectContaining({
      id: "shift-1", storeId: "store-1", openedBy: "staff-1", openingFloat: "100.00",
    }), tx);
    expect(result).toMatchObject({ id: "shift-1", store_id: "store-1", status: "open" });
  });

  it("recovers the current open shift for the authenticated operator store", async () => {
    const { deps, open } = dependencies();

    await expect(getCurrentShift({ operator }, deps as never)).resolves.toMatchObject({
      id: open.id,
      store_id: "store-1",
      status: "open",
    });
    expect(deps.getOpenShift).toHaveBeenCalledWith("store-1");
  });

  it("fails closed if current-shift storage returns another store", async () => {
    const { deps, open } = dependencies();
    deps.getOpenShift.mockResolvedValueOnce({ ...open, storeId: "store-2" });

    await expect(getCurrentShift({ operator }, deps as never)).rejects.toMatchObject({
      code: "SHIFT_STORE_MISMATCH",
      status: 403,
    });
  });

  it("replays one cash movement under concurrent duplicate submissions", async () => {
    const { deps } = dependencies();
    const records = new Map<string, Record<string, unknown>>();
    deps.findCashMovementByKey.mockImplementation(async (key: string) => records.get(key) ?? null);
    deps.insertCashMovement.mockImplementation(async (movement: Record<string, unknown>) => {
      if (records.has(String(movement.idempotencyKey))) {
        throw Object.assign(new Error("duplicate"), { code: "ER_DUP_ENTRY", errno: 1062 });
      }
      records.set(String(movement.idempotencyKey), movement);
    });
    const input = {
      shift_id: "shift-1", kind: "in" as const, amount: "20.00", reason: "Petty cash",
      idempotency_key: "cash-1", operator,
    };

    const [first, replay] = await Promise.all([
      recordCashMovement(input, deps as never),
      recordCashMovement(input, deps as never),
    ]);

    expect(first.id).toBe(replay.id);
    expect(records.size).toBe(1);
  });

  it("closes with the server-authoritative formula and enqueues audit in the same transaction", async () => {
    const { deps, tx } = dependencies();
    const result = await closeShift({
      shift_id: "shift-1", counted_cash: "195.00", idempotency_key: "close-1", operator,
    }, deps as never);

    expect(result).toMatchObject({
      expected_cash: "205.00", counted_cash: "195.00", difference_cash: "-10.00",
      reconciliation: { cash_sales: "120.00", cash_refunds: "30.00", cash_in: "20.00", cash_out: "5.00" },
    });
    expect(deps.updateClosedShift).toHaveBeenCalledWith(expect.objectContaining({
      shiftId: "shift-1", expectedCash: "205.00", differenceCash: "-10.00", closedBy: "staff-1",
    }), tx);
    expect(deps.enqueueAuditEvent).toHaveBeenCalledWith(tx, expect.objectContaining({
      eventType: "pos.shift.closed", entityId: "shift-1", storeId: "store-1", operatorId: "staff-1",
    }));
    expect(deps.runIdempotent).toHaveBeenCalledWith(
      expect.objectContaining({ key: "close-1", operation: "shift_close", storeId: "store-1" }),
      expect.any(Function),
      expect.objectContaining({ resourceType: "shift", responseStatus: 200 }),
    );
  });
});
