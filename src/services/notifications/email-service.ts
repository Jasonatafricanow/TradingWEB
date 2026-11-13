import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { emailLogs } from "@/storage/database/shared/schema";
import { EMAIL_TEMPLATES } from "./email-messages";

/**
 * Email log / outbox.
 *
 * Status of an email_logs row:
 *   queued  - recorded, waiting to be handed to the provider
 *   sending - claimed by one worker; the provider call is in flight
 *   sent    - the provider ACCEPTED the message (not proof of inbox delivery)
 *   failed  - provider not configured, rejected the message, or retries ran out
 *
 * A business event that must produce at most one email passes a dedupeKey.
 * The row is inserted once (unique key), and only the worker that claims the
 * row may call the provider, using the row id as the provider idempotency
 * key, so duplicate callbacks or concurrent workers do not send twice.
 */

export type EmailStatus = "queued" | "sending" | "sent" | "failed";

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
  contentType?: "text" | "html";
  templateKey?: string;
  orderId?: string | null;
  dedupeKey?: string | null;
  retryOf?: string | null;
}

export interface EmailResult {
  id: string;
  status: EmailStatus;
  error: string | null;
  /** false when an existing row with the same dedupe key was reused */
  created: boolean;
}

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | DbTx;

const MAX_ATTEMPTS = 5;
const STALE_SENDING_MINUTES = 10;
const RESEND_ENDPOINT = "https://api.resend.com/emails";

function providerConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  return apiKey && from ? { apiKey, from } : null;
}

function affectedRows(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  return Number((header as { affectedRows?: number } | undefined)?.affectedRows ?? 0);
}

async function readLog(id: string) {
  const [row] = await db.select().from(emailLogs).where(eq(emailLogs.id, id)).limit(1);
  return row ?? null;
}

function toResult(row: { id: string; status: string; error: string | null } | null, created: boolean, fallbackId: string): EmailResult {
  return {
    id: row?.id ?? fallbackId,
    status: (row?.status ?? "failed") as EmailStatus,
    error: row?.error ?? null,
    created,
  };
}

/**
 * Records the email as queued. Safe to call inside a business transaction:
 * if the transaction rolls back, the email is never queued.
 */
export async function enqueueEmail(message: EmailMessage, executor: Executor = db): Promise<EmailResult> {
  const id = randomUUID();
  const dedupeKey = message.dedupeKey?.slice(0, 191) || null;
  await executor.insert(emailLogs).values({
    id,
    to_email: message.to.slice(0, 255),
    subject: message.subject.slice(0, 200),
    template_key: message.templateKey?.slice(0, 50) ?? null,
    status: "queued",
    order_id: message.orderId ?? null,
    body: message.body,
    content_type: message.contentType ?? "text",
    dedupe_key: dedupeKey,
    retry_of: message.retryOf ?? null,
    attempts: 0,
  }).onDuplicateKeyUpdate({ set: { dedupe_key: dedupeKey } });

  if (!dedupeKey) return { id, status: "queued", error: null, created: true };
  const [row] = await executor.select({ id: emailLogs.id, status: emailLogs.status, error: emailLogs.error })
    .from(emailLogs).where(eq(emailLogs.dedupe_key, dedupeKey)).limit(1);
  return toResult(row ?? null, row?.id === id, id);
}

async function finish(id: string, status: EmailStatus, error: string | null, providerMessageId?: string | null) {
  await db.$client.execute(
    "UPDATE email_logs SET status = ?, error = ?, provider_message_id = COALESCE(?, provider_message_id), updated_at = NOW() WHERE id = ? AND status = 'sending'",
    [status, error, providerMessageId ?? null, id],
  );
}

/**
 * Hands a queued row to the provider. Only the caller that wins the claim
 * sends; everyone else gets the row's current state back.
 * `bodyOverride` sends content that must not be stored (password reset links).
 */
