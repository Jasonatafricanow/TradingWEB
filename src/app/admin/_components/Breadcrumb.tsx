"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { CaretRight } from "@phosphor-icons/react";
import { useI18n } from "@/contexts/i18n-context";
import { getAdminSegmentLabel } from "@/i18n";
import { useBreadcrumbValue } from "./breadcrumb-context";

export function Breadcrumb() {
  const pathname = usePathname();
  const { t } = useI18n();
  const { override } = useBreadcrumbValue();

  // Only render on admin sub-pages
  if (pathname === "/admin") return null;

  const segs = pathname.split("/").filter(Boolean);
  if (segs.length <= 1) return null;

  return (
    <nav className="flex items-center gap-1.5 text-xs text-gray-400 mb-5" aria-label={t("admin.breadcrumb")}>
      {segs.map((seg, i) => {
        const href = "/" + segs.slice(0, i + 1).join("/");
        const isLast = i === segs.length - 1;
        const label = isLast && override ? override : getAdminSegmentLabel(t, seg);
        return (
          <span key={href} className="flex items-center gap-1.5">
            {i > 0 && <CaretRight className="h-3 w-3" />}
            {isLast ? (
              <span className="text-gray-700 font-medium">{label}</span>
            ) : (
              <Link href={href} className="hover:text-blue-600 transition-colors">
                {label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
