import { db } from "@/lib/db";
import { randomUUID } from "node:crypto";

async function recordEmailLog(
  to: string,
  subject: string,
  body: string,
  status: "sent" | "failed",
) {
  const id = randomUUID();
  await db.$client.execute(
    "INSERT INTO email_logs (id, recipient, subject, body, status) VALUES (?, ?, ?, ?, ?)",
    [id, to, subject, body, status],
  );
  const [rows] = await db.$client.execute("SELECT * FROM email_logs WHERE id = ?", [id]);
  return (rows as Record<string, unknown>[])[0];
}

/**
 * Legacy local notification helper. It records an application email event;
 * callers that require real external delivery should use a provider-backed
 * helper such as sendPasswordResetEmail.
 */
export async function sendEmail(to: string, subject: string, body: string) {
  return recordEmailLog(to, subject, body, "sent");
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();

  if (!apiKey || !from) {
    console.error("[email] RESEND_API_KEY/EMAIL_FROM not configured; reset email was not delivered");
    return { delivered: false as const, reason: "provider_not_configured" as const };
  }

  const subject = "Reset your TradingWEB password";
  const body = `Use this link within 15 minutes to reset your password: ${resetUrl}`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text: body,
    }),
  });

  if (!response.ok) {
    await recordEmailLog(to, subject, body, "failed");
    const providerBody = await response.text().catch(() => "");
    throw new Error(`Email provider rejected password reset delivery (${response.status}): ${providerBody.slice(0, 200)}`);
  }

  await recordEmailLog(to, subject, body, "sent");
  return { delivered: true as const };
}

export async function sendOrderConfirmation(to: string, orderNo: string, items: { product_title: string }[]) {
  const subject = "Order Confirmation - " + orderNo;
  const body = "Thank you for your order " + orderNo + ". Items: " + items.map(i => i.product_title).join(", ");
  return sendEmail(to, subject, body);
}

export async function sendAbandonedCartReminder(to: string, items: { title: string }[]) {
  const subject = "You left something in your cart!";
  const body = "Your cart items: " + items.map((i) => i.title).join(", ");
  return sendEmail(to, subject, body);
}

export const renderTemplate = sendEmail;
