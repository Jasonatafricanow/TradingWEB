"use client"

import { useCallback, useEffect, useState } from "react"
import { useI18n } from "@/contexts/i18n-context"
import { apiFetch } from "@/lib/client-api"
import { formatMoney } from "@/lib/format"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { PageHeader, DataTable, type ColumnDef } from "../_components";
import { ArrowsClockwise, CheckCircle, Eye, MagnifyingGlass, Package, WarningCircle, XCircle } from "@phosphor-icons/react";

const REFUND_PAGE_SIZE = 20;

interface Refund {
  id: string
  order_id: string
  reason: string
  amount: string
  status: "pending" | "approved" | "rejected" | "returned" | "completed"
  evidence?: string
  admin_note?: string
  restocked: boolean
  created_at: string
  processed_at?: string
  order?: { order_no: string; buyer_email?: string; total_amount: string }
  orders?: { order_no: string; buyer_email?: string; total_amount: string }
}

function getRefundOrderNo(refund: Refund): string {
  return refund.orders?.order_no || refund.order?.order_no || refund.order_id;
}

const statusLabels: Record<string, string> = {
  pending: "待处理",
  approved: "已通过(待退货)",
  rejected: "已拒绝",
  returned: "已退货(待入库)",
  completed: "已完成",
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  approved: "bg-blue-100 text-blue-700",
  rejected: "bg-red-100 text-red-700",
  returned: "bg-purple-100 text-purple-700",
  completed: "bg-green-100 text-green-700",
}

