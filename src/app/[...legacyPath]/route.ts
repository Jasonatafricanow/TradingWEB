import { NextRequest, NextResponse } from "next/server";
import { notFound } from "next/navigation";
import { resolveUrlRedirect } from "@/services/admin/redirect-service";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ legacyPath: string[] }> },
) {
  const { legacyPath } = await params;
  const oldPath = `/${legacyPath.join("/")}`;
  const match = await resolveUrlRedirect(oldPath);
  if (!match) notFound();

  const target = new URL(match.new_path, request.nextUrl.origin);
  if (!match.new_path.includes("?")) {
    target.search = request.nextUrl.search;
  }
  return NextResponse.redirect(target, match.status_code);
}
