import { NextRequest, NextResponse } from "next/server"
import { generateBriefing, renderBriefingHtml } from "@/services/cron/briefing-service"
import { sendEmail } from "@/services/notifications/email-service"
import { SITE } from "@/config/site"

function isAuthorizedCronRequest(request: NextRequest): boolean {
  const expectedSecret = process.env.CRON_SECRET
  if (!expectedSecret) return false

  const providedSecret = request.headers.get("x-cron-secret") || request.nextUrl.searchParams.get("key")
  return providedSecret === expectedSecret
}

async function handleBriefing(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const data = await generateBriefing()
    const html = await renderBriefingHtml(data)
    const to = process.env.BRIEFING_EMAIL || SITE.email
    const result = await sendEmail(to, `${SITE.name} Daily Briefing - ${data.date}`, html)

    return NextResponse.json({
      success: true,
      date: data.date,
      summary: {
        revenue: data.revenue || 0,
        orders: data.newOrders || 0,
        pv: 0,
        lowStock: 0,
        recovered: 0,
      },
      emailSent: result.success,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return handleBriefing(request)
}

export async function GET(request: NextRequest) {
  return handleBriefing(request)
}
