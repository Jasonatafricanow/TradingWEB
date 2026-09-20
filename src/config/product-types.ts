/**
 * 商品类型字典。
 *
 * 内置类型作为数据库不可用时的 fallback；后台 PR-4b 使用
 * product_types 表做可视化管理。
 */

export interface ProductTypeDef {
  code: string;
  label: string;
  label_en: string;
  description: string;
  sort_order: number;
  is_active: boolean;
}

export interface ApiProductType extends ProductTypeDef {
  id: string;
  is_builtin: boolean;
  product_count?: number;
  category_count?: number;
}

export const PRODUCT_TYPE_DEFS: ProductTypeDef[] = [
  {
    code: "service",
    label: "咨询服务",
    label_en: "Service",
    description: "咨询、顾问、会议等需要人工交付的服务型商品。",
    sort_order: 1,
    is_active: true,
  },
  {
    code: "virtual",
    label: "虚拟商品",
    label_en: "Digital Product",
    description: "模板、课程、文件、下载链接等数字交付商品。",
    sort_order: 2,
    is_active: true,
  },
  {
    code: "physical",
    label: "实体商品",
    label_en: "Physical Product",
    description: "需要库存、发货、物流履约的实物商品。",
    sort_order: 3,
    is_active: true,
  },
];

export const PRODUCT_TYPES = PRODUCT_TYPE_DEFS.map((type) => type.code);

export function getProductTypeLabel(code: string, types?: ApiProductType[]): string {
  const fromApi = types?.find((type) => type.code === code);
  if (fromApi) return fromApi.label;
  return PRODUCT_TYPE_DEFS.find((type) => type.code === code)?.label ?? code;
}
