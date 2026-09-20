"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useI18n } from "@/contexts/i18n-context"
import { useAuth } from "@/contexts/auth-context"
import { apiFetch } from "@/lib/client-api"
import { canCancelPendingOrder, canRepayOrder, getRepaymentProvider } from "@/lib/order-payment"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowLeft, Clock, CreditCard, FileText, Package, Spinner, WarningCircle } from "@phosphor-icons/react";

interface OrderDetailItem {
  id: string
  product_title?: string | null
  product_type?: string | null
  quantity?: number | null
  subtotal?: string | number | null
}

interface OrderDetail {
  id: string
  order_no?: string | null
  total_amount?: string | number | null
  discount_amount?: string | number | null
  status: string
  payment_status?: string | null
  financial_status?: string | null
  payment_method?: string | null
  created_at: string
  has_refund?: boolean | null
  order_items?: OrderDetailItem[]
}

const statusLabels: Record<string, string> = {
  pending: "待支付", paid: "已支付", processing: "处理中",
  completed: "已完成", cancelled: "已取消", refunded: "已退款",
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700", paid: "bg-blue-100 text-blue-700",
  processing: "bg-purple-100 text-purple-700", completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700", refunded: "bg-gray-100 text-gray-700",
}

function toAmount(value?: string | number | null): number {
  const amount = typeof value === "number" ? value : Number.parseFloat(value || "0")
  return Number.isFinite(amount) ? amount : 0
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { locale } = useI18n()
  const { getToken } = useAuth()
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [refundReason, setRefundReason] = useState("")
  const [refunding, setRefunding] = useState(false)
  const [refundOpen, setRefundOpen] = useState(false)
  const [paying, setPaying] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  const loadOrder = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/orders/${id}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setOrder(json.data || json.order)
    } catch {
      toast.error("加载订单失败")
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { if (id) void loadOrder() }, [id, loadOrder])

  const handleRefund = async () => {
    if (!refundReason.trim()) {
      toast.error("请填写退款原因")
      return
    }
    setRefunding(true)
    try {
      const res = await fetch("/api/refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
        body: JSON.stringify({ order_id: id, reason: refundReason, amount: order?.total_amount }),
      })
      if (!res.ok) throw new Error()
      toast.success("退款申请已提交")
      setRefundOpen(false)
      loadOrder()
    } catch {
      toast.error("提交失败")
    } finally {
      setRefunding(false)
    }
  }

  const handleRepay = async () => {
    if (!order) return
    const provider = getRepaymentProvider(order)
    if (!provider) {
      toast.error(locale === "zh" ? "该订单不能在线重新支付" : "This order cannot be paid online")
      return
    }

    setPaying(true)
    try {
      const res = await apiFetch("/api/payment/create", {
        method: "POST",
        body: JSON.stringify({ provider, orderId: order.id }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        throw new Error(json.error || json.data?.message || "Payment creation failed")
      }
      if (json.data?.approvalUrl) {
        window.location.href = json.data.approvalUrl
        return
      }
      if (json.data?.message?.includes("Mock")) {
        router.push(`/checkout/success?mock=1&order_id=${order.id}`)
        return
      }
      throw new Error(json.data?.message || "Payment creation failed")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Payment creation failed")
    } finally {
      setPaying(false)
    }
  }

  const handleCancel = async () => {
    if (!order) return
    const confirmed = window.confirm(
      locale === "zh"
        ? `确定取消订单 ${order.order_no || order.id} 吗？`
        : `Cancel order ${order.order_no || order.id}?`,
    )
    if (!confirmed) return

    setCancelling(true)
    try {
      const res = await apiFetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "cancelled" }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        throw new Error(json.error || "Order cancellation failed")
      }
      toast.success(locale === "zh" ? "订单已取消" : "Order cancelled")
      await loadOrder()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Order cancellation failed")
    } finally {
      setCancelling(false)
    }
  }

  if (loading) return (
    <div className="mx-auto max-w-3xl px-4 py-20 text-center">
      <Spinner className="mx-auto h-8 w-8 text-muted-foreground" />
    </div>
  )

  if (!order) return (
    <div className="mx-auto max-w-3xl px-4 py-20 text-center">
      <p className="text-muted-foreground">订单不存在</p>
      <Button variant="link" onClick={() => router.push("/orders")}>返回订单列表</Button>
    </div>
  )

  const totalAmount = toAmount(order.total_amount)
  const discountAmount = toAmount(order.discount_amount)

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/orders"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">订单详情</h1>
          <p className="text-sm text-muted-foreground font-mono">{order.order_no}</p>
        </div>
        <Badge className={statusColors[order.status]} variant="outline">{statusLabels[order.status] || order.status}</Badge>
      </div>

      {/* Status timeline */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>{new Date(order.created_at).toLocaleString("zh-CN")}</span>
            </div>
            <Separator orientation="vertical" className="h-4" />
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <span>{order.payment_method || "未支付"}</span>
            </div>
            {order.has_refund && (
              <>
                <Separator orientation="vertical" className="h-4" />
                <span className="text-red-500 flex items-center gap-1"><WarningCircle className="h-4 w-4" /> 有退款</span>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Order items */}
      <Card className="mb-6">
        <CardContent className="p-0">
          <div className="px-6 py-4 font-semibold border-b">商品明细</div>
          {(order.order_items || []).map((item) => (
            <div key={item.id} className="flex items-center justify-between px-6 py-4 border-b last:border-0">
              <div className="flex items-center gap-3">
                <Package className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">{item.product_title || "-"}</p>
                  <p className="text-sm text-muted-foreground">{item.product_type} x{item.quantity}</p>
                </div>
              </div>
              <span className="font-medium">${toAmount(item.subtotal).toFixed(2)}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Total */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span>小计</span><span>${totalAmount.toFixed(2)}</span></div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-green-600"><span>折扣</span><span>-${discountAmount.toFixed(2)}</span></div>
            )}
            <Separator />
            <div className="flex justify-between text-lg font-bold"><span>合计</span><span>${totalAmount.toFixed(2)}</span></div>
          </div>
        </CardContent>
      </Card>

      {/* Invoice */}
      {(order.status === "paid" || order.status === "completed") && (
        <a href={`/api/orders/${id}/invoice`} target="_blank" className="block mb-4">
          <Button variant="outline" className="w-full">
            <FileText className="h-4 w-4 mr-2" /> 下载发票
          </Button>
        </a>
      )}

      {/* Actions */}
      {canRepayOrder(order) && (
        <Button onClick={handleRepay} disabled={paying} className="mb-4 w-full">
          {paying ? <Spinner className="h-4 w-4 mr-2 animate-spin" /> : <CreditCard className="h-4 w-4 mr-2" />}
          {locale === "zh" ? "继续支付" : "Pay now"}
        </Button>
      )}

      {canCancelPendingOrder(order) && (
        <Button
          variant="outline"
          onClick={handleCancel}
          disabled={cancelling || paying}
          className="mb-4 w-full text-red-600 hover:text-red-700"
        >
          {cancelling ? <Spinner className="h-4 w-4 mr-2 animate-spin" /> : <WarningCircle className="h-4 w-4 mr-2" />}
          {locale === "zh" ? "取消订单" : "Cancel order"}
        </Button>
      )}

      {(order.status === "paid" || order.status === "processing") && !order.has_refund && (
        <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="text-red-500 border-red-200 w-full">
              <WarningCircle className="h-4 w-4 mr-2" /> 申请退款
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>申请退款</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>退款原因</Label>
                <Textarea value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="请说明退款原因..." rows={4} />
              </div>
              <p className="text-sm text-muted-foreground">退款金额: ${totalAmount.toFixed(2)}</p>
              <Button onClick={handleRefund} disabled={refunding} className="w-full">
                {refunding ? "提交中..." : "提交退款申请"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
