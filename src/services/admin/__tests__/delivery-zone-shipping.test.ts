import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ db: {} }))

import { computeZoneShipping } from "../delivery-zone-service"

describe("computeZoneShipping", () => {
  const zone = { base_rate: "150.00", free_shipping_min: "2000.00" }

  it("charges the zone base rate below the free-shipping threshold", () => {
    expect(computeZoneShipping(zone, 1999.99)).toBe(150)
  })

  it("is free at or above the threshold (after discounts)", () => {
    expect(computeZoneShipping(zone, 2000)).toBe(0)
  })

  it("always charges the base rate when the zone has no threshold", () => {
    expect(computeZoneShipping({ base_rate: "80", free_shipping_min: null }, 99999)).toBe(80)
  })
})
