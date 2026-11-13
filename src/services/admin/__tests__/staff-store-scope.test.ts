import { describe, expect, it } from "vitest";
import { resolveStaffStoreScope } from "../staff-store-scope";

const lookup = (storeId: string | null | undefined) => ({ findStaffStoreId: async () => storeId });

describe("staff store scope", () => {
  it("leaves admins unrestricted without a lookup", async () => {
    await expect(resolveStaffStoreScope({ id: "u", email: "a@x", name: null, role: "admin" }, lookup(undefined))).resolves.toBeNull();
  });
  it("confines store-bound operators and managers to their store", async () => {
    await expect(resolveStaffStoreScope({ id: "u", email: "o@x", name: null, role: "operator", staffId: "s" }, lookup("store-1"))).resolves.toBe("store-1");
    await expect(resolveStaffStoreScope({ id: "u", email: "m@x", name: null, role: "manager", staffId: "s" }, lookup("store-2"))).resolves.toBe("store-2");
  });
  it("rejects managers without a store and inactive or missing staff", async () => {
    await expect(resolveStaffStoreScope({ id: "u", email: "m@x", name: null, role: "manager", staffId: "s" }, lookup(null))).rejects.toMatchObject({ status: 403 });
    await expect(resolveStaffStoreScope({ id: "u", email: "o@x", name: null, role: "operator", staffId: "s" }, lookup(undefined))).rejects.toMatchObject({ status: 403 });
    await expect(resolveStaffStoreScope({ id: "u", email: "o@x", name: null, role: "operator" }, lookup("store-1"))).rejects.toMatchObject({ status: 403 });
  });
  it("keeps unassigned head-office operators unrestricted", async () => {
    await expect(resolveStaffStoreScope({ id: "u", email: "o@x", name: null, role: "operator", staffId: "s" }, lookup(null))).resolves.toBeNull();
  });
});
