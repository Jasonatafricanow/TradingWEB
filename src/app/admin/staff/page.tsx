"use client"

import { useEffect, useState } from "react"
import { apiFetch } from "@/lib/client-api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
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
import { ArrowsClockwise, Info, PencilSimple, Shield, ShieldSlash, UserPlus, Users } from "@phosphor-icons/react";
import { buildStaffPosUpdate } from "./staff-pos-form"

interface Staff {
  id: string
  name: string
  email: string
  role: "admin" | "manager" | "operator" | "support"
  phone?: string
  is_active: boolean
  last_login_at?: string
  created_at: string
  store_id?: string | null
  pos_enabled?: boolean
  pos_permissions?: string[]
  pos_pin_configured?: boolean
}

interface Store {
  id: string
  name: string
  status?: string
}

const roleLabels: Record<string, string> = {
  admin: "管理员",
  manager: "经理",
  operator: "运营",
  support: "客服",
}

const roleColors: Record<string, string> = {
  admin: "bg-purple-100 text-purple-700",
  manager: "bg-amber-100 text-amber-700",
  operator: "bg-blue-100 text-blue-700",
  support: "bg-green-100 text-green-700",
}

// 角色权限说明
const rolePermissions: Record<string, { scope: string; desc: string }[]> = {
  admin: [
    { scope: "全部权限", desc: "商品/订单/员工/财务/设置 — 所有功能可操作" },
    { scope: "员工管理", desc: "可添加/编辑/删除员工，分配角色" },
    { scope: "敏感操作", desc: "可删除商品、操作退款、修改价格" },
  ],
  operator: [
    { scope: "商品管理", desc: "可创建/编辑/上架/下架商品" },
    { scope: "订单管理", desc: "可查看/处理订单，标记发货" },
    { scope: "营销工具", desc: "可创建优惠券、管理活动" },
    { scope: "禁区", desc: "不可管理员工、不可修改价格 >$1000" },
  ],
  support: [
    { scope: "订单查看", desc: "可查看订单状态和客户信息" },
    { scope: "售后处理", desc: "可处理退款/退货申请" },
    { scope: "客户管理", desc: "可查看客户信息和历史订单" },
    { scope: "禁区", desc: "不可管理商品、不可管理员工" },
  ],
}

