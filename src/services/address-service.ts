import { db } from "@/lib/db"
import { and, eq, desc } from "drizzle-orm"
import { customerAddresses } from "@/storage/database/shared/schema"
import { IS_DEMO_MODE } from "@/config/constants"
import * as demoCommerce from "@/lib/demo/commerce"

export interface AddressInput {
  label?: string
  phone?: string
  address_line1: string
  address_line2?: string
  city: string
  state?: string
  zip?: string
  country?: string
  is_default?: boolean
}

export async function listAddresses(userId: string) {
  if (IS_DEMO_MODE) return { data: demoCommerce.demoListAddresses(userId), error: null }
  try {
    const data = await db.select().from(customerAddresses)
      .where(eq(customerAddresses.user_id, userId))
      .orderBy(desc(customerAddresses.is_default), desc(customerAddresses.created_at))
    return { data: data || [], error: null }
  } catch (error) {
    return { data: [], error }
  }
}

export async function createAddress(userId: string, input: AddressInput) {
  if (IS_DEMO_MODE) return demoCommerce.demoSaveAddress(userId, input) as never
  try {
    if (input.is_default) {
      await db.update(customerAddresses).set({ is_default: false } ).where(eq(customerAddresses.user_id, userId))
    }
    const id = crypto.randomUUID()
    await db.insert(customerAddresses).values({ id, ...input, user_id: userId } )
    const [data] = await db.select().from(customerAddresses).where(eq(customerAddresses.id, id)).limit(1)
    return data
  } catch (error) {
    throw error
  }
}

export async function updateAddress(addressId: string, userId: string, input: Partial<AddressInput>) {
  if (IS_DEMO_MODE) return demoCommerce.demoSaveAddress(userId, { ...input, id: addressId }) as never
  try {
    if (input.is_default) {
      await db.update(customerAddresses).set({ is_default: false } ).where(eq(customerAddresses.user_id, userId))
    }
    await db.update(customerAddresses).set(input ).where(
      and(eq(customerAddresses.id, addressId), eq(customerAddresses.user_id, userId))
    )
    const [data] = await db.select().from(customerAddresses).where(
      and(eq(customerAddresses.id, addressId), eq(customerAddresses.user_id, userId))
    ).limit(1)
    return data
  } catch (error) {
    throw error
  }
}

export async function deleteAddress(addressId: string, userId: string) {
  if (IS_DEMO_MODE) { demoCommerce.demoDeleteAddress(userId, addressId); return }
  try {
    await db.delete(customerAddresses).where(
      and(eq(customerAddresses.id, addressId), eq(customerAddresses.user_id, userId))
    )
  } catch (error) {
    throw error
  }
}
