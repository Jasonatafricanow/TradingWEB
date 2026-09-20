"use client";

/**
 * 公共端面包屑 — 用在 products / cart / checkout / orders / account 这些子页面顶部。
 *
 * 用法：
 *   <BreadcrumbPublic items={[{ label: t("crumb.products"), href: "/products" }, { label: product.title }]} />
 *
 * 最后一项不传 href 表示当前页（不可点击）。
 * 自动在最前补一个 "首页 / Home"。
 */
import Link from "next/link";
import { CaretRight, House } from "@phosphor-icons/react";
import { useI18n } from "@/contexts/i18n-context";

export interface CrumbItem {
  label: string;
  href?: string;
}

export function BreadcrumbPublic({ items }: { items: CrumbItem[] }) {
  const { t } = useI18n();

  // 强制在最前面加上"首页"
  const list: CrumbItem[] = [{ label: t("crumb.home"), href: "/" }, ...items];

  return (
    <nav aria-label="Breadcrumb" className="mb-4 text-sm">
      <ol className="flex flex-wrap items-center gap-1.5 text-gray-500">
        {list.map((item, idx) => {
          const isLast = idx === list.length - 1;
          return (
            <li key={`${item.label}-${idx}`} className="flex items-center gap-1.5">
              {idx === 0 ? (
                <House className="h-3.5 w-3.5 text-gray-400" weight="duotone" />
              ) : null}
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="hover:text-blue-600 hover:underline"
                >
                  {item.label}
                </Link>
              ) : (
                <span className={isLast ? "font-medium text-gray-800" : ""}>
                  {item.label}
                </span>
              )}
              {!isLast && <CaretRight className="h-3 w-3 text-gray-300" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
