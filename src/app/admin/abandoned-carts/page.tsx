"use client"

import { useCallback, useEffect, useState } from "react"
import { useI18n } from "@/contexts/i18n-context"
import { formatMoney } from "@/lib/format"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"
import { PageHeader, DataTable, type ColumnDef } from "../_components";
import { ArrowsClockwise, Clock, Envelope, FloppyDisk, MagnifyingGlass, PaperPlaneTilt, ShoppingCart } from "@phosphor-icons/react";

const ABANDONED_PAGE_SIZE = 20;

// ─── 弃单数据类型 ───
interface AbandonedCart {
  id: string
  user_id?: string
  email?: string
  items: unknown
  total: string
  coupon_sent: boolean
  coupon_id?: string
  notified_at?: string
  abandoned_at: string
  recovered_at?: string
}

// ─── 邮件模板数据类型 ───
interface EmailTemplate {
  id: string
  key: string
  name: string
  subject: string
  body_html: string
  variables?: string
  is_active: boolean
}

// ─── 邮件模板子组件 ───
function EmailTemplatesPanel() {
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
        body: JSON.stringify({ id: tmpl.id, subject: tmpl.subject, body_html: tmpl.body_html, is_active: tmpl.is_active }),
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
    setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, [field]: value } : t)))
  }

  const templateLabels: Record<string, string> = {
    payment_confirmed: "付款确认",
    shipped: "发货通知",
    abandoned_cart: "弃单挽回",
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Envelope className="h-5 w-5" /> 邮件模板
          </h3>
          <p className="text-sm text-muted-foreground">管理通知邮件模板，支持 {`{{变量}}`} 替换</p>
        </div>
        {templates.length > 0 && (
          <Button variant="outline" size="sm" onClick={loadTemplates} disabled={loading}>
            <ArrowsClockwise className="h-4 w-4 mr-1" /> 刷新
          </Button>
        )}
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
                    <Switch checked={tmpl.is_active} onCheckedChange={(v) => updateField(tmpl.id, "is_active", v)} />
                  </div>
                </div>
                <div>
                  <Label>邮件主题</Label>
                  <Input value={tmpl.subject} onChange={(e) => updateField(tmpl.id, "subject", e.target.value)} />
                </div>
                <div>
                  <Label>邮件内容 (HTML)</Label>
                  <Textarea value={tmpl.body_html} onChange={(e) => updateField(tmpl.id, "body_html", e.target.value)} rows={15} className="font-mono text-sm" />
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
  )
}

