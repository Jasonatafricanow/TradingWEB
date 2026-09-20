import { NextRequest, NextResponse } from "next/server"
import { requireUser, errorResponse } from "@/services/auth/auth-middleware"
import { getProductReviews, createReview } from "@/services/review-service"

const MAX_REVIEW_TITLE_LENGTH = 200
const MAX_REVIEW_CONTENT_LENGTH = 2000

function normalizeOptionalText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, maxLength)
}

// GET /api/reviews?product_id=xxx
export async function GET(request: NextRequest) {
  try {
    const productId = request.nextUrl.searchParams.get("product_id")
    if (!productId) return NextResponse.json({ error: "product_id is required" }, { status: 400 })
    const result = await getProductReviews(productId)
    return NextResponse.json(result)
  } catch (err) { return errorResponse(err) }
}

// POST /api/reviews — 发表评论
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request)
    const { product_id, rating, title, content } = await request.json()
    const ratingNumber = Number(rating)

    if (typeof product_id !== "string" || !product_id.trim()) {
      return NextResponse.json({ error: "product_id is required" }, { status: 400 })
    }

    if (!Number.isInteger(ratingNumber) || ratingNumber < 1 || ratingNumber > 5) {
      return NextResponse.json({ error: "rating must be an integer from 1 to 5" }, { status: 400 })
    }

    const data = await createReview({
      product_id: product_id.trim(),
      user_id: user.id,
      rating: ratingNumber,
      title: normalizeOptionalText(title, MAX_REVIEW_TITLE_LENGTH),
      content: normalizeOptionalText(content, MAX_REVIEW_CONTENT_LENGTH),
    })
    return NextResponse.json({ data })
  } catch (err) { return errorResponse(err) }
}
