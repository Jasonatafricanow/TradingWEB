"use client"

import { useEffect, useState, useCallback, use } from "react"
import Link from "next/link"
import { apiFetch } from "@/lib/client-api"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { ArrowsClockwise, ArrowLeft, Download, ImageSquare } from "@phosphor-icons/react"
import { PageHeader, StatCard, StatCardGrid } from "../../_components"

interface ImportRecordError {
  record_index: number
  source_id?: string
  code: string
  field?: string
  message: string
}

interface ImportJobSummary {
  id: string
  job_type: "products" | "customers" | "orders" | "discounts" | "redirects" | "validate"
  status: "pending" | "running" | "completed" | "failed"
  total_rows: number
  success_rows: number
  failed_rows: number
  errors?: ImportRecordError[]
}

interface MirrorProgress {
  total: number
  pending: number
  mirrored: number
  failed: number
}

interface ImportJobReconciliation {
  job_type: "products" | "customers" | "orders" | "discounts" | "redirects" | "validate"
  expected: boolean
  present: boolean
  status: "pending" | "running" | "completed" | "failed" | "missing"
  total_rows: number
  success_rows: number
  failed_rows: number
  success_rate: number
}

interface ImportMappingSummary {
  source_type: string
  local_table: string
  count: number
}

interface ImportOrderReconciliation {
  count: number
  total_amount: number
  paid_amount: number
  currency: string | null
  currency_count: number
}

interface ImportErrorSummary {
  code: string
  count: number
}

interface ImportReconciliationSummary {
  expected_jobs: Array<"products" | "customers" | "orders" | "discounts" | "redirects" | "validate">
  missing_jobs: Array<"products" | "customers" | "orders" | "discounts" | "redirects" | "validate">
  jobs: ImportJobReconciliation[]
  mappings: ImportMappingSummary[]
  order_totals: ImportOrderReconciliation
  errors_by_code: ImportErrorSummary[]
  total_errors: number
  completed: boolean
}

interface ImportSessionDetail {
  session_id: string
  source: string
  source_store: string
  status: "open" | "running" | "completed" | "failed"
  customer_link_strategy: string
  jobs: ImportJobSummary[]
  mirror_progress?: MirrorProgress
  reconciliation?: ImportReconciliationSummary
  started_at: string
  finished_at?: string | null
}

const STATUS_LABELS: Record<string, string> = {
  open: "已创建",
  running: "运行中",
  completed: "已完成",
  failed: "失败",
  pending: "待处理",
}

const STATUS_COLORS: Record<string, string> = {
  open: "bg-gray-100 text-gray-700",
  running: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  pending: "bg-gray-100 text-gray-700",
}

const JOB_TYPE_LABELS: Record<string, string> = {
  products: "商品",
  customers: "客户",
  orders: "订单",
  discounts: "优惠码",
  redirects: "URL跳转",
  validate: "校验",
}

const SOURCE_TYPE_LABELS: Record<string, string> = {
  product: "商品",
  variant: "变体",
  image: "图片",
  customer: "客户",
  address: "地址",
  order: "订单",
  order_item: "订单明细",
  discount: "优惠码",
  redirect: "URL跳转",
}

function formatTs(ts: string | null | undefined): string {
  if (!ts) return "—"
  try {
    return new Date(ts).toLocaleString("zh-CN", { hour12: false })
  } catch {
    return ts ?? "—"
  }
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value)
}

function formatMoney(value: number, currency: string | null): string {
  const code = currency || "USD"
  try {
    return new Intl.NumberFormat("zh-CN", { style: "currency", currency: code }).format(value)
  } catch {
    return `${code} ${value.toFixed(2)}`
  }
}

function getMappingCount(summary: ImportReconciliationSummary | undefined, sourceType: string): number {
  return summary?.mappings
    .filter((item) => item.source_type === sourceType)
    .reduce((sum, item) => sum + item.count, 0) ?? 0
}

