/**
 * 商品相关类型定义
 */
export interface Product {
  id: string
  title: string
  title_en?: string | null
  title_ja?: string | null
  title_es?: string | null
  description?: string | null
  price: string
  category_id: string
  type: string
  status: string
  duration?: string | null
  delivery_method?: string | null
  created_at: string
}

export interface Category {
  id: string
  name: string
  name_en?: string | null
  name_ja?: string | null
  name_es?: string | null
  type: string
  icon?: string | null
  sort_order: number
  is_active: boolean
}
