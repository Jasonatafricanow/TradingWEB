"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { PageHeader, StatCard, StatCardGrid, DataTable, type ColumnDef } from "./_components";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Package,
  ShoppingCart,
  CurrencyDollar,
  Plus,
  WarningCircle,
  Cube,
  Storefront,
  Truck,
  CloudArrowDown,
} from "@phosphor-icons/react";
import { useI18n } from "@/contexts/i18n-context";

interface DashboardStats {
  todayOrders: number;
  todayRevenue: number;
  monthOrders: number;
  monthRevenue: number;
  monthPending: number;
  yearRevenue: number;
  totalCustomers: number;
  pendingFulfillment: number;
  pendingRefunds: number;
  lowStockItems: number;
  failedImportJobs: number;
  runningImportSessions: number;
  todayPosRevenue: number;
  offlinePendingOrders: number;
  todayDelivery: number;
  deliveryFailed: number;
  needsPtProducts: number;
  // optional growth fields — calculated client-side if absent
  todayOrdersGrowth?: number;
  todayRevenueGrowth?: number;
  monthOrdersGrowth?: number;
  totalCustomersGrowth?: number;
  recentOrders: {
    id: string;
    order_no: string;
    status: string;
    total_amount: string;
    buyer_email: string | null;
    created_at: string;
  }[];
}

const statusMap: Record<string, string> = {
  pending: "Pending",
  paid: "Paid",
  processing: "Processing",
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

const statusColor: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  paid: "bg-blue-100 text-blue-700",
  processing: "bg-indigo-100 text-indigo-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
  refunded: "bg-gray-100 text-gray-700",
};

