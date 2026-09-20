import { describe, expect, it } from "vitest";

import {
  ADMIN_NAV_GROUPS,
  expandForPathname,
  filterNavigationForRole,
  findActiveGroupId,
  initialExpandedGroupIds,
  isNavigationItemActive,
  toggleExpandedGroup,
} from "@/components/admin-navigation";
import { shellCatalogs, translate } from "@/i18n";

describe("admin navigation model", () => {
  it("matches the dashboard only for the exact /admin route", () => {
    const dashboard = ADMIN_NAV_GROUPS[0].items[0];

    expect(isNavigationItemActive(dashboard, "/admin")).toBe(true);
    expect(isNavigationItemActive(dashboard, "/admin/orders")).toBe(false);
    expect(findActiveGroupId("/admin")).toBe("overview");
  });

  it("selects the group for a nested route by prefix", () => {
    expect(findActiveGroupId("/admin/orders/order-42")).toBe("sales-channels");
  });

  it("initially expands only the active group and leaves unmatched routes closed", () => {
    expect([...initialExpandedGroupIds("/admin/products")]).toEqual(["catalog"]);
    expect([...initialExpandedGroupIds("/admin/not-configured")]).toEqual([]);
  });

  it("adds a destination group without closing temporary open groups", () => {
    const current = new Set(["overview", "catalog"]);

    expect([...expandForPathname(current, "/admin/orders")]).toEqual([
      "overview",
      "catalog",
      "sales-channels",
    ]);
  });

  it("keeps a manually collapsed group closed until navigation targets a child", () => {
    const collapsed = toggleExpandedGroup(new Set(["catalog"]), "catalog");
    expect([...collapsed]).toEqual([]);

    expect([...expandForPathname(collapsed, "/admin")]).toEqual(["overview"]);
    expect([...expandForPathname(collapsed, "/admin/products")]).toEqual(["catalog"]);
  });

  it("omits groups that have no entries visible to the role", () => {
    const supportGroups = filterNavigationForRole(ADMIN_NAV_GROUPS, "support");

    expect(supportGroups.every((group) => group.items.length > 0)).toBe(true);
    expect(supportGroups.map((group) => group.id)).not.toContain("governance");
    expect(
      supportGroups.flatMap((group) => group.items.map((item) => item.id)),
    ).toEqual(
      expect.arrayContaining([
        "dashboard",
        "briefing",
        "orders",
        "refunds",
        "customers",
        "reviews",
      ]),
    );
  });

  it("keeps the existing menu while role lookup is unresolved and fails closed for unknown roles", () => {
    expect(filterNavigationForRole(ADMIN_NAV_GROUPS, null)).toHaveLength(
      ADMIN_NAV_GROUPS.length,
    );
    expect(filterNavigationForRole(ADMIN_NAV_GROUPS, "unexpected-role")).toEqual([]);
  });

  it("has direct translations for every configured label key", () => {
    const keys = ADMIN_NAV_GROUPS.flatMap((group) => [
      group.labelKey,
      ...group.items.map((item) => item.labelKey),
    ]);

    for (const locale of ["zh", "en", "pt"] as const) {
      for (const key of keys) {
        expect(shellCatalogs[locale][key].trim(), `${locale}:${key}`).not.toBe("");
        expect(shellCatalogs[locale][key], `${locale}:${key}`).not.toBe(key);
      }
    }
  });

  it("changes presentation without changing IDs, routes, or expanded state", () => {
    const expanded = new Set(["overview", "catalog"]);
    const group = ADMIN_NAV_GROUPS[0];

    expect(translate("zh", group.labelKey)).not.toBe(translate("pt", group.labelKey));
    expect(group.id).toBe("overview");
    expect(group.items[0].href).toBe("/admin");
    expect([...expanded]).toEqual(["overview", "catalog"]);
  });
});
