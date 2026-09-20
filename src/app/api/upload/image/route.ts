import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole, requireUser, errorResponse } from "@/services/auth/auth-middleware";
import { createMediaUpload } from "@/services/media/media-storage";

export const runtime = "nodejs";

// Backward-compatible product image endpoint.
// New admin UI should prefer /api/admin/media/upload; this route keeps older callers working.
export async function POST(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const user = await requireUser(request);

    const formData = await request.formData();
    const uploaded = await createMediaUpload({
      file: formData.get("file") as File,
      altText: typeof formData.get("alt_text") === "string" ? String(formData.get("alt_text")).slice(0, 255) : null,
      uploadedBy: user.id,
      folder: "products",
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
