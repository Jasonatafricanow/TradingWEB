/**
 * 货币工具函数
 *
 * 已迁移至 src/config/currency.ts
 * 此文件保留为兼容导出，新代码直接导入 src/config
 */
export {
  CURRENCIES,
  DEFAULT_CURRENCY,
  DEFAULT_RATES,
  getStoredCurrency,
  setStoredCurrency,
  convertPrice,
  formatPrice,
} from "@/config/currency"
export type { CurrencyCode, CurrencyInfo } from "@/config/currency"
