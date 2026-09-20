import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { formatCents, parseMoneyToCents } from "@/services/orders/order-money";
import type { DbTx } from "@/services/orders/order-pricing-service";
import {
  orderPayments,
  orders,
  posCashMovements,
  posExchanges,
  posShifts,
  refunds,
  stores,
} from "@/storage/database/shared/schema";
import { enqueuePosAuditEvent, type EnqueuePosAuditEvent } from "./pos-audit-outbox-service";
import { hashPosRequest } from "./pos-contracts";
import { PosApiError } from "./pos-errors";
import { runIdempotent, type IdempotencyCompletion, type IdempotencyInput } from "./pos-idempotency-service";
import type { PosOperatorContext } from "./pos-operator-session-service";

export interface PosShiftRecord {
  id: string;
  storeId: string;
  openedBy: string;
  closedBy: string | null;
  status: string;
  openingFloat: string;
  expectedCash: string | null;
  countedCash: string | null;
  differenceCash: string | null;
  openedAt: Date;
  closedAt: Date | null;
}

interface PosCashMovementRecord {
  id: string;
  shiftId: string;
  kind: "in" | "out";
  amount: string;
  reason: string;
  operatorId: string;
  idempotencyKey: string;
  createdAt: Date;
}

export interface PosCashReconciliation {
  cashSalesCents: number;
  cashRefundsCents: number;
  cashInCents: number;
  cashOutCents: number;
}

export interface PosShiftDependencies {
  transaction<T>(work: (tx: DbTx) => Promise<T>): Promise<T>;
  runIdempotent<T>(input: IdempotencyInput, work: () => Promise<T>, completion?: IdempotencyCompletion<T>): Promise<T>;
  lockStore(storeId: string, tx: DbTx): Promise<boolean>;
  findOpenShift(storeId: string, tx: DbTx): Promise<PosShiftRecord | null>;
  getOpenShift(storeId: string): Promise<PosShiftRecord | null>;
  lockShift(shiftId: string, tx: DbTx): Promise<PosShiftRecord | null>;
  insertShift(shift: PosShiftRecord, tx: DbTx): Promise<void>;
  findCashMovementByKey(key: string, tx: DbTx): Promise<PosCashMovementRecord | null>;
  insertCashMovement(movement: PosCashMovementRecord, tx: DbTx): Promise<void>;
  reconcileCash(shiftId: string, tx: DbTx): Promise<PosCashReconciliation>;
  updateClosedShift(input: {
    shiftId: string;
    expectedCash: string;
    countedCash: string;
    differenceCash: string;
    closedBy: string;
    closedAt: Date;
  }, tx: DbTx): Promise<void>;
  enqueueAuditEvent: EnqueuePosAuditEvent;
  newId(): string;
  now(): Date;
}

function toShiftRecord(row: typeof posShifts.$inferSelect): PosShiftRecord {
  return {
    id: row.id,
    storeId: row.store_id,
    openedBy: row.opened_by,
    closedBy: row.closed_by,
    status: row.status,
    openingFloat: row.opening_float,
    expectedCash: row.expected_cash,
    countedCash: row.counted_cash,
    differenceCash: row.difference_cash,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
  };
}

export function sumUnambiguousCashRefunds(
  entries: Array<{ amount: string; orderPaymentMethod: string | null; isExchangeAccounting?: boolean }>,
): number {
  return entries.reduce((sum, entry) => entry.orderPaymentMethod === "cash" && !entry.isExchangeAccounting
    ? sum + parseMoneyToCents(entry.amount)
    : sum, 0);
}

export function reconcileCashEntries(input: {
  payments: Array<{ method: string; amount: string }>;
  refunds: Array<{ amount: string; orderPaymentMethod: string | null; isExchangeAccounting?: boolean }>;
  movements: Array<{ kind: string; amount: string }>;
}): PosCashReconciliation {
  return {
    cashSalesCents: input.payments.reduce((sum, row) => row.method === "cash"
      ? sum + parseMoneyToCents(row.amount)
      : sum, 0),
    cashRefundsCents: sumUnambiguousCashRefunds(input.refunds),
    cashInCents: input.movements.reduce((sum, row) => row.kind === "in"
      ? sum + parseMoneyToCents(row.amount)
      : sum, 0),
    cashOutCents: input.movements.reduce((sum, row) => row.kind === "out"
      ? sum + parseMoneyToCents(row.amount)
      : sum, 0),
  };
}

