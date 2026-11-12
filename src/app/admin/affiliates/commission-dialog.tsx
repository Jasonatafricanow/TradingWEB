"use client"

import { useState } from "react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/client-api"
import { useI18n } from "@/contexts/i18n-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ValidityWindowFields, fromLocalInput, toLocalInput } from "@/components/admin/validity-window"

interface CommissionFields {
  id: string
  code: string
  rate?: string
  max_commission?: string | null
  commission_starts_at?: string | null
  commission_ends_at?: string | null
}

/** Edits one affiliate's rate, per-order cap and commission validity window. */
export function AffiliateCommissionDialog({ affiliate, onSaved }: { affiliate: CommissionFields; onSaved: () => void }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [rate, setRate] = useState("")
  const [max, setMax] = useState("")
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")

  const openWith = (next: boolean) => {
    if (next) {
      setRate(affiliate.rate ?? "0")
      setMax(affiliate.max_commission ?? "")
      setStart(toLocalInput(affiliate.commission_starts_at))
      setEnd(toLocalInput(affiliate.commission_ends_at))
    }
    setOpen(next)
  }

  const save = async () => {
    const res = await apiFetch(`/api/admin/affiliates/${affiliate.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rate,
        max_commission: max === "" ? null : max,
        commission_starts_at: fromLocalInput(start),
        commission_ends_at: fromLocalInput(end),
      }),
    })
    if (!res.ok) { toast.error(t("affiliates.commission_save_failed")); return }
    toast.success(t("affiliates.commission_saved"))
    setOpen(false)
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={openWith}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">{t("affiliates.commission_edit")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("affiliates.commission_edit")} · {affiliate.code}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">{t("affiliates.rate")}</Label><Input type="number" min="0" max="100" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} /></div>
            <div><Label className="text-xs">{t("affiliates.max_commission")}</Label><Input type="number" min="0" step="0.01" value={max} onChange={(e) => setMax(e.target.value)} /></div>
          </div>
          <div>
            <Label className="text-xs">{t("affiliates.commission_window")}</Label>
            <ValidityWindowFields start={start} end={end} onStart={setStart} onEnd={setEnd} />
          </div>
          <Button className="w-full" onClick={save}>{t("common.save")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
