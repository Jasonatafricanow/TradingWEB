import { NextRequest, NextResponse } from "next/server"
import { recordPageView } from "@/services/admin/traffic-service"

function normalizePath(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null
  return trimmed.slice(0, 500)
}

function normalizeOptionalText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, maxLength) : undefined
}

function normalizeUtm(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim().slice(0, maxLength)
  return trimmed || undefined
}

function anonymizeIp(value: string | null): string | undefined {
  const raw = value?.split(",")[0]?.trim()
  if (!raw) return undefined
  if (raw.includes(":")) return `${raw.split(":").slice(0, 4).join(":")}::`
  return `${raw.split(".").slice(0, 3).join(".")}.0`
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const path = normalizePath(body.path)

    if (!path) {
      return NextResponse.json({ error: "valid path is required" }, { status: 400 })
    }

    await recordPageView({
      path,
      title: normalizeOptionalText(body.title, 200),
      referrer: normalizeOptionalText(body.referrer, 500),
      visitor_id: normalizeOptionalText(request.headers.get("x-visitor-id"), 100),
      user_agent: normalizeOptionalText(request.headers.get("user-agent"), 500),
      ip_anonymized: anonymizeIp(request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip")),
      utm_source: normalizeUtm(body.utm_source, 100),
      utm_medium: normalizeUtm(body.utm_medium, 100),
      utm_campaign: normalizeUtm(body.utm_campaign, 200),
      utm_content: normalizeUtm(body.utm_content, 200),
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed to track page view" }, { status: 500 })
  }
}
