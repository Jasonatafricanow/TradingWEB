import { NextRequest, NextResponse } from "next/server";

import { API_MESSAGES } from "@/lib/api-messages";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { flushEmailOutbox } from "@/services/notifications/email-service";

export const dynamic = "force-dynamic";

// Retries queued email rows (provider outage, crash after commit) with the
// same per-row idempotency key, so a retry cannot produce a second email.
export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: API_MESSAGES.cronUnauthorized }, { status: 401 });
  }
  try {
    const results = await flushEmailOutbox();
    const summary = { attempted: results.length, sent: 0, queued: 0, failed: 0 };
    for (const result of results) {
      if (result.status === "sent") summary.sent += 1;
      else if (result.status === "failed") summary.failed += 1;
      else summary.queued += 1;
    }
    return NextResponse.json({ data: summary });
  } catch {
    return NextResponse.json({ error: API_MESSAGES.emailOutboxFailed }, { status: 503 });
  }
}
