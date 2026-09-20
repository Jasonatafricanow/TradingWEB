/**
 * 管理后台 — 商品分类服务
 */
import { db } from "@/lib/db"
import { categories, products } from "@/storage/database/shared/schema"
import { eq, asc, sql } from "drizzle-orm"
import { randomUUID } from "node:crypto"

export interface CategoryInput {
  name: string
  name_en?: string
  name_ja?: string
  name_es?: string
  type: string
  icon?: string
  sort_order?: number
  is_active?: boolean
}

export interface CategoryUpdate {
  name?: string
  name_en?: string
  name_ja?: string
  name_es?: string
  type?: string
  icon?: string
  sort_order?: number
  is_active?: boolean
}

export async function listCategories() {
  try {
    const data = await db.select().from(categories).orderBy(asc(categories.sort_order))
    return { data: data || [], error: null }
  } catch (error) {
    return { data: [], error }
  }
}

export async function createCategory(input: CategoryInput) {
  try {
    const id = randomUUID()
    await db.insert(categories).values({
      id,
      name: input.name,
      name_en: input.name_en || null,
      name_ja: input.name_ja || null,
      name_es: input.name_es || null,
      type: input.type,
      icon: input.icon || null,
      is_active: input.is_active !== undefined ? Boolean(input.is_active) : true,
      sort_order: input.sort_order !== undefined ? parseInt(String(input.sort_order), 10) || 0 : 0,
    })
    const [data] = await db.select().from(categories).where(eq(categories.id, id)).limit(1)
    return data
  } catch (error) {
    throw error
  }
}

export async function updateCategory(id: string, input: CategoryUpdate) {
  try {
    const updateData: Record<string, unknown> = {}
    const fields = ["name", "name_en", "name_ja", "name_es", "type", "icon"] as const
    for (const field of fields) {
      if (input[field] !== undefined) updateData[field] = input[field] || null
    }
    if (input.sort_order !== undefined) updateData.sort_order = parseInt(String(input.sort_order), 10) || 0
    if (input.is_active !== undefined) updateData.is_active = Boolean(input.is_active)

    await db.update(categories).set(updateData).where(eq(categories.id, id))
    const [data] = await db.select().from(categories).where(eq(categories.id, id)).limit(1)
    return data
  } catch (error) {
    throw error
  }
}

export async function deleteCategory(id: string) {
  try {
    // 检查分类下是否有商品
    const [result] = await db.select({ count: sql<number>`COUNT(*) as count` }).from(products).where(eq(products.category_id, id))
    const itemCount = Number(result?.count || 0)
    if (itemCount > 0) {
      throw new Error("Cannot delete category with existing products. Reassign or remove them first.")
    }

    await db.delete(categories).where(eq(categories.id, id))
  } catch (error) {
    throw error
  }
}
