"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { PageHeader } from "../_components";
import { ArrowsClockwise, Envelope, FloppyDisk } from "@phosphor-icons/react";

interface EmailTemplate {
  id: string
  key: string
  name: string
  subject: string
  body_html: string
  variables?: string
  is_active: boolean
}

export default function AdminEmailTemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadTemplates = async () => {
    try {
      const res = await fetch("/api/admin/email-templates")
      const json = await res.json()
      setTemplates(json.data || [])
    } catch {
      toast.error("加载模板失败")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadTemplates() }, [])

  const handleSave = async (tmpl: EmailTemplate) => {
    setSaving(true)
    try {
      const res = await fetch("/api/admin/email-templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: tmpl.id,
          subject: tmpl.subject,
          body_html: tmpl.body_html,
          is_active: tmpl.is_active,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success("已保存")
    } catch {
      toast.error("保存失败")
    } finally {
      setSaving(false)
    }
  }

  const updateField = (id: string, field: string, value: unknown) => {
    setTemplates((prev) =>
      prev.map((t) => (t.id === id ? { ...t, [field]: value } : t))
    )
  }

  const templateLabels: Record<string, string> = {
    payment_confirmed: "付款确认",
    shipped: "发货通知",
    abandoned_cart: "弃单挽回",
  }

  if (loading) {
    return (
      <div className="flex"><div className="flex-1 p-8 space-y-4">
          <div className="flex items-center justify-between mb-6">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-9 w-24" />
          </div>
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex"><div className="flex-1 p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Envelope className="h-6 w-6" /> 邮件模板
            </h1>
            <p className="text-muted-foreground mt-1">管理通知邮件模板，支持 {`{{变量}}`} 替换</p>
          </div>
          <Button variant="outline" size="sm" onClick={loadTemplates}>
            <ArrowsClockwise className="h-4 w-4 mr-1" /> 刷新
          </Button>
        </div>

        {templates.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              暂无邮件模板 — 请在 Supabase 中运行 seed.sql
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue={templates[0]?.key}>
            <TabsList className="mb-4">
              {templates.map((t) => (
                <TabsTrigger key={t.key} value={t.key}>
                  {templateLabels[t.key] || t.name}
                </TabsTrigger>
              ))}
            </TabsList>

            {templates.map((tmpl) => (
              <TabsContent key={tmpl.key} value={tmpl.key}>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">{templateLabels[tmpl.key] || tmpl.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        可用变量: <code className="text-xs bg-gray-100 px-1 rounded">{tmpl.variables?.split(",").map(v => `{{${v.trim()}}}`).join(", ")}</code>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-sm">启用</Label>
                      <Switch
                        checked={tmpl.is_active}
                        onCheckedChange={(v) => updateField(tmpl.id, "is_active", v)}
                      />
                    </div>
                  </div>

                  <div>
                    <Label>邮件主题</Label>
                    <Input value={tmpl.subject} onChange={(e) => updateField(tmpl.id, "subject", e.target.value)} />
                  </div>

                  <div>
                    <Label>邮件内容 (HTML)</Label>
                    <Textarea
                      value={tmpl.body_html}
                      onChange={(e) => updateField(tmpl.id, "body_html", e.target.value)}
                      rows={15}
                      className="font-mono text-sm"
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={() => handleSave(tmpl)} disabled={saving}>
                      <FloppyDisk className="h-4 w-4 mr-1" /> {saving ? "保存中..." : "保存"}
                    </Button>
                  </div>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>
    </div>
  )
}
