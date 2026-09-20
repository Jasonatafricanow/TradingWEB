import { describe, expect, it } from "vitest";

import { buildStaffPosUpdate } from "@/app/admin/staff/staff-pos-form";

describe("buildStaffPosUpdate", () => {
  it("builds a write-only POS configuration update", () => {
    expect(buildStaffPosUpdate({
      posEnabled: true,
      storeId: "store-1",
      permissions: ["checkout"],
      pin: "2468",
      pinConfirm: "2468",
    }, { pos_pin_configured: false })).toEqual({
      pos_enabled: true,
      store_id: "store-1",
      pos_permissions: ["checkout"],
      pos_pin: "2468",
    });
  });

  it("omits the PIN when an already-configured employee leaves it blank", () => {
    expect(buildStaffPosUpdate({
      posEnabled: true,
      storeId: "store-1",
      permissions: ["checkout"],
      pin: "",
      pinConfirm: "",
    }, { pos_pin_configured: true })).not.toHaveProperty("pos_pin");
  });

  it.each([
    ["PIN_CONFIRM_MISMATCH", { posEnabled: true, storeId: "store-1", permissions: ["checkout"], pin: "2468", pinConfirm: "1357" }, { pos_pin_configured: false }],
    ["POS_STORE_REQUIRED", { posEnabled: true, storeId: "", permissions: ["checkout"], pin: "2468", pinConfirm: "2468" }, { pos_pin_configured: false }],
    ["POS_PIN_REQUIRED", { posEnabled: true, storeId: "store-1", permissions: ["checkout"], pin: "", pinConfirm: "" }, { pos_pin_configured: false }],
    ["PIN_FORMAT_INVALID", { posEnabled: true, storeId: "store-1", permissions: ["checkout"], pin: "12ab", pinConfirm: "12ab" }, { pos_pin_configured: false }],
  ])("throws %s for an invalid form", (code, form, current) => {
    expect(() => buildStaffPosUpdate(form, current)).toThrow(code);
  });
});
