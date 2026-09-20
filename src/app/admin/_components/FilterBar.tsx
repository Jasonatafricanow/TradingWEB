"use client";

import { type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { useI18n } from "@/contexts/i18n-context";

export interface FilterOption {
  label: string;
  value: string;
}

export interface FilterConfig {
  key: string;
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}

interface FilterBarProps {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: FilterConfig[];
  actions?: ReactNode;
}

export function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  filters,
  actions,
}: FilterBarProps) {
  const { t } = useI18n();
  const resolvedSearchPlaceholder = searchPlaceholder ?? t("common.search");
  return (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      {/* Search */}
      {onSearchChange && (
        <div className="relative min-w-[240px] flex-1 max-w-sm">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder={resolvedSearchPlaceholder}
            value={searchValue || ""}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
      )}

      {/* Filters */}
      {filters?.map((f) => (
        <Select key={f.key} value={f.value} onValueChange={f.onChange}>
          <SelectTrigger className="h-9 w-[150px] text-sm">
            <SelectValue placeholder={f.label} />
          </SelectTrigger>
          <SelectContent>
            {f.options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}

      {/* Actions */}
      {actions && (
        <div className="flex items-center gap-2 ml-auto">{actions}</div>
      )}
    </div>
  );
}
