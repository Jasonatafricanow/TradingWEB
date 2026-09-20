"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { apiFetch } from "@/lib/client-api"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { ArrowsClockwise, ArrowSquareOut, Cloud, MagnifyingGlass, Plus } from "@phosphor-icons/react"
import { PageHeader } from "../_components"

type ImportJobType = "products" | "customers" | "orders" | "discounts" | "redirects" | "validate"

interface ImportJobSummary {
  id: string
  job_type: ImportJobType
  status: "pending" | "running" | "completed" | "failed"
  total_rows: number
  success_rows: number
  failed_rows: number
}

interface ImportSessionRow {
  session_id: string
  source: string
  source_store: string
  status: "open" | "running" | "completed" | "failed"
  customer_link_strategy: string
  jobs: ImportJobSummary[]
  started_at: string
  finished_at?: string | null
}

interface ListResponse {
  data: ImportSessionRow[]
  total: number
  page: number
  pageSize: number
}

const STATUS_LABELS: Record<string, string> = {
  open: "已创建",
  running: "运行中",
  completed: "已完成",
  failed: "失败",
}

const STATUS_COLORS: Record<string, string> = {
  open: "bg-gray-100 text-gray-700",
  running: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
}

const JOB_TYPE_LABELS: Record<string, string> = {
  products: "商品",
  customers: "客户",
  orders: "订单",
  discounts: "优惠码",
  redirects: "URL跳转",
  validate: "校验",
}

const DEFAULT_EXPECTED_JOBS: ImportJobType[] = ["products", "customers", "discounts", "orders", "redirects"]
const SESSION_STATUSES = ["all", "open", "running", "completed", "failed"] as const
const IMPORT_SOURCES = ["all", "shopify", "woo", "magento", "excel"] as const

const JOB_OPTIONS: Array<{ value: ImportJobType; label: string; description: string }> = [
  { value: "products", label: "商品", description: "商品、变体、图片、库存和 SEO" },
  { value: "customers", label: "客户", description: "客户资料、地址和来源映射" },
  { value: "discounts", label: "优惠码", description: "Shopify discount code 导入本地优惠码" },
  { value: "orders", label: "历史订单", description: "订单、明细、客户和商品引用" },
  { value: "redirects", label: "URL 跳转", description: "旧链接 301/302 到新独立站路径" },
]

function getInitialFilter<T extends readonly string[]>(key: string, allowed: T, fallback: T[number]): T[number] {
  if (typeof window === "undefined") return fallback
  const value = new URLSearchParams(window.location.search).get(key)
  return value && allowed.includes(value) ? value : fallback
}

function formatTs(ts: string | null | undefined): string {
  if (!ts) return "—"
  try {
    return new Date(ts).toLocaleString("zh-CN", { hour12: false })
  } catch {
    return ts ?? "—"
  }
}

function summarizeJobs(jobs: ImportJobSummary[]): { ok: number; failed: number; total: number; pieces: string[] } {
  let ok = 0
  let failed = 0
  let total = 0
  const pieces: string[] = []
  for (const j of jobs) {
    ok += j.success_rows
    failed += j.failed_rows
    total += j.total_rows
    pieces.push(`${JOB_TYPE_LABELS[j.job_type] ?? j.job_type} ${j.success_rows}/${j.total_rows}`)
  }
  return { ok, failed, total, pieces }
}