const databaseShiftDependencies: PosShiftDependencies = {
  transaction: (work) => db.transaction(work),
  runIdempotent,
  async lockStore(storeId, tx) {
    const [store] = await tx.select({ id: stores.id, status: stores.status }).from(stores)
      .where(eq(stores.id, storeId)).for("update").limit(1);
    return store?.status === "active";
  },
  async findOpenShift(storeId, tx) {
    const [row] = await tx.select().from(posShifts).where(and(
      eq(posShifts.store_id, storeId),
      eq(posShifts.status, "open"),
    )).for("update").limit(1);
    return row ? toShiftRecord(row) : null;
  },
  async getOpenShift(storeId) {
    const [row] = await db.select().from(posShifts).where(and(
      eq(posShifts.store_id, storeId),
      eq(posShifts.status, "open"),
    )).limit(1);
    return row ? toShiftRecord(row) : null;
  },
  async lockShift(shiftId, tx) {
    const [row] = await tx.select().from(posShifts).where(eq(posShifts.id, shiftId)).for("update").limit(1);
    return row ? toShiftRecord(row) : null;
  },
  async insertShift(shift, tx) {
    await tx.insert(posShifts).values({
      id: shift.id,
      store_id: shift.storeId,
      opened_by: shift.openedBy,
      closed_by: shift.closedBy,
      status: shift.status,
      opening_float: shift.openingFloat,
      expected_cash: shift.expectedCash,
      counted_cash: shift.countedCash,
      difference_cash: shift.differenceCash,
      opened_at: shift.openedAt,
      closed_at: shift.closedAt,
    });
  },
  async findCashMovementByKey(key, tx) {
    const [row] = await tx.select().from(posCashMovements)
      .where(eq(posCashMovements.idempotency_key, key)).for("update").limit(1);
    return row ? {
      id: row.id,
      shiftId: row.shift_id,
      kind: row.kind as "in" | "out",
      amount: row.amount,
      reason: row.reason,
      operatorId: row.operator_id,
      idempotencyKey: row.idempotency_key,
      createdAt: row.created_at,
    } : null;
  },
  async insertCashMovement(movement, tx) {
    await tx.insert(posCashMovements).values({
      id: movement.id,
      shift_id: movement.shiftId,
      kind: movement.kind,
      amount: movement.amount,
      reason: movement.reason,
      operator_id: movement.operatorId,
      idempotency_key: movement.idempotencyKey,
      created_at: movement.createdAt,
    });
  },
  async reconcileCash(shiftId, tx) {
    const payments = await tx.select({ method: orderPayments.method, amount: orderPayments.amount }).from(orderPayments)
      .innerJoin(orders, eq(orderPayments.order_id, orders.id)).where(and(
        eq(orders.shift_id, shiftId),
        eq(orderPayments.status, "recorded"),
      ));
    const refundRows = await tx.select({
      amount: refunds.amount,
      orderPaymentMethod: orders.payment_method,
      exchangeId: posExchanges.id,
    }).from(refunds)
      .innerJoin(orders, eq(refunds.order_id, orders.id))
      .leftJoin(posExchanges, eq(posExchanges.refund_id, refunds.id))
      .where(and(
      eq(refunds.shift_id, shiftId),
      eq(refunds.status, "completed"),
    ));
    const movements = await tx.select({ kind: posCashMovements.kind, amount: posCashMovements.amount })
      .from(posCashMovements).where(eq(posCashMovements.shift_id, shiftId));
    return reconcileCashEntries({
      payments,
      refunds: refundRows.map((row) => ({
        amount: row.amount,
        orderPaymentMethod: row.orderPaymentMethod,
        isExchangeAccounting: row.exchangeId !== null,
      })),
      movements,
    });
  },
  async updateClosedShift(input, tx) {
    await tx.update(posShifts).set({
      status: "closed",
      expected_cash: input.expectedCash,
      counted_cash: input.countedCash,
      difference_cash: input.differenceCash,
      closed_by: input.closedBy,
      closed_at: input.closedAt,
    }).where(and(eq(posShifts.id, input.shiftId), eq(posShifts.status, "open")));
  },
  enqueueAuditEvent: enqueuePosAuditEvent,
  newId: randomUUID,
  now: () => new Date(),
};

