import { NextRequest, NextResponse } from "next/server"
import { generateBriefing, renderBriefingHtml } from "@/services/cron/briefing-service"
import { sendEmail } from "@/services/notifications/email-service"
import { EMAIL_TEMPLATES } from "@/services/notifications/email-messages"
import { SITE } from "@/config/site"
import { isAuthorizedCronRequest } from "@/lib/cron-auth"

async function handleBriefing(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const data = await generateBriefing()
    const html = await renderBriefingHtml(data)
    const to = process.env.BRIEFING_EMAIL || SITE.email
    // One briefing per day and recipient, even if the scheduler fires twice.
    const result = await sendEmail({
      to,
      subject: `${SITE.name} Daily Briefing - ${data.date}`,
      body: html,
      contentType: "html",
      templateKey: EMAIL_TEMPLATES.dailyBriefing.key,
      dedupeKey: `daily-briefing:${data.date}:${to.toLowerCase()}`,
    })

    return NextResponse.json({
      success: true,
      date: data.date,
      summary: {
        revenue: data.revenue,
        orders: data.newOrders,
        paidOrders: data.paidOrders,
        // No page-view source exists yet: null means unavailable, not zero.
        pv: data.pageViews,
        lowStock: data.lowStock,
        recovered: data.recoveredCarts,
      },
      emailSent: result.status === "sent",
      emailStatus: result.status,
      emailDuplicate: !result.created,
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
