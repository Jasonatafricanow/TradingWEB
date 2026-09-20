import { describe, expect, it } from "vitest";

import { validateFulfillment } from "../fulfillment-validation-service";

describe("validateFulfillment", () => {
  it("accepts in-store fulfillment without customer delivery fields", () => {
    expect(validateFulfillment({ method: "in_store" })).toEqual({ method: "in_store" });
  });

  it("requires pickup time, contact name, and phone for pickup", () => {
    expect(() => validateFulfillment({ method: "pickup", pickup_at: "" }))
      .toThrow("PICKUP_AT_REQUIRED");
    expect(() => validateFulfillment({ method: "pickup", pickup_at: "2026-07-16T10:00:00Z" }))
      .toThrow("CONTACT_NAME_REQUIRED");
  });

  it("requires a shipping address and trims accepted fields", () => {
    expect(() => validateFulfillment({
      method: "ship",
      contact_name: "Ada",
      phone: "+25884",
    })).toThrow("ADDRESS_REQUIRED");

    expect(validateFulfillment({
      method: "ship",
      contact_name: " Ada ",
      phone: " +25884 ",
      address: " Maputo ",
    })).toEqual({
      method: "ship",
      contact_name: "Ada",
      phone: "+25884",
      address: "Maputo",
    });
  });
});