const orderColumns: ColumnDef<DashboardStats["recentOrders"][0]>[] = [
  { header: "Order", accessor: (r) => <span className="font-mono text-xs">{r.order_no}</span> },
  { header: "Buyer", accessor: (r) => <span className="text-xs">{r.buyer_email || "—"}</span> },
  { header: "Amount", accessor: (r) => <span className="font-medium">${r.total_amount}</span> },
  {
    header: "Status",
    accessor: (r) => (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[r.status] || "bg-gray-100 text-gray-700"}`}>
        {statusMap[r.status] || r.status}
      </span>
    ),
  },
  {
    header: "Date",
    accessor: (r) => <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString()}</span>,
  },
];

export default function AdminDashboardPage() {
  const { t } = useI18n();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const { apiFetch } = await import("@/lib/client-api");
        const res = await apiFetch("/api/admin/dashboard");
        if (res.ok) {
          const data = await res.json();
          setStats(data.data);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  // Compute trends from available data or hide
  const trend = (value: number | undefined | null, growth: number | undefined): string | null => {
    if (growth !== undefined && growth !== null) {
      return growth >= 0 ? `+${growth}%` : `${growth}%`;
    }
    return null;
  };

  const quickActions = [
    { label: "New Product", icon: Plus, href: "/admin/products", color: "bg-blue-600" },
    { label: "Process Refunds", icon: WarningCircle, href: "/admin/refunds", color: "bg-amber-500" },
    { label: "POS Register", icon: Storefront, href: "/admin/pos", color: "bg-emerald-600" },
    { label: "Migration Sessions", icon: CloudArrowDown, href: "/admin/imports", color: "bg-purple-500" },
  ];

  const operationCards = [
    {
      label: "Today Delivery",
      value: stats?.todayDelivery ?? 0,
      href: "/admin/orders?view=today_delivery",
      icon: Truck,
      tone: "bg-green-50 text-green-700",
    },
    {
      label: "Delivery Failed",
      value: stats?.deliveryFailed ?? 0,
      href: "/admin/orders?view=delivery_failed",
      icon: WarningCircle,
      tone: "bg-red-50 text-red-700",
    },
    {
      label: "Paid, Not Fulfilled",
      value: stats?.pendingFulfillment ?? 0,
      href: "/admin/orders?view=paid_unfulfilled",
      icon: Truck,
      tone: "bg-blue-50 text-blue-700",
    },
    {
      label: "Offline Payment Pending",
      value: stats?.offlinePendingOrders ?? 0,
      href: "/admin/orders?view=offline_pending",
      icon: ShoppingCart,
      tone: "bg-orange-50 text-orange-700",
    },
    {
      label: "Low Stock Items",
      value: stats?.lowStockItems ?? 0,
      href: "/admin/inventory",
      icon: Cube,
      tone: "bg-red-50 text-red-700",
    },
    {
      label: "Missing PT Content",
      value: stats?.needsPtProducts ?? 0,
      href: "/admin/products?view=needs_pt",
      icon: WarningCircle,
      tone: "bg-orange-50 text-orange-700",
    },
    {
      label: "Pending Refunds",
      value: stats?.pendingRefunds ?? 0,
      href: "/admin/refunds",
      icon: WarningCircle,
      tone: "bg-amber-50 text-amber-700",
    },
    {
      label: "Import Failures",
      value: stats?.failedImportJobs ?? 0,
      href: "/admin/imports?status=failed",
      icon: CloudArrowDown,
      tone: "bg-purple-50 text-purple-700",
    },
  ];

  return (
    <>
      <PageHeader
        title={t("admin.dashboard")}
        description={t("admin.title")}
        actions={
          <Link href="/admin/orders">
            <Button size="sm" variant="outline" className="text-xs">
              <ShoppingCart className="h-3.5 w-3.5 mr-1.5" />
              View All Orders
            </Button>
          </Link>
        }
      />

      {/* KPI Cards */}
      <StatCardGrid>
        <StatCard
          icon={<Package className="h-4 w-4" />}
          label="Today Orders"
          value={loading ? "—" : (stats?.todayOrders ?? 0)}
          trend={trend(stats?.todayOrders, stats?.todayOrdersGrowth)}
          loading={loading}
        />
        <StatCard
          icon={<CurrencyDollar className="h-4 w-4" />}
          label="Today Revenue"
          value={loading ? "—" : `$${formatMoney(stats?.todayRevenue ?? 0)}`}
          trend={trend(stats?.todayRevenue, stats?.todayRevenueGrowth)}
          loading={loading}
        />
        <StatCard
          icon={<ShoppingCart className="h-4 w-4" />}
          label="Month Orders"
          value={loading ? "—" : (stats?.monthOrders ?? 0)}
          trend={trend(stats?.monthOrders, stats?.monthOrdersGrowth)}
          loading={loading}
        />
        <StatCard
          icon={<Storefront className="h-4 w-4" />}
          label="POS Revenue Today"
          value={loading ? "—" : `$${formatMoney(stats?.todayPosRevenue ?? 0)}`}
          loading={loading}
        />
      </StatCardGrid>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
        {operationCards.map((item) => (
          <Link key={item.label} href={item.href} className="block">
            <div className="rounded-xl border border-gray-200 bg-white p-4 hover:border-gray-300 hover:shadow-sm transition">
              <div className={`mb-3 inline-flex h-8 w-8 items-center justify-center rounded-lg ${item.tone}`}>
                <item.icon className="h-4 w-4" weight="fill" />
              </div>
              <div className="text-xs font-medium text-gray-500">{item.label}</div>
              <div className="mt-1 text-2xl font-bold text-gray-900">
                {loading ? "—" : item.value}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Quick Actions + Recent Orders */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Quick Actions */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {quickActions.map((action) => (
              <Link key={action.label} href={action.href}>
                <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-md ${action.color}`}>
                    <action.icon className="h-3.5 w-3.5 text-white" weight="fill" />
                  </div>
                  {action.label}
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        {/* Recent Orders */}
        <div className="lg:col-span-3">
          <DataTable
            data={stats?.recentOrders || []}
            columns={orderColumns}
            keyExtractor={(r) => r.id}
            loading={loading}
            onRowClick={(r) => window.location.href = `/admin/orders/${r.id}`}
          />
        </div>
      </div>

      {/* Alerts */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Pending Orders This Month", count: stats?.monthPending ?? 0, icon: WarningCircle, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "Today Orders to Process", count: stats?.todayOrders ?? 0, icon: Package, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Month Revenue", value: `$${formatMoney(stats?.monthRevenue ?? 0)}`, icon: CurrencyDollar, color: "text-green-600", bg: "bg-green-50" },
        ].map((alert) => (
          <div key={alert.label} className={`rounded-xl ${alert.bg} p-4 flex items-center gap-3`}>
            <alert.icon className={`h-5 w-5 ${alert.color}`} weight="fill" />
            <div>
              <div className="text-xs text-gray-500">{alert.label}</div>
              <div className="text-base font-bold text-gray-900">
                {"count" in alert ? alert.count : alert.value}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
