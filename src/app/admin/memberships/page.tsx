"use client"

import { useEffect, useState } from "react"
import { useI18n } from "@/contexts/i18n-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { PageHeader } from "../_components";
import { ArrowsClockwise, Crown, FloppyDisk, Plus } from "@phosphor-icons/react";

interface Tier {
  id: string
  name: string
  level: number
  min_total_spent: string
  discount_percent: string
  badge_color?: string
  benefits?: string
  is_active: boolean
}

export default function AdminMembershipsPage() {
  const { t } = useI18n()
  const [tiers, setTiers] = useState<Tier[]>([])
  const [loading, setLoading] = useState(true)
  const [editValues, setEditValues] = useState<Record<string, Tier>>({})

  const loadTiers = async () => {
    try {
      const res = await fetch("/api/admin/memberships")
      const json = await res.json()
      setTiers(json.data || [])
      // init edit values
      const vals: Record<string, Tier> = {}
      for (const t of json.data || []) vals[t.id] = { ...t }
      setEditValues(vals)
    } catch {
      toast.error("加载会员等级失败")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadTiers() }, [])

  // Create tier
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newTierName, setNewTierName] = useState("")
  const [newTierLevel, setNewTierLevel] = useState("")
  const [newTierMinSpent, setNewTierMinSpent] = useState("0")
  const [newTierDiscount, setNewTierDiscount] = useState("0")
  const [newTierBenefits, setNewTierBenefits] = useState("")

  const handleCreateTier = async () => {
    if (!newTierName || !newTierLevel) return toast.error("请填写名称和等级")
    const level = parseInt(newTierLevel)
    if (isNaN(level) || level <= 0) return toast.error("等级必须为正整数")
    setCreating(true)
    try {
      const res = await fetch("/api/admin/memberships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newTierName,
          level,
          min_total_spent: newTierMinSpent,
          discount_percent: newTierDiscount,
          benefits: newTierBenefits || undefined,
        }),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "创建失败") }
      toast.success("等级已创建")
      setCreateOpen(false); setNewTierName(""); setNewTierLevel(""); setNewTierMinSpent("0"); setNewTierDiscount("0"); setNewTierBenefits("")
      loadTiers()
    } catch (err) { toast.error(err instanceof Error ? err.message : "创建失败") }
    finally { setCreating(false) }
  }

  const handleSave = async (id: string) => {
    const val = editValues[id]
    try {
      const res = await fetch("/api/admin/memberships", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(val),
      })
      if (!res.ok) throw new Error()
      toast.success("已保存")
      loadTiers()
    } catch {
      toast.error("保存失败")
    }
  }

  const update = (id: string, field: string, value: unknown) => {
    setEditValues((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }))
  }

  const badgeColors: Record<number, string> = { 1: "bg-gray-100", 2: "bg-slate-200", 3: "bg-yellow-100", 4: "bg-indigo-100", 5: "bg-pink-100" }

  if (loading) {
    return (
      <div className="flex"><div className="flex-1 p-8 space-y-4">
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
    <div className="flex"><div className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Crown className="h-6 w-6" /> 会员等级管理
          </h1>
          <Button variant="outline" size="sm" onClick={loadTiers}>
            <ArrowsClockwise className="h-4 w-4 mr-1" /> 刷新
          </Button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> 创建等级</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>创建会员等级</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>等级名称 *</Label><Input value={newTierName} onChange={e => setNewTierName(e.target.value)} placeholder="如：白银会员" /></div>
                  <div><Label>等级编号 *</Label><Input type="number" min="1" value={newTierLevel} onChange={e => setNewTierLevel(e.target.value)} placeholder="1, 2, 3..." /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>消费门槛 ($)</Label><Input type="number" value={newTierMinSpent} onChange={e => setNewTierMinSpent(e.target.value)} /></div>
                  <div><Label>折扣 (%)</Label><Input type="number" value={newTierDiscount} onChange={e => setNewTierDiscount(e.target.value)} /></div>
                </div>
                <div><Label>权益描述</Label><Textarea value={newTierBenefits} onChange={e => setNewTierBenefits(e.target.value)} rows={3} /></div>
                <Button onClick={handleCreateTier} className="w-full" disabled={creating}>
                  {creating ? "创建中..." : "确认创建"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tiers.map((tier) => {
            const edit = editValues[tier.id] || tier
            return (
              <Card key={tier.id} className={tier.is_active ? "" : "opacity-60"}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Crown className={`h-5 w-5`} style={{ color: tier.badge_color || "#999" }} />
                      <CardTitle className="text-lg">{edit.name}</CardTitle>
                    </div>
                    <Badge className={badgeColors[tier.level] || ""} variant="outline">
                      Lv.{tier.level}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label className="text-xs">等级名称</Label>
                    <Input value={edit.name} onChange={(e) => update(tier.id, "name", e.target.value)} className="h-8 text-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">累计消费门槛 ($)</Label>
                      <Input type="number" value={edit.min_total_spent} onChange={(e) => update(tier.id, "min_total_spent", e.target.value)} className="h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs">折扣 (%)</Label>
                      <Input type="number" value={edit.discount_percent} onChange={(e) => update(tier.id, "discount_percent", e.target.value)} className="h-8 text-sm" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">权益描述</Label>
                    <Textarea value={edit.benefits || ""} onChange={(e) => update(tier.id, "benefits", e.target.value)} rows={2} className="text-sm" />
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={edit.is_active} onChange={(e) => update(tier.id, "is_active", e.target.checked)} />
                      启用
                    </label>
                    <Button size="sm" variant="outline" onClick={() => handleSave(tier.id)}>
                      <FloppyDisk className="h-3 w-3 mr-1" /> 保存
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
