import type { AuthenticatedUser } from "@/services/auth/auth-service";
import { AuthError } from "@/services/auth/auth-middleware";

export interface StaffStoreLookup {
  findStaffStoreId(staffId: string): Promise<string | null | undefined>;
}

const databaseLookup: StaffStoreLookup = {
  async findStaffStoreId(staffId) {
    const { db } = await import("@/lib/db");
    const [rows] = await db.$client.execute("SELECT store_id FROM staff WHERE id = ? AND is_active = TRUE LIMIT 1", [staffId]);
    const row = (rows as Array<{ store_id: string | null }>)[0];
    return row ? row.store_id : undefined;
  },
};

/**
 * Returns the store a staff member is confined to, or null when unrestricted.
 * Admins and unassigned (head-office) operators are unrestricted; managers must be store-bound.
 */
export async function resolveStaffStoreScope(
  user: AuthenticatedUser,
  lookup: StaffStoreLookup = databaseLookup,
): Promise<string | null> {
  if (user.role === "admin") return null;
  if (!user.staffId) throw new AuthError("Staff authorization required", 403);
  const storeId = await lookup.findStaffStoreId(user.staffId);
  if (storeId === undefined) throw new AuthError("Staff authorization required", 403);
  if (!storeId && user.role === "manager") throw new AuthError("Manager is not assigned to a store", 403);
  return storeId || null;
}
