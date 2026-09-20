"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { apiFetch } from "@/lib/client-api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"
import { ArrowsClockwise, MapPin, Package, Plus, Storefront, Warning, Warehouse } from "@phosphor-icons/react"

const NONE = "__none__"

interface ProductOption {
  id: string
  title: string
  title_en?: string | null
}

interface VariantOption {
  id: string
  title?: string | null
  sku?: string | null
  barcode?: string | null
}

interface StoreOption {
  id: string
  name: string
  status?: string | null
}

interface WarehouseOption {
  id: string
  name: string
  location?: string | null
  type?: string | null
  is_active?: boolean | null
}

interface InventoryRecord {
  id: string
  product_id: string
  variant_id?: string | null
  store_id?: string | null
  warehouse_id?: string | null
  stock: number
  low_stock_threshold: number
  updated_at: string
  location_label?: string
  products: {
    id: string
    title: string
    title_en?: string | null
    type: string
    status: string
  } | null
  variants?: {
    id: string
    title?: string | null
    sku?: string | null
    barcode?: string | null
  } | null
  stores?: {
    id: string
    name?: string | null
  } | null
  warehouses?: {
    id: string
    name?: string | null
    location?: string | null
  } | null
}

interface StockTransaction {
  id: string
  type: string
  quantity: number
  before_stock: number
  after_stock: number
  note?: string | null
  created_at: string
  variant_title?: string | null
  variant_sku?: string | null
}

type ActionType = "in" | "out" | "adjust"
type LocationType = "global" | "store" | "warehouse"

function variantLabel(variant?: VariantOption | InventoryRecord["variants"] | null) {
  if (!variant) return "默认"
  const name = variant.title || "未命名变体"
  return variant.sku ? `${name} / ${variant.sku}` : name
}

function recordSearchText(item: InventoryRecord) {
  return [
    item.products?.title,
    item.products?.title_en,
    item.variants?.title,
    item.variants?.sku,
    item.variants?.barcode,
    item.stores?.name,
    item.warehouses?.name,
    item.warehouses?.location,
    item.location_label,
  ].filter(Boolean).join(" ").toLowerCase()
}

