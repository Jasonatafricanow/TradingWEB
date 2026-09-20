"use client"
import { useCallback, useEffect, useState } from "react"
import { apiFetch } from "@/lib/client-api"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { PageHeader, DataTable, type ColumnDef } from "../_components";
import { ArrowsClockwise, CheckCircle, MagnifyingGlass, Star, XCircle } from "@phosphor-icons/react";

interface ReviewRow {
  id: string
  product_id: string
  user_id: string
  rating: number
  title: string | null
  content: string | null
  is_approved: boolean
  created_at: string
  product_title?: string | null
}

const PAGE_SIZE = 20;

export default function AdminReviewsPage() {
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "approved" | "pending">("all")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkApproved, setBulkApproved] = useState(true)
  const [bulkIds, setBulkIds] = useState("")
  const [bulkRunning, setBulkRunning] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set("page", String(page))
      params.set("pageSize", String(PAGE_SIZE))
      if (search) params.set("search", search)
      if (statusFilter === "approved") params.set("isApproved", "true")
      if (statusFilter === "pending") params.set("isApproved", "false")
      const res = await apiFetch(`/api/admin/reviews?${params.toString()}`)
      const json = await res.json()
      if (!res.ok) {
        const message = typeof json?.error === "string"
          ? json.error
          : (json?.error?.message ?? "Failed to load")
        throw new Error(message)
      }
      setRows(json.data || [])
      setTotal(Number(json.total) || 0)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }, [page, search, statusFilter])

  useEffect(() => { load() }, [load])
  // 搜索/筛选变化回到第 1 页
  useEffect(() => { setPage(1) }, [search, statusFilter])

  const handleApprove = async (id: string, approved: boolean) => {
    await apiFetch("/api/admin/reviews", { method: "PUT", body: JSON.stringify({ id, approved }) })
    toast.success(approved ? "已通过" : "已拒绝")
    load()
  }
  const handleDelete = async (id: string) => {
    await apiFetch("/api/admin/reviews", { method: "DELETE", body: JSON.stringify({ id }) })
    toast.success("已删除")
    load()
  }

  const handleBulk = async () => {
    const ids = bulkIds
      .split(/[\s,;\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length <= 64);
    if (ids.length === 0) {
      toast.error("请填写至少 1 个评论 ID");
      return;
    }
    if (ids.length > 200) {
      toast.error("单次最多 200 个");
      return;
    }
    setBulkRunning(true);
    try {
      const res = await apiFetch("/api/admin/reviews/bulk", {
        method: "POST",
        body: JSON.stringify({ ids, approved: bulkApproved }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? json?.error ?? "批量操作失败");
      const data = json.data as { ok: number; fail: number; errors: Array<{ id: string; message: string }> };
      if (data.fail === 0) {
        toast.success(`批量${bulkApproved ? "通过" : "拒绝"} ${data.ok} 条`);
      } else {
        toast.warning(`成功 ${data.ok} 条，失败 ${data.fail} 条`);
      }
      setBulkOpen(false);
      setBulkIds("");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "批量操作失败");
    } finally {
      setBulkRunning(false);
    }
  }

  const columns: ColumnDef<ReviewRow>[] = [
    {
      header: "商品",
      accessor: (r) => (
        <span className="max-w-[160px] truncate inline-block align-middle" title={r.product_title ?? ""}>
          {r.product_title || (r.product_id ? String(r.product_id).slice(0, 8) : "-")}
        </span>
      ),
    },
    {
      header: "评分",
      accessor: (r) => (
        <span className="whitespace-nowrap">
          {[1, 2, 3, 4, 5].map((s) => (
            <Star
              key={s}
              className={`inline h-3 w-3 ${s <= Number(r.rating || 0) ? "text-yellow-400 fill-yellow-400" : "text-gray-200"}`}
            />
          ))}
        </span>
      ),
    },
    {
      header: "内容",
      accessor: (r) => (
        <span className="max-w-[280px] truncate inline-block align-middle" title={r.content || r.title || ""}>
          {r.content || r.title || ""}
        </span>
      ),
    },
    {
      header: "状态",
      accessor: (r) => (
        <Badge variant={r.is_approved ? "default" : "secondary"}>
          {r.is_approved ? "已通过" : "待审核"}
        </Badge>
      ),
    },
    {
      header: "操作",
      accessor: (r) => (
        <span className="flex gap-1">
          {!r.is_approved && (
            <Button variant="ghost" size="sm" onClick={() => handleApprove(r.id, true)} aria-label="通过">
              <CheckCircle className="h-4 w-4 text-green-500" />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => handleDelete(r.id)} aria-label="删除">
            <XCircle className="h-4 w-4 text-red-500" />
            </Button>
        </span>
      ),
    },
  ]

  return (
    <div className="flex">
      <div className="flex-1 p-8 space-y-4">
        <PageHeader title="评论审核" description="按商品、用户或状态过滤。" />

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-80">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索标题/内容/商品"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-1">
            {(["all", "pending", "approved"] as const).map((key) => (
              <Button
                key={key}
                size="sm"
                variant={statusFilter === key ? "default" : "outline"}
                onClick={() => setStatusFilter(key)}
              >
                {key === "all" ? "全部" : key === "pending" ? "待审核" : "已通过"}
              </Button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={load}>
            <ArrowsClockwise className="h-4 w-4 mr-1" /> 刷新
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setBulkOpen(true); setBulkApproved(true); setBulkIds(""); }}>
            批量审核
          </Button>
        </div>

        {error && (
          <Card className="border-red-200">
            <CardContent className="p-3 text-red-600 text-sm">{error}</CardContent>
          </Card>
        )}

        {loading ? (
          <Skeleton className="h-64 w-full rounded-lg" />
        ) : (
          <DataTable
            data={rows}
            columns={columns}
            keyExtractor={(r) => r.id}
            pagination={{
              page,
              pageSize: PAGE_SIZE,
              total,
              onPageChange: setPage,
            }}
          />
        )}

        {/* Bulk Dialog */}
        <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>批量评论审核</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>动作</Label>
                <div className="flex gap-2 mt-1">
                  <Button
                    size="sm"
                    variant={bulkApproved ? "default" : "outline"}
                    onClick={() => setBulkApproved(true)}
                    className="text-green-700"
                  >
                    批量通过
                  </Button>
                  <Button
                    size="sm"
                    variant={!bulkApproved ? "default" : "outline"}
                    onClick={() => setBulkApproved(false)}
                    className="text-red-600"
                  >
                    批量拒绝
                  </Button>
                </div>
              </div>
              <div>
                <Label>评论 ID（每行 / 逗号 / 空格 分隔，最多 200 个）</Label>
                <Textarea
                  rows={6}
                  value={bulkIds}
                  onChange={(e) => setBulkIds(e.target.value)}
                  placeholder="uuid-1&#10;uuid-2&#10;uuid-3"
                  className="font-mono text-xs"
                />
              </div>
              <Button onClick={handleBulk} disabled={bulkRunning} className="w-full">
                {bulkRunning ? "处理中..." : `确认批量${bulkApproved ? "通过" : "拒绝"}`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
