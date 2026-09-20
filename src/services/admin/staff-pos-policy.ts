export interface StaffPosSnapshot {
  store_id: string | null;
  is_active: boolean;
  pos_enabled: boolean;
  pos_permissions: string[];
}

export interface StaffPosUpdateInput {
  store_id?: string | null;
  is_active?: boolean;
  pos_enabled?: boolean;
  pos_permissions?: string[];
  pos_pin?: string;
}

export interface StaffPosUpdatePlan {
  values: Record<string, unknown>;
  revokeSessions: boolean;
}

function samePermissions(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function planStaffPosUpdate(
  current: StaffPosSnapshot,
  input: StaffPosUpdateInput,
  hashPin: (pin: string) => string,
): StaffPosUpdatePlan {
  const values: Record<string, unknown> = {};
  let revokeSessions = false;

  for (const field of ["store_id", "is_active", "pos_enabled"] as const) {
    const next = input[field];
    if (next !== undefined && next !== current[field]) {
      values[field] = next;
      revokeSessions = true;
    }
  }

  if (input.pos_permissions !== undefined && !samePermissions(input.pos_permissions, current.pos_permissions)) {
    values.pos_permissions = input.pos_permissions;
    revokeSessions = true;
  }

  if (input.pos_pin !== undefined) {
    Object.assign(values, {
      pos_pin_hash: hashPin(input.pos_pin),
      pos_pin_failed_attempts: 0,
      pos_pin_last_failed_at: null,
      pos_pin_locked_until: null,
    });
    revokeSessions = true;
  }

  return { values, revokeSessions };
}
