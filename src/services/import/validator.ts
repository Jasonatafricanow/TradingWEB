/**
 * 六维校验
 *
 * 给 import receiver 用，也供 /api/admin/import/validate dry-run 端点直接调用。
 * 输入：envelope（来自 sender 的标准批次包）；输出：ImportRecordError[]。
 *
 * 当前实现：
 * - validateProducts：完整六维中的 products / variants / images / inventory 维度
 * - validateCustomers：邮箱格式 + 必填校验（P2c 补 cross-source 重复邮箱聚合）
 * - validateOrders：line_items 必填 + 金额格式（P2c 补 customer/product 引用完整性）
 *
 * 设计：
 * - 不做 DB 查询（保持纯函数；schema 校验交给 receiver 在事务内做 unique 冲突时报）
 * - 单条 record 失败不阻止其它条；errors[] 完整列出
 */
import type {
  ImportProductsEnvelope,
  ImportCustomersEnvelope,
  ImportOrdersEnvelope,
  ImportDiscountsEnvelope,
  ImportRedirectsEnvelope,
  ImportRecordError,
  CustomerLinkStrategy,
} from "@/types/import-contract";
import { bulkFindMappings } from "./source-mapping";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DECIMAL_REGEX = /^-?\d+(\.\d+)?$/;

function isPositiveDecimal(value: string | null | undefined): boolean {
  if (!value || !DECIMAL_REGEX.test(value)) return false;
  return Number(value) >= 0;
}

function isStrictPositiveDecimal(value: string | null | undefined): boolean {
  if (!value || !DECIMAL_REGEX.test(value)) return false;
  return Number(value) > 0;
}

function isValidDateString(value: string | null | undefined): boolean {
  if (!value) return true;
  return !Number.isNaN(new Date(value).getTime());
}

function isNonZeroDecimal(value: string | null | undefined): boolean {
  if (!value || !DECIMAL_REGEX.test(value)) return false;
  return Math.abs(Number(value)) > 0;
}

function isValidDiscountType(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return ["percentage", "percent", "fixed", "fixed_amount", "amount"].includes(normalized);
}

