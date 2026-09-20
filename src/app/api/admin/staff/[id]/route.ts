import { NextRequest, NextResponse } from "next/server"
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware"
import { getStaffById, updateStaff, deleteStaff, type StaffUpdate } from "@/services/admin/staff-service"
import { getStore } from "@/services/admin/store-service"

const ALLOWED_ROLES = new Set(["admin", "manager", "operator", "support"])
const POS_PERMISSIONS = new Set([
  "checkout",
  "refund",
  "exchange",
  "discount",
  "stock_adjust",
  "inventory_read",
  "inventory_adjust",
  "inventory_transfer",
  "purchase_order_read",
  "purchase_order_create",
  "purchase_order_receive",
])
const POS_PIN_PATTERN = /^\d{4,8}$/

class StaffValidationError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
  }
}

function normalizeStaffUpdate(input: unknown): StaffUpdate {
  const body = input as Record<string, unknown>
  const update: StaffUpdate = {}

  if (typeof body.name === "string") update.name = body.name.trim().slice(0, 100)
  if (typeof body.phone === "string") update.phone = body.phone.trim().slice(0, 50)
  if (typeof body.role === "string" && ALLOWED_ROLES.has(body.role)) update.role = body.role
  if (typeof body.is_active === "boolean") update.is_active = body.is_active
  if (body.store_id !== undefined) {
    if (body.store_id === null) {
      update.store_id = null
    } else if (typeof body.store_id === "string" && body.store_id.trim().length > 0 && body.store_id.trim().length <= 36) {
      update.store_id = body.store_id.trim()
    } else {
      throw new StaffValidationError("store_id must be null or a non-empty string up to 36 characters")
    }
  }
  if (body.pos_enabled !== undefined) {
    if (typeof body.pos_enabled !== "boolean") throw new StaffValidationError("pos_enabled must be a boolean")
    update.pos_enabled = body.pos_enabled
  }
  if (body.pos_permissions !== undefined) {
    if (!Array.isArray(body.pos_permissions) || !body.pos_permissions.every((value) => typeof value === "string" && POS_PERMISSIONS.has(value))) {
      throw new StaffValidationError("pos_permissions contains an unsupported permission")
    }
    update.pos_permissions = [...new Set(body.pos_permissions)]
  }
  if (body.pos_pin !== undefined) {
    if (typeof body.pos_pin !== "string" || !POS_PIN_PATTERN.test(body.pos_pin)) {
      throw new StaffValidationError("pos_pin must contain 4 to 8 digits")
    }
    update.pos_pin = body.pos_pin
  }

  return update
}

function isSelfTarget(target: { id: string; email: string | null }, user: { id: string; email: string; staffId?: string }): boolean {
  return target.id === user.staffId || target.email === user.email
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaffRole(request, ["admin"])
    const user = await requireUser(request)
    const { id } = await params
    const target = await getStaffById(id)
    if (!target) return NextResponse.json({ error: "Staff not found" }, { status: 404 })

    const update = normalizeStaffUpdate(await request.json())
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
    }

    if (isSelfTarget(target, user) && (update.role || update.is_active === false)) {
      return NextResponse.json({ error: "Cannot change your own role or deactivate yourself" }, { status: 400 })
    }

    if (typeof update.store_id === "string") {
      const store = await getStore(update.store_id)
      if (store.error) throw store.error
      if (!store.data) throw new StaffValidationError("Store not found", 404)
      if (store.data.status === "inactive") throw new StaffValidationError("Cannot assign an inactive store")
    }

    if (update.pos_enabled === true) {
      const finalStoreId = update.store_id !== undefined ? update.store_id : target.store_id
      const hasPin = update.pos_pin !== undefined || target.pos_pin_configured === true
      if (typeof finalStoreId !== "string" || finalStoreId.length === 0) {
        throw new StaffValidationError("A store is required before enabling POS")
      }
      if (!hasPin) throw new StaffValidationError("A PIN is required before enabling POS")
    }

    const data = await updateStaff(id, update)
    return NextResponse.json({ data })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaffRole(request, ["admin"])
    const user = await requireUser(request)
    const { id } = await params
    const target = await getStaffById(id)
    if (!target) return NextResponse.json({ error: "Staff not found" }, { status: 404 })

    if (isSelfTarget(target, user)) {
      return NextResponse.json({ error: "Cannot delete your own staff account" }, { status: 400 })
    }

    await deleteStaff(id)
    return NextResponse.json({ success: true })
  } catch (err) {
    return errorResponse(err)
  }
}
