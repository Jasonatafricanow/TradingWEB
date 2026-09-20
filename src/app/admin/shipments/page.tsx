"use client"

import { useEffect, useState } from "react"
import { useI18n } from "@/contexts/i18n-context"
import { apiFetch } from "@/lib/client-api"
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
import { toast } from "sonner"
import { PageHeader } from "../_components";
import { ArrowsClockwise, MapPin, Package, Plus, Truck } from "@phosphor-icons/react";

interface Shipment {
  id: string; order_id: string; store_id?: string
  tracking_number?: string; carrier?: string; carrier_code?: string
  status: string; shipping_method?: string
  estimated_delivery?: string; shipped_at?: string; delivered_at?: string
  weight?: string; weight_unit?: string; package_count?: number
  notes?: string; tracking_events?: Record<string, unknown>[]
  created_at: string
  orders?: { order_no: string; buyer_name?: string }
  stores?: { name: string }
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  pending: { label: "待发货", variant: "outline" },
  picked: { label: "已拣货", variant: "secondary" },
  packaged: { label: "已打包", variant: "secondary" },
  shipped: { label: "已发货", variant: "default" },
  in_transit: { label: "运输中", variant: "default" },
  out_for_delivery: { label: "派送中", variant: "default" },
  delivered: { label: "已签收", variant: "default" },
  failed: { label: "配送失败", variant: "destructive" },
}

