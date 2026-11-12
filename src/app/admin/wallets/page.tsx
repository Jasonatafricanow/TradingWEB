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
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fromLocalInput } from "@/components/admin/validity-window"
import { MagnifyingGlass, Plus, Wallet } from "@phosphor-icons/react"

interface Credit {
  id: string; amount: string; remaining: string; source: string; note: string | null
  expires_at: string | null; created_at: string; status: "active" | "expired" | "used" | "revoked"
}
interface Txn { id: string; type: string; amount: string; order_id: string | null; note: string | null; created_at: string }
interface Summary { customer: { id: string; email: string; name: string | null }; balance: string; credits: Credit[]; transactions: Txn[] }

const STATUS_VARIANT: Record<Credit["status"], "default" | "outline" | "secondary" | "destructive"> = {
  active: "default", expired: "secondary", used: "outline", revoked: "destructive",
}

export default function AdminWalletsPage() {
  const { t, locale } = useI18n()
  const [query, setQuery] = useState("")
  const [summary, setSummary] = useState<Summary | null>(null)
  const [amount, setAmount] = useState("")
  const [expires, setExpires] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)

  const lookup = async (q = query) => {
    if (!q.trim()) return
    const res = await apiFetch(`/api/admin/wallets?q=${encodeURIComponent(q.trim())}`)
    if (res.status === 404) { setSummary(null); toast.error(t("wallets.not_found")); return }
    if (!res.ok) { toast.error(t("wallets.load_failed")); return }
    setSummary((await res.json()).data)
  }

  const grant = async () => {
    if (!summary) return
    setBusy(true)
    try {
      const res = await apiFetch("/api/admin/wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: summary.customer.id, amount, expires_at: fromLocalInput(expires), note }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setSummary({ customer: summary.customer, ...(await res.json()).data })
      setAmount(""); setExpires(""); setNote("")
      toast.success(t("wallets.granted"))
    } catch {
      toast.error(t("wallets.grant_failed"))
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (credit: Credit) => {
    if (!window.confirm(translate(locale, "wallets.revoke_confirm", { amount: credit.remaining }))) return
    const res = await apiFetch(`/api/admin/wallets/credits/${credit.id}/revoke`, { method: "POST", body: "{}" })
    if (!res.ok) { toast.error(t("wallets.revoke_failed")); return }
    toast.success(t("wallets.revoked"))
    lookup(summary?.customer.email)
  }

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Wallet className="h-6 w-6" /> {t("wallets.title")}</h1>
      <p className="text-sm text-muted-foreground">{t("wallets.intro")}</p>
      <div className="flex gap-2">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && lookup()} placeholder={t("wallets.search_placeholder")} className="max-w-sm" />
        <Button variant="outline" onClick={() => lookup()}><MagnifyingGlass className="h-4 w-4 mr-1" /> {t("common.search")}</Button>
      </div>

      {summary && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{summary.customer.name || summary.customer.email}</CardTitle>
              <div className="text-xs text-muted-foreground">{summary.customer.email}</div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-3xl font-bold text-green-600">${summary.balance}</div>
              <div className="grid gap-3 md:grid-cols-4 items-end">
                <div><Label className="text-xs">{t("wallets.amount")}</Label><Input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
                <div><Label className="text-xs">{t("wallets.expires_at")}</Label><Input type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} /></div>
                <div><Label className="text-xs">{t("wallets.note")}</Label><Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={255} /></div>
                <Button onClick={grant} disabled={busy || !amount}><Plus className="h-4 w-4 mr-1" /> {t("wallets.grant")}</Button>
              </div>
              <p className="text-[11px] text-muted-foreground">{t("wallets.expiry_hint")}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">{t("wallets.credits")}</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>{t("wallets.amount")}</TableHead><TableHead>{t("wallets.remaining")}</TableHead>
                  <TableHead>{t("wallets.source")}</TableHead><TableHead>{t("wallets.expires_at")}</TableHead>
                  <TableHead>{t("wallets.status")}</TableHead><TableHead>{t("wallets.note")}</TableHead><TableHead />
                </TableRow></TableHeader>
                <TableBody>
                  {summary.credits.map((credit) => (
                    <TableRow key={credit.id}>
                      <TableCell>${credit.amount}</TableCell>
                      <TableCell>${credit.remaining}</TableCell>
                      <TableCell className="text-xs">{credit.source}</TableCell>
                      <TableCell className="text-xs">{credit.expires_at ? new Date(credit.expires_at).toLocaleString() : t("validity.never")}</TableCell>
                      <TableCell><Badge variant={STATUS_VARIANT[credit.status]}>{t(`wallets.status_${credit.status}` as "wallets.status_active")}</Badge></TableCell>
                      <TableCell className="text-xs">{credit.note}</TableCell>
                      <TableCell>
                        {credit.status === "active" && (
                          <Button variant="ghost" size="sm" onClick={() => revoke(credit)}>{t("wallets.revoke")}</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">{t("wallets.ledger")}</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>{t("wallets.time")}</TableHead><TableHead>{t("wallets.type")}</TableHead>
                  <TableHead>{t("wallets.amount")}</TableHead><TableHead>{t("wallets.order")}</TableHead><TableHead>{t("wallets.note")}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {summary.transactions.map((txn) => (
                    <TableRow key={txn.id}>
                      <TableCell className="text-xs">{new Date(txn.created_at).toLocaleString()}</TableCell>
                      <TableCell className="text-xs">{t(`wallets.type_${txn.type}` as "wallets.type_grant")}</TableCell>
                      <TableCell className={Number(txn.amount) < 0 ? "text-red-600" : "text-green-600"}>{txn.amount}</TableCell>
                      <TableCell className="text-xs font-mono">{txn.order_id?.slice(0, 8)}</TableCell>
                      <TableCell className="text-xs">{txn.note}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
