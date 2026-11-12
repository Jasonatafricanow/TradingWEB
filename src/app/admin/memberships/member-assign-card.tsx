"use client"

import { useState } from "react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/client-api"
import { useI18n } from "@/contexts/i18n-context"
import { translate } from "@/i18n"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { fromLocalInput, toLocalInput } from "@/components/admin/validity-window"

interface Assignment {
  customer: { id: string; email: string; name: string | null }
  assigned_tier_id: string | null
  assigned_until: string | null
  effective_tier_name: string | null
  discount_percent: number
  spent: string
}

/** Gives one customer a tier for a period (the higher of this and the spend tier applies). */
export function MemberAssignCard({ tiers }: { tiers: Array<{ id: string; name: string; level: number }> }) {
  const { t, locale } = useI18n()
  const [query, setQuery] = useState("")
  const [current, setCurrent] = useState<Assignment | null>(null)
  const [tierId, setTierId] = useState("")
  const [until, setUntil] = useState("")

  const show = (data: Assignment) => {
    setCurrent(data)
    setTierId(data.assigned_tier_id ?? "")
    setUntil(toLocalInput(data.assigned_until))
  }

  const lookup = async () => {
    if (!query.trim()) return
    const res = await apiFetch(`/api/admin/memberships/assign?q=${encodeURIComponent(query.trim())}`)
    if (!res.ok) { setCurrent(null); toast.error(t("wallets.not_found")); return }
    show((await res.json()).data)
  }

  const save = async () => {
    if (!current) return
    const res = await apiFetch("/api/admin/memberships/assign", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: current.customer.id, tier_id: tierId || null, until: fromLocalInput(until) }),
    })
    if (!res.ok) { toast.error(t("memberships.assign_failed")); return }
    show((await res.json()).data)
    toast.success(t("memberships.assigned"))
  }

  return (
    <Card className="mb-6">
      <CardHeader><CardTitle className="text-base">{t("memberships.assign_title")}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && lookup()} placeholder={t("wallets.search_placeholder")} className="max-w-sm" />
          <Button variant="outline" onClick={lookup}>{t("common.search")}</Button>
        </div>
        {current && (
          <div className="space-y-3">
            <div className="text-sm">
              <span className="font-medium">{current.customer.name || current.customer.email}</span>
              <span className="ml-2 text-muted-foreground">
                {translate(locale, "memberships.effective", { tier: current.effective_tier_name || "—", percent: String(current.discount_percent), spent: current.spent })}
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-3 items-end">
              <div>
                <Label className="text-xs">{t("memberships.assigned_tier")}</Label>
                <select className="h-9 w-full rounded-md border px-2 text-sm" value={tierId} onChange={(e) => setTierId(e.target.value)}>
                  <option value="">{t("memberships.no_assignment")}</option>
                  {tiers.map((tier) => <option key={tier.id} value={tier.id}>{translate(locale, "memberships.tier_option", { level: String(tier.level), name: tier.name })}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">{t("memberships.assigned_until")}</Label>
                <Input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} disabled={!tierId} />
              </div>
              <Button onClick={save}>{t("common.save")}</Button>
            </div>
            <p className="text-[11px] text-muted-foreground">{t("memberships.assign_hint")}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
