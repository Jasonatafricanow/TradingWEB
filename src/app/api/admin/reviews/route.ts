import { NextRequest, NextResponse } from "next/server"
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware"
import { listAllReviews, approveReview, deleteReview } from "@/services/review-service"

export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator", "support"]);
    const params = request.nextUrl.searchParams;
    const search = params.get("search")?.trim();
    const isApprovedParam = params.get("isApproved");
    const result = await listAllReviews({
      page: Number(params.get("page")) || 1,
      pageSize: Number(params.get("pageSize")) || 50,
      search: search || undefined,
      isApproved: isApprovedParam === "true" ? true : isApprovedParam === "false" ? false : undefined,
    });
    return NextResponse.json(result)
  } catch (err) { return errorResponse(err) }
}

export async function PUT(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator", "support"]);
    const body = await request.json()
    if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 })
    await approveReview(body.id, body.approved !== false)
    return NextResponse.json({ success: true })
  } catch (err) { return errorResponse(err) }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator", "support"]);
    const { id } = await request.json()
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })
    await deleteReview(id)
    return NextResponse.json({ success: true })
  } catch (err) { return errorResponse(err) }
}
