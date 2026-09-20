"use client"

import { useEffect, useState } from "react"
import { useI18n } from "@/contexts/i18n-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"
import { PageHeader } from "../_components";
import { ArrowsClockwise, ArrowsLeftRight, Eye, Package, Plus, Truck, Warehouse, X } from "@phosphor-icons/react";

interface Warehouse {
  id: string; name: string; location?: string; is_active: boolean; type?: string
}

interface TransferItem {
  id: string; product_id: string; product_title?: string; variant_id?: string
  quantity: number; unit_cost?: number
}

interface Transfer {
  id: string; reference_no: string; from_warehouse_id: string; to_warehouse_id: string
  from_warehouse_name?: string; to_warehouse_name?: string
  status: string; note?: string; shipping_method?: string
  total_cost?: string; operator_id?: string
  item_count: number; completed_at?: string; created_at: string
  items?: TransferItem[]
}

interface Product {
  id: string; title: string; title_en?: string
}

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "待处理", variant: "secondary" },
  in_transit: { label: "调拨中", variant: "default" },
  completed: { label: "已完成", variant: "outline" },
  cancelled: { label: "已取消", variant: "destructive" },
}

export default function AdminWarehousesPage() {
  const { t } = useI18n()
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Add warehouse
  const [addOpen, setAddOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState("")
  const [location, setLocation] = useState("")
  const [whType, setWhType] = useState("warehouse")

  // Multi-SKU Transfer
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferring, setTransferring] = useState(false)
  const [txFromWh, setTxFromWh] = useState("")
  const [txToWh, setTxToWh] = useState("")
  const [txNote, setTxNote] = useState("")
  const [txShipping, setTxShipping] = useState("")
  const [txItems, setTxItems] = useState<Array<{ productId: string; quantity: string; unitCost: string }>>([
    { productId: "", quantity: "1", unitCost: "" },
  ])

  // Transfer detail
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailData, setDetailData] = useState<Transfer | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Restock
  const [restockOpen, setRestockOpen] = useState(false)
  const [restocking, setRestocking] = useState(false)
  const [restockSupplier, setRestockSupplier] = useState("")
  const [restockProduct, setRestockProduct] = useState("")
  const [restockQty, setRestockQty] = useState("")
  const [restockNote, setRestockNote] = useState("")

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    try {
      const [whRes, txRes, prodRes] = await Promise.all([
        fetch("/api/admin/warehouses"),
        fetch("/api/admin/inventory/transfers"),
        fetch("/api/admin/products"),
      ])
      const whJson = await whRes.json()
      const txJson = await txRes.json()
      const prodJson = await prodRes.json()
      setWarehouses(whJson.data || [])
      setTransfers(txJson.data || [])
      setProducts(prodJson.data || [])
    } catch {
      toast.error("加载失败")
    } finally { setLoading(false); setRefreshing(false) }
  }

  useEffect(() => { load() }, [])

  const suppliers = warehouses.filter((w) => w.type === "supplier")
  const realWarehouses = warehouses.filter((w) => w.type !== "supplier" && w.is_active)

  const handleAdd = async () => {
    if (!name) return toast.error("请填写名称")
    setAdding(true)
    try {
      const res = await fetch("/api/admin/warehouses", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, location, type: whType }),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "添加失败") }
      toast.success(whType === "supplier" ? "供应商已添加" : "仓库已添加")
      setAddOpen(false); setName(""); setLocation(""); setWhType("warehouse"); load()
    } catch (err) { toast.error(err instanceof Error ? (err as Error).message : "添加失败") }
    finally { setAdding(false) }
  }

  const handleToggle = async (wh: Warehouse) => {
    try {
      await fetch("/api/admin/warehouses", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: wh.id, is_active: !wh.is_active }),
      })
      load()
    } catch { toast.error("操作失败") }
  }

  const addTransferItem = () => {
    setTxItems([...txItems, { productId: "", quantity: "1", unitCost: "" }])
  }

  const removeTransferItem = (index: number) => {
    if (txItems.length <= 1) return
    setTxItems(txItems.filter((_, i) => i !== index))
  }

  const updateTransferItem = (index: number, field: string, value: string) => {
    const newItems = [...txItems]
    ;(newItems[index] as any)[field] = value
    setTxItems(newItems)
  }

  const handleTransfer = async () => {
    if (!txFromWh || !txToWh) return toast.error("请选择源仓库和目标仓库")
    if (txFromWh === txToWh) return toast.error("不能调拨到同一仓库")

    const validItems = txItems.filter((item) => item.productId && Number(item.quantity) > 0)
    if (validItems.length === 0) return toast.error("请添加至少一个调拨商品")

    setTransferring(true)
    try {
      const res = await fetch("/api/admin/inventory/transfers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromWarehouseId: txFromWh,
          toWarehouseId: txToWh,
          shippingMethod: txShipping || undefined,
          items: validItems.map((item) => ({
            productId: item.productId,
            quantity: Number(item.quantity),
            unitCost: item.unitCost ? Number(item.unitCost) : undefined,
          })),
          note: txNote || undefined,
        }),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "调拨失败") }
      toast.success("调拨已创建")
      setTransferOpen(false)
      setTxFromWh(""); setTxToWh(""); setTxNote(""); setTxShipping("")
      setTxItems([{ productId: "", quantity: "1", unitCost: "" }])
      load()
    } catch (err) { toast.error(err instanceof Error ? (err as Error).message : "调拨失败") }
    finally { setTransferring(false) }
  }

  const handleRestock = async () => {
    if (!restockSupplier || !restockProduct || !restockQty) return toast.error("请填写完整信息")
    const quantity = parseInt(restockQty)
    if (isNaN(quantity) || quantity <= 0) return toast.error("数量必须为正整数")
    setRestocking(true)
    try {
      const res = await fetch("/api/admin/inventory/restock", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierId: restockSupplier, productId: restockProduct, quantity, note: restockNote }),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "补货失败") }
      toast.success("补货完成")
      setRestockOpen(false); setRestockSupplier(""); setRestockProduct(""); setRestockQty(""); setRestockNote(""); load()
    } catch (err) { toast.error(err instanceof Error ? (err as Error).message : "补货失败") }
    finally { setRestocking(false) }
  }

  const handleCompleteTransfer = async (transferId: string) => {
    try {
      const res = await fetch(`/api/admin/inventory/transfers/${transferId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete" }),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "操作失败") }
      toast.success("调拨已完成")
      load()
      if (detailData?.id === transferId) setDetailData(null)
    } catch (err) { toast.error(err instanceof Error ? (err as Error).message : "操作失败") }
  }

  const handleCancelTransfer = async (transferId: string) => {
    try {
      const res = await fetch(`/api/admin/inventory/transfers/${transferId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "操作失败") }
      toast.success("调拨已取消")
      load()
      if (detailData?.id === transferId) setDetailData(null)
    } catch (err) { toast.error(err instanceof Error ? (err as Error).message : "操作失败") }
  }

  const openDetail = async (transfer: Transfer) => {
    setDetailOpen(true)
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/admin/inventory/transfers/${transfer.id}`)
      const json = await res.json()
      setDetailData(json.data || null)
    } catch {
      toast.error("加载详情失败")
    } finally { setDetailLoading(false) }
  }

  if (loading) {
    return (
      <div className="flex"><div className="flex-1 p-8">
          <div className="flex items-center justify-between mb-6">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-9 w-24" />
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-5 w-32" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-16 mt-2" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex"><div className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2"><Warehouse className="h-6 w-6" /> 仓库管理</h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => load(true)} disabled={refreshing}>
              <ArrowsClockwise className={`h-4 w-4 mr-1 ${refreshing ? "animate-spin" : ""}`} /> 刷新
            </Button>

            {/* Restock dialog */}
            <Dialog open={restockOpen} onOpenChange={setRestockOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <Truck className="h-4 w-4 mr-1" /> 补货
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>从供应商补货</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>供应商</Label>
                    <Select value={restockSupplier} onValueChange={setRestockSupplier}>
                      <SelectTrigger><SelectValue placeholder="选择供应商" /></SelectTrigger>
                      <SelectContent>
                        {suppliers.length === 0 ? (
                          <SelectItem value="__none" disabled>暂无供应商，请先添加</SelectItem>
                        ) : suppliers.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>商品</Label>
                    <Select value={restockProduct} onValueChange={setRestockProduct}>
                      <SelectTrigger><SelectValue placeholder="选择商品" /></SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.title || p.title_en || String(p.id || "").slice(0, 8) || "-"}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>数量</Label>
                    <Input type="number" min="1" value={restockQty}
                      onChange={(e) => { const v = Number(e.target.value); setRestockQty(isNaN(v) || v < 0 ? "" : String(v)); }}
                    />
                  </div>
                  <div>
                    <Label>备注（可选）</Label>
                    <Input value={restockNote} onChange={(e) => setRestockNote(e.target.value)} placeholder="补货原因" />
                  </div>
                  <Button onClick={handleRestock} className="w-full" disabled={restocking}>
                    {restocking ? "补货中..." : "确认补货"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Multi-SKU Transfer dialog */}
            <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <ArrowsLeftRight className="h-4 w-4 mr-1" /> 多SKU调拨
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>多SKU库存调拨</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <Label>源仓库</Label>
                      <Select value={txFromWh} onValueChange={setTxFromWh}>
                        <SelectTrigger><SelectValue placeholder="选择源仓库" /></SelectTrigger>
                        <SelectContent>
                          {realWarehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1">
                      <Label>目标仓库</Label>
                      <Select value={txToWh} onValueChange={setTxToWh}>
                        <SelectTrigger><SelectValue placeholder="选择目标仓库" /></SelectTrigger>
                        <SelectContent>
                          {realWarehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="border rounded-md p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">调拨商品</Label>
                      <Button type="button" variant="ghost" size="sm" onClick={addTransferItem}>
                        <Plus className="h-3 w-3 mr-1" /> 添加商品
                      </Button>
                    </div>
                    {txItems.map((item, idx) => (
                      <div key={idx} className="flex items-end gap-2">
                        <div className="flex-1">
                          {idx === 0 && <Label className="text-xs">商品</Label>}
                          <Select value={item.productId} onValueChange={(v) => updateTransferItem(idx, "productId", v)}>
                            <SelectTrigger><SelectValue placeholder="选择商品" /></SelectTrigger>
                            <SelectContent>
                              {products.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.title || p.title_en || String(p.id || "").slice(0, 8) || "-"}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="w-20">
                          {idx === 0 && <Label className="text-xs">数量</Label>}
                          <Input type="number" min="1" value={item.quantity}
                            onChange={(e) => updateTransferItem(idx, "quantity", e.target.value)}
                          />
                        </div>
                        <div className="w-24">
                          {idx === 0 && <Label className="text-xs">单价</Label>}
                          <Input type="number" min="0" step="0.01" value={item.unitCost}
                            onChange={(e) => updateTransferItem(idx, "unitCost", e.target.value)}
                            placeholder="可选"
                          />
                        </div>
                        {txItems.length > 1 && (
                          <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0"
                            onClick={() => removeTransferItem(idx)}>
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-3">
                    <div className="flex-1">
                      <Label>运输方式（可选）</Label>
                      <Input value={txShipping} onChange={(e) => setTxShipping(e.target.value)} placeholder="如：陆运、空运" />
                    </div>
                  </div>
                  <div>
                    <Label>备注（可选）</Label>
                    <Input value={txNote} onChange={(e) => setTxNote(e.target.value)} placeholder="调拨原因" />
                  </div>
                  <Button onClick={handleTransfer} className="w-full" disabled={transferring}>
                    {transferring ? "创建调拨中..." : "创建调拨"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Add warehouse button */}
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> 添加</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>添加仓库/供应商</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>类型</Label>
                    <Select value={whType} onValueChange={setWhType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="warehouse">仓库</SelectItem>
                        <SelectItem value="supplier">供应商</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>名称</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
                  <div><Label>位置（可选）</Label><Input value={location} onChange={(e) => setLocation(e.target.value)} /></div>
                  <Button onClick={handleAdd} className="w-full" disabled={adding}>
                    {adding ? "添加中..." : "确认添加"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Tabs defaultValue="warehouses">
          <TabsList className="mb-4">
            <TabsTrigger value="warehouses">仓库列表 ({realWarehouses.length})</TabsTrigger>
            <TabsTrigger value="suppliers">供应商 ({suppliers.length})</TabsTrigger>
            <TabsTrigger value="transfers">调拨记录 ({transfers.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="warehouses">
            {realWarehouses.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Package className="h-12 w-12 mb-4" />
                  <p className="text-lg font-medium">暂无仓库</p>
                  <p className="text-sm mt-1">点击右上角"添加"创建仓库</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {realWarehouses.map((wh) => (
                  <Card key={wh.id} className={wh.is_active ? "" : "opacity-60"}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Warehouse className="h-4 w-4 text-blue-600" /> {wh.name}
                        </CardTitle>
                        <Badge variant={wh.is_active ? "default" : "secondary"}>
                          {wh.is_active ? "启用" : "禁用"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">{wh.location || "未设置位置"}</p>
                      <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => handleToggle(wh)}>
                        {wh.is_active ? "禁用" : "启用"}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="suppliers">
            {suppliers.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Truck className="h-12 w-12 mb-4" />
                  <p className="text-lg font-medium">暂无供应商</p>
                  <p className="text-sm mt-1">添加仓库时选择类型为"供应商"</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {suppliers.map((s) => (
                  <Card key={s.id} className="border-dashed">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Truck className="h-4 w-4 text-green-600" /> {s.name}
                        </CardTitle>
                        <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50">
                          供应商
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">{s.location || "未设置"}</p>
                      <p className="text-xs text-muted-foreground mt-1">无库存数据</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="transfers">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>单号</TableHead>
                      <TableHead>源仓库</TableHead>
                      <TableHead>目标仓库</TableHead>
                      <TableHead>SKU数</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>时间</TableHead>
                      <TableHead className="w-24">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transfers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          暂无调拨记录
                        </TableCell>
                      </TableRow>
                    ) : transfers.map((t) => {
                      const st = statusLabels[t.status] || { label: t.status, variant: "secondary" }
                      return (
                        <TableRow key={t.id}>
                          <TableCell className="font-mono text-xs">{t.reference_no || String(t.id || "").slice(0, 8) || "-"}</TableCell>
                          <TableCell>{t.from_warehouse_name || String(t.from_warehouse_id || "").slice(0, 8) || "-"}</TableCell>
                          <TableCell>{t.to_warehouse_name || String(t.to_warehouse_id || "").slice(0, 8) || "-"}</TableCell>
                          <TableCell>{t.item_count} 项</TableCell>
                          <TableCell>
                            <Badge variant={st.variant}>{st.label}</Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {new Date(t.created_at).toLocaleString("zh-CN")}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8"
                                onClick={() => openDetail(t)} title="查看详情">
                                <Eye className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Transfer Detail Dialog */}
        <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                调拨详情
                {detailData?.reference_no && (
                  <span className="ml-2 font-mono text-sm font-normal text-muted-foreground">
                    {detailData.reference_no}
                  </span>
                )}
              </DialogTitle>
              <DialogDescription>
                {detailData && (
                  <span>
                    {detailData.from_warehouse_name || String(detailData.from_warehouse_id || "").slice(0, 8) || "-"}
                    {" → "}
                    {detailData.to_warehouse_name || String(detailData.to_warehouse_id || "").slice(0, 8) || "-"}
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>

            {detailLoading ? (
              <div className="py-8 text-center text-muted-foreground">加载中...</div>
            ) : detailData ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-muted-foreground">状态：</span>
                    <Badge variant={statusLabels[detailData.status]?.variant || "secondary"}>
                      {statusLabels[detailData.status]?.label || detailData.status}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    {detailData.status === "in_transit" && (
                      <>
                        <Button size="sm" onClick={() => handleCompleteTransfer(detailData.id)}>
                          完成调拨
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleCancelTransfer(detailData.id)}>
                          取消
                        </Button>
                      </>
                    )}
                    {detailData.status === "pending" && (
                      <Button size="sm" variant="outline" onClick={() => handleCancelTransfer(detailData.id)}>
                        取消
                      </Button>
                    )}
                  </div>
                </div>

                {detailData.shipping_method && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">运输方式：</span>{detailData.shipping_method}
                  </div>
                )}
                {detailData.total_cost && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">总成本：</span>
                    {Number.isFinite(Number(detailData.total_cost)) ? Number(detailData.total_cost).toFixed(2) : "0.00"}
                  </div>
                )}
                {detailData.note && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">备注：</span>{detailData.note}
                  </div>
                )}
                {detailData.completed_at && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">完成时间：</span>
                    {new Date(detailData.completed_at).toLocaleString("zh-CN")}
                  </div>
                )}

                <div>
                  <Label className="text-sm font-medium">调拨商品明细</Label>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>商品</TableHead>
                        <TableHead>数量</TableHead>
                        <TableHead>单价</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailData.items && detailData.items.length > 0 ? (
                        detailData.items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>{item.product_title || String(item.product_id || "").slice(0, 8) || "-"}</TableCell>
                            <TableCell>{item.quantity}</TableCell>
                            <TableCell>
                              {item.unit_cost && Number.isFinite(Number(item.unit_cost)) ? Number(item.unit_cost).toFixed(2) : "-"}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground">
                            无明细
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">加载失败</div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
