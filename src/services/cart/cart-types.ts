/**
 * 购物车类型定义
 */
export interface CartItem {
  id: string
  title: string
  price: number
  type: string
  quantity: number
  image_key?: string | null
}