export default function AdminShipmentsPage() {
  const { t } = useI18n()
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null)

  // Create form
  const [orderId, setOrderId] = useState("")
  const [carrier, setCarrier] = useState("")
  const [trackingNumber, setTrackingNumber] = useState("")
  const [shipMethod, setShipMethod] = useState("")

  // Tracking event form
  const [eventStatus, setEventStatus] = useState("")
  const [eventLocation, setEventLocation] = useState("")
  const [eventDesc, setEventDesc] = useState("")

  const load = async () => {
    try {
      const res = await apiFetch("/api/admin/shipments")
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.error) throw new Error(json.error || "加载失败")
      setShipments(json.data || [])
    } catch { toast.error("加载失败") }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const resetForm = () => {
    setOrderId(""); setCarrier(""); setTrackingNumber(""); setShipMethod("")
  }

  const handleCreate = async () => {
    if (!orderId) return toast.error("请填写订单ID")
    try {
      const res = await apiFetch("/api/admin/shipments", {
        method: "POST",
        body: JSON.stringify({
          order_id: orderId,
          carrier: carrier || undefined,
          tracking_number: trackingNumber || undefined,
          shipping_method: shipMethod || undefined,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success("发货单已创建")
      setAddOpen(false); resetForm(); load()
    } catch { toast.error("创建失败") }
  }

  const handleStatusUpdate = async (id: string, status: string) => {
    try {
      const res = await apiFetch(`/api/admin/shipments/${id}`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error()
      toast.success("状态已更新"); load()
    } catch { toast.error("更新失败") }
  }

  const handleAddTrackingEvent = async () => {
    if (!eventStatus || !selectedShipment) return toast.error("请填写物流状态")
    try {
      const updateRes = await apiFetch(`/api/admin/shipments/${selectedShipment.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          action: "tracking_event",
          event: {
            status: eventStatus,
            location: eventLocation || undefined,
            timestamp: new Date().toISOString(),
            description: eventDesc || undefined,
          },
        }),
      })
      if (!updateRes.ok) throw new Error()
      toast.success("物流事件已添加")
      setEventStatus(""); setEventLocation(""); setEventDesc("")
      // Reload detail
      const res = await apiFetch(`/api/admin/shipments/${selectedShipment.id}`)
      const json = await res.json()
      setSelectedShipment(json.data)
      load()
    } catch { toast.error("添加失败") }
  }

  const openDetail = async (shipment: Shipment) => {
    try {
      const res = await apiFetch(`/api/admin/shipments/${shipment.id}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.error) throw new Error(json.error || "加载详情失败")
      setSelectedShipment(json.data)
      setDetailOpen(true)
    } catch { toast.error("加载详情失败") }
  }

  const statusLabel = (s: string) => statusConfig[s]?.label || s
  const statusVariant = (s: string) => statusConfig[s]?.variant || "secondary"

  if (loading) return (
    <div className="flex"><div className="flex-1 p-8">加载中...</div></div>
  )

  return (
    <div className="flex"><div className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2"><Truck className="h-6 w-6" /> 物流发货</h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load}><ArrowsClockwise className="h-4 w-4 mr-1" /> 刷新</Button>
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> 新建发货单</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>新建发货单</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>订单ID *</Label><Input value={orderId} onChange={e => setOrderId(e.target.value)} placeholder="输入订单UUID" /></div>
                  <div><Label>承运商</Label><Select value={carrier} onValueChange={setCarrier}><SelectTrigger><SelectValue placeholder="选择承运商" /></SelectTrigger><SelectContent>
                    <SelectItem value="DHL">DHL</SelectItem>
                    <SelectItem value="FedEx">FedEx</SelectItem>
                    <SelectItem value="UPS">UPS</SelectItem>
                    <SelectItem value="EMS">EMS</SelectItem>
                    <SelectItem value="其他">其他</SelectItem>
                  </SelectContent></Select></div>
                  <div><Label>运单号</Label><Input value={trackingNumber} onChange={e => setTrackingNumber(e.target.value)} /></div>
                  <div><Label>配送方式</Label><Input value={shipMethod} onChange={e => setShipMethod(e.target.value)} placeholder="如：标准快递" /></div>
                  <Button onClick={handleCreate} className="w-full">确认创建</Button>
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
                  <TableHead>订单号</TableHead>
                  <TableHead>承运商</TableHead>
                  <TableHead>运单号</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>发货店铺</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shipments.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">暂无发货记录</TableCell></TableRow>
                ) : shipments.map((ship) => (
                  <TableRow key={ship.id}>
                    <TableCell className="font-medium">{ship.orders?.order_no || String(ship.order_id || "").slice(0, 8) || "-"}</TableCell>
                    <TableCell>{ship.carrier || "-"}</TableCell>
                    <TableCell className="text-sm">{ship.tracking_number || "-"}</TableCell>
                    <TableCell><Badge variant={statusVariant(ship.status)}>{statusLabel(ship.status)}</Badge></TableCell>
                    <TableCell className="text-sm">{ship.stores?.name || "-"}</TableCell>
                    <TableCell className="text-sm">{new Date(ship.created_at).toLocaleString("zh-CN")}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openDetail(ship)}>
                          <Package className="h-4 w-4 mr-1" /> 详情
                        </Button>
                        {ship.status === "pending" && (
                          <Button variant="ghost" size="sm" onClick={() => handleStatusUpdate(ship.id, "shipped")}>
                            发货
                          </Button>
                        )}
                        {ship.status === "shipped" && (
                          <Button variant="ghost" size="sm" onClick={() => handleStatusUpdate(ship.id, "delivered")}>
                            签收
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Detail Dialog */}
        <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>发货详情</DialogTitle></DialogHeader>
            {selectedShipment && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">订单：</span>{selectedShipment.orders?.order_no || selectedShipment.order_id}</div>
                  <div><span className="text-muted-foreground">承运商：</span>{selectedShipment.carrier || "-"}</div>
                  <div><span className="text-muted-foreground">运单号：</span>{selectedShipment.tracking_number || "-"}</div>
                  <div><span className="text-muted-foreground">状态：</span><Badge variant={statusVariant(selectedShipment.status)}>{statusLabel(selectedShipment.status)}</Badge></div>
                  <div><span className="text-muted-foreground">发货店铺：</span>{selectedShipment.stores?.name || "-"}</div>
                  <div><span className="text-muted-foreground">配送方式：</span>{selectedShipment.shipping_method || "-"}</div>
                  <div><span className="text-muted-foreground">预计送达：</span>{selectedShipment.estimated_delivery ? new Date(selectedShipment.estimated_delivery).toLocaleDateString("zh-CN") : "-"}</div>
                  <div><span className="text-muted-foreground">包裹数：</span>{selectedShipment.package_count || 1}</div>
                  {selectedShipment.notes && <div className="col-span-2"><span className="text-muted-foreground">备注：</span>{selectedShipment.notes}</div>}
                </div>

                {selectedShipment.status !== "delivered" && selectedShipment.status !== "failed" && (
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">添加物流事件</CardTitle></CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-2">
                        <Select value={eventStatus} onValueChange={setEventStatus}>
                          <SelectTrigger><SelectValue placeholder="状态" /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(statusConfig).map(([k, v]) => (
                              <SelectItem key={k} value={k}>{v.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input value={eventLocation} onChange={e => setEventLocation(e.target.value)} placeholder="地点（可选）" />
                        <Button size="sm" onClick={handleAddTrackingEvent}><MapPin className="h-4 w-4 mr-1" /> 添加</Button>
                      </div>
                      <Input value={eventDesc} onChange={e => setEventDesc(e.target.value)} placeholder="描述（可选）" className="mt-2" />
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">物流轨迹</CardTitle></CardHeader>
                  <CardContent>
                    {(!selectedShipment.tracking_events || (selectedShipment.tracking_events as unknown[]).length === 0) ? (
                      <p className="text-sm text-muted-foreground">暂无物流事件</p>
                    ) : (
                      <div className="relative pl-6 space-y-3">
                        {(selectedShipment.tracking_events as Array<{ status: string; location?: string; timestamp: string; description?: string }>).map((evt, i) => (
                          <div key={i} className="relative">
                            <div className="absolute left-[-18px] top-1 w-2.5 h-2.5 rounded-full bg-primary" />
                            <div>
                              <p className="text-sm font-medium">{statusLabel(evt.status)}</p>
                              <p className="text-xs text-muted-foreground">
                                {evt.location ? `${evt.location} · ` : ""}{new Date(evt.timestamp).toLocaleString("zh-CN")}
                              </p>
                              {evt.description && <p className="text-xs text-muted-foreground">{evt.description}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