/* Legacy malformed block kept inert because earlier encoding drift joined comments and code.
export function validateProducts(
  envelope: ImportProductsEnvelope,
): ImportRecordError[] {
  const errors: ImportRecordError[] = [];
  const seenSourceIds = new Set<string>();

  for (let i = 0; i < envelope.records.length; i++) {
    const r = envelope.records[i];

    // 维度 1：商品数据完整性
    if (!r.source_id) {
      errors.push({
        record_index: i,
        code: "VALIDATION_FAILED",
        field: "source_id",
        message: "source_id 必填",
      });
      continue; // 没有 source_id 其余字段也没法定位错误
    }
    if (seenSourceIds.has(r.source_id)) {
      errors.push({
        record_index: i,
        source_id: r.source_id,
        code: "DUPLICATE_SOURCE_ID",
        field: "source_id",
        message: `批次内 source_id 重复：${r.source_id}`,
      });
    }
    seenSourceIds.add(r.source_id);

    if (!r.title || r.title.trim() === "") {
      errors.push({
        record_index: i,
        source_id: r.source_id,
        code: "VALIDATION_FAILED",
        field: "title",
        message: "商品标题必填",
      });
    }
    if (
      r.compare_at_price !== undefined &&
      r.compare_at_price !== null &&
      !isPositiveDecimal(r.compare_at_price)
    ) {
      errors.push({
        record_index: i,
        source_id: r.source_id,
        code: "VALIDATION_FAILED",
        field: "compare_at_price",
        message: `compare_at_price 无效："${r.compare_at_price}"`,
      });
    }

    // 维度 2：变体完整性（价格非负 + source_id 必填 + 批次内变体 source_id 唯一）
    const variantSourceIds = new Set<string>();
    if (r.variants && r.variants.length > 0) {
      for (let j = 0; j < r.variants.length; j++) {
        const v = r.variants[j];
        if (!v.source_id) {
          errors.push({
            record_index: i,
            source_id: r.source_id,
            code: "VALIDATION_FAILED",
            field: `variants[${j}].source_id`,
            message: `变体 #${j} 缺 source_id`,
          });
        } else if (variantSourceIds.has(v.source_id)) {
          errors.push({
            record_index: i,
            source_id: r.source_id,
            code: "DUPLICATE_SOURCE_ID",
            field: `variants[${j}].source_id`,
            message: `同商品下变体 source_id 重复：${v.source_id}`,
          });
        }
        if (v.source_id) variantSourceIds.add(v.source_id);

        if (!isStrictPositiveDecimal(v.price)) {
          errors.push({
            record_index: i,
            source_id: r.source_id,
            code: "VALIDATION_FAILED",
            field: `variants[${j}].price`,
            message: `变体 #${j} 价格无效："${v.price}"（必须为 > 0 的数字）`,
          });
        }
        if (
          v.compare_at_price !== undefined &&
          v.compare_at_price !== null &&
          !isPositiveDecimal(v.compare_at_price)
        ) {
          errors.push({
            record_index: i,
            source_id: r.source_id,
            code: "VALIDATION_FAILED",
            field: `variants[${j}].compare_at_price`,
            message: `变体 #${j} compare_at_price 无效："${v.compare_at_price}"`,
          });
        }
        // 维度 5：库存非负
        if (
        if (v.cost !== undefined && v.cost !== null && !isPositiveDecimal(v.cost)) {
          errors.push({
            record_index: i,
            source_id: r.source_id,
            code: "VALIDATION_FAILED",
            field: `variants[${j}].cost`,
            message: `变体 #${j} cost 无效："${v.cost}"`,
          });
        }
        if (v.weight !== undefined && v.weight !== null && !isPositiveDecimal(v.weight)) {
          errors.push({
            record_index: i,
            source_id: r.source_id,
            code: "VALIDATION_FAILED",
            field: `variants[${j}].weight`,
            message: `变体 #${j} weight 无效："${v.weight}"`,
          });
        }
        if (
          v.inventory_quantity !== undefined &&
          v.inventory_quantity !== null &&
          (typeof v.inventory_quantity !== "number" || v.inventory_quantity < 0)
        ) {
          errors.push({
            record_index: i,
            source_id: r.source_id,
            code: "VALIDATION_FAILED",
            field: `variants[${j}].inventory_quantity`,
            message: `变体 #${j} 库存无效：${v.inventory_quantity}（必须为 >= 0 的整数）`,
          });
        }
      }
    }

    // 维度 3：图片字段格式（URL 必填）
    if (r.images && r.images.length > 0) {
      for (let k = 0; k < r.images.length; k++) {
        const img = r.images[k];
        if (!img.url || img.url.trim() === "") {
          errors.push({
            record_index: i,
            source_id: r.source_id,
            code: "VALIDATION_FAILED",
            field: `images[${k}].url`,
            message: `图片 #${k} URL 必填`,
          });
        }
      }
    }
  }

  return errors;
}

*/

