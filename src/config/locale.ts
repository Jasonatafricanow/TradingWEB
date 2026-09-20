/**
 * 多语言配置
 *
 * 新增语言只需在此添加条目，无需修改组件。
 * 组件中通过 `t()` 调用翻译，localeLabels/flags 从此文件读取。
 */
export type LocaleCode = "zh" | "en" | "pt"

export interface LocaleInfo {
  code: LocaleCode
  label: string
  flag: string
  locale: string // Intl.NumberFormat locale
}

export const LOCALES: LocaleInfo[] = [
  { code: "zh", label: "中文",     flag: "🇨🇳", locale: "zh-CN" },
  { code: "en", label: "English",  flag: "🇺🇸", locale: "en-US" },
  { code: "pt", label: "Português", flag: "🇧🇷", locale: "pt-BR" },
]

export const DEFAULT_LOCALE: LocaleCode = "zh"

/** 获取语言标签映射 */
export function getLocaleLabels(): Record<LocaleCode, string> {
  const map = {} as Record<LocaleCode, string>
  for (const l of LOCALES) map[l.code] = l.label
  return map
}

/** 获取语言国旗映射 */
export function getLocaleFlags(): Record<LocaleCode, string> {
  const map = {} as Record<LocaleCode, string>
  for (const l of LOCALES) map[l.code] = l.flag
  return map
}
