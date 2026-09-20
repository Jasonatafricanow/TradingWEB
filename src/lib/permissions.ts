"use server"

import { AuthenticatedUser } from "@/services/auth/auth-middleware"

/** Role hierarchy (higher index = more access) */
const ROLE_HIERARCHY = ["disabled", "support", "operator", "admin"] as const
export type Role = (typeof ROLE_HIERARCHY)[number]

/**
 * Which admin sidebar items each role can see
 */
export const SIDEBAR_ACCESS: Record<string, Role[]> = {
  "/admin": ["admin", "operator", "support"],
  "/admin/briefing": ["admin", "operator"],
  "/admin/sales": ["admin", "operator"],
  "/admin/traffic": ["admin", "operator"],
  "/admin/products": ["admin", "operator"],
  "/admin/categories": ["admin", "operator"],
  "/admin/reviews": ["admin", "operator", "support"],
  "/admin/recommendations": ["admin", "operator"],
  "/admin/orders": ["admin", "operator", "support"],
  "/admin/refunds": ["admin", "operator"],
  "/admin/abandoned-carts": ["admin", "operator"],
  "/admin/customers": ["admin", "operator", "support"],
  "/admin/memberships": ["admin", "operator"],
  "/admin/coupons": ["admin", "operator"],
  "/admin/affiliates": ["admin", "operator"],
  "/admin/notifications": ["admin", "operator"],
  "/admin/warehouses": ["admin", "operator"],
  "/admin/inventory": ["admin", "operator"],
  "/admin/shipments": ["admin", "operator"],
  "/admin/shipping-templates": ["admin", "operator"],
  "/admin/stores": ["admin", "operator"],
  "/admin/email-templates": ["admin", "operator"],
  "/admin/seed": ["admin"],
  "/admin/staff": ["admin"],
  "/admin/audit-logs": ["admin", "operator", "support"],
  "/admin/settings": ["admin"],
}

export function canAccess(path: string, role: string): boolean {
  const allowed = SIDEBAR_ACCESS[path]
  if (!allowed) return false
  return allowed.includes(role as Role)
}

export function filterSidebarByRole(items: { href?: string; children?: { href?: string }[] }[], role: string) {
  return items.filter((item) => {
    if (item.href && !canAccess(item.href, role)) return false
    if (item.children) {
      item.children = item.children.filter((child) => {
        if (child.href) return canAccess(child.href, role)
        return true
      })
      return item.children.length > 0
    }
    return true
  })
}