export function validateProducts(
  envelope: ImportProductsEnvelope,
): ImportRecordError[] {
  const errors: ImportRecordError[] = [];
  const seenSourceIds = new Set<string>();

  for (let i = 0; i < envelope.records.length; i++) {
    const r = envelope.records[i];

    if (!r.source_id) {
      errors.push({
        record_index: i,
        code: "VALIDATION_FAILED",
        field: "source_id",
        message: "source_id is required",
      });
      continue;
    }

    if (seenSourceIds.has(r.source_id)) {
      errors.push({
        record_index: i,
        source_id: r.source_id,
        code: "DUPLICATE_SOURCE_ID",
        field: "source_id",
        message: `Duplicate product source_id in batch: ${r.source_id}`,
      });
    }
    seenSourceIds.add(r.source_id);

    if (!r.title || r.title.trim() === "") {
      errors.push({
        record_index: i,
        source_id: r.source_id,
        code: "VALIDATION_FAILED",
        field: "title",
        message: "Product title is required",
      });
    }

    if (
      r.compare_at_price !== undefined &&
      r.compare_at_price !== null &&
      !isPositiveDecimal(r.compare_at_price)
    ) {
      errors.push({
        record_index: i,
        source_id: r.source_id,
        code: "VALIDATION_FAILED",
        field: "compare_at_price",
        message: `Invalid compare_at_price: ${r.compare_at_price}`,
      });
    }

    const variantSourceIds = new Set<string>();
    for (let j = 0; j < (r.variants ?? []).length; j++) {
      const v = r.variants![j];

      if (!v.source_id) {
        errors.push({
          record_index: i,
          source_id: r.source_id,
          code: "VALIDATION_FAILED",
          field: `variants[${j}].source_id`,
          message: `Variant #${j} source_id is required`,
        });
      } else if (variantSourceIds.has(v.source_id)) {
        errors.push({
          record_index: i,
          source_id: r.source_id,
          code: "DUPLICATE_SOURCE_ID",
          field: `variants[${j}].source_id`,
          message: `Duplicate variant source_id under product: ${v.source_id}`,
        });
      }
      if (v.source_id) variantSourceIds.add(v.source_id);

      if (!isStrictPositiveDecimal(v.price)) {
        errors.push({
          record_index: i,
          source_id: r.source_id,
          code: "VALIDATION_FAILED",
          field: `variants[${j}].price`,
          message: `Invalid variant #${j} price: ${v.price}`,
        });
      }

      if (v.compare_at_price !== undefined && v.compare_at_price !== null && !isPositiveDecimal(v.compare_at_price)) {
        errors.push({
          record_index: i,
          source_id: r.source_id,
          code: "VALIDATION_FAILED",
          field: `variants[${j}].compare_at_price`,
          message: `Invalid variant #${j} compare_at_price: ${v.compare_at_price}`,
        });
      }

      if (v.cost !== undefined && v.cost !== null && !isPositiveDecimal(v.cost)) {
        errors.push({
          record_index: i,
          source_id: r.source_id,
          code: "VALIDATION_FAILED",
          field: `variants[${j}].cost`,
          message: `Invalid variant #${j} cost: ${v.cost}`,
        });
      }

      if (v.weight !== undefined && v.weight !== null && !isPositiveDecimal(v.weight)) {
        errors.push({
          record_index: i,
          source_id: r.source_id,
          code: "VALIDATION_FAILED",
          field: `variants[${j}].weight`,
          message: `Invalid variant #${j} weight: ${v.weight}`,
        });
      }

      if (
        v.inventory_quantity !== undefined &&
        v.inventory_quantity !== null &&
        (typeof v.inventory_quantity !== "number" || !Number.isInteger(v.inventory_quantity) || v.inventory_quantity < 0)
      ) {
        errors.push({
          record_index: i,
          source_id: r.source_id,
          code: "VALIDATION_FAILED",
          field: `variants[${j}].inventory_quantity`,
          message: `Invalid variant #${j} inventory_quantity: ${v.inventory_quantity}`,
        });
      }
    }

    for (let k = 0; k < (r.images ?? []).length; k++) {
      const img = r.images![k];
      if (!img.url || img.url.trim() === "") {
        errors.push({
          record_index: i,
          source_id: r.source_id,
          code: "VALIDATION_FAILED",
          field: `images[${k}].url`,
          message: `Image #${k} URL is required`,
        });
      }
    }

    for (let p = 0; p < (r.legacy_paths ?? []).length; p++) {
      const path = r.legacy_paths![p];
      if (!isValidRedirectPath(path)) {
        errors.push({
          record_index: i,
          source_id: r.source_id,
          code: "VALIDATION_FAILED",
          field: `legacy_paths[${p}]`,
          message: `Invalid legacy path: ${path}`,
        });
      }
    }
  }

  return errors;
}

