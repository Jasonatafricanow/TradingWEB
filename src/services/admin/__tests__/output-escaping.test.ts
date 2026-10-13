import { describe, expect, it } from "vitest"

import { escapeCsvField, toCsv } from "@/lib/csv"
import { escapeHtml } from "@/lib/html"

describe("CSV export escaping", () => {
  it("neutralizes spreadsheet formulas from customer-controlled text", () => {
    expect(escapeCsvField('=HYPERLINK("https://evil.example","x")')).toBe(
      `"'=HYPERLINK(""https://evil.example"",""x"")"`,
    )
    expect(escapeCsvField("@SUM(A1)")).toBe("'@SUM(A1)")
    expect(escapeCsvField("+cmd")).toBe("'+cmd")
  })

  it("keeps numbers and ordinary text unchanged", () => {
    expect(toCsv([["-5", "12.50", "Blue shirt", "a,b"]])).toBe('-5,12.50,Blue shirt,"a,b"')
  })
})

describe("HTML escaping", () => {
  it("escapes markup in buyer-supplied names", () => {
    expect(escapeHtml(`<img src=x onerror="alert(1)">`)).toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;")
    expect(escapeHtml(null)).toBe("")
  })
})
