"use client"

import { useEffect, useState } from "react"
import { useI18n } from "@/contexts/i18n-context"
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
import { ArrowsClockwise, PencilSimple, Plus, Storefront } from "@phosphor-icons/react";

interface Store {
  id: string; name: string; slug?: string; type: string; status: string
  warehouse_id?: string; contact_name?: string; contact_phone?: string
  address_line1?: string; city?: string; state?: string; country?: string
  open_time?: string; close_time?: string; open_at?: string; close_at?: string
  created_at: string
  warehouses?: { name: string }
}

export default function AdminStoresPage() {
  const { t } = useI18n()
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editingStore, setEditingStore] = useState<Store | null>(null)

  // Form fields
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [type, setType] = useState("permanent")
  const [contactName, setContactName] = useState("")
  const [contactPhone, setContactPhone] = useState("")
  const [addressLine1, setAddressLine1] = useState("")
  const [city, setCity] = useState("")
  const [state, setState] = useState("")
  const [country, setCountry] = useState("Moz")
  const [openTime, setOpenTime] = useState("")
  const [closeTime, setCloseTime] = useState("")

  const load = async () => {
    try {
      const res = await fetch("/api/admin/stores")
      const json = await res.json()
      setStores(json.data || [])
    } catch { toast.error("加载失败") }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const resetForm = () => {
    setName(""); setSlug(""); setType("permanent")
    setContactName(""); setContactPhone(""); setAddressLine1("")
    setCity(""); setState(""); setCountry("Moz")
    setOpenTime(""); setCloseTime("")
  }

  const openEdit = (store: Store) => {
    setEditingStore(store)
    setName(store.name); setSlug(store.slug || "")
    setType(store.type); setContactName(store.contact_name || "")
    setContactPhone(store.contact_phone || "")
    setAddressLine1(store.address_line1 || "")
    setCity(store.city || ""); setState(store.state || "")
    setCountry(store.country || "Moz")
    setOpenTime(store.open_time || ""); setCloseTime(store.close_time || "")
    setEditOpen(true)
  }

  const handleSave = async (isEdit = false) => {
    if (!name) return toast.error("请填写店铺名称")
    try {
      const body = {
        ...(isEdit ? { id: editingStore?.id } : {}),
        name, slug: slug || undefined,
        type, contact_name: contactName || undefined,
        contact_phone: contactPhone || undefined,
        address_line1: addressLine1 || undefined,
        city: city || undefined, state: state || undefined,
        country: country || undefined,
        open_time: openTime || undefined, close_time: closeTime || undefined,
      }
      const res = await fetch("/api/admin/stores", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      toast.success(isEdit ? "店铺已更新" : "店铺已添加")
      setAddOpen(false); setEditOpen(false); resetForm(); load()
    } catch { toast.error(isEdit ? "更新失败" : "添加失败") }
  }

  const handleToggleStatus = async (store: Store) => {
    try {
      const newStatus = store.status === "active" ? "closed" : "active"
      await fetch(`/api/admin/stores/${store.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })
      load()
    } catch { toast.error("操作失败") }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除该店铺？")) return
    try {
      await fetch(`/api/admin/stores/${id}`, { method: "DELETE" })
      toast.success("店铺已删除"); load()
    } catch { toast.error("删除失败") }
  }

  const typeBadge = (type: string) => {
    const map: Record<string, string> = { permanent: "永久", temp: "临时", popup: "快闪" }
    return map[type] || type
  }

  const statusBadge = (status: string) => {
    const colors: Record<string, "default" | "secondary" | "outline"> = {
      active: "default", closed: "secondary", suspended: "outline",
    }
    const labels: Record<string, string> = {
      active: "营业中", closed: "已关闭", suspended: "暂停",
    }
    return <Badge variant={colors[status] || "secondary"}>{labels[status] || status}</Badge>
  }

  if (loading) return (
    <div className="flex"><div className="flex-1 p-8">加载中...</div></div>
  )

  return (
    <div className="flex"><div className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2"><Storefront className="h-6 w-6" /> 多店铺管理</h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load}><ArrowsClockwise className="h-4 w-4 mr-1" /> 刷新</Button>
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild><Button size="sm" onClick={() => { resetForm(); setEditingStore(null) }}>
                <Plus className="h-4 w-4 mr-1" /> 添加店铺
              </Button></DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>添加店铺</DialogTitle></DialogHeader>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2"><Label>店铺名称 *</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
                  <div className="col-span-2"><Label>Slug（URL标识，可选）</Label><Input value={slug} onChange={e => setSlug(e.target.value)} /></div>
                  <div><Label>类型</Label><Select value={type} onValueChange={setType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="permanent">永久店</SelectItem><SelectItem value="temp">临时店</SelectItem><SelectItem value="popup">快闪店</SelectItem></SelectContent></Select></div>
                  <div><Label>国家</Label><Input value={country} onChange={e => setCountry(e.target.value)} /></div>
                  <div className="col-span-2"><Label>地址</Label><Input value={addressLine1} onChange={e => setAddressLine1(e.target.value)} placeholder="街道地址" /></div>
                  <div><Label>城市</Label><Input value={city} onChange={e => setCity(e.target.value)} /></div>
                  <div><Label>省份/州</Label><Input value={state} onChange={e => setState(e.target.value)} /></div>
                  <div><Label>联系人</Label><Input value={contactName} onChange={e => setContactName(e.target.value)} /></div>
                  <div><Label>联系电话</Label><Input value={contactPhone} onChange={e => setContactPhone(e.target.value)} /></div>
                  <div><Label>营业开始</Label><Input type="time" value={openTime} onChange={e => setOpenTime(e.target.value)} /></div>
                  <div><Label>营业结束</Label><Input type="time" value={closeTime} onChange={e => setCloseTime(e.target.value)} /></div>
                </div>
                <Button onClick={() => handleSave(false)} className="w-full mt-2">确认添加</Button>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>联系人</TableHead>
                  <TableHead>地址</TableHead>
                  <TableHead>营业时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stores.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">暂无店铺</TableCell></TableRow>
                ) : stores.map((store) => (
                  <TableRow key={store.id}>
                    <TableCell className="font-medium">{store.name}</TableCell>
                    <TableCell>{typeBadge(store.type)}</TableCell>
                    <TableCell>{statusBadge(store.status)}</TableCell>
                    <TableCell className="text-sm">{store.contact_name || "-"}</TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">
                      {[store.address_line1, store.city, store.state].filter(Boolean).join(", ") || "-"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {store.open_time && store.close_time ? `${store.open_time} - ${store.close_time}` : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(store)}>
                          <PencilSimple className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleToggleStatus(store)}>
                          {store.status === "active" ? "关闭" : "开启"}
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-500" onClick={() => handleDelete(store.id)}>
                          删除
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>编辑店铺</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>店铺名称 *</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
              <div className="col-span-2"><Label>Slug</Label><Input value={slug} onChange={e => setSlug(e.target.value)} /></div>
              <div><Label>类型</Label><Select value={type} onValueChange={setType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="permanent">永久店</SelectItem><SelectItem value="temp">临时店</SelectItem><SelectItem value="popup">快闪店</SelectItem></SelectContent></Select></div>
              <div><Label>国家</Label><Input value={country} onChange={e => setCountry(e.target.value)} /></div>
              <div className="col-span-2"><Label>地址</Label><Input value={addressLine1} onChange={e => setAddressLine1(e.target.value)} /></div>
              <div><Label>城市</Label><Input value={city} onChange={e => setCity(e.target.value)} /></div>
              <div><Label>省份/州</Label><Input value={state} onChange={e => setState(e.target.value)} /></div>
              <div><Label>联系人</Label><Input value={contactName} onChange={e => setContactName(e.target.value)} /></div>
              <div><Label>联系电话</Label><Input value={contactPhone} onChange={e => setContactPhone(e.target.value)} /></div>
              <div><Label>营业开始</Label><Input type="time" value={openTime} onChange={e => setOpenTime(e.target.value)} /></div>
              <div><Label>营业结束</Label><Input type="time" value={closeTime} onChange={e => setCloseTime(e.target.value)} /></div>
            </div>
            <Button onClick={() => handleSave(true)} className="w-full mt-2">保存修改</Button>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
