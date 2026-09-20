import { and, eq, inArray, isNotNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { staff } from "@/storage/database/shared/schema";

export interface PosApproverIdentity {
  id: string;
  name: string;
  role: "admin" | "manager";
}

export interface PosApproverCandidate {
  id: string;
  name: string;
  role: string;
  storeId: string | null;
  isActive: boolean;
  posEnabled: boolean;
  pinHash: string | null;
}

export interface PosApproverDiscoveryRepository {
  listCandidates(storeId: string): Promise<PosApproverCandidate[]>;
}

const databaseRepository: PosApproverDiscoveryRepository = {
  async listCandidates(storeId) {
    return db.select({
      id: staff.id,
      name: staff.name,
      role: staff.role,
      storeId: staff.store_id,
      isActive: staff.is_active,
      posEnabled: staff.pos_enabled,
      pinHash: staff.pos_pin_hash,
    }).from(staff).where(and(
      eq(staff.store_id, storeId),
      eq(staff.is_active, true),
      eq(staff.pos_enabled, true),
      inArray(staff.role, ["admin", "manager"]),
      isNotNull(staff.pos_pin_hash),
    ));
  },
};

export async function discoverPosApprovers(
  storeId: string,
  repository: PosApproverDiscoveryRepository = databaseRepository,
): Promise<PosApproverIdentity[]> {
  const candidates = await repository.listCandidates(storeId);
  return candidates
    .filter((candidate) => (
      candidate.storeId === storeId
      && candidate.isActive
      && candidate.posEnabled
      && candidate.pinHash !== null
      && (candidate.role === "admin" || candidate.role === "manager")
    ))
    .map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      role: candidate.role as "admin" | "manager",
    }));
}
