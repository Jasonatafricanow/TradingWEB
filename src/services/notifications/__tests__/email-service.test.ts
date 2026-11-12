import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = {
  id: string; to_email: string; subject: string; template_key: string | null; status: string;
  error: string | null; order_id: string | null; body: string | null; content_type: string;
  dedupe_key: string | null; retry_of: string | null; provider_message_id: string | null;
  attempts: number; stale?: boolean;
};

const store = vi.hoisted(() => ({ rows: new Map<string, Row>() }));

vi.mock("drizzle-orm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("drizzle-orm")>()),
  eq: (column: { name: string }, value: unknown) => ({ column: column.name, value }),
}));

vi.mock("@/lib/db", () => {
  const find = (cond: { column: string; value: unknown }) =>
    [...store.rows.values()].filter((row) => (row as Record<string, unknown>)[cond.column] === cond.value);
  const select = () => ({
    from: () => ({ where: (cond: { column: string; value: unknown }) => ({ limit: async () => find(cond).map((r) => ({ ...r })) }) }),
  });
  const insert = () => ({
    values: (values: Row) => ({
      onDuplicateKeyUpdate: async () => {
        const clash = values.dedupe_key && [...store.rows.values()].some((r) => r.dedupe_key === values.dedupe_key);
        if (!clash) store.rows.set(values.id, { ...values });
      },
    }),
  });
  const execute = async (sql: string, params: unknown[] = []) => {
    if (sql.includes("SET status = 'sending'")) {
      const row = store.rows.get(params[0] as string);
      if (!row || !(row.status === "queued" || (row.status === "sending" && row.stale))) return [{ affectedRows: 0 }];
      row.status = "sending"; row.attempts += 1; row.error = null; row.stale = false;
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith("UPDATE email_logs SET status = ?")) {
      const [status, error, providerId, id] = params as [string, string | null, string | null, string];
      const row = store.rows.get(id);
      if (!row || row.status !== "sending") return [{ affectedRows: 0 }];
      Object.assign(row, { status, error, provider_message_id: providerId ?? row.provider_message_id });
      return [{ affectedRows: 1 }];
    }
    throw new Error(`unexpected SQL: ${sql}`);
  };
  return { db: { select, insert, $client: { execute } } };
});

import {
  EmailResendNotAllowedError,
  deliverEmail,
  enqueueEmail,
  resendEmailLog,
  sendEmail,
  sendPasswordResetEmail,
} from "@/services/notifications/email-service";

const fetchMock = vi.fn();
const message = { to: "buyer@example.com", subject: "Order confirmation - A1", body: "Thanks", dedupeKey: "order-confirmation:o1" };

describe("email outbox", () => {
  beforeEach(() => {
    store.rows.clear();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "re_123" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "shop@example.com";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
  });

  it("marks sent only after the provider accepts, with the row id as idempotency key", async () => {
    const result = await sendEmail(message);
    expect(result).toMatchObject({ status: "sent", created: true });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe(`email-log/${result.id}`);
    expect(store.rows.get(result.id)).toMatchObject({ status: "sent", provider_message_id: "re_123", to_email: "buyer@example.com" });
  });

  it("does not send twice for the same business event", async () => {
    const first = await sendEmail(message);
    const second = await sendEmail(message);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toMatchObject({ id: first.id, status: "sent", created: false });
    expect(store.rows.size).toBe(1);
  });

  it("only the worker that claims the row calls the provider", async () => {
    const queued = await enqueueEmail(message);
    store.rows.get(queued.id)!.status = "sending"; // another worker holds it
    const result = await deliverEmail(queued.id);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.status).toBe("sending");
  });

  it("records failed (not sent) when the provider is not configured", async () => {
    delete process.env.RESEND_API_KEY;
    const result = await sendEmail(message);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "failed", error: "provider_not_configured" });
  });

  it("keeps an ambiguous network failure queued so the retry reuses the same key", async () => {
    fetchMock.mockRejectedValueOnce(new Error("socket hang up"));
    const result = await sendEmail(message);
    expect(result.status).toBe("queued");
    const retried = await deliverEmail(result.id);
    expect(retried.status).toBe("sent");
    const keys = fetchMock.mock.calls.map(([, init]) => (init as RequestInit & { headers: Record<string, string> }).headers["Idempotency-Key"]);
    expect(new Set(keys).size).toBe(1);
  });

  it("marks a provider rejection failed", async () => {
    fetchMock.mockResolvedValueOnce(new Response("invalid to", { status: 422 }));
    const result = await sendEmail(message);
    expect(result.status).toBe("failed");
    expect(result.error).toContain("provider_422");
  });

  it("never stores the password reset link and never re-queues that mail", async () => {
    fetchMock.mockRejectedValueOnce(new Error("timeout"));
    const outcome = await sendPasswordResetEmail("user@example.com", "https://shop.test/reset?token=secret");
    expect(outcome).toEqual({ delivered: false, reason: "provider_failed" });
    const row = [...store.rows.values()][0];
    expect(row.body).not.toContain("secret");
    expect(row.status).toBe("failed");
    const sent = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(sent.text).toContain("token=secret");
    await expect(resendEmailLog(row.id)).rejects.toBeInstanceOf(EmailResendNotAllowedError);
  });

  it("resends from the stored original as a new linked row and keeps the original", async () => {
    delete process.env.RESEND_API_KEY;
    const original = await sendEmail({ ...message, contentType: "html", body: "<p>Thanks</p>" });
    process.env.RESEND_API_KEY = "re_test";
    const resent = await resendEmailLog(original.id);
    expect(resent).toMatchObject({ status: "sent", created: true });
    expect(store.rows.get(original.id)).toMatchObject({ status: "failed" });
    expect(store.rows.get(resent!.id)).toMatchObject({ retry_of: original.id, dedupe_key: null, body: "<p>Thanks</p>" });
    const sent = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(sent.html).toBe("<p>Thanks</p>");
  });
});
