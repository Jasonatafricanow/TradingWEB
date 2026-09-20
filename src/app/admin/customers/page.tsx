"use client"

import { useEffect, useState } from "react"
import { useI18n } from "@/contexts/i18n-context"
import { formatMoney } from "@/lib/format"
import { apiFetch } from "@/lib/client-api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import Link from "next/link"
import { toast } from "sonner"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { PageHeader } from "../_components";
import { ArrowsClockwise, Crown, Eye, MagnifyingGlass, Plus, UserMinus, Users } from "@phosphor-icons/react";

interface Customer {
  user_id: string | null
  email: string | null
  name: string | null
  total_orders: number
  total_spent: number
  first_order_at?: string
  last_order_at?: string
  membership_tier?: string
  membership_discount?: string
  tier?: string
  tags?: string
}

const TIER_LABELS: Record<string, string> = {
  vip: "VIP", active: "Active", new: "New", at_risk: "At Risk", lost: "Lost",
};
const TIER_COLORS: Record<string, string> = {
  vip: "bg-purple-100 text-purple-700", active: "bg-green-100 text-green-700",
  new: "bg-blue-100 text-blue-700", at_risk: "bg-amber-100 text-amber-700",
  lost: "bg-gray-100 text-gray-700",
};

export default function AdminCustomersPage() {
  const { t } = useI18n()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [tierFilter, setTierFilter] = useState("all")
  const [tagFilter, setTagFilter] = useState("")

  const load = async () => {
    setLoading(true)
    try {
      const res = await apiFetch("/api/admin/customers")
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.error) throw new Error(json.error || "Failed to load")
      setCustomers(json.data || [])
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed to load") }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  // Create
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createEmail, setCreateEmail] = useState("")
  const [createName, setCreateName] = useState("")
  const [createPhone, setCreatePhone] = useState("")

  const handleCreate = async () => {
    if (!createEmail) return toast.error("请填写邮箱")
    setCreating(true)
    try {
      const res = await apiFetch("/api/admin/customers", {
        method: "POST",
        body: JSON.stringify({ email: createEmail, name: createName || undefined, phone: createPhone || undefined }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "创建失败")
      toast.success("客户已创建")
      setCreateOpen(false); setCreateEmail(""); setCreateName(""); setCreatePhone(""); load()
    } catch (err) { toast.error(err instanceof Error ? err.message : "创建失败") }
    finally { setCreating(false) }
  }

  const filtered = customers.filter((c) => {
    if (!search) return true
    const q = search.toLowerCase()
    return String(c.email || "").toLowerCase().includes(q) ||
      String(c.name || "").toLowerCase().includes(q) ||
      String(c.user_id || "").includes(q)
  }).filter((c) => {
    if (tierFilter === "all") return true;
    return c.tier === tierFilter;
  }).filter((c) => {
    if (!tagFilter) return true;
    const tags = c.tags || "";
    return tags.toLowerCase().includes(tagFilter.toLowerCase());
  })

  const totalRevenue = customers.reduce((s, c) => s + Number(c.total_spent), 0)
  const avgOrders = customers.length > 0
    ? Math.round(customers.reduce((s, c) => s + Number(c.total_orders), 0) / customers.length)
    : 0

  // Loading skeleton
  if (loading) {
    return (
      <div className="p-6 lg:p-8">
          <div className="flex items-center justify-between mb-6">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-9 w-20" />
          </div>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="pt-6">
                  <Skeleton className="h-4 w-20 mb-2" />
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardContent className="p-4 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </CardContent>
          </Card>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" /> {t("admin.customers_title")}
          </h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load}>
              <ArrowsClockwise className="h-4 w-4 mr-1" /> {t("admin.refresh")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.open("/api/admin/customers/export?tier=vip", "_blank")}>
              <Crown className="h-4 w-4 mr-1" /> 导出 VIP
            </Button>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" /> {t("admin.new_customer")}</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{t("admin.new_customer")}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>{t("staff.email")} *</Label><Input value={createEmail} onChange={e => setCreateEmail(e.target.value)} placeholder={t("admin.email_placeholder")} /></div>
                  <div><Label>{t("staff.name")}</Label><Input value={createName} onChange={e => setCreateName(e.target.value)} placeholder={t("admin.name_placeholder")} /></div>
                  <div><Label>{t("staff.phone")}</Label><Input value={createPhone} onChange={e => setCreatePhone(e.target.value)} placeholder={t("admin.phone_placeholder")} /></div>
                  <Button onClick={handleCreate} className="w-full" disabled={creating}>
                    {creating ? t("admin.creating") : t("admin.confirm_create")}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">{t("admin.customers_total")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{customers.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">{t("admin.customers_revenue")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">${formatMoney(totalRevenue)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">{t("admin.customers_avg")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{avgOrders}</div>
            </CardContent>
          </Card>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <MagnifyingGlass className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("customers.search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={tierFilter} onValueChange={setTierFilter}>
            <SelectTrigger className="w-32"><SelectValue placeholder="全部分层" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部分层</SelectItem>
              <SelectItem value="vip">VIP</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="at_risk">At Risk</SelectItem>
              <SelectItem value="lost">Lost</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative w-40">
            <Input
              placeholder="筛选标签..."
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="text-sm"
            />
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <UserMinus className="h-12 w-12 mb-4" />
                <p className="text-lg font-medium">{t("customers.list_empty")}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("staff.name")}</TableHead>
                    <TableHead>{t("customers.orders")}</TableHead>
                    <TableHead>{t("customers.spent")}</TableHead>
                    <TableHead>{t("customers.tier")}</TableHead>
                    <TableHead>标签</TableHead>
                    <TableHead>{t("customers.last_order")}</TableHead>
                    <TableHead>{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => (
                    <TableRow key={c.user_id || c.email || "unknown"}>
                      <TableCell>
                        <div className="font-medium">{c.name || "—"}</div>
                        <div className="text-sm text-muted-foreground">{c.email}</div>
                      </TableCell>
                      <TableCell>{c.total_orders}</TableCell>
                      <TableCell className="font-medium">${formatMoney(c.total_spent)}</TableCell>
                      <TableCell>
                        {c.membership_tier ? (
                          <Badge className="flex items-center gap-1 w-fit">
                            <Crown className="h-3 w-3" /> {c.membership_tier}
                          </Badge>
                        ) : c.tier ? (
                          <Badge className={`${TIER_COLORS[c.tier] || "bg-gray-100"} text-xs`}>
                            {TIER_LABELS[c.tier] || c.tier}
                          </Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">
                        {c.tags || "-"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {c.last_order_at ? new Date(c.last_order_at).toLocaleDateString("zh-CN") : "-"}
                      </TableCell>
                      <TableCell>
                        <Link href={`/admin/customers/${c.user_id || ""}`}>
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
    </div>
  )
}
