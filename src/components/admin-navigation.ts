import type React from "react";
import {
  Bell,
  ChartBar,
  ClipboardText,
  CloudArrowDown,
  CreditCard,
  Crown,
  Cube,
  Database,
  Envelope,
  Gear,
  Image,
  Lightbulb,
  LinkSimple,
  Package,
  ShareNetwork,
  ShoppingCart,
  SquaresFour,
  Star,
  Storefront,
  Tag,
  TrendUp,
  Truck,
  UserCircle,
  Users,
  Warehouse,
  WarningCircle,
} from "@phosphor-icons/react";

import type { TranslationKey } from "@/i18n";

export type AdminNavigationIcon = React.ComponentType<{
  className?: string;
  weight?: "fill" | "regular" | "duotone";
}>;

export interface AdminNavigationItem {
  id: string;
  labelKey: TranslationKey;
  href: string;
  icon: AdminNavigationIcon;
  exact?: boolean;
}

export interface AdminNavigationGroup {
  id: string;
  labelKey: TranslationKey;
  items: readonly AdminNavigationItem[];
}

export const ADMIN_NAV_GROUPS = [
  {
    id: "overview",
    labelKey: "nav.group.overview",
    items: [
      { id: "dashboard", labelKey: "nav.dashboard", href: "/admin", icon: SquaresFour, exact: true },
      { id: "briefing", labelKey: "nav.briefing", href: "/admin/briefing", icon: TrendUp },
      { id: "sales", labelKey: "nav.sales", href: "/admin/sales", icon: TrendUp },
      { id: "traffic", labelKey: "nav.traffic", href: "/admin/traffic", icon: ChartBar },
    ],
  },
  {
    id: "sales-channels",
    labelKey: "nav.group.sales_channels",
    items: [
      { id: "pos", labelKey: "nav.pos", href: "/admin/pos", icon: Storefront },
      { id: "orders", labelKey: "nav.orders", href: "/admin/orders", icon: ShoppingCart },
      { id: "payment-methods", labelKey: "nav.payment_methods", href: "/admin/payment-methods", icon: CreditCard },
      { id: "refunds", labelKey: "nav.refunds", href: "/admin/refunds", icon: WarningCircle },
      { id: "abandoned-carts", labelKey: "nav.abandoned_carts", href: "/admin/abandoned-carts", icon: ShoppingCart },
    ],
  },
  {
    id: "catalog",
    labelKey: "nav.group.catalog",
    items: [
      { id: "products", labelKey: "nav.products", href: "/admin/products", icon: Package },
      { id: "product-types", labelKey: "nav.product_types", href: "/admin/product-types", icon: Cube },
      { id: "categories", labelKey: "nav.categories", href: "/admin/categories", icon: Tag },
      { id: "reviews", labelKey: "nav.reviews", href: "/admin/reviews", icon: Star },
      { id: "recommendations", labelKey: "nav.recommendations", href: "/admin/recommendations", icon: Lightbulb },
    ],
  },
  {
    id: "customers",
    labelKey: "nav.group.customers",
    items: [
      { id: "customers", labelKey: "nav.customers", href: "/admin/customers", icon: UserCircle },
      { id: "memberships", labelKey: "nav.memberships", href: "/admin/memberships", icon: Crown },
    ],
  },
  {
    id: "marketing",
    labelKey: "nav.group.marketing",
    items: [
      { id: "coupons", labelKey: "nav.coupons", href: "/admin/coupons", icon: Tag },
      { id: "affiliates", labelKey: "nav.affiliates", href: "/admin/affiliates", icon: ShareNetwork },
      { id: "notifications", labelKey: "nav.notifications", href: "/admin/notifications", icon: Bell },
    ],
  },
  {
    id: "inventory-fulfillment",
    labelKey: "nav.group.inventory_fulfillment",
    items: [
      { id: "stores", labelKey: "nav.stores", href: "/admin/stores", icon: Storefront },
      { id: "warehouses", labelKey: "nav.warehouses", href: "/admin/warehouses", icon: Warehouse },
      { id: "inventory", labelKey: "nav.inventory", href: "/admin/inventory", icon: Cube },
      { id: "shipments", labelKey: "nav.shipments", href: "/admin/shipments", icon: Truck },
      { id: "shipping-templates", labelKey: "nav.shipping_templates", href: "/admin/shipping-templates", icon: Truck },
    ],
  },
  {
    id: "content-migration",
    labelKey: "nav.group.content_migration",
    items: [
      { id: "media", labelKey: "nav.media", href: "/admin/media", icon: Image },
      { id: "email-templates", labelKey: "nav.email_templates", href: "/admin/email-templates", icon: Envelope },
      { id: "imports", labelKey: "nav.imports", href: "/admin/imports", icon: CloudArrowDown },
      { id: "redirects", labelKey: "nav.redirects", href: "/admin/redirects", icon: LinkSimple },
      { id: "seed", labelKey: "nav.seed_data", href: "/admin/seed", icon: Database },
    ],
  },
  {
    id: "governance",
    labelKey: "nav.group.governance",
    items: [
      { id: "staff", labelKey: "nav.staff", href: "/admin/staff", icon: Users },
      { id: "audit-logs", labelKey: "nav.audit_logs", href: "/admin/audit-logs", icon: ClipboardText },
      { id: "settings", labelKey: "nav.settings", href: "/admin/settings", icon: Gear },
    ],
  },
] as const satisfies readonly AdminNavigationGroup[];