export default function AdminImportsPage() {
  const router = useRouter()
  const [sessions, setSessions] = useState<ImportSessionRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>(() => getInitialFilter("status", SESSION_STATUSES, "all"))
  const [sourceFilter, setSourceFilter] = useState<string>(() => getInitialFilter("source", IMPORT_SOURCES, "all"))
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newSource, setNewSource] = useState("shopify")
  const [newSourceStore, setNewSourceStore] = useState("")
  const [newStrategy, setNewStrategy] = useState("auto_create_user")
  const [expectedJobs, setExpectedJobs] = useState<ImportJobType[]>(DEFAULT_EXPECTED_JOBS)

  const loadSessions = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set("page", String(page))
      params.set("pageSize", String(pageSize))
      if (statusFilter !== "all") params.set("status", statusFilter)
      if (sourceFilter !== "all") params.set("source", sourceFilter)
      const res = await apiFetch(`/api/admin/import/sessions?${params.toString()}`)
      const json = (await res.json()) as ListResponse
      setSessions(json.data ?? [])
      setTotal(json.total ?? 0)
    } catch {
      toast.error("加载导入会话失败")
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter, sourceFilter])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  const filtered = sessions.filter((s) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      s.session_id.toLowerCase().includes(q) ||
      s.source_store.toLowerCase().includes(q) ||
      s.source.toLowerCase().includes(q)
    )
  })

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const toggleExpectedJob = (job: ImportJobType, checked: boolean) => {
    setExpectedJobs((current) => {
      if (checked) return current.includes(job) ? current : [...current, job]
      return current.filter((item) => item !== job)
    })
  }

  const resetCreateForm = () => {
    setNewSource("shopify")
    setNewSourceStore("")
    setNewStrategy("auto_create_user")
    setExpectedJobs(DEFAULT_EXPECTED_JOBS)
  }

  const createSession = async () => {
    const sourceStore = newSourceStore.trim()
    if (!sourceStore) {
      toast.error("请填写来源店铺标识")
      return
    }
    if (expectedJobs.length === 0) {
      toast.error("至少选择一个导入批次")
      return
    }

    setCreating(true)
    try {
      const res = await apiFetch("/api/admin/import/sessions", {
        method: "POST",
        body: JSON.stringify({
          source: newSource,
          source_store: sourceStore,
          expected_jobs: expectedJobs,
          customer_link_strategy: newStrategy,
        }),
      })
      const json = (await res.json()) as { session_id?: string; error?: string }
      if (!res.ok || !json.session_id) {
        throw new Error(json.error || "创建导入会话失败")
      }

      toast.success("导入会话已创建")
      setCreateOpen(false)
      resetCreateForm()
      await loadSessions()
      router.push(`/admin/imports/${json.session_id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建导入会话失败")
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <PageHeader
        title="导入会话"
        description="MoveShopify 等外部源推过来的迁移会话；session 状态和 jobs 进度"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadSessions} disabled={loading}>
              <ArrowsClockwise className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
              刷新
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              新建会话
            </Button>
          </div>
        }
      />

      <Dialog open={createOpen} onOpenChange={(open) => {
        setCreateOpen(open)
        if (!open && !creating) resetCreateForm()
      }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>新建迁移会话</DialogTitle>
            <DialogDescription>
              先创建会话，再由 MoveShopify 按选定批次推送数据。会话详情页会显示进度和对账结果。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="import-source">来源平台</Label>
                <Select value={newSource} onValueChange={setNewSource}>
                  <SelectTrigger id="import-source">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shopify">Shopify</SelectItem>
                    <SelectItem value="woo">WooCommerce</SelectItem>
                    <SelectItem value="magento">Magento</SelectItem>
                    <SelectItem value="excel">Excel</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="source-store">店铺标识</Label>
                <Input
                  id="source-store"
                  value={newSourceStore}
                  onChange={(event) => setNewSourceStore(event.target.value)}
                  placeholder="my-store.myshopify.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer-link-strategy">客户匹配策略</Label>
              <Select value={newStrategy} onValueChange={setNewStrategy}>
                <SelectTrigger id="customer-link-strategy">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto_create_user">自动创建或按邮箱复用客户</SelectItem>
                  <SelectItem value="guest_placeholder">无法匹配时挂到访客占位账号</SelectItem>
                  <SelectItem value="skip_unmatched">无法匹配客户时跳过订单</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <div>
                <Label>预计导入批次</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  对账报告会按这里选择的批次判断是否漏导。
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {JOB_OPTIONS.map((job) => (
                  <label
                    key={job.value}
                    className="flex items-start gap-3 rounded-md border p-3 text-sm hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={expectedJobs.includes(job.value)}
                      onCheckedChange={(checked) => toggleExpectedJob(job.value, checked === true)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block font-medium leading-5">{job.label}</span>
                      <span className="block text-xs text-muted-foreground leading-5">{job.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              取消
            </Button>
            <Button onClick={createSession} disabled={creating}>
              {creating ? "创建中..." : "创建会话"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">筛选</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="session_id / source / source_store"
                className="pl-9"
              />
            </div>

            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="open">已创建</SelectItem>
                <SelectItem value="running">运行中</SelectItem>
                <SelectItem value="completed">已完成</SelectItem>
                <SelectItem value="failed">失败</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setPage(1) }}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="来源" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部来源</SelectItem>
                <SelectItem value="shopify">Shopify</SelectItem>
                <SelectItem value="woo">WooCommerce</SelectItem>
                <SelectItem value="magento">Magento</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            会话列表（共 {total}）
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Cloud className="h-10 w-10 mb-2 opacity-60" />
              <div>没有导入会话</div>
              <div className="text-xs mt-1">外部 Sender（如 MoveShopify）创建后会在这里显示</div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>来源 / Store</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>Jobs</TableHead>
                  <TableHead>开始时间</TableHead>
                  <TableHead>结束时间</TableHead>
                  <TableHead className="w-[80px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => {
                  const summary = summarizeJobs(s.jobs)
                  return (
                    <TableRow key={s.session_id}>
                      <TableCell>
                        <div className="font-medium">{s.source} · {s.source_store}</div>
                        <div className="text-xs text-muted-foreground font-mono">{s.session_id.slice(0, 8)}…</div>
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_COLORS[s.status] ?? "bg-gray-100 text-gray-700"}>
                          {STATUS_LABELS[s.status] ?? s.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {s.jobs.length === 0 ? (
                          <span className="text-xs text-muted-foreground">尚无 job</span>
                        ) : (
                          <div className="text-xs space-y-0.5">
                            {summary.pieces.map((p, idx) => (
                              <div key={idx}>{p}</div>
                            ))}
                            {summary.failed > 0 && (
                              <div className="text-red-600">失败 {summary.failed}</div>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{formatTs(s.started_at)}</TableCell>
                      <TableCell className="text-xs">{formatTs(s.finished_at)}</TableCell>
                      <TableCell className="text-right">
                        <Link href={`/admin/imports/${s.session_id}`}>
                          <Button variant="ghost" size="sm">
                            <ArrowSquareOut className="h-4 w-4" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm">
              <div className="text-muted-foreground">
                第 {page} / {totalPages} 页
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  上一页
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  下一页
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
