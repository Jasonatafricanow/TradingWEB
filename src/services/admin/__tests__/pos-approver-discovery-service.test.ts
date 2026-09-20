import { describe, expect, it } from "vitest";

import {
  discoverPosApprovers,
  type PosApproverDiscoveryRepository,
} from "../pos-approver-discovery-service";

const records = [
  { id: "manager-1", name: "Store One Manager", role: "manager", storeId: "store-1", isActive: true, posEnabled: true, pinHash: "hash" },
  { id: "admin-1", name: "Store One Admin", role: "admin", storeId: "store-1", isActive: true, posEnabled: true, pinHash: "hash" },
  { id: "operator-1", name: "Store One Clerk", role: "operator", storeId: "store-1", isActive: true, posEnabled: true, pinHash: "hash" },
  { id: "inactive-1", name: "Inactive Manager", role: "manager", storeId: "store-1", isActive: false, posEnabled: true, pinHash: "hash" },
  { id: "disabled-1", name: "Disabled Manager", role: "manager", storeId: "store-1", isActive: true, posEnabled: false, pinHash: "hash" },
  { id: "no-pin-1", name: "Unconfigured Manager", role: "manager", storeId: "store-1", isActive: true, posEnabled: true, pinHash: null },
  { id: "manager-2", name: "Other Store Manager", role: "manager", storeId: "store-2", isActive: true, posEnabled: true, pinHash: "hash" },
];

describe("discoverPosApprovers", () => {
  it("returns only active POS-enabled manager/admin identities with configured PINs in the session store", async () => {
    const repository: PosApproverDiscoveryRepository = {
      listCandidates: async () => records,
    };

    await expect(discoverPosApprovers("store-1", repository)).resolves.toEqual([
      { id: "manager-1", name: "Store One Manager", role: "manager" },
      { id: "admin-1", name: "Store One Admin", role: "admin" },
    ]);
  });

  it("returns the minimum public identity shape without staff secrets", async () => {
    const repository: PosApproverDiscoveryRepository = {
      listCandidates: async () => [records[0]],
    };

    const [approver] = await discoverPosApprovers("store-1", repository);
    expect(Object.keys(approver).sort()).toEqual(["id", "name", "role"]);
    expect(approver).not.toHaveProperty("pinHash");
    expect(approver).not.toHaveProperty("storeId");
  });
});