export async function deliverEmail(id: string, options: { bodyOverride?: string } = {}): Promise<EmailResult> {
  const [claim] = await db.$client.execute(
    `UPDATE email_logs SET status = 'sending', attempts = attempts + 1, error = NULL, updated_at = NOW()
     WHERE id = ? AND (status = 'queued'
       OR (status = 'sending' AND updated_at < NOW() - INTERVAL ${STALE_SENDING_MINUTES} MINUTE))`,
    [id],
  );
  if (affectedRows(claim) < 1) return toResult(await readLog(id), false, id);

  const row = await readLog(id);
  if (!row) return toResult(null, false, id);

  const storedOnly = options.bodyOverride === undefined;
  if (storedOnly && row.template_key === EMAIL_TEMPLATES.passwordReset.key) {
    // The real link was never stored; sending the placeholder would be wrong.
    await finish(id, "failed", "not_resendable");
    return toResult(await readLog(id), false, id);
  }

  const config = providerConfig();
  if (!config) {
    await finish(id, "failed", "provider_not_configured");
    return toResult(await readLog(id), false, id);
  }

  const body = options.bodyOverride ?? row.body ?? "";
  const payload: Record<string, unknown> = { from: config.from, to: [row.to_email], subject: row.subject };
  if (row.content_type === "html") payload.html = body;
  else payload.text = body;

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        // Same row -> same key, so a re-claimed stale row is not sent twice.
        "Idempotency-Key": `email-log/${id}`,
      },
      body: JSON.stringify(payload),
    });
    if (response.ok) {
      const json = await response.json().catch(() => null) as { id?: string } | null;
      await finish(id, "sent", null, typeof json?.id === "string" ? json.id.slice(0, 100) : null);
    } else {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      const retryable = response.status === 429 || response.status >= 500;
      const exhausted = !storedOnly || row.attempts >= MAX_ATTEMPTS;
      await finish(id, retryable && !exhausted ? "queued" : "failed", `provider_${response.status}: ${detail}`);
    }
  } catch (error) {
    // Network failure is ambiguous; keep the row queued so the same
    // idempotency key is reused instead of creating a second email.
    const exhausted = !storedOnly || row.attempts >= MAX_ATTEMPTS;
    const message = error instanceof Error ? error.message : String(error);
    await finish(id, exhausted ? "failed" : "queued", `network: ${message.slice(0, 300)}`);
  }
  return toResult(await readLog(id), false, id);
}

/** Queue + deliver now. Never throws for provider failures; read `status`. */
export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const queued = await enqueueEmail(message);
  if (!queued.created && queued.status !== "queued") return queued;
  const delivered = await deliverEmail(queued.id);
  return { ...delivered, created: queued.created };
}

/** Best-effort delivery after a business transaction committed. */
export async function deliverQueuedEmailSafely(id: string | null | undefined) {
  if (!id) return;
  try {
    await deliverEmail(id);
  } catch (error) {
    console.error("[email] delivery attempt failed; row stays queued for the outbox job", error);
  }
}

/** Outbox job: retries queued rows and re-claims stale in-flight rows. */
export async function flushEmailOutbox(limit = 50) {
  const [rows] = await db.$client.execute(
    `SELECT id FROM email_logs
     WHERE (status = 'queued' OR (status = 'sending' AND updated_at < NOW() - INTERVAL ${STALE_SENDING_MINUTES} MINUTE))
       AND created_at > NOW() - INTERVAL 23 HOUR
       AND (template_key IS NULL OR template_key <> ?)
     ORDER BY created_at ASC LIMIT ${Math.max(1, Math.min(200, Math.trunc(limit)))}`,
    [EMAIL_TEMPLATES.passwordReset.key],
  );
  const results: EmailResult[] = [];
  for (const { id } of rows as Array<{ id: string }>) results.push(await deliverEmail(id));
  return results;
}

/**
 * Admin resend: creates a new row linked to the original and leaves the
 * original untouched. Password reset mail is never resent from the log,
 * because its link is not stored (and would have expired anyway).
 */
export async function resendEmailLog(originalId: string): Promise<EmailResult | null> {
  const original = await readLog(originalId);
  if (!original) return null;
  if (original.template_key === EMAIL_TEMPLATES.passwordReset.key || !original.body) {
    throw new EmailResendNotAllowedError();
  }
  return sendEmail({
    to: original.to_email,
    subject: original.subject,
    body: original.body,
    contentType: original.content_type === "html" ? "html" : "text",
    templateKey: original.template_key ?? undefined,
    orderId: original.order_id,
    retryOf: original.id,
  });
}

export class EmailResendNotAllowedError extends Error {
  constructor() {
    super("This email cannot be resent from the log");
  }
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const template = EMAIL_TEMPLATES.passwordReset;
  const queued = await enqueueEmail({
    to,
    subject: template.subject,
    body: template.body("[reset link not stored]"),
    templateKey: template.key,
  });
  const result = await deliverEmail(queued.id, { bodyOverride: template.body(resetUrl) });
  if (result.status === "sent") return { delivered: true as const };
  return {
    delivered: false as const,
    reason: result.error === "provider_not_configured" ? "provider_not_configured" as const : "provider_failed" as const,
  };
}
