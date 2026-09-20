"use client";

import { type ReactNode } from "react";
import { TrendUp, TrendDown } from "@phosphor-icons/react";
import { Skeleton } from "@/components/ui/skeleton";

interface StatCardProps {
  icon?: ReactNode;
  label: string;
  value: string | number;
  /** e.g. "+12%" or "-3%". If null/undefined, arrow hidden */
  trend?: string | null;
  loading?: boolean;
}

export function StatCard({ icon, label, value, trend, loading }: StatCardProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <Skeleton className="h-4 w-20 mb-3" />
        <Skeleton className="h-7 w-28 mb-2" />
        <Skeleton className="h-3 w-12" />
      </div>
    );
  }

  const isUp = trend && trend.startsWith("+");
  const isDown = trend && trend.startsWith("-");

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</span>
        {icon && <span className="text-gray-400">{icon}</span>}
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      {trend && (
        <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${
          isUp ? "text-green-600" : isDown ? "text-red-500" : "text-gray-400"
        }`}>
          {isUp && <TrendUp className="h-3 w-3" weight="fill" />}
          {isDown && <TrendDown className="h-3 w-3" weight="fill" />}
          <span>{trend}</span>
        </div>
      )}
    </div>
  );
}

interface StatCardGridProps {
  children: ReactNode;
  cols?: 2 | 3 | 4;
}

export function StatCardGrid({ children, cols = 4 }: StatCardGridProps) {
  const gridCols = {
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-2 lg:grid-cols-3",
    4: "sm:grid-cols-2 lg:grid-cols-4",
  };
  return (
    <div className={`grid grid-cols-1 ${gridCols[cols]} gap-4`}>
      {children}
    </div>
  );
}