export function validateCustomers(
  envelope: ImportCustomersEnvelope,
): ImportRecordError[] {
  const errors: ImportRecordError[] = [];
  const seenSourceIds = new Set<string>();
  const seenEmails = new Set<string>();

  for (let i = 0; i < envelope.records.length; i++) {
    const r = envelope.records[i];

    if (!r.source_id) {
      errors.push({
        record_index: i,
        code: "VALIDATION_FAILED",
        field: "source_id",
        message: "source_id 必填",
      });
      continue;
    }
    if (seenSourceIds.has(r.source_id)) {
      errors.push({
        record_index: i,
        source_id: r.source_id,
        code: "DUPLICATE_SOURCE_ID",
        field: "source_id",
        message: `批次内 customer source_id 重复：${r.source_id}`,
      });
    }
    seenSourceIds.add(r.source_id);

    if (!r.email || !EMAIL_REGEX.test(r.email)) {
      errors.push({
        record_index: i,
        source_id: r.source_id,
        code: "VALIDATION_FAILED",
        field: "email",
        message: `客户邮箱无效："${r.email}"`,
      });
    } else {
      const normalized = r.email.toLowerCase();
      if (seenEmails.has(normalized)) {
        errors.push({
          record_index: i,
          source_id: r.source_id,
          code: "VALIDATION_FAILED",
          field: "email",
          message: `批次内邮箱重复：${normalized}`,
        });
      }
      seenEmails.add(normalized);
    }

    // total_spent / orders_count 校验（如有）
    if (r.total_spent !== undefined && r.total_spent !== null && !isPositiveDecimal(r.total_spent)) {
      errors.push({
        record_index: i,
        source_id: r.source_id,
        code: "VALIDATION_FAILED",
        field: "total_spent",
        message: `total_spent 无效："${r.total_spent}"`,
      });
    }
  }

  return errors;
}

export function validateOrders(
  envelope: ImportOrdersEnvelope,
): ImportRecordError[] {
  const errors: ImportRecordError[] = [];
  const seenSourceIds = new Set<string>();

  for (let i = 0; i < envelope.records.length; i++) {
    const r = envelope.records[i];

    if (!r.source_id) {
      errors.push({
        record_index: i,
        code: "VALIDATION_FAILED",
        field: "source_id",
        message: "source_id 必填",
      });
      continue;
    }
    if (seenSourceIds.has(r.source_id)) {
      errors.push({
        record_index: i,
        source_id: r.source_id,
        code: "DUPLICATE_SOURCE_ID",
        field: "source_id",
        message: `批次内 order source_id 重复：${r.source_id}`,
      });
    }
    seenSourceIds.add(r.source_id);

    if (!r.order_number || r.order_number.trim() === "") {
      errors.push({
        record_index: i,
        source_id: r.source_id,
        code: "VALIDATION_FAILED",
        field: "order_number",
        message: "order_number 必填",
      });
    }
    if (!isPositiveDecimal(r.total_price)) {
      errors.push({
        record_index: i,
        source_id: r.source_id,
        code: "VALIDATION_FAILED",
        field: "total_price",
        message: `total_price 无效："${r.total_price}"`,
      });
    }
    if (!isValidDateString(r.created_at)) {
      errors.push({
        record_index: i,
        source_id: r.source_id,
        code: "VALIDATION_FAILED",
        field: "created_at",
        message: `created_at 无效："${r.created_at}"`,
      });
    }
    if (!r.line_items || r.line_items.length === 0) {
      errors.push({
        record_index: i,
        source_id: r.source_id,
        code: "VALIDATION_FAILED",
        field: "line_items",
        message: "订单必须至少包含 1 个 line item",
      });
    } else {
      for (let j = 0; j < r.line_items.length; j++) {
        const li = r.line_items[j];
        if (!li.product_source_id) {
          errors.push({
            record_index: i,
            source_id: r.source_id,
            code: "MISSING_REFERENCE",
            field: `line_items[${j}].product_source_id`,
            message: `line item #${j} 缺 product_source_id`,
          });
        }
        if (!li.quantity || li.quantity <= 0) {
          errors.push({
            record_index: i,
            source_id: r.source_id,
            code: "VALIDATION_FAILED",
            field: `line_items[${j}].quantity`,
            message: `line item #${j} 数量无效：${li.quantity}`,
          });
        }
        if (!isPositiveDecimal(li.price)) {
          errors.push({
            record_index: i,
            source_id: r.source_id,
            code: "VALIDATION_FAILED",
            field: `line_items[${j}].price`,
            message: `line item #${j} 价格无效："${li.price}"`,
          });
        }
      }
    }

    // TODO P2c：维度 4 + 6 跨表引用完整性
    //   - customer_source_id 在 external_source_mappings 找得到（除非 customer_link_strategy 是 auto_create_user）
    //   - line_items[].product_source_id / variant_source_id 在 external_source_mappings 找得到
    //   这两项需要 DB 查询，要么在 validator 里加 db 参数，要么挪到 order-receiver 里做
  }

  return errors;
}

