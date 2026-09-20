"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useI18n } from "@/contexts/i18n-context"
import { formatMoney } from "@/lib/format"
import { apiFetch } from "@/lib/client-api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import Link from "next/link"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "../../_components";
import { ArrowLeft, CalendarBlank, Crown, CurrencyDollar, Envelope, MapPin, Package, Phone, ShoppingBag, UserMinus, WhatsappLogo } from "@phosphor-icons/react";

export default function CustomerDetailPage() {
  const { t } = useI18n()
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tagInput, setTagInput] = useState("")

  useEffect(() => {
    if (!id) { setLoading(false); return }
    apiFetch(`/api/admin/customers/${id}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok || j.error) throw new Error(j.error || "加载失败")
        setData(j.data)
        setTagInput(j.data?.tags || "")
      })
      .catch((err) => { toast.error(err instanceof Error ? err.message : "加载失败") })
      .finally(() => setLoading(false))
  }, [id])

  const saveTags = async () => {
    if (!id || !data) return;
    try {
      const res = await apiFetch(`/api/admin/customers/${id}/tags`, {
        method: "PUT",
        body: JSON.stringify({ tags: tagInput }),
      });
      if (!res.ok) throw new Error("保存失败");
      toast.success("标签已保存");
    } catch { toast.error("标签保存失败"); }
  }

  if (loading) return (
    <div className="flex"><div className="flex-1 p-8 space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full rounded-lg" /></div></div>
  )

  if (!data) return (
    <div className="flex"><div className="flex-1 p-8"><div className="flex flex-col items-center justify-center min-h-[40vh]"><UserMinus className="h-16 w-16 text-muted-foreground/30 mb-4" /><p className="text-muted-foreground">客户未找到</p></div></div></div>
  )

  const { info, orders, membership, addresses } = data

  const statusLabels: Record<string, string> = {
    pending: "待支付", paid: "已支付", processing: "处理中",
    completed: "已完成", cancelled: "已取消", refunded: "已退款",
  }
  const statusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700", paid: "bg-blue-100 text-blue-700",
    processing: "bg-purple-100 text-purple-700", completed: "bg-green-100 text-green-700",
    cancelled: "bg-red-100 text-red-700", refunded: "bg-gray-100 text-gray-700",
  }

  return (
    <div className="flex"><div className="flex-1 p-8">
        <Button variant="ghost" size="sm" onClick={() => router.push("/admin/customers")} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-1" /> 返回客户列表
        </Button>

        {/* 客户信息卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                {info.name || "未知用户"}
                {membership?.tier && <Crown className="h-5 w-5 text-yellow-500" />}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2"><Envelope className="h-4 w-4 text-muted-foreground" /> {info.email}</div>
              {info.phone && <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /> {info.phone}</div>}
              {info.whatsapp && <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-green-500" /><span className="text-green-600">{info.whatsapp} <span className="text-xs text-muted-foreground">(WhatsApp)</span></span></div>}
              <div className="flex items-center gap-2"><Package className="h-4 w-4 text-muted-foreground" /> 客户ID: <code className="text-xs">{info.user_id}</code></div>
              {data.tier && (
                <div className="flex items-center gap-2">
                  <Crown className="h-4 w-4 text-yellow-500" />
                  <span className="capitalize">{data.tier}</span>
                </div>
              )}
              {membership?.tier && (
                <div className="flex items-center gap-2">
                  <Crown className="h-4 w-4 text-yellow-500" />
                  {membership.tier.name} ({membership.tier.discount_percent}% 折扣)
                </div>
              )}
              {/* Tags */}
              <div className="flex items-center gap-2 pt-2">
                <span className="text-xs text-muted-foreground shrink-0">标签:</span>
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="逗号分隔的标签"
                  className="h-7 text-xs flex-1"
                  onBlur={saveTags}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveTags(); }}
                />
              </div>
              {/* WhatsApp contact */}
              {info.phone && (
                <Button variant="outline" size="sm" className="w-full gap-2 border-green-500 text-green-700 hover:bg-green-50 mt-2"
                  onClick={() => window.open(`https://wa.me/${info.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent('您好，我是 GlobalTrade 运营团队')}`, '_blank')}>
                  <WhatsappLogo className="h-4 w-4" /> WhatsApp 联系
                </Button>
              )}
            </CardContent>
          </Card>

          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><ShoppingBag className="h-3 w-3" /> 总订单</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{info.total_orders}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><CurrencyDollar className="h-3 w-3" /> 总消费</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-green-600">${formatMoney(info.total_spent)}</div></CardContent></Card>
        </div>

        {/* 地址 */}
        {addresses && addresses.length > 0 && (
          <Card className="mb-6">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4" /> 地址 ({addresses.length})</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                {addresses.map((addr: { id: string; is_default?: boolean; label?: string; address_line1?: string; city?: string; state?: string; zip?: string; country?: string; phone?: string }) => (
                  <div key={addr.id} className={`p-4 rounded-lg border ${addr.is_default ? "border-blue-300 bg-blue-50" : ""}`}>
                    <div className="flex items-center gap-2 mb-1">
                      {addr.label && <span className="text-xs font-semibold text-muted-foreground uppercase">{addr.label}</span>}
                      {addr.is_default && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">默认</span>}
                    </div>
                    <p className="text-sm">{addr.address_line1}</p>
                    <p className="text-sm text-muted-foreground">{addr.city}{addr.state ? `, ${addr.state}` : ""} {addr.zip}</p>
                    <p className="text-sm text-muted-foreground">{addr.country}</p>
                    {addr.phone && <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1"><Phone className="h-3 w-3" /> {addr.phone}</p>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 订单历史 */}
        <Card>
          <CardHeader><CardTitle className="text-base">订单历史 ({orders.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {orders.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">暂无订单</div>
              ) : orders.map((order: { id: string; order_no?: string; total_amount?: string; status: string; payment_method?: string; created_at: string; order_items?: { product_title: string }[] }) => (
                <div key={order.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium">{order.order_no || String(order.id || "").slice(0, 8) || "-"}</span>
                      <Badge className={statusColors[order.status]} variant="outline">{statusLabels[order.status] || order.status}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      <CalendarBlank className="inline h-3 w-3 mr-1" />
                      {new Date(order.created_at).toLocaleString("zh-CN")}
                      {order.payment_method && <> · {order.payment_method}</>}
                    </div>
                    {(order.order_items || []).length > 0 && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {(order.order_items || []).map((item: { product_title: string }) => item.product_title).join(", ")}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-bold">${formatMoney(order.total_amount)}</div>
                    <Link href={`/orders/${order.id}`} className="text-xs text-blue-600 hover:underline">查看</Link>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
