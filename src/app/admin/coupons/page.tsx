"use client"

import { useCallback, useEffect, useState } from "react"
import { useI18n } from "@/contexts/i18n-context"
import { apiFetch } from "@/lib/client-api"
import { formatMoney } from "@/lib/format"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { PageHeader, DataTable, type ColumnDef } from "../_components";
import { ArrowsClockwise, Copy, MagnifyingGlass, Plus, Tag, Trash } from "@phosphor-icons/react";

const COUPON_PAGE_SIZE = 20;

interface Coupon {
  id: string
  code: string
  type: "percentage" | "fixed"
  value: string
  min_order_amount: string
  max_discount?: string
  usage_limit: number
  used_count: number
  expires_at?: string
  is_active: boolean
  campaign_source?: string
  campaign_name?: string
  customer_segment?: string
  description?: string
  created_at: string
}

export default function AdminCouponsPage() {
  const { t } = useI18n()
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all")
  const [dialogOpen, setDialogOpen] = useState(false)

  // Form state
  const [code, setCode] = useState("")
  const [type, setType] = useState<"percentage" | "fixed">("percentage")
  const [value, setValue] = useState("")
  const [minAmount, setMinAmount] = useState("0")
  const [maxDiscount, setMaxDiscount] = useState("")
  const [usageLimit, setUsageLimit] = useState("0")
  const [expiresAt, setExpiresAt] = useState("")
  const [description, setDescription] = useState("")
  const [campaignSource, setCampaignSource] = useState("")
  const [campaignName, setCampaignName] = useState("")
  const [customerSegment, setCustomerSegment] = useState("")
  const [batchDialogOpen, setBatchDialogOpen] = useState(false)
  const [batchPrefix, setBatchPrefix] = useState("")
  const [batchCount, setBatchCount] = useState("10")
  const [batchResult, setBatchResult] = useState<{ created: number; codes?: string[] } | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkActive, setBulkActive] = useState(true)
  const [bulkIds, setBulkIds] = useState("")
  const [bulkRunning, setBulkRunning] = useState(false)

  const loadCoupons = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set("page", String(page))
      params.set("pageSize", String(COUPON_PAGE_SIZE))
      if (search) params.set("search", search)
      if (statusFilter === "active") params.set("isActive", "true")
      if (statusFilter === "inactive") params.set("isActive", "false")
      const res = await apiFetch(`/api/admin/coupons?${params.toString()}`)
      const json = await res.json()
      setCoupons(json.data || [])
      setTotal(Number(json.total) || 0)
    } catch {
      toast.error("加载优惠券失败")
    } finally {
      setLoading(false)
    }
  }, [page, search, statusFilter])

  useEffect(() => { loadCoupons() }, [loadCoupons])
  // 搜索/筛选变化回到第 1 页
  useEffect(() => { setPage(1) }, [search, statusFilter])

  const handleAdd = async () => {
    if (!code || !value) {
      toast.error("请填写优惠码和折扣值")
      return
    }
    try {
      const res = await apiFetch("/api/admin/coupons", {
        method: "POST",
        body: JSON.stringify({
          code, type, value, min_order_amount: minAmount,
          max_discount: maxDiscount || undefined,
          usage_limit: parseInt(usageLimit) || 0,
          expires_at: expiresAt || undefined, description,
          campaign_source: campaignSource || undefined,
          campaign_name: campaignName || undefined,
          customer_segment: customerSegment || undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
      toast.success("优惠券已创建")
      setDialogOpen(false)
      setCode(""); setValue(""); setDescription("")
      loadCoupons()
    } catch (err) {
      toast.error(err instanceof Error ? (err as Error).message : "创建失败")
    }
  }

  const handleToggle = async (coupon: Coupon) => {
    try {
      const res = await apiFetch("/api/admin/coupons", {
        method: "PUT",
        body: JSON.stringify({ id: coupon.id, is_active: !coupon.is_active }),
      })
      if (!res.ok) throw new Error()
      loadCoupons()
    } catch {
      toast.error("操作失败")
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("确认删除此优惠券？")) return
    try {
      await apiFetch("/api/admin/coupons", {
        method: "DELETE",
        body: JSON.stringify({ id }),
      })
      toast.success("已删除")
      loadCoupons()
    } catch {
      toast.error("删除失败")
    }
  }

  const handleBulk = async () => {
    const ids = bulkIds
      .split(/[\s,;\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length <= 64);
    if (ids.length === 0) {
      toast.error("请填写至少 1 个优惠码 ID");
      return;
    }
    if (ids.length > 200) {
      toast.error("单次最多 200 个");
      return;
    }
    setBulkRunning(true);
    try {
      const res = await apiFetch("/api/admin/coupons/bulk", {
        method: "POST",
        body: JSON.stringify({ ids, is_active: bulkActive }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? json?.error ?? "批量操作失败");
      const data = json.data as { ok: number; fail: number; errors: Array<{ id: string; message: string }> };
      if (data.fail === 0) {
        toast.success(`批量${bulkActive ? "启用" : "禁用"} ${data.ok} 条`);
      } else {
        toast.warning(`成功 ${data.ok} 条，失败 ${data.fail} 条`);
      }
      setBulkOpen(false);
      setBulkIds("");
      loadCoupons();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "批量操作失败");
    } finally {
      setBulkRunning(false);
    }
  }

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code)
    toast.success("已复制: " + code)
  }

  if (loading) {
    return (
      <div className="flex"><div className="flex-1 p-8 space-y-4">
          <div className="flex items-center justify-between mb-6">
            <Skeleton className="h-8 w-48" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-24" />
            </div>
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
              <Tag className="h-6 w-6" /> 优惠券管理
            </h1>
            <p className="text-muted-foreground mt-1">创建和管理折扣码、优惠券</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadCoupons}>
              <ArrowsClockwise className="h-4 w-4 mr-1" /> 刷新
            </Button>

            <Button variant="outline" size="sm" onClick={() => { setBulkOpen(true); setBulkActive(true); setBulkIds(""); }}>
              批量启用/禁用
            </Button>

            <Button size="sm" onClick={() => { setBatchDialogOpen(true); setBatchResult(null); }}>
              <Plus className="h-4 w-4 mr-1" /> 批量生成
            </Button>
            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open && !batchDialogOpen) { setBatchResult(null); } }}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" /> 创建优惠券</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>创建优惠券</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>优惠码</Label>
                    <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="如: WELCOME10" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>类型</Label>
                      <Select value={type} onValueChange={(v: string) => setType(v as "percentage" | "fixed")}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percentage">百分比 (%)</SelectItem>
                          <SelectItem value="fixed">固定金额 ($)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>折扣值</Label>
                      <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder={type === "percentage" ? "如: 10" : "如: 5.00"} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>最低订单金额</Label>
                      <Input type="number" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} />
                    </div>
                    <div>
                      <Label>最大折扣（百分比时）</Label>
                      <Input type="number" value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value)} placeholder="不限制" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>使用上限（0=不限）</Label>
                      <Input type="number" value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} />
                    </div>
                    <div>
                      <Label>过期时间</Label>
                      <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <Label>描述</Label>
                    <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="可选" />
                  </div>
                  <div>
                    <Label>活动来源</Label>
                    <Select value={campaignSource} onValueChange={(v) => setCampaignSource(v === "__none__" ? "" : v)}>
                      <SelectTrigger><SelectValue placeholder="不指定" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">不指定</SelectItem>
                        <SelectItem value="instagram">Instagram</SelectItem>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="facebook">Facebook</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>活动名称</Label>
                    <Input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="例如：July VIP Sale" />
                  </div>
                  <div>
                    <Label>客户分层</Label>
                    <Select value={customerSegment} onValueChange={(v) => setCustomerSegment(v === "__none__" ? "" : v)}>
                      <SelectTrigger><SelectValue placeholder="不限制" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">不限制</SelectItem>
                        <SelectItem value="vip">VIP</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="new">New</SelectItem>
                        <SelectItem value="at_risk">At Risk</SelectItem>
                        <SelectItem value="lost">Lost</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleAdd} className="w-full">创建优惠券</Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Batch Generation Dialog */}
            <Dialog open={batchDialogOpen} onOpenChange={(open) => { setBatchDialogOpen(open); if (!open) setBatchResult(null); }}>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>批量生成优惠券</DialogTitle></DialogHeader>
                {batchResult ? (
                  <div className="space-y-3">
                    <p className="text-sm text-green-700">成功创建 {batchResult.created} 个优惠码</p>
                    {batchResult.codes && batchResult.codes.length > 0 && (
                      <div className="max-h-48 overflow-y-auto space-y-1">
                        {batchResult.codes.map((c, i) => (
                          <div key={i} className="flex items-center justify-between rounded bg-gray-50 px-3 py-1.5 text-sm">
                            <code className="font-mono font-medium">{c}</code>
                            <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(c); toast.success("已复制"); }}>
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    <Button variant="outline" className="w-full" onClick={() => { setBatchDialogOpen(false); setBatchResult(null); loadCoupons(); }}>完成</Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>前缀</Label>
                        <Input value={batchPrefix} onChange={(e) => setBatchPrefix(e.target.value.toUpperCase())} placeholder="如: VIP-JULY" />
                      </div>
                      <div>
                        <Label>数量</Label>
                        <Input type="number" value={batchCount} onChange={(e) => setBatchCount(e.target.value)} min="1" max="100" />
                      </div>
                    </div>
                    <Button onClick={async () => {
                      if (!batchPrefix.trim()) { toast.error("请输入前缀"); return; }
                      const count = parseInt(batchCount) || 10;
                      if (count < 1 || count > 100) { toast.error("数量在 1-100 之间"); return; }
                      try {
                        const res = await apiFetch("/api/admin/coupons/batch", {
                          method: "POST",
                          body: JSON.stringify({
                            prefix: batchPrefix.trim(),
                            count,
                            type, value, min_order_amount: minAmount,
                            max_discount: maxDiscount || undefined,
                            usage_limit: parseInt(usageLimit) || 0,
                            expires_at: expiresAt || undefined,
                            campaign_source: campaignSource || undefined,
                            campaign_name: campaignName || undefined,
                            customer_segment: customerSegment || undefined,
                            description,
                          }),
                        });
                        const json = await res.json();
                        if (!res.ok) throw new Error(json.error || "批量生成失败");
                        setBatchResult(json);
                        loadCoupons();
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "批量生成失败");
                      }
                    }} className="w-full">生成</Button>
                  </div>
                )}
              </DialogContent>
            </Dialog>

            {/* Bulk Enable/Disable Dialog */}
            <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>批量启用/禁用优惠券</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>动作</Label>
                    <div className="flex gap-2 mt-1">
                      <Button
                        size="sm"
                        variant={bulkActive ? "default" : "outline"}
                        onClick={() => setBulkActive(true)}
                        className="text-green-700"
                      >
                        批量启用
                      </Button>
                      <Button
                        size="sm"
                        variant={!bulkActive ? "default" : "outline"}
                        onClick={() => setBulkActive(false)}
                        className="text-red-600"
                      >
                        批量禁用
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label>优惠码 ID（每行 / 逗号 / 空格 分隔，最多 200 个）</Label>
                    <Textarea
                      rows={6}
                      value={bulkIds}
                      onChange={(e) => setBulkIds(e.target.value)}
                      placeholder="uuid-1&#10;uuid-2&#10;uuid-3"
                      className="font-mono text-xs"
                    />
                  </div>
                  <Button onClick={handleBulk} disabled={bulkRunning} className="w-full">
                    {bulkRunning ? "处理中..." : `确认批量${bulkActive ? "启用" : "禁用"}`}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative w-80">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索优惠码 / 描述 / 活动"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-1">
            {([
              { key: "all", label: "全部" },
              { key: "active", label: "启用" },
              { key: "inactive", label: "禁用" },
            ] as const).map((opt) => (
              <Button
                key={opt.key}
                size="sm"
                variant={statusFilter === opt.key ? "default" : "outline"}
                onClick={() => setStatusFilter(opt.key)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>

        {(() => {
          const expiredOrMaxed = (c: Coupon) => {
            const expired = c.expires_at ? new Date(c.expires_at) < new Date() : false;
            const maxed = c.usage_limit > 0 && c.used_count >= c.usage_limit;
            return { expired, maxed };
          };
          const columns: ColumnDef<Coupon>[] = [
            {
              header: "优惠码",
              accessor: (c) => <code className="px-2 py-1 bg-gray-100 rounded text-sm font-mono font-bold">{c.code}</code>,
            },
            {
              header: "折扣",
              accessor: (c) => (
                <span>
                  {c.type === "percentage" ? `${c.value}%` : `$${c.value}`}
                  {c.max_discount && ` (上限 $${c.max_discount})`}
                </span>
              ),
            },
            {
              header: "使用情况",
              accessor: (c) =>
                c.usage_limit > 0 ? `${c.used_count} / ${c.usage_limit}` : `${c.used_count} (无限制)`,
            },
            {
              header: "活动",
              accessor: (c) =>
                c.campaign_name || c.campaign_source ? (
                  <span className="text-xs">
                    {c.campaign_name || ""}
                    {c.campaign_name && c.campaign_source ? " · " : ""}
                    {c.campaign_source || ""}
                  </span>
                ) : (
                  <span className="text-muted-foreground">-</span>
                ),
            },
            {
              header: "分层",
              accessor: (c) =>
                c.customer_segment ? (
                  <Badge variant="outline" className="text-xs">{c.customer_segment}</Badge>
                ) : (
                  <span className="text-muted-foreground">-</span>
                ),
            },
            {
              header: "有效期",
              accessor: (c) =>
                c.expires_at
                  ? new Date(c.expires_at).toLocaleDateString("zh-CN")
                  : "永不过期",
            },
            { header: "最低金额", accessor: (c) => `$${formatMoney(c.min_order_amount)}` },
            {
              header: "状态",
              accessor: (c) => {
                const { expired, maxed } = expiredOrMaxed(c);
                if (expired) return <Badge variant="destructive">已过期</Badge>;
                if (maxed) return <Badge variant="secondary">已达上限</Badge>;
                if (c.is_active) return <Badge className="bg-green-100 text-green-700">启用</Badge>;
                return <Badge variant="outline">禁用</Badge>;
              },
            },
            {
              header: "操作",
              accessor: (c) => (
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => handleCopy(c.code || "")} title="复制">
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleToggle(c)} title={c.is_active ? "禁用" : "启用"}>
                    <Badge variant={c.is_active ? "destructive" : "secondary"} className="h-2 w-2 p-0 rounded-full" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(c.id)} title="删除">
                    <Trash className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ),
            },
          ];

          return loading && coupons.length === 0 ? (
            <Skeleton className="h-64 w-full rounded-lg" />
          ) : (
            <DataTable
              data={coupons}
              columns={columns}
              keyExtractor={(c) => c.id}
              pagination={{
                page,
                pageSize: COUPON_PAGE_SIZE,
                total,
                onPageChange: setPage,
              }}
            />
          );
        })()}
      </div>
    </div>
  )
}
