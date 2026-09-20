"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { PageHeader } from "../_components";
import { ArrowsClockwise, CaretLeft, CaretRight, ClipboardText, MagnifyingGlass } from "@phosphor-icons/react";

interface LogEntry {
  id: string
  user_id?: string
  action: string
  entity_type?: string
  entity_id?: string
  details?: unknown
  created_at: string
}

const ACTION_OPTIONS = [
  { value: "all", label: "全部操作" },
  { value: "create", label: "创建" },
  { value: "update", label: "修改" },
  { value: "delete", label: "删除" },
  { value: "login", label: "登录" },
  { value: "logout", label: "登出" },
]

const ENTITY_OPTIONS = [
  { value: "all", label: "全部对象" },
  { value: "product", label: "商品" },
  { value: "order", label: "订单" },
  { value: "category", label: "分类" },
  { value: "staff", label: "员工" },
  { value: "coupon", label: "优惠券" },
  { value: "settings", label: "设置" },
]

const ACTION_COLORS: Record<string, string> = {
  create: "bg-green-100 text-green-700",
  update: "bg-blue-100 text-blue-700",
  delete: "bg-red-100 text-red-700",
  login: "bg-purple-100 text-purple-700",
  logout: "bg-gray-100 text-gray-700",
}

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [actionFilter, setActionFilter] = useState("all")
  const [entityFilter, setEntityFilter] = useState("all")
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 50

  const loadLogs = useCallback(async (p?: number) => {
    setLoading(true)
    const currentPage = p ?? page
    try {
      const params = new URLSearchParams()
      if (search) params.set("search", search)
      if (actionFilter !== "all") params.set("action", actionFilter)
      if (entityFilter !== "all") params.set("entity_type", entityFilter)
      params.set("page", String(currentPage))
      params.set("limit", String(limit))

      const res = await fetch(`/api/admin/audit-logs?${params}`)
      const json = await res.json()
      setLogs(json.data || [])
      setTotal(json.total || 0)
      setPage(json.page || currentPage)
    } catch {
      toast.error("加载日志失败")
    } finally {
      setLoading(false)
    }
  }, [search, actionFilter, entityFilter])

  useEffect(() => { loadLogs(1) }, [loadLogs])

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="flex"><div className="flex-1 p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ClipboardText className="h-6 w-6" /> 操作日志
            </h1>
            <p className="text-muted-foreground mt-1">后台所有写操作的审计记录，共 {total} 条</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => loadLogs(1)} disabled={loading}>
            <ArrowsClockwise className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> 刷新
          </Button>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <MagnifyingGlass className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索操作/对象/ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTION_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={entityFilter} onValueChange={setEntityFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ENTITY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[160px]">时间</TableHead>
                    <TableHead className="w-[100px]">操作</TableHead>
                    <TableHead className="w-[100px]">对象类型</TableHead>
                    <TableHead className="w-[120px]">对象ID</TableHead>
                    <TableHead className="w-[100px]">操作人</TableHead>
                    <TableHead>详情</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                        暂无匹配的审计日志
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString("zh-CN")}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`font-mono text-xs ${ACTION_COLORS[log.action] || "bg-gray-100"}`}
                          >
                            {log.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {log.entity_type || "-"}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">
                          {log.entity_id?.slice(0, 8) || "-"}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">
                          {log.user_id?.slice(0, 8) || "-"}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                          {log.details ? JSON.stringify(log.details).slice(0, 80) : "-"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-muted-foreground">
              第 {page}/{totalPages} 页，共 {total} 条
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => loadLogs(page - 1)}
              >
                <CaretLeft className="h-4 w-4 mr-1" /> 上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || loading}
                onClick={() => loadLogs(page + 1)}
              >
                下一页 <CaretRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
