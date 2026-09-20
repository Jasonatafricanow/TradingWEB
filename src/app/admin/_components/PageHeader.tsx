"use client";

import { type ReactNode } from "react";
import { useBreadcrumbOverride } from "./breadcrumb-context";

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumbOverride?: string | null;
}

export function PageHeader({ title, description, actions, breadcrumbOverride }: PageHeaderProps) {
  useBreadcrumbOverride(breadcrumbOverride ?? null);

  return (
    <div className="mb-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-gray-500">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>
    </div>
  );
}
