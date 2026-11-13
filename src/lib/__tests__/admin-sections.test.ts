import { describe, expect, it } from "vitest";
import { GRANTABLE_SECTIONS, managerMayUse, normalizeManagerGrant, sectionForApiPath } from "../admin-sections";
import { ADMIN_NAV_GROUPS, filterNavigationForRole } from "@/components/admin-navigation";

describe("manager grants", () => {
  it("defaults to POS only", () => {
    const grant = normalizeManagerGrant(null);
    expect(managerMayUse(grant, "/api/admin/pos/checkout")).toBe(true);
    expect(managerMayUse(grant, "/api/admin/orders")).toBe(false);
  });

  it("maps API segments to the section that owns them", () => {
    expect(sectionForApiPath("/api/admin/email-logs/abc")).toBe("notifications");
    expect(sectionForApiPath("/api/admin/delivery-zones")).toBe("shipping-templates");
    expect(sectionForApiPath("/api/admin/wallets/credits/x/revoke")).toBe("wallets");
  });

  it("the permission editor and the sidebar bootstrap are never grantable, even with all", () => {
    const all = normalizeManagerGrant({ all: true });
    expect(managerMayUse(all, "/api/admin/role-permissions")).toBe(false);
    expect(managerMayUse(all, "/api/admin/staff/me")).toBe(false);
    expect(managerMayUse(all, "/api/admin/settings")).toBe(true);
  });

  it("drops unknown section ids", () => {
    expect(normalizeManagerGrant({ sections: ["orders", "role-permissions", 3] }).sections).toEqual(["orders"]);
  });

  it("every grantable section is a sidebar item, and the sidebar shows a manager only its grant", () => {
    const navIds = ADMIN_NAV_GROUPS.flatMap((group) => group.items.map((item) => item.id as string));
    for (const section of GRANTABLE_SECTIONS) expect(navIds).toContain(section);
    const shown = filterNavigationForRole(ADMIN_NAV_GROUPS, "manager", ["orders", "pos"])
      .flatMap((group) => group.items.map((item) => item.id));
    expect(shown.sort()).toEqual(["orders", "pos"]);
  });
});
