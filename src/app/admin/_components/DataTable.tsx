"use client";

import { type ReactNode } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "./EmptyState";
import { useI18n } from "@/contexts/i18n-context";
import { formatTableRange } from "@/i18n";

export interface ColumnDef<T> {
  id?: string;
  header: ReactNode;
  accessor: (row: T) => ReactNode;
  className?: string;
  sortable?: boolean;
}

export interface PaginationConfig {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  keyExtractor: (row: T) => string | number;
  loading?: boolean;
  pagination?: PaginationConfig;
  emptyState?: ReactNode;
  rowActions?: (row: T) => ReactNode;
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({
  data,
  columns,
  keyExtractor,
  loading,
  pagination,
  emptyState,
  rowActions,
  onRowClick,
}: DataTableProps<T>) {
  const { locale, t } = useI18n();
  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                {columns.map((col) => (
                  <th key={col.id || String(col.header)} className={`px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider ${col.className || ""}`}>
                    {col.header}
                  </th>
                ))}
                {rowActions && <th className="px-4 py-3 w-20" />}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {columns.map((col) => (
                    <td key={col.id || String(col.header)} className={`px-4 py-3 ${col.className || ""}`}>
                      <Skeleton className="h-4 w-full max-w-[120px]" />
                    </td>
                  ))}
                  {rowActions && (
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-16" />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white">
        {emptyState || (
          <EmptyState
            title={t("admin.table.no_data")}
            description={t("admin.table.no_items")}
          />
        )}
      </div>
    );
  }

  const totalPages = pagination ? Math.ceil(pagination.total / pagination.pageSize) : 1;

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              {columns.map((col) => (
                <th key={col.id || String(col.header)} className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${col.className || ""}`}>
                  {col.header}
                </th>
              ))}
              {rowActions && <th className="px-4 py-3 w-20" />}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr
                key={keyExtractor(row)}
                className={`border-b border-gray-50 transition-colors ${
                  onRowClick ? "cursor-pointer hover:bg-gray-50" : "hover:bg-gray-50/50"
                }`}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <td key={col.id || String(col.header)} className={`px-4 py-3 text-sm text-gray-700 ${col.className || ""}`}>
                    {col.accessor(row)}
                  </td>
                ))}
                {rowActions && (
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      {rowActions(row)}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
          <span className="text-xs text-gray-400">
            {formatTableRange(locale, {
              start: (pagination.page - 1) * pagination.pageSize + 1,
              end: Math.min(pagination.page * pagination.pageSize, pagination.total),
              total: pagination.total,
            })}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              aria-label={t("common.previous_page")}
            >
              <CaretLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-gray-500 px-2">{pagination.page} / {totalPages}</span>
            <Button
              variant="ghost"
              size="sm"
              disabled={pagination.page >= totalPages}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              aria-label={t("common.next_page")}
            >
              <CaretRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
