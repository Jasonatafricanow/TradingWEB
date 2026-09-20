import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole, requireUser, errorResponse } from "@/services/auth/auth-middleware";
import { createMediaUpload } from "@/services/media/media-storage";

export const runtime = "nodejs";

function normalizeText(value: FormDataEntryValue | null, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

export async function POST(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const user = await requireUser(request);

    const formData = await request.formData();
    const uploaded = await createMediaUpload({
      file: formData.get("file") as File,
      altText: normalizeText(formData.get("alt_text"), 255),
      uploadedBy: user.id,
      folder: normalizeText(formData.get("folder"), 80) || "media",
    });

    return NextResponse.json({
      url: uploaded.url,
      path: uploaded.url,
      filename: uploaded.filename,
      original_name: uploaded.original_name,
      data: uploaded,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
