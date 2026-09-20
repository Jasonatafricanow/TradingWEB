"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useI18n } from "@/contexts/i18n-context";
import { formatMoney } from "@/lib/format";
import { apiFetch } from "@/lib/client-api";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton"
import Link from "next/link";
import { toast } from "sonner";
import { PageHeader } from "../../_components";
import { ArrowLeft, ArrowsClockwise, Clock, CreditCard, FileText, FloppyDisk, Package, ShoppingBag, Truck, User } from "@phosphor-icons/react";

interface OrderItem {
  id: string;
  product_title: string;
  product_type: string;
  quantity: number;
  unit_price: string;
  subtotal: string;
  sku?: string | null;
  delivery_method?: string | null;
}

interface TimelineEntry {
  id: string;
  order_id: string;
  action: string;
  description: string;
  old_value: string | null;
  new_value: string | null;
  operator_id: string | null;
  created_at: string;
}

interface RefundRecord {
  id: string;
  amount: string;
  reason: string | null;
  status: string;
  created_at: string;
  processed_at: string | null;
}

interface ShipmentRecord {
  id: string;
  tracking_number: string | null;
  carrier: string | null;
  status: string;
  shipped_at: string | null;
  created_at: string;
}

interface OrderDetail {
  id: string;
  order_no: string;
  source: string;
  delivery_zone_id: string | null;
  shipping_cost: string | null;
  delivery_date: string | null;
  delivery_time_slot: string | null;
  status: string;
  total_amount: string;
  currency: string;
  payment_method: string | null;
  payment_status: string | null;
  fulfillment_status: string | null;
  buyer_email: string | null;
  buyer_name: string | null;
  buyer_phone: string | null;
  notes: string | null;
  tracking_number: string | null;
  coupon_id: string | null;
  discount_amount: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string | null;
  items: OrderItem[];
  refunds?: RefundRecord[];
  shipments?: ShipmentRecord[];
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-300",
  processing: "bg-blue-100 text-blue-800 border-blue-300",
  completed: "bg-green-100 text-green-800 border-green-300",
  cancelled: "bg-red-100 text-red-800 border-red-300",
  refunded: "bg-purple-100 text-purple-800 border-purple-300",
  paid: "bg-green-100 text-green-800 border-green-300",
  unpaid: "bg-yellow-100 text-yellow-800 border-yellow-300",
  delivering: "bg-orange-100 text-orange-800 border-orange-300",
  delivered: "bg-green-100 text-green-800 border-green-300",
  delivery_failed: "bg-red-100 text-red-800 border-red-300",
};

const actionLabels: Record<string, string> = {
  created: "Order Created",
  status_change: "Status Changed",
  payment: "Payment Update",
  note: "内部备注",
  shipping: "Shipping Update",
  refund: "Refund Processed",
  paid: "支付确认",
  cancelled: "订单取消",
  fulfilled: "发货/履约",
  refund_created: "发起退款",
  tracking_updated: "运单更新",
  stock_deducted: "库存扣减",
  stock_restored: "库存回补",
  pos_sale: "POS 销售",
};

const refundStatusLabels: Record<string, string> = {
  pending: "待审批",
  approved: "已批准",
  rejected: "已拒绝",
  completed: "已完成",
};

