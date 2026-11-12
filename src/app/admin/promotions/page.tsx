"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/client-api"
import { useI18n } from "@/contexts/i18n-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { FloppyDisk, Gift } from "@phosphor-icons/react"

interface ProgramSettings {
  membership: { enabled: boolean; stackMode: "best" | "stack" }
  wallet: { enabled: boolean; maxPercent: number; restoreGraceDays: number }
  affiliate: { enabled: boolean; attributionDays: number; holdDays: number }
}

function Switch(props: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium">
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      {props.label}
    </label>
  )
}

function NumberField(props: { label: string; hint: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <div>
      <Label className="text-xs">{props.label}</Label>
      <Input
        type="number"
        min={props.min}
        max={props.max}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="h-8 w-32 text-sm"
      />
      <p className="mt-1 text-[11px] text-muted-foreground">{props.hint}</p>
    </div>
  )
}

export default function PromotionsPage() {
  const { t } = useI18n()
  const [settings, setSettings] = useState<ProgramSettings | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    apiFetch("/api/admin/promotions")
      .then((res) => res.ok ? res.json() : Promise.reject(new Error(String(res.status))))
      .then((json) => setSettings(json.data))
      .catch(() => toast.error(t("programs.load_failed")))
  }, [t])

  const patch = <K extends keyof ProgramSettings>(section: K, value: Partial<ProgramSettings[K]>) =>
    setSettings((current) => current && { ...current, [section]: { ...current[section], ...value } })

  const save = async () => {
    if (!settings) return
    setSaving(true)
    try {
      const res = await apiFetch("/api/admin/promotions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.field || String(res.status))
      setSettings(json.data)
      toast.success(t("programs.saved"))
    } catch (err) {
      toast.error(`${t("programs.save_failed")} ${err instanceof Error ? err.message : ""}`.trim())
    } finally {
      setSaving(false)
    }
  }

  if (!settings) return <div className="p-8"><Skeleton className="h-96 w-full" /></div>

  return (
    <div className="p-8 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Gift className="h-6 w-6" /> {t("programs.title")}</h1>
        <Button onClick={save} disabled={saving}><FloppyDisk className="h-4 w-4 mr-1" /> {t("common.save")}</Button>
      </div>
      <p className="text-sm text-muted-foreground">{t("programs.intro")}</p>

      <Card>
        <CardHeader><CardTitle className="text-base">{t("programs.membership")}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Switch checked={settings.membership.enabled} onChange={(enabled) => patch("membership", { enabled })} label={t("programs.enable_membership")} />
          <div className="space-y-1 text-sm">
            <Label className="text-xs">{t("programs.stack_mode")}</Label>
            <label className="flex items-center gap-2">
              <input type="radio" name="stack" checked={settings.membership.stackMode === "best"} onChange={() => patch("membership", { stackMode: "best" })} />
              {t("programs.stack_best")}
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="stack" checked={settings.membership.stackMode === "stack"} onChange={() => patch("membership", { stackMode: "stack" })} />
              {t("programs.stack_both")}
            </label>
          </div>
          <p className="text-[11px] text-muted-foreground">{t("programs.membership_hint")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{t("programs.wallet")}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Switch checked={settings.wallet.enabled} onChange={(enabled) => patch("wallet", { enabled })} label={t("programs.enable_wallet")} />
          <div className="flex flex-wrap gap-6">
            <NumberField label={t("programs.wallet_max_percent")} hint={t("programs.wallet_max_percent_hint")} value={settings.wallet.maxPercent} min={1} max={100} onChange={(maxPercent) => patch("wallet", { maxPercent })} />
            <NumberField label={t("programs.wallet_grace_days")} hint={t("programs.wallet_grace_days_hint")} value={settings.wallet.restoreGraceDays} min={1} max={3650} onChange={(restoreGraceDays) => patch("wallet", { restoreGraceDays })} />
          </div>
          <p className="text-[11px] text-muted-foreground">{t("programs.wallet_hint")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{t("programs.affiliate")}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Switch checked={settings.affiliate.enabled} onChange={(enabled) => patch("affiliate", { enabled })} label={t("programs.enable_affiliate")} />
          <div className="flex flex-wrap gap-6">
            <NumberField label={t("programs.attribution_days")} hint={t("programs.attribution_days_hint")} value={settings.affiliate.attributionDays} min={1} max={365} onChange={(attributionDays) => patch("affiliate", { attributionDays })} />
            <NumberField label={t("programs.hold_days")} hint={t("programs.hold_days_hint")} value={settings.affiliate.holdDays} min={0} max={365} onChange={(holdDays) => patch("affiliate", { holdDays })} />
          </div>
          <p className="text-[11px] text-muted-foreground">{t("programs.affiliate_hint")}</p>
        </CardContent>
      </Card>
    </div>
  )
}
