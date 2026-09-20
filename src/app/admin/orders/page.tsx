"use client";

import { useEffect, useState, useCallback } from "react";
import { useI18n } from "@/contexts/i18n-context";
import { PageHeader, DataTable, FilterBar, type ColumnDef } from "../_components";
import { apiFetch } from "@/lib/client-api";
import { toast } from "sonner";

// ── Types ──
interface OrderItem {
  id: string; product_title: string; product_title_en: string;
  quantity: number; unit_price: string; subtotal: string;
  duration: string | null; delivery_method: string | null;
}
interface Order {
  id: string; order_no: string; buyer_email: string | null;
  total_amount: string; status: string; created_at: string;
  buyer_name: string | null; buyer_phone: string | null;
  buyer_address: string | null; payment_method: string | null;
  paid_at: string | null; completed_at: string | null;
  notes: string | null; items: OrderItem[];
}

const STATUS_MAP: Record<string, string> = {
  pending: "Pending", paid: "Paid", processing: "Processing",
  completed: "Completed", cancelled: "Cancelled", refunded: "Refunded",
  delivering: "Delivering", delivered: "Delivered", delivery_failed: "Delivery Failed",
};
const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700", paid: "bg-blue-100 text-blue-700",
  processing: "bg-indigo-100 text-indigo-700", completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700", refunded: "bg-gray-100 text-gray-700",
  delivering: "bg-orange-100 text-orange-700", delivered: "bg-green-100 text-green-700",
  delivery_failed: "bg-red-100 text-red-700",
};

// P1-01 Saved Views:与后端 ORDER_VIEWS 的 key 一一对应
const ORDER_VIEW_TABS: { key: string; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "unpaid", label: "待付款" },
  { key: "paid_unfulfilled", label: "已付款未履约" },
  { key: "to_ship", label: "待发货" },
  { key: "today_delivery", label: "今日配送" },
  { key: "delivering", label: "派送中" },
  { key: "delivered", label: "已送达" },
  { key: "delivery_failed", label: "配送失败" },
  { key: "processing", label: "处理中" },
  { key: "refunding", label: "退款中" },
  { key: "offline_pending", label: "线下待确认" },
  { key: "pos", label: "POS 订单" },
];

const orderColumns: ColumnDef<Order>[] = [
  { header: "Order #", accessor: (r) => <span className="font-mono text-xs font-medium">{r.order_no}</span> },
  { header: "Buyer", accessor: (r) => <span className="text-xs">{r.buyer_email || r.buyer_name || "—"}</span> },
  { header: "Amount", accessor: (r) => <span className="font-mono text-sm font-medium">${r.total_amount}</span> },
  {
    header: "Status", accessor: (r) => (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] || "bg-gray-100 text-gray-700"}`}>
        {STATUS_MAP[r.status] || r.status}
      </span>
    ),
  },
  {
    header: "Date", accessor: (r) => (
      <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString()}</span>
    ),
  },
];

export default function AdminOrdersPage() {
  const { t } = useI18n();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [view, setView] = useState<string>(() => {
    if (typeof window === "undefined") return "all";
    const v = new URLSearchParams(window.location.search).get("view");
    return v && ORDER_VIEW_TABS.some((tab) => tab.key === v) ? v : "all";
  });
  const [viewCounts, setViewCounts] = useState<Record<string, number>>({});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  const changeView = (v: string) => {
    setView(v);
    setPage(1);
    const url = new URL(window.location.href);
    if (v === "all") url.searchParams.delete("view");
    else url.searchParams.set("view", v);
    window.history.replaceState(null, "", url.toString());
  };

  const fetchViewCounts = useCallback(async () => {
    try {
      const res = await apiFetch("/api/admin/orders?view_counts=1");
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.data) setViewCounts(json.data);
    } catch { /* 角标计数失败不影响列表 */ }
  }, []);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (view !== "all") params.set("view", view);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      const res = await apiFetch(`/api/admin/orders?${params}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        throw new Error(json.error || "Failed to load orders");
      }
      setOrders(json.data || []);
      setTotal(json.total || json.data?.length || 0);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load orders");
    } finally { setLoading(false); }
  }, [search, statusFilter, view, page]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);
  useEffect(() => { fetchViewCounts(); }, [fetchViewCounts]);

  return (
    <>
      <PageHeader title={t("admin.orders")} description="Track and manage customer orders" />

      {/* Saved Views */}
      <div className="mb-4 flex flex-wrap gap-1 border-b border-gray-200">
        {ORDER_VIEW_TABS.map((tab) => {
          const active = view === tab.key;
          const count = viewCounts[tab.key];
          return (
            <button
              key={tab.key}
              onClick={() => changeView(tab.key)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"
              }`}
            >
              {tab.label}
              {typeof count === "number" && (
                <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${active ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-500"}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <FilterBar
        searchValue={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        searchPlaceholder="Search orders..."
        filters={[
          {
            key: "status", label: "Status", value: statusFilter,
            options: [
              { label: "All Statuses", value: "all" },
              ...Object.entries(STATUS_MAP).map(([k, v]) => ({ label: v, value: k })),
            ],
            onChange: (v) => { setStatusFilter(v); setPage(1); },
          },
        ]}
      />

      <DataTable
        data={orders}
        columns={orderColumns}
        keyExtractor={(r) => r.id}
        loading={loading}
        pagination={{ page, pageSize, total, onPageChange: setPage }}
        onRowClick={(r) => window.location.href = `/admin/orders/${r.id}`}
      />
    </>
  );
}
