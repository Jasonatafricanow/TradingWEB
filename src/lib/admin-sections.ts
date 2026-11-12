/**
 * Admin sections that a manager can be granted by an admin.
 *
 * Section ids are the admin navigation item ids (src/components/admin-navigation.ts).
 * API routes under /api/admin/<segment> belong to the section below; a segment
 * that is not listed (for example role-permissions) is never grantable, so the
 * permission editor stays admin-only even when everything else is opened.
 */
export const GRANTABLE_SECTIONS = [
  "dashboard", "briefing", "sales", "traffic",
  "pos", "orders", "payment-methods", "refunds", "abandoned-carts",
  "products", "product-types", "categories", "reviews", "recommendations",
  "customers", "memberships", "wallets",
  "coupons", "affiliates", "notifications", "promotions",
  "stores", "warehouses", "inventory", "shipments", "shipping-templates",
  "media", "email-templates", "imports", "redirects", "seed",
  "staff", "audit-logs", "settings", "version",
] as const;

export type AdminSection = (typeof GRANTABLE_SECTIONS)[number];

/** What a manager may use when no admin has configured anything yet. */
export const MANAGER_DEFAULT_SECTIONS: readonly AdminSection[] = ["pos"];

const API_SEGMENT_SECTION: Record<string, AdminSection> = {
  "abandoned-carts": "abandoned-carts",
  affiliates: "affiliates",
  "audit-logs": "audit-logs",
  categories: "categories",
  coupons: "coupons",
  customers: "customers",
  dashboard: "dashboard",
  "db-status": "settings",
  "delivery-methods": "shipping-templates",
  "delivery-zones": "shipping-templates",
  "email-logs": "notifications",
  "email-templates": "email-templates",
  import: "imports",
  inventory: "inventory",
  maintenance: "settings",
  media: "media",
  memberships: "memberships",
  orders: "orders",
  "payment-methods": "payment-methods",
  pos: "pos",
  products: "products",
  "product-types": "product-types",
  promotions: "promotions",
  recommendations: "recommendations",
  redirects: "redirects",
  refunds: "refunds",
  reviews: "reviews",
  sales: "sales",
  seed: "seed",
  settings: "settings",
  shipments: "shipments",
  "shipping-templates": "shipping-templates",
  staff: "staff",
  stores: "stores",
  traffic: "traffic",
  version: "version",
  wallets: "wallets",
  warehouses: "warehouses",
};

export interface ManagerGrant {
  all: boolean;
  sections: AdminSection[];
}

const SECTION_SET = new Set<string>(GRANTABLE_SECTIONS);

export function normalizeManagerGrant(raw: unknown): ManagerGrant {
  if (!raw || typeof raw !== "object") return { all: false, sections: [...MANAGER_DEFAULT_SECTIONS] };
  const value = raw as { all?: unknown; sections?: unknown };
  const sections = Array.isArray(value.sections)
    ? [...new Set(value.sections.filter((s): s is AdminSection => typeof s === "string" && SECTION_SET.has(s)))]
    : [...MANAGER_DEFAULT_SECTIONS];
  return { all: value.all === true, sections };
}

/** The section an /api/admin/... path belongs to, or null when it is never grantable. */
export function sectionForApiPath(pathname: string): AdminSection | null {
  const match = /^\/api\/admin\/([^/?#]+)/.exec(pathname);
  if (!match) return null;
  // /api/admin/staff/me is how every staff member loads the sidebar.
  if (/^\/api\/admin\/staff\/me\/?$/.test(pathname)) return null;
  return API_SEGMENT_SECTION[match[1]] ?? null;
}

export function grantedSections(grant: ManagerGrant): AdminSection[] {
  return grant.all ? [...GRANTABLE_SECTIONS] : grant.sections;
}

export function managerMayUse(grant: ManagerGrant, pathname: string): boolean {
  const section = sectionForApiPath(pathname);
  if (!section) return false;
  return grant.all || grant.sections.includes(section);
}
