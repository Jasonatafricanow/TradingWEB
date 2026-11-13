import { db } from "@/lib/db";
import { normalizeManagerGrant, type ManagerGrant } from "@/lib/admin-sections";
import { logAction } from "@/services/admin/audit-service";
import { readSettings, writeSettings, type SettingsExecutor } from "@/services/admin/site-settings-store";

const MANAGER_KEY = "rbac.manager";

export async function loadManagerGrant(executor: SettingsExecutor = db): Promise<ManagerGrant> {
  const settings = await readSettings(MANAGER_KEY, executor);
  const raw = settings.get(MANAGER_KEY);
  if (!raw) return normalizeManagerGrant(null);
  try {
    return normalizeManagerGrant(JSON.parse(raw));
  } catch {
    return normalizeManagerGrant(null);
  }
}

export async function saveManagerGrant(input: unknown, actorId: string | null): Promise<ManagerGrant> {
  const grant = normalizeManagerGrant(input);
  return db.transaction(async (tx) => {
    const previous = await loadManagerGrant(tx);
    await writeSettings({ [MANAGER_KEY]: JSON.stringify(grant) }, tx);
    await logAction({
      userId: actorId,
      action: "role_permissions.update",
      entityType: "role",
      entityId: "manager",
      details: { previous, next: grant },
    }, tx);
    return grant;
  });
}
