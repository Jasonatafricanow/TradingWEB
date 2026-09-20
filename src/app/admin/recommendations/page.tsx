"use client"
import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { getErrorMessage } from "@/lib/error-message";
import { PageHeader } from "../_components";
import { ArrowsClockwise, Lightbulb, Plus, Trash } from "@phosphor-icons/react";

export default function AdminRecommendationsPage() {
  const [productId, setProductId] = useState("")
  const [recs, setRecs] = useState<any[]>([])
  const [recProductId, setRecProductId] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    if (!productId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/recommendations?product_id=${productId}`)
      if (!res.ok) throw new Error((await res.json()).error || "Failed to load")
      setRecs((await res.json()).data || [])
    } catch (e: any) {
      setError(e.message || "Unknown error")
      setRecs([])
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { if (productId) load() }, [productId])

  const handleAdd = async () => {
    if (!recProductId) return toast.error("请输入推荐商品ID")
    const res = await fetch("/api/admin/recommendations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product_id: productId, recommended_product_id: recProductId }) })
    if (!res.ok) { const err = await res.json(); return toast.error(getErrorMessage(err.error, "添加失败")) }
    toast.success("已添加"); setRecProductId(""); load()
  }
  const handleDelete = async (id: string) => {
    await fetch("/api/admin/recommendations", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })
    toast.success("已移除"); load()
  }

  if (loading) {
    return (
      <div className="flex"><div className="flex-1 p-8 space-y-4">
          <div className="flex items-center justify-between mb-6">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-9 w-24" />
          </div>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Skeleton className="h-24 rounded-lg" />
            <Skeleton className="h-24 rounded-lg" />
            <Skeleton className="h-24 rounded-lg" />
          </div>
          <Skeleton className="h-96 w-full rounded-lg" />
        </div>
      </div>
    )
  }

  
  return (<div className="flex"><div className="flex-1 p-8">
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Lightbulb className="h-6 w-6" /> 商品推荐管理</h1>
      <Button variant="outline" size="sm" onClick={load}><ArrowsClockwise className="h-4 w-4 mr-1" /> 刷新</Button>
    </div>
    <Card className="mb-4"><CardContent className="p-4">
      <Label>商品ID</Label>
      <Input value={productId} onChange={(e) => setProductId(e.target.value)} placeholder="输入商品UUID查看和管理推荐" />
    </CardContent></Card>
    {productId && (<><Card className="mb-4"><CardContent className="p-4 flex gap-2 items-end">
      <div className="flex-1"><Label>推荐商品ID</Label><Input value={recProductId} onChange={(e) => setRecProductId(e.target.value)} placeholder="输入推荐的商品UUID" /></div>
      <Button onClick={handleAdd}><Plus className="h-4 w-4 mr-1" /> 添加推荐</Button>
    </CardContent></Card>
    <Card><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>推荐商品</TableHead><TableHead>类型</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
    <TableBody>{recs.length === 0 && !loading ? <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">暂无手动推荐</TableCell></TableRow> :
      recs.map((r) => <TableRow key={r.id}><TableCell>{r.recommended?.title || String(r.recommended_product_id || "").slice(0, 8) || "-"}</TableCell><TableCell><Badge variant="outline">手动</Badge></TableCell><TableCell><Button variant="ghost" size="sm" onClick={() => handleDelete(r.id)}><Trash className="h-4 w-4 text-red-500" /></Button></TableCell></TableRow>)}
    </TableBody></Table></CardContent></Card></>)}
  </div></div>)
}

