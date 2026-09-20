"use client"

import { useState, useEffect } from "react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Phone, Spinner, User } from "@phosphor-icons/react";
import { useI18n } from "@/contexts/i18n-context"
import type { TranslationKeyWithoutParams } from "@/i18n"
interface ContactInfo {
  name: string
  phone: string
}

interface Props {
  open: boolean
  onComplete: (info: ContactInfo) => void
  onSkip: () => void
}

export function ContactInfoDialog({ open, onComplete, onSkip }: Props) {
  const { t } = useI18n()
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [saving, setSaving] = useState(false)
  const [errorKey, setErrorKey] = useState<TranslationKeyWithoutParams | null>(null)

  // Reset on open
  useEffect(() => { if (open) { setName(""); setPhone(""); setErrorKey(null) } }, [open])

  async function handleSave() {
    if (!name.trim() || !phone.trim()) { setErrorKey("auth.contact.required"); return }

    setSaving(true)
    onComplete({ name: name.trim(), phone: phone.trim() })
    setSaving(false)
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t("auth.contact.title")}
          </DialogTitle>
          <DialogDescription>
            {t("auth.contact.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="contact-name">{t("auth.contact.name")}</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="contact-name"
                placeholder={t("auth.web.your_name")}
                className="pl-9"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact-phone">{t("auth.contact.phone")}</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="contact-phone"
                placeholder={t("auth.contact.phone_placeholder")}
                className="pl-9"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          {errorKey && (
            <p className="text-sm text-destructive">{t(errorKey)}</p>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={onSkip}>
              {t("auth.contact.skip")}
            </Button>
            <Button className="flex-1 bg-blue-600 text-white hover:bg-blue-700 transition-colors" onClick={handleSave} disabled={saving}>
              {saving ? <Spinner className="h-4 w-4" /> : t("auth.contact.save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