export async function validateOrdersWithReferences(
  envelope: ImportOrdersEnvelope,
  options: { customer_link_strategy?: CustomerLinkStrategy } = {},
): Promise<ImportRecordError[]> {
  const errors = validateOrders(envelope);
  const invalidIndices = new Set<number>();
  for (const e of errors) {
    if (
      e.code === "VALIDATION_FAILED" ||
      e.code === "DUPLICATE_SOURCE_ID" ||
      e.code === "MISSING_REFERENCE"
    ) {
      invalidIndices.add(e.record_index);
    }
  }

  const productSourceIds = new Set<string>();
  const variantSourceIds = new Set<string>();
  const customerSourceIds = new Set<string>();
  for (let i = 0; i < envelope.records.length; i++) {
    if (invalidIndices.has(i)) continue;
    const record = envelope.records[i];
    if (record.customer_source_id) customerSourceIds.add(record.customer_source_id);
    for (const item of record.line_items) {
      if (item.product_source_id) productSourceIds.add(item.product_source_id);
      if (item.variant_source_id) variantSourceIds.add(item.variant_source_id);
    }
  }

  const [productMappings, variantMappings, customerMappings] = await Promise.all([
    bulkFindMappings(envelope.source, envelope.source_store, "product", [...productSourceIds]),
    bulkFindMappings(envelope.source, envelope.source_store, "variant", [...variantSourceIds]),
    bulkFindMappings(envelope.source, envelope.source_store, "customer", [...customerSourceIds]),
  ]);

  const strategy = options.customer_link_strategy ?? "auto_create_user";
  for (let i = 0; i < envelope.records.length; i++) {
    if (invalidIndices.has(i)) continue;
    const record = envelope.records[i];

    if (record.customer_source_id && !customerMappings.has(record.customer_source_id)) {
      if (strategy === "skip_unmatched" || (strategy === "auto_create_user" && !record.email)) {
        errors.push({
          record_index: i,
          source_id: record.source_id,
          code: "MISSING_REFERENCE",
          field: "customer_source_id",
          message: `customer ${record.customer_source_id} 尚未导入`,
        });
      }
    } else if (!record.customer_source_id) {
      if (strategy === "skip_unmatched" || (strategy === "auto_create_user" && !record.email)) {
        errors.push({
          record_index: i,
          source_id: record.source_id,
          code: "MISSING_REFERENCE",
          field: "customer_source_id",
          message: "订单缺客户映射，且当前 customer_link_strategy 无法自动兜底",
        });
      }
    }

    for (let j = 0; j < record.line_items.length; j++) {
      const item = record.line_items[j];
      if (item.product_source_id && !productMappings.has(item.product_source_id)) {
        errors.push({
          record_index: i,
          source_id: record.source_id,
          code: "MISSING_REFERENCE",
          field: `line_items[${j}].product_source_id`,
          message: `商品 ${item.product_source_id} 尚未导入`,
        });
      }
      if (item.variant_source_id && !variantMappings.has(item.variant_source_id)) {
        errors.push({
          record_index: i,
          source_id: record.source_id,
          code: "MISSING_REFERENCE",
          field: `line_items[${j}].variant_source_id`,
          message: `变体 ${item.variant_source_id} 尚未导入`,
        });
      }
    }
  }

  return errors;
}

