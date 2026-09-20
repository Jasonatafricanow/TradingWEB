"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/contexts/i18n-context";
import { useAuth } from "@/contexts/auth-context";
import { apiFetch } from "@/lib/client-api";
import { canCancelPendingOrder, canRepayOrder, getRepaymentProvider } from "@/lib/order-payment";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { CheckCircle, Clock, CreditCard, Eye, Package, Spinner, XCircle } from "@phosphor-icons/react";
import { toast } from "sonner";
import { BreadcrumbPublic } from "@/components/breadcrumb-public";
import {
  formatDate,
  formatOrderCancelConfirmation,
  formatOrderMoney,
  getOrderStatusLabel,
  translate,
} from "@/i18n";

interface OrderItem {
  id: string;
  product_title: string;
  product_type: string;
  quantity: number;
  unit_price: string;
  subtotal: string;
}

interface Order {
  id: string;
  order_no?: string | null;
  user_id: string;
  total_amount: number | string;
  currency?: string | null;
  status: string;
  payment_method: string | null;
  payment_status: string | null;
  financial_status?: string | null;
  created_at: string;
  updated_at: string;
  order_items: OrderItem[];
}

const statusConfig: Record<string, { color: string; icon: React.ReactNode }> = {
  pending: {
    color: "bg-yellow-100 text-yellow-700",
    icon: <Clock className="h-4 w-4" />,
  },
  paid: {
    color: "bg-blue-100 text-blue-700",
    icon: <CheckCircle className="h-4 w-4" />,
  },
  processing: {
    color: "bg-blue-100 text-blue-700",
    icon: <Clock className="h-4 w-4" />,
  },
  shipped: {
    color: "bg-indigo-100 text-indigo-700",
    icon: <Package className="h-4 w-4" />,
  },
  delivering: {
    color: "bg-purple-100 text-purple-700",
    icon: <Package className="h-4 w-4" />,
  },
  delivered: {
    color: "bg-green-100 text-green-700",
    icon: <CheckCircle className="h-4 w-4" />,
  },
  delivery_failed: {
    color: "bg-red-100 text-red-700",
    icon: <XCircle className="h-4 w-4" />,
  },
  completed: {
    color: "bg-green-100 text-green-700",
    icon: <CheckCircle className="h-4 w-4" />,
  },
  cancelled: {
    color: "bg-red-100 text-red-700",
    icon: <XCircle className="h-4 w-4" />,
  },
  refunded: {
    color: "bg-gray-100 text-gray-700",
    icon: <XCircle className="h-4 w-4" />,
  },
};

