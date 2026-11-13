import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  notifications: new Map<string, Record<string, unknown>>(),
  emails: new Map<string, Record<string, unknown>>(),
  staff: [] as Array<{ user_id: string | null; role: string; store_id: string | null }>,
  failNotifications: false,
}));

vi.mock("drizzle-orm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("drizzle-orm")>()),
  eq: (column: { name: string }, value: unknown) => ({ column: column.name, value }),
  and: (...parts: unknown[]) => parts,
  inArray: (column: { name: string }, values: unknown[]) => ({ column: column.name, values }),
}));

vi.mock("@/lib/db", async () => {
  const schema = await import("@/storage/database/shared/schema");
  const rowsFor = (table: unknown) => {
    if (table === schema.staff) return state.staff;
    if (table === schema.users) return [{ email: "account@example.com" }];
    if (table === schema.orderItems) return [{ title: "Drill" }, { title: "Bits" }];
    if (table === schema.emailLogs) return [...state.emails.values()];
    return [];
  };
  const where = (table: unknown, cond?: { column: string; value: unknown }) => {
    const rows = rowsFor(table).filter((row) => !cond || !("column" in (cond ?? {})) || table !== schema.emailLogs
      || (row as Record<string, unknown>)[cond.column] === cond.value);
    const result = Promise.resolve(rows) as Promise<unknown[]> & { limit: () => Promise<unknown[]> };
    result.limit = async () => rows;
    return result;
  };
  const insert = (table: unknown) => ({
    values: (values: Record<string, unknown>) => ({
      onDuplicateKeyUpdate: async () => {
        const target = table === schema.notifications ? state.notifications : state.emails;
        if (table === schema.notifications && state.failNotifications) throw new Error("notifications table missing");
        const key = (values.dedupe_key as string | null) ?? `nokey:${values.id}`;
        if (!target.has(key)) target.set(key, values);
      },
    }),
  });
  const executor = {
    select: () => ({ from: (table: unknown) => ({ where: (cond: { column: string; value: unknown }) => where(table, cond) }) }),
    insert,
    transaction: async <T>(work: (tx: unknown) => Promise<T>) => work(executor),
  };
  return { db: { ...executor, $client: { execute: vi.fn() } } };
});

vi.mock("@/services/notifications/email-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/notifications/email-service")>();
  return { ...actual, deliverQueuedEmailSafely: vi.fn() };
});

import { db } from "@/lib/db";
import { recordOrderPaidEvents, recordRefundRequestedEvent } from "@/services/notifications/order-notification-service";

const order = { id: "o1", order_no: "A1001", total_amount: "90.00", currency: "USD", store_id: "s1", user_id: "u1", buyer_email: null, source: "web" };

describe("order event notifications", () => {
  beforeEach(() => {
    state.notifications.clear();
    state.emails.clear();
    state.failNotifications = false;
    state.staff = [
      { user_id: "admin-1", role: "admin", store_id: "s2" },
      { user_id: "op-s1", role: "operator", store_id: "s1" },
      { user_id: "op-s2", role: "operator", store_id: "s2" },
      { user_id: "op-hq", role: "operator", store_id: null },
      { user_id: null, role: "operator", store_id: "s1" },
    ];
  });

  it("notifies admins and same-store or head-office operators, once per recipient", async () => {
    await recordOrderPaidEvents(order, db as never);
    await recordOrderPaidEvents(order, db as never); // duplicated payment callback
    const recipients = [...state.notifications.values()].map((n) => n.user_id).sort();
    expect(recipients).toEqual(["admin-1", "op-hq", "op-s1"]);
    expect([...state.notifications.keys()]).toContain("order-paid:o1:op-s1");
  });

  it("queues one confirmation email to the account address and reports it only when newly queued", async () => {
    const first = await recordOrderPaidEvents(order, db as never);
    const second = await recordOrderPaidEvents(order, db as never);
    expect(state.emails.size).toBe(1);
    const email = state.emails.get("order-confirmation:o1")!;
    expect(email).toMatchObject({ to_email: "account@example.com", status: "queued", order_id: "o1" });
    expect(String(email.body)).toContain("Drill, Bits");
    expect(first).toBe(email.id);
    expect(second).toBeNull();
  });

  it("skips customer email for POS walk-in orders without an address", async () => {
    await recordOrderPaidEvents({ ...order, source: "pos" }, db as never);
    expect(state.emails.size).toBe(0);
  });

  it("does not let a notification failure break the payment transaction", async () => {
    state.failNotifications = true;
    await expect(recordOrderPaidEvents(order, db as never)).resolves.toBeTruthy();
    expect(state.emails.size).toBe(1);
  });

  it("keys refund notices by refund so two refunds on one order both notify", async () => {
    await recordRefundRequestedEvent(order, { id: "r1", amount: "10.00" }, db as never);
    await recordRefundRequestedEvent(order, { id: "r1", amount: "10.00" }, db as never);
    await recordRefundRequestedEvent(order, { id: "r2", amount: "5.00" }, db as never);
    expect(state.notifications.size).toBe(6);
  });
});