// ─── 主页面 ───
export default function AdminAbandonedCartsPage() {
  const { t } = useI18n()
  const [carts, setCarts] = useState<AbandonedCart[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [recoveredFilter, setRecoveredFilter] = useState<"all" | "recovered" | "pending">("all")
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)

  const loadCarts = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set("page", String(page))
      params.set("pageSize", String(ABANDONED_PAGE_SIZE))
      if (search) params.set("search", search)
      if (recoveredFilter === "recovered") params.set("recovered", "true")
      if (recoveredFilter === "pending") params.set("recovered", "false")
      const res = await fetch(`/api/admin/abandoned-carts?${params.toString()}`)
      const json = await res.json()
      setCarts(json.data || [])
      setTotal(Number(json.total) || 0)
    } catch {
      toast.error("加载弃单列表失败")
    } finally {
      setLoading(false)
    }
  }, [page, search, recoveredFilter])

  useEffect(() => { loadCarts() }, [loadCarts])
  useEffect(() => { setPage(1) }, [search, recoveredFilter])

  const handleCheckNow = async () => {
    setProcessing(true)
    try {
      const res = await fetch("/api/admin/abandoned-carts", { method: "POST" })
      const json = await res.json()
      toast.success(`已处理 ${json.processed} 条弃单`)
      loadCarts()
    } catch {
      toast.error("处理失败")
    } finally {
      setProcessing(false)
    }
  }

  const pending = carts.filter((c) => !c.recovered_at && !c.coupon_sent)
  const recovered = carts.filter((c) => c.recovered_at)
  const sentCoupon = carts.filter((c) => c.coupon_sent && !c.recovered_at)

  if (loading) {
    return (
      <div className="flex"><div className="flex-1 p-8 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex"><div className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShoppingCart className="h-6 w-6" /> 弃单管理
            </h1>
            <p className="text-muted-foreground mt-1">追踪弃单，2小时自动发送挽回优惠券</p>
          </div>
        </div>

        <Tabs defaultValue="carts">
          <TabsList className="mb-4">
            <TabsTrigger value="carts">弃单列表 ({carts.length})</TabsTrigger>
            <TabsTrigger value="templates">
              <Envelope className="h-4 w-4 mr-1" /> 邮件模板
            </TabsTrigger>
          </TabsList>

          <TabsContent value="carts">
            {/* Stats —— 基于当前分页数据计算，仅作快速观察；不参与服务端统计 */}
            <div className="flex items-center justify-between mb-4">
              <div className="grid grid-cols-3 gap-4 flex-1">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground">待处理弃单</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-yellow-600">{pending.length}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground">已发券挽回</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-blue-600">{sentCoupon.length}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground">已恢复</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">{recovered.length}</div>
                  </CardContent>
                </Card>
              </div>
              <div className="flex gap-2 ml-4">
                <Button variant="outline" size="sm" onClick={loadCarts}>
                  <ArrowsClockwise className="h-4 w-4 mr-1" /> 刷新
                </Button>
                <Button size="sm" onClick={handleCheckNow} disabled={processing}>
                  <PaperPlaneTilt className="h-4 w-4 mr-1" />
                  {processing ? "处理中..." : "检查并发送"}
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-4">
              <div className="relative w-72">
                <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="搜索邮箱 / user_id"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex gap-1">
                {([
                  { key: "all", label: "全部" },
                  { key: "pending", label: "未恢复" },
                  { key: "recovered", label: "已恢复" },
                ] as const).map((opt) => (
                  <Button
                    key={opt.key}
                    size="sm"
                    variant={recoveredFilter === opt.key ? "default" : "outline"}
                    onClick={() => setRecoveredFilter(opt.key)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>

            {(() => {
              const columns: ColumnDef<AbandonedCart>[] = [
                {
                  header: "用户/邮箱",
                  accessor: (c) => (
                    <div>
                      <div className="text-sm">{c.email || "未知"}</div>
                      {c.user_id && <div className="text-xs text-muted-foreground">{String(c.user_id).slice(0, 8)}</div>}
                    </div>
                  ),
                },
                { header: "金额", accessor: (c) => `$${formatMoney(c.total)}` },
                {
                  header: "状态",
                  accessor: (c) => {
                    const isExpired = !c.recovered_at && !c.coupon_sent &&
                      new Date(c.abandoned_at) < new Date(Date.now() - 2 * 3600000);
                    if (c.recovered_at) return <Badge className="bg-green-100 text-green-700">已恢复</Badge>;
                    if (c.coupon_sent) return <Badge className="bg-blue-100 text-blue-700">已发券</Badge>;
                    if (isExpired) return (
                      <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                        <Clock className="h-3 w-3" /> 待处理
                      </Badge>
                    );
                    return <Badge variant="secondary">等待中</Badge>;
                  },
                },
                {
                  header: "弃单时间",
                  accessor: (c) => (
                    <span className="text-sm">{new Date(c.abandoned_at).toLocaleString("zh-CN")}</span>
                  ),
                },
                {
                  header: "通知时间",
                  accessor: (c) => (
                    <span className="text-sm">
                      {c.notified_at ? new Date(c.notified_at).toLocaleString("zh-CN") : "-"}
                    </span>
                  ),
                },
              ];

              return loading && carts.length === 0 ? (
                <Skeleton className="h-64 w-full rounded-lg" />
              ) : (
                <DataTable
                  data={carts}
                  columns={columns}
                  keyExtractor={(c) => c.id}
                  pagination={{
                    page,
                    pageSize: ABANDONED_PAGE_SIZE,
                    total,
                    onPageChange: setPage,
                  }}
                />
              );
            })()}
          </TabsContent>

          <TabsContent value="templates">
            <EmailTemplatesPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