export default function AdminInventoryPage() {
  const pendingVariantFromUrl = useRef<string | null>(null)
  const [inventory, setInventory] = useState<InventoryRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [actionType, setActionType] = useState<ActionType>("in")
  const [selectedProduct, setSelectedProduct] = useState("")
  const [selectedVariant, setSelectedVariant] = useState(NONE)
  const [locationType, setLocationType] = useState<LocationType>("global")
  const [selectedStore, setSelectedStore] = useState(NONE)
  const [selectedWarehouse, setSelectedWarehouse] = useState(NONE)
  const [quantity, setQuantity] = useState("")
  const [note, setNote] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyTitle, setHistoryTitle] = useState("")
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyData, setHistoryData] = useState<StockTransaction[]>([])

  const [allProducts, setAllProducts] = useState<ProductOption[]>([])
  const [variants, setVariants] = useState<VariantOption[]>([])
  const [stores, setStores] = useState<StoreOption[]>([])
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([])

  const loadInventory = async () => {
    try {
      const res = await apiFetch("/api/admin/inventory")
      const json = await res.json()
      setInventory(json.data || [])
    } catch {
      toast.error("加载库存失败")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadInventory()
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const productId = params.get("product_id")
    if (!productId) return

    const variantId = params.get("variant_id")
    const action = params.get("action")
    pendingVariantFromUrl.current = variantId || null
    setSelectedProduct(productId)
    if (action === "in" || action === "out" || action === "adjust") {
      setActionType(action)
    }
    setDialogOpen(true)
    setNote("Opened from product variant editor")
  }, [])

  useEffect(() => {
    Promise.all([
      apiFetch("/api/admin/products?pageSize=500").then((r) => r.json()),
      apiFetch("/api/admin/stores").then((r) => r.json()),
      apiFetch("/api/admin/warehouses").then((r) => r.json()),
    ])
      .then(([productJson, storeJson, warehouseJson]) => {
        setAllProducts(productJson.data || [])
        setStores(storeJson.data || [])
        setWarehouses(warehouseJson.data || [])
      })
      .catch(() => toast.error("加载商品或地点失败"))
  }, [])

  useEffect(() => {
    setSelectedVariant(NONE)
    if (!selectedProduct) {
      setVariants([])
      return
    }
    apiFetch(`/api/admin/products/${selectedProduct}/variants`)
      .then((r) => r.json())
      .then((json) => {
        const data = json.data || []
        setVariants(data)
        const pendingVariant = pendingVariantFromUrl.current
        if (pendingVariant && data.some((variant: VariantOption) => variant.id === pendingVariant)) {
          setSelectedVariant(pendingVariant)
          pendingVariantFromUrl.current = null
        }
      })
      .catch(() => setVariants([]))
  }, [selectedProduct])

  useEffect(() => {
    if (locationType !== "store") setSelectedStore(NONE)
    if (locationType !== "warehouse") setSelectedWarehouse(NONE)
  }, [locationType])

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return inventory
    return inventory.filter((item) => recordSearchText(item).includes(keyword))
  }, [inventory, search])

  const lowStockItems = inventory.filter((item) => item.stock > 0 && item.stock <= item.low_stock_threshold)
  const outOfStockItems = inventory.filter((item) => item.stock <= 0)
  const totalStock = inventory.reduce((sum, item) => sum + Number(item.stock || 0), 0)

  const resetForm = () => {
    setSelectedProduct("")
    setSelectedVariant(NONE)
    setLocationType("global")
    setSelectedStore(NONE)
    setSelectedWarehouse(NONE)
    setQuantity("")
    setNote("")
  }

  const handleSubmit = async () => {
    const parsedQuantity = Number(quantity)
    if (!selectedProduct || !Number.isInteger(parsedQuantity) || parsedQuantity < 0) {
      toast.error("请选择商品并输入有效数量")
      return
    }
    if (actionType !== "adjust" && parsedQuantity <= 0) {
      toast.error("入库和出库数量必须大于 0")
      return
    }
    if (locationType === "store" && selectedStore === NONE) {
      toast.error("请选择门店")
      return
    }
    if (locationType === "warehouse" && selectedWarehouse === NONE) {
      toast.error("请选择仓库")
      return
    }

    setSubmitting(true)
    try {
      const res = await apiFetch("/api/admin/inventory", {
        method: "POST",
        body: JSON.stringify({
          action: actionType,
          product_id: selectedProduct,
          variant_id: selectedVariant === NONE ? null : selectedVariant,
          store_id: locationType === "store" ? selectedStore : null,
          warehouse_id: locationType === "warehouse" ? selectedWarehouse : null,
          quantity: parsedQuantity,
          note,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "操作失败")
      }
      toast.success(actionType === "in" ? "入库成功" : actionType === "out" ? "出库成功" : "库存已调整")
      setDialogOpen(false)
      resetForm()
      loadInventory()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败")
    } finally {
      setSubmitting(false)
    }
  }

  const loadHistory = async (item: InventoryRecord) => {
    const params = new URLSearchParams({ product_id: item.product_id })
    if (item.variant_id) params.set("variant_id", item.variant_id)
    setHistoryTitle([
      item.products?.title || "未知商品",
      item.variants ? variantLabel(item.variants) : null,
      item.location_label || null,
    ].filter(Boolean).join(" / "))
    setHistoryLoading(true)
    setHistoryOpen(true)
    try {
      const res = await apiFetch(`/api/admin/inventory/transactions?${params.toString()}`)
      const json = await res.json()
      setHistoryData(json.data || [])
    } catch {
      toast.error("加载历史失败")
      setHistoryData([])
    } finally {
      setHistoryLoading(false)
    }
  }

  const typeLabel: Record<string, string> = { in: "入库", out: "出库", restock: "补货", adjust: "调整" }
  const typeColor: Record<string, string> = {
    in: "text-green-700 bg-green-50",
    out: "text-red-700 bg-red-50",
    restock: "text-blue-700 bg-blue-50",
    adjust: "text-amber-700 bg-amber-50",
  }

  if (loading) {
    return (
      <div className="flex">
        <div className="flex-1 p-8 space-y-4">
          <div className="flex items-center justify-between mb-6">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-9 w-24" />
          </div>
          <Skeleton className="h-96 w-full rounded-lg" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex">
      <div className="flex-1 p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="h-6 w-6" /> 库存管理
          </h1>
          <p className="text-muted-foreground mt-1">按商品、变体、门店和仓库管理可售库存。</p>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">库存行</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{inventory.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">库存总数</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalStock}</div>
            </CardContent>
          </Card>
          <Card className={lowStockItems.length > 0 ? "border-amber-300" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
                <Warning className="h-3 w-3" /> 低库存
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${lowStockItems.length > 0 ? "text-amber-600" : ""}`}>
                {lowStockItems.length}
              </div>
            </CardContent>
          </Card>
          <Card className={outOfStockItems.length > 0 ? "border-red-300" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">缺货</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${outOfStockItems.length > 0 ? "text-red-600" : ""}`}>
                {outOfStockItems.length}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center justify-between mb-4">
          <Input
            placeholder="搜索商品、SKU、条码、门店或仓库..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-80"
          />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadInventory}>
              <ArrowsClockwise className="h-4 w-4 mr-1" /> 刷新
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-1" /> 入库/出库
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-xl">
                <DialogHeader>
                  <DialogTitle>库存操作</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>操作类型</Label>
                      <Select value={actionType} onValueChange={(value) => setActionType(value as ActionType)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="in">入库</SelectItem>
                          <SelectItem value="out">出库</SelectItem>
                          <SelectItem value="adjust">盘点调整</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>{actionType === "adjust" ? "目标库存" : "数量"}</Label>
                      <Input
                        type="number"
                        min={actionType === "adjust" ? "0" : "1"}
                        value={quantity}
                        onChange={(event) => setQuantity(event.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <Label>商品</Label>
                    <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                      <SelectTrigger><SelectValue placeholder="选择商品" /></SelectTrigger>
                      <SelectContent>
                        {allProducts.map((product) => (
                          <SelectItem key={product.id} value={product.id}>{product.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>变体 / SKU</Label>
                    <Select value={selectedVariant} onValueChange={setSelectedVariant} disabled={!selectedProduct || variants.length === 0}>
                      <SelectTrigger>
                        <SelectValue placeholder={variants.length > 0 ? "选择变体" : "该商品无变体"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>默认商品</SelectItem>
                        {variants.map((variant) => (
                          <SelectItem key={variant.id} value={variant.id}>{variantLabel(variant)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>库存地点类型</Label>
                      <Select value={locationType} onValueChange={(value) => setLocationType(value as LocationType)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="global">未指定地点</SelectItem>
                          <SelectItem value="store">门店</SelectItem>
                          <SelectItem value="warehouse">仓库</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {locationType === "store" ? (
                      <div>
                        <Label>门店</Label>
                        <Select value={selectedStore} onValueChange={setSelectedStore}>
                          <SelectTrigger><SelectValue placeholder="选择门店" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>选择门店</SelectItem>
                            {stores.map((store) => (
                              <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div>
                        <Label>仓库</Label>
                        <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse} disabled={locationType !== "warehouse"}>
                          <SelectTrigger>
                            <SelectValue placeholder={locationType === "warehouse" ? "选择仓库" : "无需选择"} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>选择仓库</SelectItem>
                            {warehouses.map((warehouse) => (
                              <SelectItem key={warehouse.id} value={warehouse.id}>{warehouse.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  <div>
                    <Label>备注</Label>
                    <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="选填" />
                  </div>

                  <Button onClick={handleSubmit} disabled={submitting} className="w-full">
                    {submitting ? "处理中..." : actionType === "in" ? "确认入库" : actionType === "out" ? "确认出库" : "确认调整"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>商品</TableHead>
                  <TableHead>SKU / 条码</TableHead>
                  <TableHead>地点</TableHead>
                  <TableHead>当前库存</TableHead>
                  <TableHead>预警阈值</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>最后更新</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      暂无库存数据
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((item) => {
                    const isOut = item.stock <= 0
                    const isLow = item.stock > 0 && item.stock <= item.low_stock_threshold
                    const product = item.products
                    return (
                      <TableRow key={item.id} className={isOut ? "bg-red-50" : isLow ? "bg-amber-50" : ""}>
                        <TableCell className="font-medium">
                          <div>{product?.title || "未知商品"}</div>
                          <div className="text-xs text-muted-foreground">{product?.type === "service" ? "咨询服务" : "商品"}</div>
                        </TableCell>
                        <TableCell>
                          <div>{variantLabel(item.variants)}</div>
                          {item.variants?.barcode ? <div className="text-xs text-muted-foreground">{item.variants.barcode}</div> : null}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {item.store_id ? <Storefront className="h-4 w-4 text-blue-600" /> : item.warehouse_id ? <Warehouse className="h-4 w-4 text-slate-600" /> : <MapPin className="h-4 w-4 text-muted-foreground" />}
                            <span>{item.location_label || "未指定地点"}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={`font-bold ${isOut ? "text-red-600" : isLow ? "text-amber-600" : ""}`}>
                            {item.stock}
                          </span>
                        </TableCell>
                        <TableCell>{item.low_stock_threshold}</TableCell>
                        <TableCell>
                          {isOut ? (
                            <Badge variant="destructive">缺货</Badge>
                          ) : isLow ? (
                            <Badge variant="outline" className="border-amber-300 text-amber-700">低库存</Badge>
                          ) : (
                            <Badge variant="secondary">正常</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {new Date(item.updated_at).toLocaleString("zh-CN")}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => loadHistory(item)}>
                            历史
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
          <DialogContent className="max-w-2xl max-h-[70vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>库存变动历史 - {historyTitle}</DialogTitle>
            </DialogHeader>
            {historyLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">加载中...</div>
            ) : historyData.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">暂无变动记录</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>类型</TableHead>
                    <TableHead>变动数量</TableHead>
                    <TableHead>变动前</TableHead>
                    <TableHead>变动后</TableHead>
                    <TableHead>备注</TableHead>
                    <TableHead>时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyData.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${typeColor[tx.type] || "bg-gray-50 text-gray-600"}`}>
                          {typeLabel[tx.type] || tx.type}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium">{tx.quantity}</TableCell>
                      <TableCell className="text-muted-foreground">{tx.before_stock}</TableCell>
                      <TableCell className="text-muted-foreground">{tx.after_stock}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[220px] truncate">{tx.note || "-"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {new Date(tx.created_at).toLocaleString("zh-CN")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
