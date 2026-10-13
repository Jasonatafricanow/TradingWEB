import { NextResponse } from "next/server"
import { errorResponse } from "@/services/auth/auth-middleware"
import { listDeliveryZones } from "@/services/admin/delivery-zone-service"

// GET /api/delivery-zones — active zones for checkout (public, read-only).
// The admin route requires staff auth, so the storefront cannot use it.
export async function GET() {
  try {
    const zones = await listDeliveryZones(true)
    const data = zones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      name_en: zone.name_en,
      base_rate: zone.base_rate,
      free_shipping_min: zone.free_shipping_min,
      time_slots: zone.time_slots,
    }))
    return NextResponse.json({ data })
  } catch (err) {
    return errorResponse(err)
  }
}
