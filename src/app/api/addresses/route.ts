import { NextRequest, NextResponse } from "next/server"
import { requireUser, errorResponse } from "@/services/auth/auth-middleware"
import { listAddresses, createAddress, updateAddress, deleteAddress } from "@/services/address-service"

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request)
    const result = await listAddresses(user.id)
    return NextResponse.json(result)
  } catch (err) { return errorResponse(err) }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request)
    const body = await request.json()
    if (!body.address_line1 || !body.city) {
      return NextResponse.json({ error: "address_line1 and city are required" }, { status: 400 })
    }
    const data = await createAddress(user.id, body)
    return NextResponse.json({ data })
  } catch (err) { return errorResponse(err) }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser(request)
    const body = await request.json()
    if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 })
    const { id, ...updates } = body
    const data = await updateAddress(id, user.id, updates)
    return NextResponse.json({ data })
  } catch (err) { return errorResponse(err) }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireUser(request)
    const { id } = await request.json()
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })
    await deleteAddress(id, user.id)
    return NextResponse.json({ success: true })
  } catch (err) { return errorResponse(err) }
}