export default function OrdersPage() {
  const { locale, t } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [payingOrderId, setPayingOrderId] = useState<string | null>(null);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    fetchOrders();
  }, [user]);

  async function fetchOrders() {
    try {
      const res = await apiFetch("/api/orders");
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      setOrders(result.data || []);
    } catch (err) {
      console.error("Failed to fetch orders:", err);
    } finally {
      setLoading(false);
    }
  }

  function orderDisplayNo(order: Order): string {
    return order.order_no || order.id.slice(0, 8).toUpperCase();
  }

  async function handleRepay(order: Order) {
    const provider = getRepaymentProvider(order);
    if (!provider) {
      toast.error(t("orders.cannot_repay"));
      return;
    }

    setPayingOrderId(order.id);
    try {
      const res = await apiFetch("/api/payment/create", {
        method: "POST",
        body: JSON.stringify({ provider, orderId: order.id }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error("PAYMENT_CREATE_FAILED");
      }
      if (json.data?.approvalUrl) {
        window.location.href = json.data.approvalUrl;
        return;
      }
      if (json.data?.message?.includes("Mock")) {
        router.push(`/checkout/success?mock=1&order_id=${order.id}`);
        return;
      }
      throw new Error("PAYMENT_CREATE_FAILED");
    } catch {
      toast.error(t("orders.payment_create_failed"));
    } finally {
      setPayingOrderId(null);
    }
  }

  async function handleCancel(order: Order) {
    const confirmed = window.confirm(
      formatOrderCancelConfirmation(locale, orderDisplayNo(order)),
    );
    if (!confirmed) return;

    setCancellingOrderId(order.id);
    try {
      const res = await apiFetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "cancelled" }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error("ORDER_CANCEL_FAILED");
      }
      toast.success(t("orders.cancelled"));
      await fetchOrders();
    } catch {
      toast.error(t("orders.cancel_failed"));
    } finally {
      setCancellingOrderId(null);
    }
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-20 text-center sm:px-6 lg:px-8">
        <Package className="mx-auto h-12 w-12 text-gray-300" />
        <h1 className="mt-4 text-2xl font-bold text-gray-900">
          {t("orders.sign_in_required")}
        </h1>
        <Link href="/auth/login">
          <Button className="mt-4">{t("orders.sign_in")}</Button>
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Skeleton className="h-8 w-48" />
        <div className="mt-6 space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <BreadcrumbPublic items={[{ label: t("orders.title") }]} />
      <h1 className="text-3xl font-bold text-gray-900">
        {t("orders.title")}
      </h1>
      <p className="mt-2 text-gray-500">
        {t("orders.description")}
      </p>

      {orders.length === 0 ? (
        <div className="mt-12 text-center">
          <Package className="mx-auto h-16 w-16 text-gray-200" />
          <p className="mt-4 text-gray-500">
            {t("orders.empty")}
          </p>
          <Link href="/products">
            <Button className="mt-4">
              {t("orders.shop_now")}
            </Button>
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {orders.map((order) => (
            <Card key={order.id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-base">
                      {t("orders.order_label")}: {orderDisplayNo(order)}
                    </CardTitle>
                    <Badge className={statusConfig[order.status]?.color || "bg-gray-100 text-gray-600"}>
                      {statusConfig[order.status]?.icon}
                      <span className="ml-1">{getOrderStatusLabel(locale, order.status)}</span>
                    </Badge>
                  </div>
                  <div className="flex flex-col gap-3 lg:items-end">
                    <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                      <span>
                        {t("orders.payment_label")}: {(order.payment_method || "paypal").toUpperCase()}
                      </span>
                      <span>
                        {formatDate(locale, new Date(order.created_at), {
                          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                        })}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/orders/${order.id}`}>
                          <Eye className="h-4 w-4" />
                          {t("orders.view_details")}
                        </Link>
                      </Button>
                      {canRepayOrder(order) && (
                        <Button
                          size="sm"
                          onClick={() => handleRepay(order)}
                          disabled={payingOrderId === order.id}
                        >
                          {payingOrderId === order.id ? (
                            <Spinner className="h-4 w-4 animate-spin" />
                          ) : (
                            <CreditCard className="h-4 w-4" />
                          )}
                          {t("orders.pay_now")}
                        </Button>
                      )}
                      {canCancelPendingOrder(order) && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => handleCancel(order)}
                          disabled={cancellingOrderId === order.id || payingOrderId === order.id}
                        >
                          {cancellingOrderId === order.id ? (
                            <Spinner className="h-4 w-4 animate-spin" />
                          ) : (
                            <XCircle className="h-4 w-4" />
                          )}
                          {t("orders.cancel")}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="text-2xl font-bold text-gray-900">
                      {formatOrderMoney(
                        locale,
                        Number(order.total_amount),
                        order.currency,
                      )}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                  >
                    <Eye className="mr-1 h-4 w-4" />
                    {expandedOrder === order.id
                      ? t("orders.hide")
                      : t("orders.details")}
                  </Button>
                </div>

                {expandedOrder === order.id && order.order_items && (
                  <>
                    <Separator className="my-4" />
                    <div className="space-y-3">
                      {order.order_items.map((item) => (
                        <div key={item.id} className="flex items-center justify-between text-sm">
                          <div>
                            <p className="text-gray-900">{item.product_title}</p>
                            <Badge variant="secondary" className="mt-1 text-xs">
                              {translate(locale, "orders.item_quantity", {
                                type: item.product_type,
                                count: item.quantity,
                              })}
                            </Badge>
                          </div>
                          <span className="font-medium">
                            {formatOrderMoney(
                              locale,
                              Number(item.subtotal || 0),
                              order.currency,
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
