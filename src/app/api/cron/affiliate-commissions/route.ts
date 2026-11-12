import { NextRequest, NextResponse } from "next/server";

import { API_MESSAGES } from "@/lib/api-messages";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { matureDueCommissions } from "@/services/promotions/commission-ledger";

export const dynamic = "force-dynamic";

// Moves commissions whose hold period (refund window) has passed into the
// affiliate balance. Each one matures in its own transaction exactly once.
export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: API_MESSAGES.cronUnauthorized }, { status: 401 });
  }
  try {
    return NextResponse.json({ data: await matureDueCommissions() });
  } catch {
    return NextResponse.json({ error: API_MESSAGES.commissionMaturityFailed }, { status: 503 });
  }
}
