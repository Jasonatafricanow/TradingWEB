import { NextResponse } from "next/server";

// Legacy clients must migrate to the authoritative pos-v1 checkout contract.
export async function POST() {
  return NextResponse.json({ error: "Legacy POS checkout retired; use /api/admin/pos/checkout" }, { status: 410 });
}