export function validateDiscounts(
  envelope: ImportDiscountsEnvelope,
): ImportRecordError[] {
  const errors: ImportRecordError[] = [];
  const seenSourceIds = new Set<string>();
  const seenCodes = new Set<string>();

  for (let i = 0; i < envelope.records.length; i++) {
    const r = envelope.records[i];
    if (!r.source_id) {
      errors.push({
        record_index: i,
        code: "VALIDATION_FAILED",
        field: "source_id",
        message: "source_id is required",
      });
    } else if (seenSourceIds.has(r.source_id)) {
      errors.push({
        record_index: i,
        source_id: r.source_id,
        code: "DUPLICATE_SOURCE_ID",
        field: "source_id",
        message: `Duplicate discount source_id in batch: ${r.source_id}`,
      });
    }
    if (r.source_id) seenSourceIds.add(r.source_id);

    const code = typeof r.code === "string" ? r.code.trim().toUpperCase() : "";
    if (!code) {
      errors.push({
        record_index: i,
        source_id: r.source_id,
        code: "VALIDATION_FAILED",
        field: "code",
        message: "Discount code is required",
      });
    } else if (code.length > 50) {
      errors.push({
        record_index: i,
        source_id: r.source_id,
        code: "VALIDATION_FAILED",
        field: "code",
        message: "Discount code must be 50 characters or shorter",
      });
    } else if (seenCodes.has(code)) {
      errors.push({
        record_index: i,
        source_id: r.source_id,
        code: "DUPLICATE_SOURCE_ID",
        field: "code",
        message: `Duplicate discount code in batch: ${code}`,
      });
    }
    if (code) seenCodes.add(code);

    if (!isValidDiscountType(r.type)) {
      errors.push({
        record_index: i,
        source_id: r.source_id,
        code: "VALIDATION_FAILED",
        field: "type",
        message: `Unsupported discount type: ${r.type}`,
      });
    }

    if (!isNonZeroDecimal(r.value)) {
      errors.push({
        record_index: i,
        source_id: r.source_id,
        code: "VALIDATION_FAILED",
        field: "value",
        message: `Invalid discount value: ${r.value}`,
      });
    }

    if (r.min_order_amount !== undefined && r.min_order_amount !== null && !isPositiveDecimal(r.min_order_amount)) {
      errors.push({
        record_index: i,
        source_id: r.source_id,
        code: "VALIDATION_FAILED",
        field: "min_order_amount",
        message: `Invalid min_order_amount: ${r.min_order_amount}`,
      });
    }

    if (r.max_discount !== undefined && r.max_discount !== null && !isPositiveDecimal(r.max_discount)) {
      errors.push({
        record_index: i,
        source_id: r.source_id,
        code: "VALIDATION_FAILED",
        field: "max_discount",
        message: `Invalid max_discount: ${r.max_discount}`,
      });
    }

    if (r.usage_limit !== undefined && r.usage_limit !== null && (!Number.isInteger(r.usage_limit) || r.usage_limit < 0)) {
      errors.push({
        record_index: i,
        source_id: r.source_id,
        code: "VALIDATION_FAILED",
        field: "usage_limit",
        message: `Invalid usage_limit: ${r.usage_limit}`,
      });
    }

    if (r.used_count !== undefined && r.used_count !== null && (!Number.isInteger(r.used_count) || r.used_count < 0)) {
      errors.push({
        record_index: i,
        source_id: r.source_id,
        code: "VALIDATION_FAILED",
        field: "used_count",
        message: `Invalid used_count: ${r.used_count}`,
      });
    }

    if (!isValidDateString(r.starts_at)) {
      errors.push({
        record_index: i,
        source_id: r.source_id,
        code: "VALIDATION_FAILED",
        field: "starts_at",
        message: `Invalid starts_at: ${r.starts_at}`,
      });
    }

    if (!isValidDateString(r.expires_at)) {
      errors.push({
        record_index: i,
        source_id: r.source_id,
        code: "VALIDATION_FAILED",
        field: "expires_at",
        message: `Invalid expires_at: ${r.expires_at}`,
      });
    }

    if (
      r.starts_at &&
      r.expires_at &&
      isValidDateString(r.starts_at) &&
      isValidDateString(r.expires_at) &&
      new Date(r.starts_at).getTime() > new Date(r.expires_at).getTime()
    ) {
      errors.push({
        record_index: i,
        source_id: r.source_id,
        code: "VALIDATION_FAILED",
        field: "expires_at",
        message: "expires_at must be after starts_at",
      });
    }
  }

  return errors;
}

