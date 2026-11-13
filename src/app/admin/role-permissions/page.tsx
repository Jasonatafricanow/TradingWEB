"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/client-api"
import { useI18n } from "@/contexts/i18n-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ADMIN_NAV_GROUPS } from "@/components/admin-navigation"
import { FloppyDisk, Key } from "@phosphor-icons/react"

interface ManagerGrant { all: boolean; sections: string[] }

export default function RolePermissionsPage() {
  const { t } = useI18n()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [grantable, setGrantable] = useState<string[]>([])
  const [grant, setGrant] = useState<ManagerGrant>({ all: false, sections: [] })

  useEffect(() => {
    apiFetch("/api/admin/role-permissions")
      .then((res) => res.ok ? res.json() : Promise.reject(new Error(String(res.status))))
      .then((json) => {
        setGrantable(json.data.sections)
        setGrant(json.data.manager)
      })
      .catch(() => toast.error(t("rbac.load_failed")))
      .finally(() => setLoading(false))
  }, [t])

  const groups = useMemo(() => ADMIN_NAV_GROUPS
    .map((group) => ({ ...group, items: group.items.filter((item) => grantable.includes(item.id)) }))
    .filter((group) => group.items.length > 0), [grantable])

  const toggle = (id: string) => setGrant((current) => ({
    ...current,
    sections: current.sections.includes(id)
      ? current.sections.filter((s) => s !== id)
      : [...current.sections, id],
  }))

  const save = async () => {
    setSaving(true)
    try {
      const res = await apiFetch("/api/admin/role-permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manager: grant }),
      })
      if (!res.ok) throw new Error(String(res.status))
      const json = await res.json()
      setGrant(json.data.manager)
      toast.success(t("rbac.saved"))
    } catch {
      toast.error(t("rbac.save_failed"))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-8"><Skeleton className="h-96 w-full" /></div>

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Key className="h-6 w-6" /> {t("rbac.title")}</h1>
        <Button onClick={save} disabled={saving}><FloppyDisk className="h-4 w-4 mr-1" /> {t("common.save")}</Button>
      </div>
      <p className="text-sm text-muted-foreground">{t("rbac.manager_intro")}</p>
      <Card>
        <CardHeader><CardTitle className="text-base">{t("role.manager")}</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <label className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={grant.all}
              onChange={(e) => setGrant((current) => ({ ...current, all: e.target.checked }))}
            />
            <span>
              <span className="font-medium">{t("rbac.grant_all")}</span>
              <span className="block text-xs text-muted-foreground">{t("rbac.grant_all_hint")}</span>
            </span>
          </label>
          {groups.map((group) => (
            <div key={group.id}>
              <div className="mb-2 text-xs font-semibold text-gray-500">{t(group.labelKey)}</div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {group.items.map((item) => (
                  <label key={item.id} className={`flex items-center gap-2 text-sm ${grant.all ? "opacity-60" : ""}`}>
                    <input
                      type="checkbox"
                      disabled={grant.all}
                      checked={grant.all || grant.sections.includes(item.id)}
                      onChange={() => toggle(item.id)}
                    />
                    {t(item.labelKey)}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">{t("rbac.scope_note")}</p>
        </CardContent>
      </Card>
    </div>
  )
}