export default function AdminOrderDetailPage() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Editable fields
  const [status, setStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [fulfillmentStatus, setFulfillmentStatus] = useState("");
  const [orderPaymentMethod, setOrderPaymentMethod] = useState("");
  const [notes, setNotes] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [newTimelineNote, setNewTimelineNote] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");

  // P1-03:所有状态变更走动作 API,不再让前端随意 PATCH 字段
  const runAction = async (action: string, body?: Record<string, unknown>, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return false;
    setActionBusy(action);
    try {
      const res = await apiFetch(`/api/admin/orders/${id}/${action}`, {
        method: "POST",
        body: JSON.stringify(body || {}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) throw new Error(json.error || "操作失败");
      await Promise.all([loadOrder(), loadTimeline()]);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
      return false;
    } finally {
      setActionBusy(null);
    }
  };

  // Payment methods for dropdown
  const [pmOptions, setPmOptions] = useState<Array<{ code: string; name: string }>>([]);
  useEffect(() => {
    apiFetch("/api/admin/payment-methods")
      .then((r: Response) => r.json())
      .then((j: { data?: Array<{ code: string; name: string }> }) => {
        const builtin = [
          { code: "paypal", name: "PayPal" },
          { code: "stripe", name: "Stripe" },
        ];
        setPmOptions([...builtin, ...(j.data || [])]);
      })
      .catch(() => {});
  }, []);

  const loadOrder = async () => {
    if (!id) { setLoading(false); return; }
    try {
      const { apiFetch } = await import("@/lib/client-api");
      const res = await apiFetch("/api/admin/orders/" + id);
      if (res.ok) {
        const json = await res.json();
        const data = json.data;
        setOrder(data);
        setStatus(data.status || "");
        setPaymentStatus(data.payment_status || "");
        setFulfillmentStatus(data.fulfillment_status || "");
        setOrderPaymentMethod(data.payment_method || "");
        setNotes(data.notes || "");
        setTrackingNumber(data.tracking_number || "");
      } else {
        toast.error("Failed to load order");
      }
    } catch {
      toast.error("Failed to load order");
    } finally {
      setLoading(false);
    }
  };

  const loadTimeline = async () => {
    if (!id) return;
    try {
      const { apiFetch } = await import("@/lib/client-api");
      const res = await apiFetch("/api/admin/orders/" + id + "/timeline");
      if (res.ok) {
        const json = await res.json();
        setTimeline(json.data || []);
      }
    } catch {
      // silently fail
    }
  };

  useEffect(() => {
    loadOrder();
    loadTimeline();
  }, [id]);

  const saveOrder = async () => {
    setSaving(true);
    try {
      const { apiFetch } = await import("@/lib/client-api");
      const res = await apiFetch("/api/admin/orders/" + id, {
        method: "PUT",
        body: JSON.stringify({
          status,
          paymentStatus,
          fulfillmentStatus,
          payment_method: orderPaymentMethod || null,
          notes,
          tracking_number: trackingNumber,
        }),
      });
      if (res.ok) {
        toast.success("Order updated");
        loadOrder();
        loadTimeline();
      } else {
        toast.error("Failed to update order");
      }
    } catch {
      toast.error("Failed to update order");
    } finally {
      setSaving(false);
    }
  };

  const addTimelineNote = async () => {
    if (!newTimelineNote.trim()) return;
    const ok = await runAction("add-note", { note: newTimelineNote.trim() });
    if (ok) {
      toast.success("备注已添加");
      setNewTimelineNote("");
    }
  };

  if (loading) {
    return (
      <div className="p-6 lg:p-8 space-y-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9" />
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-6 w-24" />
            </div>
            <Skeleton className="h-9 w-24" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Skeleton className="h-48 w-full rounded-lg" />
              <Skeleton className="h-40 w-full rounded-lg" />
              <Skeleton className="h-64 w-full rounded-lg" />
            </div>
            <div className="space-y-6">
              <Skeleton className="h-72 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-40 w-full rounded-lg" />
              <Skeleton className="h-64 w-full rounded-lg" />
            </div>
          </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-6 lg:p-8">
          <p className="text-muted-foreground">Order not found</p>
          <Button variant="outline" className="mt-4" onClick={() => router.push("/admin/orders")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Orders
          </Button>
      </div>
    );
  }

  const fmtCurrency = (amount: string) => {
    const prefix = order.currency === "USD" ? "$" : "MZN ";
    return prefix + formatMoney(amount);
  };

  const fmtDate = (d: string) => {
    return new Date(d).toLocaleString("zh-CN", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  };

  return (
    <div className="p-6 lg:p-8 pb-24">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => router.push("/admin/orders")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShoppingBag className="h-6 w-6" /> Order {order.order_no}
            </h1>
            <Badge variant="outline" className={statusColors[order.status] || ""}>
              {order.status}
            </Badge>
          </div>
          <Button variant="outline" size="sm" onClick={() => { loadOrder(); loadTimeline(); }}>
            <ArrowsClockwise className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Info Cards */}
          <div className="lg:col-span-2 space-y-6">

            {/* Order Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5" /> Order Info
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Order No:</span>
                    <p className="font-mono">{order.order_no}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total:</span>
                    <p className="text-lg font-bold">{fmtCurrency(order.total_amount)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Created:</span>
                    <p>{fmtDate(order.created_at)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Source:</span>
                    <p>{order.source || "web"}</p>
                  </div>
                  {order.delivery_zone_id && (
                    <>
                      <div>
                        <span className="text-muted-foreground">配送区域:</span>
                        <p>{order.delivery_zone_id}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">配送日期:</span>
                        <p>{order.delivery_date || "-"}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">配送时段:</span>
                        <p>{order.delivery_time_slot || "-"}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">运费:</span>
                        <p>{order.shipping_cost ? `$${order.shipping_cost}` : "-"}</p>
                      </div>
                    </>
                  )}
                  <div>
                    <span className="text-muted-foreground">Updated:</span>
                    <p>{order.updated_at ? fmtDate(order.updated_at) : "-"}</p>
                  </div>
                  {order.discount_amount && order.discount_amount !== "0" && (
                    <div>
                      <span className="text-muted-foreground">Discount:</span>
                      <p className="text-red-500">-{fmtCurrency(order.discount_amount)}</p>
                    </div>
                  )}
                  {order.coupon_id && (
                    <div>
                      <span className="text-muted-foreground">Coupon:</span>
                      <p>{order.coupon_id}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Customer */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="h-5 w-5" /> Customer
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  {order.buyer_name && <p><span className="text-muted-foreground">Name:</span> {order.buyer_name}</p>}
                  {order.buyer_email && <p><span className="text-muted-foreground">Email:</span> {order.buyer_email}</p>}
                  {order.buyer_phone && <p><span className="text-muted-foreground">Phone:</span> {order.buyer_phone}</p>}
                  {order.user_id && (
                    <Link href={"/admin/customers/" + order.user_id} className="text-blue-600 hover:underline text-sm block mt-2">
                      View Customer Profile &rarr;
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Order Items */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Package className="h-5 w-5" /> Items ({order.items?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-2 px-1">Product</th>
                        <th className="text-center py-2 px-1">Type</th>
                        <th className="text-center py-2 px-1">Qty</th>
                        <th className="text-center py-2 px-1">Delivery</th>
                        <th className="text-right py-2 px-1">Price</th>
                        <th className="text-right py-2 px-1">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(order.items || []).map((item) => (
                        <tr key={item.id} className="border-b last:border-0">
                          <td className="py-2 px-1">{item.product_title}</td>
                          <td className="text-center py-2 px-1">{item.product_type}</td>
                          <td className="text-center py-2 px-1">{item.quantity}</td>
                          <td className="text-center py-2 px-1 text-xs text-muted-foreground">
                            {item.delivery_method || "—"}
                          </td>
                          <td className="text-right py-2 px-1">{fmtCurrency(item.unit_price)}</td>
                          <td className="text-right py-2 px-1">{fmtCurrency(item.subtotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Refund Records */}
            {(order.refunds || []).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CreditCard className="h-5 w-5" /> 退款记录 ({(order.refunds || []).length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {(order.refunds || []).map((r) => (
                      <div key={r.id} className="flex items-center justify-between text-sm border-b last:border-0 pb-2">
                        <div>
                          <p className="font-medium">{fmtCurrency(r.amount)}</p>
                          {r.reason && <p className="text-xs text-muted-foreground">{r.reason}</p>}
                        </div>
                        <div className="text-right">
                          <Badge variant="outline" className={statusColors[r.status] || ""}>
                            {refundStatusLabels[r.status] || r.status}
                          </Badge>
                          <p className="text-xs text-muted-foreground mt-1">{fmtDate(r.created_at)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

          </div>

          {/* Right Column - Actions & Timeline */}
          <div className="space-y-6">

            {/* Status Controls */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <CreditCard className="h-5 w-5" /> Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Order Status</label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="processing">Processing</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                      <SelectItem value="refunded">Refunded</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Payment Status</label>
                  <Select value={paymentStatus || "__none__"} onValueChange={(v) => setPaymentStatus(v === "__none__" ? "" : v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="unpaid">Unpaid</SelectItem>
                      <SelectItem value="refunded">Refunded</SelectItem>
                      <SelectItem value="partially_refunded">Partially Refunded</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Fulfillment</label>
                  <Select value={fulfillmentStatus || "__none__"} onValueChange={(v) => setFulfillmentStatus(v === "__none__" ? "" : v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      <SelectItem value="fulfilled">Fulfilled</SelectItem>
                      <SelectItem value="unfulfilled">Unfulfilled</SelectItem>
                      <SelectItem value="partial">Partially Fulfilled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Payment Method</label>
                  <Select value={orderPaymentMethod || "__none__"} onValueChange={(v) => setOrderPaymentMethod(v === "__none__" ? "" : v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {pmOptions.map((pm) => (
                        <SelectItem key={pm.code} value={pm.code}>{pm.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Order Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">订单动作</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {order.payment_status !== "paid" && order.status !== "cancelled" && (
                  <Button
                    variant="outline"
                    className="w-full border-green-300 text-green-700 hover:bg-green-50"
                    disabled={actionBusy !== null}
                    onClick={async () => {
                      const ok = await runAction(
                        "mark-paid",
                        {},
                        `确认标记 "${order.order_no}" ($${formatMoney(order.total_amount)}) 为已收款？\n收款方式: ${orderPaymentMethod || order.payment_method || "—"}\n(将自动扣减库存并写入审计日志)`
                      );
                      if (ok) toast.success("已确认收款");
                    }}
                  >
                    {actionBusy === "mark-paid" ? "处理中..." : "✓ 确认收款"}
                  </Button>
                )}
                {order.fulfillment_status !== "fulfilled" && order.status !== "cancelled" && (
                  <Button
                    variant="outline"
                    className="w-full border-blue-300 text-blue-700 hover:bg-blue-50"
                    disabled={actionBusy !== null}
                    onClick={async () => {
                      const ok = await runAction(
                        "fulfill",
                        trackingNumber.trim() ? { tracking_number: trackingNumber.trim() } : {},
                        trackingNumber.trim()
                          ? `确认发货？运单号: ${trackingNumber.trim()}`
                          : "确认标记为已履约？(未填写运单号)"
                      );
                      if (ok) toast.success("已发货/履约");
                    }}
                  >
                    {actionBusy === "fulfill" ? "处理中..." : "🚚 发货 / 标记履约"}
                  </Button>
                )}

                {/* 配送动作（仅当有 delivery_zone_id 时显示） */}
                {order.delivery_zone_id && (
                  <>
                    {order.status !== "delivering" && order.status !== "delivered" && order.status !== "cancelled" && order.status !== "delivery_failed" && (
                      <Button variant="outline" className="w-full border-orange-300 text-orange-700 hover:bg-orange-50" disabled={actionBusy !== null} onClick={async () => {
                        const ok = await runAction("mark-delivering", {});
                        if (ok) toast.success("已标记为派送中");
                      }}>
                        {actionBusy === "mark-delivering" ? "处理中..." : "📦 标记派送中"}
                      </Button>
                    )}
                    {order.status === "delivering" && (
                      <>
                        <Button variant="outline" className="w-full border-green-300 text-green-700 hover:bg-green-50" disabled={actionBusy !== null} onClick={async () => {
                          const ok = await runAction("mark-delivered", {});
                          if (ok) toast.success("已标记为已送达");
                        }}>
                          {actionBusy === "mark-delivered" ? "处理中..." : "✅ 标记已送达"}
                        </Button>
                        <Button variant="outline" className="w-full border-red-300 text-red-700 hover:bg-red-50" disabled={actionBusy !== null} onClick={async () => {
                          const reason = prompt("配送失败原因（选填）") || "";
                          const ok = await runAction("mark-delivery-failed", { reason });
                          if (ok) toast.success("已标记配送失败");
                        }}>
                          {actionBusy === "mark-delivery-failed" ? "处理中..." : "✕ 配送失败"}
                        </Button>
                      </>
                    )}
                  </>
                )}

                {order.status !== "cancelled" && order.fulfillment_status !== "fulfilled" && (
                  <Button
                    variant="outline"
                    className="w-full border-red-300 text-red-700 hover:bg-red-50"
                    disabled={actionBusy !== null}
                    onClick={async () => {
                      const ok = await runAction(
                        "cancel",
                        {},
                        `确认取消订单 "${order.order_no}"？\n(已扣减的库存会自动回补)`
                      );
                      if (ok) toast.success("订单已取消");
                    }}
                  >
                    {actionBusy === "cancel" ? "处理中..." : "✕ 取消订单"}
                  </Button>
                )}

                {/* 发起退款 */}
                {order.payment_status === "paid" && (
                  <div className="pt-2 border-t space-y-2">
                    <p className="text-xs text-muted-foreground">发起退款</p>
                    <Input
                      type="number"
                      placeholder={`金额(≤ ${order.total_amount})`}
                      value={refundAmount}
                      onChange={(e) => setRefundAmount(e.target.value)}
                    />
                    <Input
                      placeholder="退款原因"
                      value={refundReason}
                      onChange={(e) => setRefundReason(e.target.value)}
                    />
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled={actionBusy !== null || !refundAmount || !refundReason.trim()}
                      onClick={async () => {
                        const ok = await runAction(
                          "create-refund",
                          { amount: refundAmount, reason: refundReason.trim() },
                          `确认发起退款 ${refundAmount} ${order.currency}？`
                        );
                        if (ok) {
                          toast.success("退款申请已创建,请到退款模块审批");
                          setRefundAmount("");
                          setRefundReason("");
                        }
                      }}
                    >
                      {actionBusy === "create-refund" ? "处理中..." : "发起退款"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tracking */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Truck className="h-5 w-5" /> Shipping
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Input
                  placeholder="Tracking number"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={actionBusy !== null || !trackingNumber.trim()}
                  onClick={async () => {
                    const ok = await runAction("update-tracking", { tracking_number: trackingNumber.trim() });
                    if (ok) toast.success("运单号已更新");
                  }}
                >
                  {actionBusy === "update-tracking" ? "处理中..." : "更新运单号"}
                </Button>
                {(order.shipments || []).length > 0 && (
                  <div className="pt-2 space-y-1">
                    {(order.shipments || []).map((s) => (
                      <div key={s.id} className="text-xs text-muted-foreground flex justify-between gap-2">
                        <span className="font-mono">{s.tracking_number || "—"}</span>
                        <span>{s.carrier || ""} {s.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Notes */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5" /> Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="Internal notes..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </CardContent>
            </Card>

            {/* Timeline */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="h-5 w-5" /> Timeline
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Textarea
                    placeholder="Add a note..."
                    value={newTimelineNote}
                    onChange={(e) => setNewTimelineNote(e.target.value)}
                    rows={2}
                  />
                  <Button variant="outline" size="sm" className="w-full" onClick={addTimelineNote}>
                    Add Note
                  </Button>
                </div>
                <Separator />
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {timeline.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No timeline entries yet</p>
                  )}
                  {timeline.map((entry, i) => (
                    <div key={entry.id || i} className="relative pl-4 border-l-2 border-gray-200 pb-3">
                      <div className="absolute -left-[5px] top-0 w-2 h-2 rounded-full bg-gray-400" />
                      <p className="text-xs text-muted-foreground">{fmtDate(entry.created_at)}</p>
                      <p className="text-sm font-medium">
                        {actionLabels[entry.action] || entry.action}
                      </p>
                      {entry.description && (
                        <p className="text-sm text-muted-foreground">{entry.description}</p>
                      )}
                      {entry.old_value && entry.new_value && (
                        <p className="text-xs text-muted-foreground">
                          {entry.old_value} &rarr; {entry.new_value}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

          </div>
        </div>

        {/* Sticky bottom save bar — 替代之前分散在 3 个 Card 里的 Save 按钮 */}
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/75">
          <div className="mx-auto flex max-w-7xl items-center justify-end gap-3 px-6 py-3">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              修改状态 / 物流 / 备注后请点击保存
            </span>
            <Button onClick={saveOrder} disabled={saving} className="gap-2">
              <FloppyDisk className="h-4 w-4" />
              {saving ? "Saving..." : "Save All Changes"}
            </Button>
          </div>
        </div>
    </div>
  );
}