export default function AdminRefundsPage() {
  const { t } = useI18n()
  const [refunds, setRefunds] = useState<Refund[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected" | "returned">("all")
  const [loading, setLoading] = useState(true)
  const [detailOpen, setDetailOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkAction, setBulkAction] = useState<"approved" | "rejected">("approved")
  const [bulkIds, setBulkIds] = useState("")
  const [bulkNote, setBulkNote] = useState("")
  const [bulkRunning, setBulkRunning] = useState(false)
  const [selected, setSelected] = useState<Refund | null>(null)

  // Create form
  const [orderId, setOrderId] = useState("")
  const [reason, setReason] = useState("")
  const [amount, setAmount] = useState("")
  const [adminNote, setAdminNote] = useState("")

  const loadRefunds = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set("page", String(page))
      params.set("pageSize", String(REFUND_PAGE_SIZE))
      if (search) params.set("search", search)
      if (statusFilter !== "all") params.set("status", statusFilter)
      const res = await apiFetch(`/api/admin/refunds?${params.toString()}`)
      const json = await res.json()
      setRefunds(json.data || [])
      setTotal(Number(json.total) || 0)
    } catch {
      toast.error("加载退款列表失败")
    } finally {
      setLoading(false)
    }
  }, [page, search, statusFilter])

  useEffect(() => { loadRefunds() }, [loadRefunds])
  useEffect(() => { setPage(1) }, [search, statusFilter])

  const handleProcess = async (id: string, action: "approved" | "rejected") => {
    try {
      const res = await apiFetch("/api/admin/refunds", {
        method: "PUT",
        body: JSON.stringify({ id, action, admin_note: adminNote || undefined }),
      })
      if (!res.ok) throw new Error()
      toast.success(action === "approved" ? "已通过" : "已拒绝")
      setAdminNote("")
      loadRefunds()
    } catch {
      toast.error("操作失败")
    }
  }

  const handleReturn = async (id: string) => {
    try {
      const res = await apiFetch("/api/admin/refunds", {
        method: "PUT",
        body: JSON.stringify({ id, action: "returned" }),
      })
      if (!res.ok) throw new Error()
      toast.success("退货确认，库存已加回")
      loadRefunds()
    } catch {
      toast.error("退货处理失败")
    }
  }

  const openDetail = async (id: string) => {
    try {
      const res = await apiFetch(`/api/admin/refunds/${id}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.error) throw new Error(json.error || "Failed to load refund detail")
      setSelected(json.data)
      setDetailOpen(true)
    } catch {
      toast.error("加载详情失败")
    }
  }

  const handleCreate = async () => {
    if (!orderId || !reason || !amount) {
      toast.error("请填写完整信息")
      return
    }
    try {
      const res = await apiFetch("/api/admin/refunds", {
        method: "POST",
        body: JSON.stringify({ order_id: orderId, reason, amount }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
      toast.success("退款申请已创建")
      setCreateOpen(false)
      setOrderId(""); setReason(""); setAmount("")
      loadRefunds()
    } catch (err) {
      toast.error(err instanceof Error ? (err as Error).message : "创建失败")
    }
  }

  const handleBulk = async () => {
    // 接受换行/逗号/空格分隔；过滤空字符串与太长行（防 DoS）
    const ids = bulkIds
      .split(/[\s,;\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length <= 64);
    if (ids.length === 0) {
      toast.error("请填写至少 1 个退款 ID");
      return;
    }
    if (ids.length > 200) {
      toast.error("单次最多 200 个");
      return;
    }
    setBulkRunning(true);
    try {
      const res = await apiFetch("/api/admin/refunds/bulk", {
        method: "POST",
        body: JSON.stringify({ ids, action: bulkAction, admin_note: bulkNote || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? json?.error ?? "批量操作失败");
      const data = json.data as { ok: number; fail: number; errors: Array<{ id: string; message: string }> };
      if (data.fail === 0) {
        toast.success(`批量${bulkAction === "approved" ? "通过" : "拒绝"} ${data.ok} 条`);
      } else {
        toast.warning(`成功 ${data.ok} 条，失败 ${data.fail} 条`);
      }
      setBulkOpen(false);
      setBulkIds(""); setBulkNote("");
      loadRefunds();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "批量操作失败");
    } finally {
      setBulkRunning(false);
    }
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
              <WarningCircle className="h-6 w-6" /> {t("refund.title")}
            </h1>
            <p className="text-muted-foreground mt-1">{t("refund.title_desc")}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadRefunds}>
              <ArrowsClockwise className="h-4 w-4 mr-1" /> 刷新
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setBulkOpen(true); setBulkAction("approved"); setBulkIds(""); setBulkNote(""); }}>
              批量操作
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">待处理</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">
                {refunds.filter((r) => r.status === "pending").length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">已通过待退货</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
              {refunds.filter((r) => r.status === "approved" || r.status === "returned").length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">已完成</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
         {refunds.filter((r) => r.status === "completed").length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">已拒绝</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
    {refunds.filter((r) => r.status === "rejected").length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search + Status filter */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative w-80">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索订单号 / 退款原因"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {([
              { key: "all", label: "全部" },
              { key: "pending", label: "待处理" },
              { key: "approved", label: "已通过" },
              { key: "rejected", label: "已拒绝" },
              { key: "returned", label: "已退货" },
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

        {/* Table */}
        {(() => {
          const columns: ColumnDef<Refund>[] = [
            {
              header: "订单号",
              accessor: (r) => <span className="font-mono text-sm">{getRefundOrderNo(r)}</span>,
            },
            { header: "退款金额", accessor: (r) => <span className="font-medium">${formatMoney(r.amount)}</span> },
            {
              header: "原因",
              accessor: (r) => (
                <span className="max-w-[160px] truncate inline-block align-middle" title={r.reason}>
                  {r.reason}
                </span>
              ),
            },
            {
              header: "状态",
              accessor: (r) => (
                <Badge className={statusColors[r.status]} variant="outline">
                  {statusLabels[r.status]}
                </Badge>
              ),
            },
            {
              header: "已退库",
              accessor: (r) =>
                r.restocked ? (
                  <span className="flex items-center gap-1 text-green-600 text-sm">
                    <Package className="h-3 w-3" /> 已退库
                  </span>
                ) : (
                  <span className="text-muted-foreground text-sm">-</span>
                ),
            },
            {
              header: "申请时间",
              accessor: (r) => <span className="text-sm text-muted-foreground">{new Date(r.created_at).toLocaleDateString("zh-CN")}</span>,
            },
            {
              header: "操作",
              accessor: (r) => (
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openDetail(r.id)} title="详情">
                    <Eye className="h-4 w-4" />
                  </Button>
                  {r.status === "pending" && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => handleProcess(r.id, "approved")} className="text-green-600" title="通过">
                        <CheckCircle className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleProcess(r.id, "rejected")} className="text-red-600" title="拒绝">
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  {(r.status === "approved" || r.status === "returned") && (
                    <Button variant="ghost" size="sm" onClick={() => handleReturn(r.id)} title="确认退货入库">
                      <Package className="h-4 w-4 text-blue-600" />
                    </Button>
                  )}
                </div>
              ),
            },
          ];

          return loading && refunds.length === 0 ? (
            <Skeleton className="h-64 w-full rounded-lg" />
          ) : (
            <DataTable
              data={refunds}
              columns={columns}
              keyExtractor={(r) => r.id}
              pagination={{
                page,
                pageSize: REFUND_PAGE_SIZE,
                total,
                onPageChange: setPage,
              }}
            />
          );
        })()}

        {/* Bulk Dialog */}
        <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>批量退款操作</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>动作</Label>
                <div className="flex gap-2 mt-1">
                  <Button
                    size="sm"
                    variant={bulkAction === "approved" ? "default" : "outline"}
                    onClick={() => setBulkAction("approved")}
                    className="text-green-700"
                  >
                    批量通过
                  </Button>
                  <Button
                    size="sm"
                    variant={bulkAction === "rejected" ? "default" : "outline"}
                    onClick={() => setBulkAction("rejected")}
                    className="text-red-600"
                  >
                    批量拒绝
                  </Button>
                </div>
              </div>
              <div>
                <Label>退款 ID（每行 / 逗号 / 空格 分隔，最多 200 个）</Label>
                <Textarea
                  rows={6}
                  value={bulkIds}
                  onChange={(e) => setBulkIds(e.target.value)}
                  placeholder="uuid-1&#10;uuid-2&#10;uuid-3"
                  className="font-mono text-xs"
                />
              </div>
              <div>
                <Label>备注（可选，作用于全部条目）</Label>
                <Textarea
                  rows={2}
                  value={bulkNote}
                  onChange={(e) => setBulkNote(e.target.value)}
                  placeholder="批量通过：客户提供新证据..."
                />
              </div>
              <Button onClick={handleBulk} disabled={bulkRunning} className="w-full">
                {bulkRunning ? "处理中..." : `确认批量${bulkAction === "approved" ? "通过" : "拒绝"}`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Detail Dialog */}
        <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>退款详情</DialogTitle></DialogHeader>
            {selected && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-muted-foreground">退款 ID:</span> <code className="text-xs">{selected.id}</code></div>
                  <div><span className="text-muted-foreground">订单:</span> {getRefundOrderNo(selected)}</div>
                  <div><span className="text-muted-foreground">金额:</span> ${formatMoney(selected.amount)}</div>
                  <div>
                    <span className="text-muted-foreground">状态:</span>{" "}
                    <Badge className={statusColors[selected.status]} variant="outline">
                      {statusLabels[selected.status]}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label>退款原因</Label>
                  <p className="text-sm p-2 bg-gray-50 rounded mt-1">{selected.reason}</p>
                </div>
                {selected.evidence && (
                  <div>
                    <Label>凭证说明</Label>
                    <p className="text-sm p-2 bg-gray-50 rounded mt-1">{selected.evidence}</p>
                  </div>
                )}
                {selected.admin_note && (
                  <div>
                    <Label>处理备注</Label>
                    <p className="text-sm p-2 bg-gray-50 rounded mt-1">{selected.admin_note}</p>
                  </div>
                )}
                <div className="text-xs text-muted-foreground">
                  创建: {new Date(selected.created_at).toLocaleString("zh-CN")}
                  {selected.processed_at && ` | 处理: ${new Date(selected.processed_at).toLocaleString("zh-CN")}`}
                  {selected.restocked && " | 已退库"}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