function money(value: string, field: string, positive = false): string {
  let cents: number;
  try {
    cents = parseMoneyToCents(value);
  } catch {
    throw new PosApiError("MONEY_INVALID", `${field} must be a decimal amount`, 400);
  }
  if (cents < 0 || (positive && cents === 0)) {
    throw new PosApiError("MONEY_INVALID", `${field} must be ${positive ? "positive" : "non-negative"}`, 400);
  }
  return formatCents(cents);
}

function shiftDto(shift: PosShiftRecord) {
  return {
    id: shift.id,
    store_id: shift.storeId,
    opened_by: shift.openedBy,
    closed_by: shift.closedBy,
    status: shift.status,
    opening_float: shift.openingFloat,
    expected_cash: shift.expectedCash,
    counted_cash: shift.countedCash,
    difference_cash: shift.differenceCash,
    opened_at: shift.openedAt.toISOString(),
    closed_at: shift.closedAt?.toISOString() ?? null,
  };
}

function assertShiftAccess(shift: PosShiftRecord, operator: PosOperatorContext): void {
  if (shift.storeId !== operator.storeId) {
    throw new PosApiError("SHIFT_STORE_MISMATCH", "Shift belongs to another store", 403);
  }
}

function assertOpen(shift: PosShiftRecord): void {
  if (shift.status !== "open") throw new PosApiError("SHIFT_CLOSED", "Shift is already closed", 409);
}

export async function openShift(
  input: { opening_float: string; operator: PosOperatorContext },
  dependencies: PosShiftDependencies = databaseShiftDependencies,
) {
  const openingFloat = money(input.opening_float, "opening_float");
  return dependencies.transaction(async (tx) => {
    if (!await dependencies.lockStore(input.operator.storeId, tx)) {
      throw new PosApiError("STORE_UNAVAILABLE", "Store not found or inactive", 409);
    }
    if (await dependencies.findOpenShift(input.operator.storeId, tx)) {
      throw new PosApiError("SHIFT_ALREADY_OPEN", "Store already has an open shift", 409);
    }
    const shift: PosShiftRecord = {
      id: dependencies.newId(),
      storeId: input.operator.storeId,
      openedBy: input.operator.staffId,
      closedBy: null,
      status: "open",
      openingFloat,
      expectedCash: null,
      countedCash: null,
      differenceCash: null,
      openedAt: dependencies.now(),
      closedAt: null,
    };
    await dependencies.insertShift(shift, tx);
    return shiftDto(shift);
  });
}

export async function getCurrentShift(
  input: { operator: PosOperatorContext },
  dependencies: PosShiftDependencies = databaseShiftDependencies,
) {
  const shift = await dependencies.getOpenShift(input.operator.storeId);
  if (!shift) return null;
  assertShiftAccess(shift, input.operator);
  return shiftDto(shift);
}

function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; errno?: number; cause?: { code?: string; errno?: number } };
  return candidate.code === "ER_DUP_ENTRY" || candidate.errno === 1062
    || candidate.cause?.code === "ER_DUP_ENTRY" || candidate.cause?.errno === 1062;
}

function movementDto(movement: PosCashMovementRecord) {
  return {
    id: movement.id,
    shift_id: movement.shiftId,
    kind: movement.kind,
    amount: movement.amount,
    reason: movement.reason,
    operator_id: movement.operatorId,
    idempotency_key: movement.idempotencyKey,
    created_at: movement.createdAt.toISOString(),
  };
}

function replayMovement(existing: PosCashMovementRecord, requested: PosCashMovementRecord) {
  if (
    existing.shiftId !== requested.shiftId || existing.kind !== requested.kind
    || existing.amount !== requested.amount || existing.reason !== requested.reason
    || existing.operatorId !== requested.operatorId
  ) {
    throw new PosApiError("IDEMPOTENCY_KEY_REUSED", "Cash movement idempotency key was reused", 409);
  }
  return movementDto(existing);
}

