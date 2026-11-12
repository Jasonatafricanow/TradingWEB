import { NextResponse } from "next/server";
import { API_MESSAGES } from "@/lib/api-messages";

// Legacy clients must migrate to the authoritative pos-v1 checkout contract.
export async function POST() {
  return NextResponse.json({ error: API_MESSAGES.legacyPosRetired }, { status: 410 });
}