function isValidRedirectPath(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      return Boolean(url.pathname);
    } catch {
      return false;
    }
  }
  return trimmed.startsWith("/") || /^[a-z0-9][a-z0-9/_-]*$/i.test(trimmed);
}

export function validateRedirects(
  envelope: ImportRedirectsEnvelope,
): ImportRecordError[] {
  const errors: ImportRecordError[] = [];
  const seenSourceIds = new Set<string>();
  const seenOldPaths = new Set<string>();

  for (let i = 0; i < envelope.records.length; i++) {
    const r = envelope.records[i];
    if (!r.source_id) {
      errors.push({
        record_index: i,
        code: "VALIDATION_FAILED",
        field: "source_id",
        message: "source_id 必填",
      });
    } else if (seenSourceIds.has(r.source_id)) {
      errors.push({
        record_index: i,
        source_id: r.source_id,
        code: "DUPLICATE_SOURCE_ID",
        field: "source_id",
        message: `批次内 redirect source_id 重复：${r.source_id}`,
      });
    }
    if (r.source_id) seenSourceIds.add(r.source_id);

    if (!isValidRedirectPath(r.old_path)) {
      errors.push({
        record_index: i,
        source_id: r.source_id,
        code: "VALIDATION_FAILED",
        field: "old_path",
        message: `old_path 无效："${r.old_path}"`,
      });
    }
    if (!isValidRedirectPath(r.new_path)) {
      errors.push({
        record_index: i,
        source_id: r.source_id,
        code: "VALIDATION_FAILED",
        field: "new_path",
        message: `new_path 无效："${r.new_path}"`,
      });
    }
    if (r.old_path && r.new_path && r.old_path.trim() === r.new_path.trim()) {
      errors.push({
        record_index: i,
        source_id: r.source_id,
        code: "VALIDATION_FAILED",
        field: "new_path",
        message: "old_path 和 new_path 不能相同",
      });
    }

    const normalizedOld = typeof r.old_path === "string" ? r.old_path.trim().toLowerCase() : "";
    if (normalizedOld && seenOldPaths.has(normalizedOld)) {
      errors.push({
        record_index: i,
        source_id: r.source_id,
        code: "DUPLICATE_SOURCE_ID",
        field: "old_path",
        message: `批次内 old_path 重复：${r.old_path}`,
      });
    }
    if (normalizedOld) seenOldPaths.add(normalizedOld);
  }

  return errors;
}
