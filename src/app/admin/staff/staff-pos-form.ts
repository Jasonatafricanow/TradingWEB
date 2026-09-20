import { AppError } from "@/lib/errors";

/** 抛错用稳定错误码：客户端可 i18n 化。 */
export const STAFF_POS_ERROR_CODES = {
  PIN_CONFIRM_MISMATCH: "PIN_CONFIRM_MISMATCH",
  PIN_FORMAT_INVALID: "PIN_FORMAT_INVALID",
  POS_STORE_REQUIRED: "POS_STORE_REQUIRED",
  POS_PIN_REQUIRED: "POS_PIN_REQUIRED",
} as const;
export type StaffPosErrorCode =
  (typeof STAFF_POS_ERROR_CODES)[keyof typeof STAFF_POS_ERROR_CODES];

export interface StaffPosFormState {
  posEnabled: boolean;
  storeId: string;
  permissions: string[];
  pin: string;
  pinConfirm: string;
}

export interface StaffPosFormCurrent {
  pos_pin_configured: boolean;
}

export interface StaffPosUpdateBody {
  pos_enabled: boolean;
  store_id: string | null;
  pos_permissions: string[];
  pos_pin?: string;
}

function fail(code: StaffPosErrorCode, status = 400): never {
  throw new AppError(code, status, code, { details: { reason: code } });
}

export function buildStaffPosUpdate(
  form: StaffPosFormState,
  current: StaffPosFormCurrent,
): StaffPosUpdateBody {
  const storeId = form.storeId.trim();
  const pin = form.pin.trim();
  const pinConfirm = form.pinConfirm.trim();

  if (pin !== pinConfirm) fail(STAFF_POS_ERROR_CODES.PIN_CONFIRM_MISMATCH);
  if (pin && !/^\d{4,8}$/.test(pin)) fail(STAFF_POS_ERROR_CODES.PIN_FORMAT_INVALID);
  if (form.posEnabled && !storeId) fail(STAFF_POS_ERROR_CODES.POS_STORE_REQUIRED);
  if (form.posEnabled && !current.pos_pin_configured && !pin) fail(STAFF_POS_ERROR_CODES.POS_PIN_REQUIRED);

  const update: StaffPosUpdateBody = {
    pos_enabled: form.posEnabled,
    store_id: storeId || null,
    pos_permissions: [...new Set(form.permissions)],
  };
  if (pin) update.pos_pin = pin;
  return update;
}
