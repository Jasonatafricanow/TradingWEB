"use client"

import { useEffect, useState } from "react"
import { useI18n } from "@/contexts/i18n-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { toast } from "sonner"
import { PageHeader } from "../_components";
import { ArrowsClockwise, PencilSimple, Plus, ToggleLeft, ToggleRight, Trash, Truck } from "@phosphor-icons/react";

interface ShippingTemplate {
  id: string
  name: string
  type: "flat" | "weight_based" | "price_based" | "free_shipping"
  base_rate: string
  free_shipping_min: string | null
  description: string | null
  is_active: boolean
  sort_order: number
  created_at: string
}

interface DeliveryZone {
  id: string
  name: string
  name_en: string | null
  base_rate: string
  free_shipping_min: string | null
  time_slots: unknown
  is_active: boolean
  sort_order: number
}

const TYPE_LABELS: Record<string, string> = {
  flat: "固定运费",
  weight_based: "按重量",
  price_based: "按金额",
  free_shipping: "包邮",
}

const TYPE_OPTIONS = [
  { value: "flat", label: "固定运费" },
  { value: "weight_based", label: "按重量计费" },
  { value: "price_based", label: "按金额计费" },
  { value: "free_shipping", label: "包邮" },
]

const emptyForm = {
  name: "",
  type: "flat",
  base_rate: "0.00",
  free_shipping_min: "",
  description: "",
  is_active: true,
  sort_order: 0,
}

