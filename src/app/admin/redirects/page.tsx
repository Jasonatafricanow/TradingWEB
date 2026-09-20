"use client"

import { useCallback, useEffect, useState } from "react"
import { apiFetch } from "@/lib/client-api"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { ArrowsClockwise, LinkSimple, Plus, Trash } from "@phosphor-icons/react"
import { PageHeader } from "../_components"

interface UrlRedirect {
  id: string
  old_path: string
  new_path: string
  status_code: number
  source?: string | null
  source_store?: string | null
  source_id?: string | null
  hits: number
  is_active: boolean
  last_hit_at?: string | null
  created_at: string
}

interface RedirectListResponse {
  data: UrlRedirect[]
  total: number
  page: number
  pageSize: number
}

function formatTs(value?: string | null) {
  if (!value) return "—"
  return new Date(value).toLocaleString("zh-CN", { hour12: false })
}

export default function AdminRedirectsPage() {
  const [rows, setRows] = useState<UrlRedirect[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    old_path: "",
    new_path: "",
    status_code: "301",
    source: "manual",
    source_store: "",
    source_id: "",
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ pageSize: "50" })
      if (search.trim()) params.set("search", search.trim())
      const res = await apiFetch(`/api/admin/redirects?${params.toString()}`)
      const json = (await res.json()) as RedirectListResponse
      setRows(json.data || [])
      setTotal(json.total || 0)
    } catch {
      toast.error("加载 URL 跳转失败")
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    load()
  }, [load])

  const save = async () => {
    if (!form.old_path || !form.new_path) {
      toast.error("请填写旧路径和新路径")
      return
    }
    try {
      const res = await apiFetch("/api/admin/redirects", {
        method: "POST",
        body: JSON.stringify({
          old_path: form.old_path,
          new_path: form.new_path,
          status_code: Number(form.status_code),
          source: form.source || "manual",
          source_store: form.source_store || undefined,
          source_id: form.source_id || undefined,
        }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || "保存失败")
      }
      toast.success("URL 跳转已保存")
      setOpen(false)
      setForm({ old_path: "", new_path: "", status_code: "301", source: "manual", source_store: "", source_id: "" })
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败")
    }
  }

  const remove = async (row: UrlRedirect) => {
    if (!window.confirm(`确认删除跳转 ${row.old_path} ?`)) return
    try {
      const res = await apiFetch(`/api/admin/redirects?id=${encodeURIComponent(row.id)}`, { method: "DELETE" })
      if (!res.ok) throw new Error("删除失败")
      toast.success("URL 跳转已删除")
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败")
    }
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <PageHeader
        title="URL 跳转"
        description="管理 Shopify 旧链接到 tradingWEB 新页面的 301/302 跳转。"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <ArrowsClockwise className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
              刷新
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" /> 新增跳转</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>新增/更新 URL 跳转</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>旧路径</Label>
                    <Input value={form.old_path} onChange={(e) => setForm({ ...form, old_path: e.target.value })} placeholder="/products/old-shopify-handle" />
                  </div>
                  <div>
                    <Label>新路径</Label>
                    <Input value={form.new_path} onChange={(e) => setForm({ ...form, new_path: e.target.value })} placeholder="/products/new-product-slug" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>状态码</Label>
                      <Select value={form.status_code} onValueChange={(value) => setForm({ ...form, status_code: value })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="301">301 永久</SelectItem>
                          <SelectItem value="302">302 临时</SelectItem>
                          <SelectItem value="307">307 临时</SelectItem>
                          <SelectItem value="308">308 永久</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>来源</Label>
                      <Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="shopify" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Source Store</Label>
                      <Input value={form.source_store} onChange={(e) => setForm({ ...form, source_store: e.target.value })} placeholder="fj-boutique" />
                    </div>
                    <div>
                      <Label>Source ID</Label>
                      <Input value={form.source_id} onChange={(e) => setForm({ ...form, source_id: e.target.value })} placeholder="old-handle" />
                    </div>
                  </div>
                  <Button className="w-full" onClick={save}>保存</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">筛选</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索旧路径 / 新路径 / source_id"
              className="max-w-md"
            />
            <Button variant="outline" onClick={load}>搜索</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <LinkSimple className="h-4 w-4" /> 跳转列表（{total}）
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>旧路径</TableHead>
                <TableHead>新路径</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>来源</TableHead>
                <TableHead className="text-right">命中</TableHead>
                <TableHead>最后命中</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    暂无 URL 跳转
                  </TableCell>
                </TableRow>
              ) : rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.old_path}</TableCell>
                  <TableCell className="font-mono text-xs">{row.new_path}</TableCell>
                  <TableCell>
                    <Badge variant={row.is_active ? "default" : "secondary"}>{row.status_code}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {row.source || "manual"}
                    {row.source_store ? <span className="text-muted-foreground"> · {row.source_store}</span> : null}
                  </TableCell>
                  <TableCell className="text-right font-mono">{row.hits}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatTs(row.last_hit_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" className="text-red-600" onClick={() => remove(row)}>
                      <Trash className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