export async function recordCashMovement(
  input: {
    shift_id: string;
    kind: "in" | "out";
    amount: string;
    reason: string;
    idempotency_key: string;
    operator: PosOperatorContext;
  },
  dependencies: PosShiftDependencies = databaseShiftDependencies,
) {
  const amount = money(input.amount, "amount", true);
  const reason = input.reason.trim();
  const key = input.idempotency_key.trim();
  if (!reason || reason.length > 255) throw new PosApiError("CASH_REASON_INVALID", "reason is required", 400);
  if (!key || key.length > 160) throw new PosApiError("IDEMPOTENCY_KEY_INVALID", "idempotency_key is required", 400);
  if (input.kind !== "in" && input.kind !== "out") throw new PosApiError("CASH_KIND_INVALID", "kind must be in or out", 400);

  return dependencies.transaction(async (tx) => {
    const shift = await dependencies.lockShift(input.shift_id, tx);
    if (!shift) throw new PosApiError("SHIFT_NOT_FOUND", "Shift not found", 404);
    assertShiftAccess(shift, input.operator);
    assertOpen(shift);
    const requested: PosCashMovementRecord = {
      id: dependencies.newId(),
      shiftId: shift.id,
      kind: input.kind,
      amount,
      reason,
      operatorId: input.operator.staffId,
      idempotencyKey: key,
      createdAt: dependencies.now(),
    };
    const existing = await dependencies.findCashMovementByKey(key, tx);
    if (existing) return replayMovement(existing, requested);
    try {
      await dependencies.insertCashMovement(requested, tx);
      return movementDto(requested);
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      const replay = await dependencies.findCashMovementByKey(key, tx);
      if (!replay) throw error;
      return replayMovement(replay, requested);
    }
  });
}

export async function closeShift(
  input: { shift_id: string; counted_cash: string; idempotency_key: string; operator: PosOperatorContext },
  dependencies: PosShiftDependencies = databaseShiftDependencies,
) {
  const countedCash = money(input.counted_cash, "counted_cash");
  const key = input.idempotency_key.trim();
  if (!key || key.length > 160) throw new PosApiError("IDEMPOTENCY_KEY_INVALID", "idempotency_key is required", 400);
  const requestHash = hashPosRequest({ shift_id: input.shift_id, counted_cash: countedCash });
  return dependencies.runIdempotent({
    key,
    operation: "shift_close",
    storeId: input.operator.storeId,
    requestHash,
  }, () => dependencies.transaction(async (tx) => {
    const shift = await dependencies.lockShift(input.shift_id, tx);
    if (!shift) throw new PosApiError("SHIFT_NOT_FOUND", "Shift not found", 404);
    assertShiftAccess(shift, input.operator);
    assertOpen(shift);
    const reconciliation = await dependencies.reconcileCash(shift.id, tx);
    const expectedCashCents = parseMoneyToCents(shift.openingFloat)
      + reconciliation.cashSalesCents
      - reconciliation.cashRefundsCents
      + reconciliation.cashInCents
      - reconciliation.cashOutCents;
    const differenceCashCents = parseMoneyToCents(countedCash) - expectedCashCents;
    const expectedCash = formatCents(expectedCashCents);
    const differenceCash = formatCents(differenceCashCents);
    const closedAt = dependencies.now();
    await dependencies.updateClosedShift({
      shiftId: shift.id,
      expectedCash,
      countedCash,
      differenceCash,
      closedBy: input.operator.staffId,
      closedAt,
    }, tx);
    const result = {
      ...shiftDto({
        ...shift,
        status: "closed",
        closedBy: input.operator.staffId,
        expectedCash,
        countedCash,
        differenceCash,
        closedAt,
      }),
      reconciliation: {
        cash_sales: formatCents(reconciliation.cashSalesCents),
        cash_refunds: formatCents(reconciliation.cashRefundsCents),
        cash_in: formatCents(reconciliation.cashInCents),
        cash_out: formatCents(reconciliation.cashOutCents),
      },
    };
    await dependencies.enqueueAuditEvent(tx, {
      eventType: "pos.shift.closed",
      entityType: "shift",
      entityId: shift.id,
      storeId: shift.storeId,
      operatorId: input.operator.staffId,
      payload: result,
    });
    return result;
  }), {
    responseStatus: 200,
    resourceType: "shift",
    resourceId: input.shift_id,
  });
}

export async function findOpenShiftId(storeId: string, tx: DbTx): Promise<string | null> {
  const shift = await databaseShiftDependencies.findOpenShift(storeId, tx);
  return shift?.id ?? null;
}