export default function AdminShippingTemplatesPage() {
  const { t } = useI18n()
  const [templates, setTemplates] = useState<ShippingTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<typeof emptyForm>(emptyForm)

  // Delivery zones state
  const [zones, setZones] = useState<DeliveryZone[]>([])
  const [zonesLoading, setZonesLoading] = useState(true)
  const [zoneDialogOpen, setZoneDialogOpen] = useState(false)
  const [zoneEditingId, setZoneEditingId] = useState<string | null>(null)
  const [zoneForm, setZoneForm] = useState({ name: "", name_en: "", base_rate: "0.00", free_shipping_min: "", time_slots: "", sort_order: 0 })

  const load = async () => {
    try {
      const res = await fetch("/api/admin/shipping-templates")
      const json = await res.json()
      setTemplates(json.data || [])
    } catch { toast.error("加载失败") }
    finally { setLoading(false) }
  }

  useEffect(() => { load(); loadZones() }, [])

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  const openEdit = (tmpl: ShippingTemplate) => {
    setEditingId(tmpl.id)
    setForm({
      name: tmpl.name,
      type: tmpl.type,
      base_rate: tmpl.base_rate,
      free_shipping_min: tmpl.free_shipping_min || "",
      description: tmpl.description || "",
      is_active: tmpl.is_active,
      sort_order: tmpl.sort_order,
    })
    setDialogOpen(true)
  }

  const save = async () => {
    if (!form.name.trim()) { toast.error("请输入模板名称"); return }
    try {
      const body = {
        ...form,
        free_shipping_min: form.free_shipping_min || null,
        description: form.description || null,
      }
      const url = editingId
        ? `/api/admin/shipping-templates/${editingId}`
        : "/api/admin/shipping-templates"
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error("保存失败")
      toast.success(editingId ? "已更新" : "已创建")
      setDialogOpen(false)
      load()
    } catch { toast.error("保存失败") }
  }

  const remove = async (id: string, name: string) => {
    if (!confirm(`确定删除模板「${name}」？`)) return
    try {
      const res = await fetch(`/api/admin/shipping-templates/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("删除失败")
      toast.success("已删除")
      load()
    } catch { toast.error("删除失败") }
  }

  const toggleActive = async (tmpl: ShippingTemplate) => {
    try {
      await fetch(`/api/admin/shipping-templates/${tmpl.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !tmpl.is_active }),
      })
      load()
    } catch { toast.error("操作失败") }
  }

  const loadZones = async () => {
    try {
      const res = await fetch("/api/admin/delivery-zones")
      const json = await res.json()
      setZones(json.data || [])
    } catch { toast.error("加载配送区域失败") }
    finally { setZonesLoading(false) }
  }

  const openZoneCreate = () => {
    setZoneEditingId(null)
    setZoneForm({ name: "", name_en: "", base_rate: "0.00", free_shipping_min: "", time_slots: "", sort_order: 0 })
    setZoneDialogOpen(true)
  }

  const openZoneEdit = (z: DeliveryZone) => {
    setZoneEditingId(z.id)
    setZoneForm({
      name: z.name,
      name_en: z.name_en || "",
      base_rate: z.base_rate,
      free_shipping_min: z.free_shipping_min || "",
      time_slots: typeof z.time_slots === 'string' ? z.time_slots : JSON.stringify(z.time_slots || ""),
      sort_order: z.sort_order,
    })
    setZoneDialogOpen(true)
  }

  const saveZone = async () => {
    if (!zoneForm.name.trim()) { toast.error("请输入区域名称"); return }
    let parsedTimeSlots: unknown = null;
    const ts = zoneForm.time_slots.trim();
    if (ts) {
      try { parsedTimeSlots = JSON.parse(ts); } catch { parsedTimeSlots = ts; }
    }
    try {
      const body: Record<string, unknown> = {
        name: zoneForm.name.trim(),
        name_en: zoneForm.name_en.trim() || null,
        base_rate: zoneForm.base_rate,
        free_shipping_min: zoneForm.free_shipping_min || null,
        time_slots: parsedTimeSlots,
        sort_order: zoneForm.sort_order,
      }
      const url = zoneEditingId
        ? `/api/admin/delivery-zones/${zoneEditingId}`
        : "/api/admin/delivery-zones"
      const res = await fetch(url, {
        method: zoneEditingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error("保存失败")
      toast.success(zoneEditingId ? "已更新" : "已创建")
      setZoneDialogOpen(false)
      loadZones()
    } catch { toast.error("保存失败") }
  }

  const removeZone = async (id: string, name: string) => {
    if (!confirm(`确定删除配送区域「${name}」？`)) return
    try {
      const res = await fetch(`/api/admin/delivery-zones/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("删除失败")
      toast.success("已删除")
      loadZones()
    } catch { toast.error("删除失败") }
  }

  const toggleZoneActive = async (z: DeliveryZone) => {
    try {
      await fetch(`/api/admin/delivery-zones/${z.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !z.is_active }),
      })
      loadZones()
    } catch { toast.error("操作失败") }
  }

  return (
    <div className="flex"><div className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2"><Truck className="h-6 w-6" /> 物流模板</h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load}><ArrowsClockwise className="h-4 w-4 mr-1" /> 刷新</Button>
            <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> 新建模板</Button>
          </div>
        </div>

        <Card><CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>模板名称</TableHead>
                <TableHead>计费方式</TableHead>
                <TableHead>基础运费</TableHead>
                <TableHead>包邮门槛</TableHead>
                <TableHead>排序</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">加载中...</TableCell></TableRow>
              ) : templates.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">暂无物流模板，点击上方按钮新建</TableCell></TableRow>
              ) : templates.map((tmpl) => (
                <TableRow key={tmpl.id}>
                  <TableCell>
                    <div className="font-medium">{tmpl.name}</div>
                    {tmpl.description && <div className="text-xs text-muted-foreground">{tmpl.description}</div>}
                  </TableCell>
                  <TableCell>{TYPE_LABELS[tmpl.type] || tmpl.type}</TableCell>
                  <TableCell>${tmpl.base_rate}</TableCell>
                  <TableCell>{tmpl.free_shipping_min ? `$${tmpl.free_shipping_min}` : "-"}</TableCell>
                  <TableCell>{tmpl.sort_order}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => toggleActive(tmpl)}>
                      {tmpl.is_active ? <ToggleRight className="h-5 w-5 text-green-600" /> : <ToggleLeft className="h-5 w-5 text-gray-400" />}
                    </Button>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(tmpl)}><PencilSimple className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(tmpl.id, tmpl.name)}><Trash className="h-4 w-4 text-red-500" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingId ? "编辑物流模板" : "新建物流模板"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>模板名称</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例如：标准快递" />
              </div>
              <div>
                <Label>计费方式</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as ShippingTemplate['type'] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>基础运费 ($)</Label>
                  <Input type="number" step="0.01" value={form.base_rate} onChange={(e) => setForm({ ...form, base_rate: e.target.value })} />
                </div>
                <div>
                  <Label>包邮门槛 ($)</Label>
                  <Input type="number" step="0.01" value={form.free_shipping_min} onChange={(e) => setForm({ ...form, free_shipping_min: e.target.value })} placeholder="留空即不启用" />
                </div>
              </div>
              <div>
                <Label>排序（数字越小越靠前）</Label>
                <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })} />
              </div>
              <div>
                <Label>描述（选填）</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="例如：适用于3-5个工作日送达的订单" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button onClick={save}>保存</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Maputo 配送区域 ── */}
        <div className="mt-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold flex items-center gap-2"><Truck className="h-5 w-5" /> Maputo 配送区域</h2>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadZones}><ArrowsClockwise className="h-4 w-4 mr-1" /> 刷新</Button>
              <Button size="sm" onClick={openZoneCreate}><Plus className="h-4 w-4 mr-1" /> 新建区域</Button>
            </div>
          </div>

          <Card><CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>区域名称</TableHead>
                  <TableHead>名称 (EN)</TableHead>
                  <TableHead>基础运费</TableHead>
                  <TableHead>免邮门槛</TableHead>
                  <TableHead>配送时段</TableHead>
                  <TableHead>排序</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {zonesLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">加载中...</TableCell></TableRow>
                ) : zones.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">暂无配送区域，点击上方按钮新建</TableCell></TableRow>
                ) : zones.map((z) => (
                  <TableRow key={z.id}>
                    <TableCell className="font-medium">{z.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{z.name_en || "-"}</TableCell>
                    <TableCell>${z.base_rate}</TableCell>
                    <TableCell>{z.free_shipping_min ? `$${z.free_shipping_min}` : "-"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{z.time_slots ? (typeof z.time_slots === 'string' ? z.time_slots.slice(0, 30) : JSON.stringify(z.time_slots).slice(0, 30)) + "…" : "-"}</TableCell>
                    <TableCell>{z.sort_order}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => toggleZoneActive(z)}>
                        {z.is_active ? <ToggleRight className="h-5 w-5 text-green-600" /> : <ToggleLeft className="h-5 w-5 text-gray-400" />}
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openZoneEdit(z)}><PencilSimple className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => removeZone(z.id, z.name)}><Trash className="h-4 w-4 text-red-500" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </div>

        {/* Zone Dialog */}
        <Dialog open={zoneDialogOpen} onOpenChange={setZoneDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{zoneEditingId ? "编辑配送区域" : "新建配送区域"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>区域名称</Label>
                <Input value={zoneForm.name} onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })} placeholder="例如：Maputo Cidade" />
              </div>
              <div>
                <Label>名称 (EN)</Label>
                <Input value={zoneForm.name_en} onChange={(e) => setZoneForm({ ...zoneForm, name_en: e.target.value })} placeholder="e.g. Maputo City" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>基础运费 ($)</Label>
                  <Input type="number" step="0.01" value={zoneForm.base_rate} onChange={(e) => setZoneForm({ ...zoneForm, base_rate: e.target.value })} />
                </div>
                <div>
                  <Label>免邮门槛 ($)</Label>
                  <Input type="number" step="0.01" value={zoneForm.free_shipping_min} onChange={(e) => setZoneForm({ ...zoneForm, free_shipping_min: e.target.value })} placeholder="留空即不启用" />
                </div>
              </div>
              <div>
                <Label>配送时段 (JSON)</Label>
                <Textarea value={zoneForm.time_slots} onChange={(e) => setZoneForm({ ...zoneForm, time_slots: e.target.value })} rows={3} placeholder={'[{"label":"09:00-12:00","label_en":"Morning"},{"label":"14:00-17:00","label_en":"Afternoon"}]'} />
              </div>
              <div>
                <Label>排序（数字越小越靠前）</Label>
                <Input type="number" value={zoneForm.sort_order} onChange={(e) => setZoneForm({ ...zoneForm, sort_order: parseInt(e.target.value) || 0 })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setZoneDialogOpen(false)}>取消</Button>
              <Button onClick={saveZone}>保存</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}