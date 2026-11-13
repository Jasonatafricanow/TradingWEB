"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useI18n } from "@/contexts/i18n-context"

/** ISO / Date → value for <input type="datetime-local"> in the browser's time zone. */
export function toLocalInput(value: string | Date | null | undefined): string {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** datetime-local value → ISO string, or null when empty (= open-ended). */
export function fromLocalInput(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** Start/end of a validity window; empty means "no limit" on that side. */
export function ValidityWindowFields(props: {
  start: string
  end: string
  onStart: (value: string) => void
  onEnd: (value: string) => void
  compact?: boolean
}) {
  const { t } = useI18n()
  const cls = props.compact ? "h-8 text-xs" : ""
  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <Label className="text-xs">{t("validity.starts")}</Label>
        <Input type="datetime-local" value={props.start} onChange={(e) => props.onStart(e.target.value)} className={cls} />
      </div>
      <div>
        <Label className="text-xs">{t("validity.ends")}</Label>
        <Input type="datetime-local" value={props.end} onChange={(e) => props.onEnd(e.target.value)} className={cls} />
      </div>
      <p className="col-span-2 text-[11px] text-muted-foreground">{t("validity.open_hint")}</p>
    </div>
  )
}