const ROLE_MENUS: Record<string, readonly string[]> = {
  admin: [
    "dashboard", "products", "orders", "pos", "categories", "sales", "traffic",
    "product-types", "coupons", "refunds", "notifications", "email-templates",
    "abandoned-carts", "memberships", "affiliates", "audit-logs", "warehouses",
    "stores", "shipments", "shipping-templates", "customers", "reviews",
    "recommendations", "media", "seed", "briefing", "inventory", "staff",
    "settings", "imports", "redirects", "payment-methods",
  ],
  operator: [
    "dashboard", "products", "orders", "pos", "categories", "sales", "traffic",
    "coupons", "refunds", "email-templates", "abandoned-carts", "customers",
    "reviews", "briefing", "inventory", "imports", "redirects", "stores",
    "shipments", "payment-methods",
  ],
  support: ["dashboard", "orders", "refunds", "customers", "reviews", "briefing"],
};

export function filterNavigationForRole(
  groups: readonly AdminNavigationGroup[],
  role: string | null,
): AdminNavigationGroup[] {
  if (!role) {
    return groups.map((group) => ({ ...group, items: [...group.items] }));
  }
  const roleMenus = ROLE_MENUS[role];
  if (!roleMenus) return [];
  const allowed = new Set(roleMenus);
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => allowed.has(item.id)),
    }))
    .filter((group) => group.items.length > 0);
}

export function isNavigationItemActive(
  item: Pick<AdminNavigationItem, "href" | "exact">,
  pathname: string,
): boolean {
  return item.exact === true ? pathname === item.href : pathname.startsWith(item.href);
}

export function findActiveGroupId(
  pathname: string,
  groups: readonly AdminNavigationGroup[] = ADMIN_NAV_GROUPS,
): string | null {
  const matches = groups.flatMap((group) =>
    group.items
      .filter((item) => isNavigationItemActive(item, pathname))
      .map((item) => ({ groupId: group.id, hrefLength: item.href.length })),
  );
  matches.sort((left, right) => right.hrefLength - left.hrefLength);
  return matches[0]?.groupId ?? null;
}

export function initialExpandedGroupIds(pathname: string): Set<string> {
  const activeGroupId = findActiveGroupId(pathname);
  return activeGroupId ? new Set([activeGroupId]) : new Set();
}

export function expandForPathname(
  expanded: ReadonlySet<string>,
  pathname: string,
): Set<string> {
  const next = new Set(expanded);
  const activeGroupId = findActiveGroupId(pathname);
  if (activeGroupId) next.add(activeGroupId);
  return next;
}

export function toggleExpandedGroup(
  expanded: ReadonlySet<string>,
  groupId: string,
): Set<string> {
  const next = new Set(expanded);
  if (next.has(groupId)) next.delete(groupId);
  else next.add(groupId);
  return next;
}