function downloadErrorsCsv(sessionId: string, jobs: ImportJobSummary[]): void {
  const rows: string[] = ["job_type,record_index,source_id,code,field,message"]
  for (const j of jobs) {
    for (const e of j.errors ?? []) {
      rows.push([
        j.job_type,
        String(e.record_index),
        csvEscape(e.source_id ?? ""),
        e.code,
        csvEscape(e.field ?? ""),
        csvEscape(e.message),
      ].join(","))
    }
  }
  const blob = new Blob(["﻿" + rows.join("\n")], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `import-errors-${sessionId.slice(0, 8)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function AdminImportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const [detail, setDetail] = useState<ImportSessionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch(`/api/admin/import/sessions/${id}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as ImportSessionDetail
      setDetail(json)
    } catch (e) {
      toast.error(`加载详情失败：${e instanceof Error ? e.message : "未知错误"}`)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  // Auto refresh when session running or mirror in-progress
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(load, 4000)
    return () => clearInterval(interval)
  }, [autoRefresh, load])

  useEffect(() => {
    if (!detail) return
    const shouldRefresh =
      detail.status === "running" ||
      detail.status === "open" ||
      (detail.mirror_progress !== undefined && detail.mirror_progress.pending > 0)
    setAutoRefresh(shouldRefresh)
  }, [detail])

  if (loading && !detail) {
    return (
      <div className="p-6 lg:p-8 space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="p-6 lg:p-8">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <div>会话不存在或加载失败</div>
            <Link href="/admin/imports" className="text-blue-600 text-sm mt-2 inline-block">
              ← 返回列表
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const totalRecords = detail.jobs.reduce((sum, j) => sum + j.total_rows, 0)
  const totalSuccess = detail.jobs.reduce((sum, j) => sum + j.success_rows, 0)
  const totalFailed = detail.jobs.reduce((sum, j) => sum + j.failed_rows, 0)
  const hasErrors = detail.jobs.some((j) => (j.errors ?? []).length > 0)
  const reconciliation = detail.reconciliation

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <PageHeader
        title={`导入会话 · ${detail.source_store}`}
        description={
          <span className="font-mono text-xs">{detail.session_id}</span>
        }
        actions={
          <div className="flex gap-2">
            <Link href="/admin/imports">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-1" />
                返回
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <ArrowsClockwise className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
              刷新
            </Button>
            {hasErrors && (
              <Button variant="outline" size="sm" onClick={() => downloadErrorsCsv(detail.session_id, detail.jobs)}>
                <Download className="h-4 w-4 mr-1" />
                错误 CSV
              </Button>
            )}
          </div>
        }
      />

      {/* Session info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">会话信息</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">来源</div>
              <div className="font-medium">{detail.source}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Source Store</div>
              <div className="font-medium">{detail.source_store}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">状态</div>
              <Badge className={STATUS_COLORS[detail.status] ?? "bg-gray-100 text-gray-700"}>
                {STATUS_LABELS[detail.status] ?? detail.status}
              </Badge>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">客户策略</div>
              <div className="font-medium text-xs">{detail.customer_link_strategy}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">开始时间</div>
              <div className="text-xs font-mono">{formatTs(detail.started_at)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">结束时间</div>
              <div className="text-xs font-mono">{formatTs(detail.finished_at)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stat summary */}
      <StatCardGrid>
        <StatCard label="总记录" value={String(totalRecords)} />
        <StatCard label="成功" value={String(totalSuccess)} />
        <StatCard label="失败" value={String(totalFailed)} />
        <StatCard
          label="Jobs"
          value={String(detail.jobs.length)}
        />
      </StatCardGrid>

      {reconciliation && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">迁移对账报告</CardTitle>
              <Badge className={reconciliation.completed ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}>
                {reconciliation.completed ? "可验收" : "需处理"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">预期任务</div>
                <div className="font-semibold">
                  {reconciliation.expected_jobs.length > 0
                    ? reconciliation.expected_jobs.map((job) => JOB_TYPE_LABELS[job] ?? job).join(" / ")
                    : "—"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">缺失任务</div>
                <div className={reconciliation.missing_jobs.length > 0 ? "font-semibold text-red-600" : "font-semibold"}>
                  {reconciliation.missing_jobs.length > 0
                    ? reconciliation.missing_jobs.map((job) => JOB_TYPE_LABELS[job] ?? job).join(" / ")
                    : "无"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">错误总数</div>
                <div className={reconciliation.total_errors > 0 ? "font-semibold text-red-600" : "font-semibold"}>
                  {formatNumber(reconciliation.total_errors)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">订单金额</div>
                <div className="font-semibold">
                  {formatMoney(reconciliation.order_totals.total_amount, reconciliation.order_totals.currency)}
                </div>
                <div className="text-xs text-muted-foreground">
                  已付款 {formatMoney(reconciliation.order_totals.paid_amount, reconciliation.order_totals.currency)}
                </div>
                {reconciliation.order_totals.currency_count > 1 && (
                  <div className="text-xs text-amber-600">含多币种，金额仅作粗略合计</div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-3">
              {["product", "variant", "image", "customer", "address", "order", "order_item", "discount", "redirect"].map((sourceType) => (
                <div key={sourceType} className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">{SOURCE_TYPE_LABELS[sourceType] ?? sourceType}</div>
                  <div className="text-xl font-bold">{formatNumber(getMappingCount(reconciliation, sourceType))}</div>
                </div>
              ))}
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>任务</TableHead>
                    <TableHead>覆盖</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="text-right">总数</TableHead>
                    <TableHead className="text-right">成功率</TableHead>
                    <TableHead className="text-right">失败</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reconciliation.jobs.map((job) => (
                    <TableRow key={job.job_type}>
                      <TableCell className="font-medium">{JOB_TYPE_LABELS[job.job_type] ?? job.job_type}</TableCell>
                      <TableCell>
                        {job.expected ? (
                          <Badge variant="outline">预期内</Badge>
                        ) : (
                          <Badge variant="secondary">额外</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_COLORS[job.status] ?? "bg-gray-100 text-gray-700"}>
                          {STATUS_LABELS[job.status] ?? job.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">{job.present ? job.total_rows : "—"}</TableCell>
                      <TableCell className="text-right font-mono">{job.present ? `${job.success_rate}%` : "—"}</TableCell>
                      <TableCell className="text-right font-mono">
                        <span className={job.failed_rows > 0 ? "text-red-600" : "text-muted-foreground"}>
                          {job.present ? job.failed_rows : "—"}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {reconciliation.errors_by_code.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {reconciliation.errors_by_code.map((item) => (
                  <Badge key={item.code} variant="outline" className="border-red-200 text-red-700">
                    {item.code}: {item.count}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Mirror progress */}
      {detail.mirror_progress && detail.mirror_progress.total > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ImageSquare className="h-4 w-4" />
              图片镜像进度
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Progress
                value={
                  detail.mirror_progress.total > 0
                    ? Math.round((detail.mirror_progress.mirrored / detail.mirror_progress.total) * 100)
                    : 0
                }
                className="h-2"
              />
              <div className="flex justify-between text-xs">
                <span>已镜像 {detail.mirror_progress.mirrored}</span>
                <span className="text-yellow-600">待处理 {detail.mirror_progress.pending}</span>
                {detail.mirror_progress.failed > 0 && (
                  <span className="text-red-600">失败 {detail.mirror_progress.failed}</span>
                )}
                <span className="text-muted-foreground">共 {detail.mirror_progress.total}</span>
              </div>
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              注：当前按 source_store 维度聚合，包含本店历史所有图（v1 限制）
            </div>
          </CardContent>
        </Card>
      )}

      {/* Jobs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          {detail.jobs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              尚无 job —— Sender 还没开始推送任何批次
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>类型</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">总数</TableHead>
                  <TableHead className="text-right">成功</TableHead>
                  <TableHead className="text-right">失败</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.jobs.map((j) => (
                  <TableRow key={j.id}>
                    <TableCell>
                      <span className="font-medium">{JOB_TYPE_LABELS[j.job_type] ?? j.job_type}</span>
                      <span className="text-xs text-muted-foreground font-mono ml-2">
                        {j.id.slice(0, 8)}…
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[j.status] ?? "bg-gray-100 text-gray-700"}>
                        {STATUS_LABELS[j.status] ?? j.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">{j.total_rows}</TableCell>
                    <TableCell className="text-right font-mono text-green-700">
                      {j.success_rows}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      <span className={j.failed_rows > 0 ? "text-red-600" : "text-muted-foreground"}>
                        {j.failed_rows}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Errors */}
      {hasErrors && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-red-700">错误明细</CardTitle>
          </CardHeader>
          <CardContent>
            {detail.jobs.map((j) => {
              const errs = j.errors ?? []
              if (errs.length === 0) return null
              return (
                <div key={j.id} className="mb-6">
                  <div className="font-medium mb-2 text-sm">
                    {JOB_TYPE_LABELS[j.job_type] ?? j.job_type} · {errs.length} 条错误
                  </div>
                  <div className="border rounded">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[60px]">#</TableHead>
                          <TableHead className="w-[120px]">source_id</TableHead>
                          <TableHead className="w-[140px]">code</TableHead>
                          <TableHead className="w-[140px]">field</TableHead>
                          <TableHead>message</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {errs.slice(0, 50).map((e, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-mono text-xs">{e.record_index}</TableCell>
                            <TableCell className="font-mono text-xs">{e.source_id ?? "—"}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">{e.code}</Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs">{e.field ?? "—"}</TableCell>
                            <TableCell className="text-xs">{e.message}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {errs.length > 50 && (
                      <div className="px-3 py-2 text-xs text-muted-foreground border-t">
                        显示前 50 条，剩 {errs.length - 50} 条请用「错误 CSV」下载查看
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
