import { createHash, timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { dispatchAuditOutbox } from "@/services/admin/pos-audit-outbox-service";

export const dynamic = "force-dynamic";

function sameSecret(left: string, right: string): boolean {
  const leftDigest = createHash("sha256").update(left, "utf8").digest();
  const rightDigest = createHash("sha256").update(right, "utf8").digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  const provided = bearer ?? request.headers.get("x-cron-secret");
  return Boolean(provided && sameSecret(provided, expected));
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const data = await dispatchAuditOutbox();
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Audit dispatch failed" }, { status: 503 });
  }
}