export default function AdminStaffPage() {
  const [staff, setStaff] = useState<Staff[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  // Add dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [role, setRole] = useState("support")
  const [phone, setPhone] = useState("")

  // Edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null)
  const [editName, setEditName] = useState("")
  const [editEmail, setEditEmail] = useState("")
  const [editRole, setEditRole] = useState("support")
  const [editPhone, setEditPhone] = useState("")
  const [editPosEnabled, setEditPosEnabled] = useState(false)
  const [editStoreId, setEditStoreId] = useState("")
  const [editPosPermissions, setEditPosPermissions] = useState<string[]>([])
  const [editPosPin, setEditPosPin] = useState("")
  const [editPosPinConfirm, setEditPosPinConfirm] = useState("")

  // Role info popover
  const [showRoleInfo, setShowRoleInfo] = useState<string | null>(null)

  const loadStaff = async () => {
    try {
      const res = await apiFetch("/api/admin/staff")
      const json = await res.json()
      setStaff(json.data || [])
    } catch {
      toast.error("加载员工列表失败")
    } finally {
      setLoading(false)
    }
  }

  const loadStores = async () => {
    try {
      const res = await apiFetch("/api/admin/stores")
      const json = await res.json()
      setStores((json.data || []).filter((store: Store) => store.status !== "inactive"))
    } catch {
      toast.error("加载门店列表失败")
    }
  }

  useEffect(() => {
    loadStaff()
    loadStores()
  }, [])

  const filtered = staff.filter((s) => {
    if (!search) return true
    const q = search.toLowerCase()
    return String(s.name || "").toLowerCase().includes(q) || String(s.email || "").toLowerCase().includes(q)
  })

  const handleAdd = async () => {
    if (!name || !email) {
      toast.error("请填写姓名和邮箱")
      return
    }
    try {
      const res = await apiFetch("/api/admin/staff", {
        method: "POST",
        body: JSON.stringify({ name, email, role, phone }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
      toast.success("员工添加成功")
      setAddDialogOpen(false)
      setName("")
      setEmail("")
      setRole("support")
      setPhone("")
      loadStaff()
    } catch (err) {
      toast.error(err instanceof Error ? (err as Error).message : "添加失败")
    }
  }

  const handleEdit = async () => {
    if (!editingStaff) return
    try {
      const posUpdate = buildStaffPosUpdate({
        posEnabled: editPosEnabled,
        storeId: editStoreId,
        permissions: editPosPermissions,
        pin: editPosPin,
        pinConfirm: editPosPinConfirm,
      }, { pos_pin_configured: editingStaff.pos_pin_configured === true })
      const securityChanged = posUpdate.pos_pin !== undefined
        || posUpdate.pos_enabled !== editingStaff.pos_enabled
        || posUpdate.store_id !== (editingStaff.store_id ?? null)
        || JSON.stringify(posUpdate.pos_permissions) !== JSON.stringify(editingStaff.pos_permissions ?? [])
      if (securityChanged && !window.confirm("修改 POS 安全配置会立即注销该员工现有的收银会话。是否继续？")) return
      const res = await apiFetch(`/api/admin/staff/${editingStaff.id}`, {
        method: "PUT",
        body: JSON.stringify({ name: editName, role: editRole, phone: editPhone, ...posUpdate }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
      toast.success("员工信息已更新")
      setEditDialogOpen(false)
      setEditingStaff(null)
      setEditPosPin("")
      setEditPosPinConfirm("")
      loadStaff()
    } catch (err) {
      const code = err instanceof Error ? err.message : ""
      const message: Record<string, string> = {
        PIN_CONFIRM_MISMATCH: "两次输入的 POS PIN 不一致",
        PIN_FORMAT_INVALID: "POS PIN 必须是 4–8 位数字",
        POS_STORE_REQUIRED: "启用 POS 前必须选择所属门店",
        POS_PIN_REQUIRED: "启用 POS 前必须设置员工 PIN",
      }
      toast.error(message[code] ?? code ?? "更新失败")
    }
  }

  const openEditDialog = (s: Staff) => {
    setEditingStaff(s)
    setEditName(s.name)
    setEditEmail(s.email)
    setEditRole(s.role)
    setEditPhone(s.phone || "")
    setEditPosEnabled(s.pos_enabled === true)
    setEditStoreId(s.store_id ?? "")
    setEditPosPermissions(s.pos_permissions ?? [])
    setEditPosPin("")
    setEditPosPinConfirm("")
    setEditDialogOpen(true)
  }

  const handleEditDialogOpen = (open: boolean) => {
    setEditDialogOpen(open)
    if (!open) {
      setEditingStaff(null)
      setEditPosPin("")
      setEditPosPinConfirm("")
    }
  }

  const handleToggleStatus = async (id: string) => {
    try {
      const res = await apiFetch(`/api/admin/staff/${id}`, {
        method: "PUT",
        body: JSON.stringify({ is_active: !staff.find((s) => s.id === id)?.is_active }),
      })
      if (!res.ok) throw new Error()
      toast.success("状态已更新")
      loadStaff()
    } catch {
      toast.error("更新失败")
    }
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
          <div className="flex items-center justify-between mb-4">
            <Skeleton className="h-9 w-64" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-32" />
            </div>
          </div>
          <Skeleton className="h-96 w-full rounded-lg" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex"><div className="flex-1 p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" /> 员工管理
          </h1>
          <p className="text-muted-foreground mt-1">管理后台运营人员，分配角色与权限。不同角色看到的功能界面不同。</p>
        </div>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">员工总数</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{staff.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">活跃员工</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {staff.filter((s) => s.is_active).length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">管理员</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {staff.filter((s) => s.role === "admin").length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between mb-4">
          <Input
            placeholder="搜索姓名或邮箱..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadStaff}>
              <ArrowsClockwise className="h-4 w-4 mr-1" /> 刷新
            </Button>
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <UserPlus className="h-4 w-4 mr-1" /> 添加员工
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>添加员工</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>姓名</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="员工姓名" />
                  </div>
                  <div>
                    <Label>邮箱</Label>
                    <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" type="email" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <Label>角色</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 p-0 text-xs text-muted-foreground"
                        onClick={() => setShowRoleInfo(showRoleInfo === "new" ? null : "new")}
                      >
                        <Info className="h-3 w-3 mr-0.5" /> 权限说明
                      </Button>
                    </div>
                    {showRoleInfo === "new" && (
                      <div className="mb-2 p-2 bg-blue-50 rounded text-xs space-y-1">
                        {rolePermissions[role]?.map((p, i) => (
                          <div key={i} className="flex gap-1">
                            <span className="font-medium text-blue-700 shrink-0">• {p.scope}:</span>
                            <span className="text-blue-600">{p.desc}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <Select value={role} onValueChange={setRole}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">管理员</SelectItem>
                        <SelectItem value="manager">经理</SelectItem>
                        <SelectItem value="operator">运营</SelectItem>
                        <SelectItem value="support">客服</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>电话（可选）</Label>
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </div>
                  <Button onClick={handleAdd} className="w-full">确认添加</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>员工</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>移动 POS</TableHead>
                  <TableHead>最后登录</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      暂无员工数据
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs">
                              {String(s.name || s.email || "?").charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">{s.name}</div>
                            <div className="text-xs text-muted-foreground">{s.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Badge className={roleColors[s.role]} variant="outline">
                            {roleLabels[s.role]}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0"
                            onClick={() => setShowRoleInfo(showRoleInfo === s.id ? null : s.id)}
                          >
                            <Info className="h-3 w-3 text-muted-foreground" />
                          </Button>
                        </div>
                        {showRoleInfo === s.id && (
                          <div className="mt-1 p-2 bg-blue-50 rounded text-xs space-y-1">
                            {rolePermissions[s.role]?.map((p, i) => (
                              <div key={i} className="flex gap-1">
                                <span className="font-medium text-blue-700 shrink-0">• {p.scope}:</span>
                                <span className="text-blue-600">{p.desc}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {s.is_active ? (
                          <Badge variant="secondary" className="text-green-600">活跃</Badge>
                        ) : (
                          <Badge variant="destructive">已禁用</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={s.pos_enabled && s.pos_pin_configured ? "secondary" : "outline"}>
                          {!s.pos_enabled ? "未启用" : s.pos_pin_configured ? "可用" : "待设置 PIN"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {s.last_login_at
                          ? new Date(s.last_login_at).toLocaleString("zh-CN")
                          : "从未登录"}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(s)}
                          >
                            <PencilSimple className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleStatus(s.id)}
                          >
                            {s.is_active ? (
                              <ShieldSlash className="h-4 w-4 text-red-500" />
                            ) : (
                              <Shield className="h-4 w-4 text-green-500" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={handleEditDialogOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>编辑员工</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>姓名</Label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div>
                <Label>邮箱</Label>
                <Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} type="email" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Label>角色</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 p-0 text-xs text-muted-foreground"
                    onClick={() => setShowRoleInfo(showRoleInfo === "edit" ? null : "edit")}
                  >
                    <Info className="h-3 w-3 mr-0.5" /> 权限说明
                  </Button>
                </div>
                {showRoleInfo === "edit" && (
                  <div className="mb-2 p-2 bg-blue-50 rounded text-xs space-y-1">
                    {rolePermissions[editRole]?.map((p, i) => (
                      <div key={i} className="flex gap-1">
                        <span className="font-medium text-blue-700 shrink-0">• {p.scope}:</span>
                        <span className="text-blue-600">{p.desc}</span>
                      </div>
                    ))}
                  </div>
                )}
                <Select value={editRole} onValueChange={setEditRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">管理员</SelectItem>
                    <SelectItem value="manager">经理</SelectItem>
                    <SelectItem value="operator">运营</SelectItem>
                    <SelectItem value="support">客服</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>电话</Label>
                <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
              </div>
              <div className="space-y-4 rounded-lg border p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label>移动 POS</Label>
                    <p className="text-xs text-muted-foreground">启用后，该员工可使用所属门店的 Android 收银端。</p>
                  </div>
                  <Switch checked={editPosEnabled} onCheckedChange={setEditPosEnabled} />
                </div>
                <div>
                  <Label>所属门店</Label>
                  <Select value={editStoreId || "__none"} onValueChange={(value) => setEditStoreId(value === "__none" ? "" : value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择门店" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">未分配</SelectItem>
                      {stores.map((store) => (
                        <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label>收银权限</Label>
                    <p className="text-xs text-muted-foreground">允许创建并提交 POS 结账。</p>
                  </div>
                  <Switch
                    checked={editPosPermissions.includes("checkout")}
                    onCheckedChange={(checked) => setEditPosPermissions(checked ? ["checkout"] : [])}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>员工 PIN</Label>
                  <Badge variant={editingStaff?.pos_pin_configured ? "secondary" : "outline"}>
                    {editingStaff?.pos_pin_configured ? "已配置" : "未配置"}
                  </Badge>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input
                    value={editPosPin}
                    onChange={(event) => setEditPosPin(event.target.value)}
                    type="password"
                    inputMode="numeric"
                    maxLength={8}
                    placeholder="新 PIN（4–8 位数字）"
                    autoComplete="new-password"
                  />
                  <Input
                    value={editPosPinConfirm}
                    onChange={(event) => setEditPosPinConfirm(event.target.value)}
                    type="password"
                    inputMode="numeric"
                    maxLength={8}
                    placeholder="再次输入新 PIN"
                    autoComplete="new-password"
                  />
                </div>
                <p className="text-xs text-muted-foreground">留空表示不修改现有 PIN。修改安全配置会注销该员工当前 POS 会话。</p>
              </div>
              <Button onClick={handleEdit} className="w-full">保存修改</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
