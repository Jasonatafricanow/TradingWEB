import { NextRequest, NextResponse } from "next/server"
import { recordWhatsAppClick } from "@/services/admin/traffic-service"

function normalizeOptionalText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, maxLength) : undefined
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const path = normalizeOptionalText(body.path, 500)
    if (!path) {
      return NextResponse.json({ error: "path is required" }, { status: 400 })
    }

    // Fire-and-forget: 不阻塞用户体验
    await recordWhatsAppClick({
      path,
      visitor_id: normalizeOptionalText(request.headers.get("x-visitor-id"), 100),
      product_id: normalizeOptionalText(body.product_id, 36),
      variant_id: normalizeOptionalText(body.variant_id, 36),
      locale: normalizeOptionalText(body.locale, 10),
      referrer: normalizeOptionalText(body.referrer, 500),
      utm_source: normalizeOptionalText(body.utm_source, 100),
      utm_medium: normalizeOptionalText(body.utm_medium, 100),
      utm_campaign: normalizeOptionalText(body.utm_campaign, 200),
      utm_content: normalizeOptionalText(body.utm_content, 200),
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed to track WhatsApp click" }, { status: 500 })
  }
}
