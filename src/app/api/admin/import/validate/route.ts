/**
 * POST /api/admin/import/validate?type=products|customers|orders|discounts|redirects
 *
 * Dry-run validation endpoint. It does not create import_jobs or write business
 * records; it only returns field-level errors for the sender UI.
 */
import { NextResponse } from "next/server";
import {
  requireStaffRole,
  errorResponse,
} from "@/services/auth/auth-middleware";
import { toCsv } from "@/lib/csv";
import { ValidationError } from "@/lib/errors";
import {
  validateProducts,
  validateCustomers,
  validateDiscounts,
  validateOrders,
  validateOrdersWithReferences,
  validateRedirects,
} from "@/services/import/validator";
import type {
  CustomerLinkStrategy,
  ImportBatchResult,
  ImportCustomersEnvelope,
  ImportDiscountsEnvelope,
  ImportOrdersEnvelope,
  ImportProductsEnvelope,
  ImportRecordError,
  ImportRedirectsEnvelope,
} from "@/types/import-contract";

const ALLOWED_TYPES = ["products", "customers", "orders", "discounts", "redirects"] as const;

export async function POST(request: Request) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);

    const url = new URL(request.url);
    const type = url.searchParams.get("type");
    const format = url.searchParams.get("format");
    const checkReferences = url.searchParams.get("check_references") === "true";
    const customerLinkStrategy =
      (url.searchParams.get("customer_link_strategy") as CustomerLinkStrategy | null) ??
      "auto_create_user";
    if (!type || !ALLOWED_TYPES.includes(type as (typeof ALLOWED_TYPES)[number])) {
      throw new ValidationError("?type must be products / customers / orders / discounts / redirects");
    }

    const body = await request.json();
    let errors: ImportRecordError[];
    let total: number;
    switch (type) {
      case "products": {
        const env = body as ImportProductsEnvelope;
        errors = validateProducts(env);
        total = env.records?.length ?? 0;
        break;
      }
      case "customers": {
        const env = body as ImportCustomersEnvelope;
        errors = validateCustomers(env);
        total = env.records?.length ?? 0;
        break;
      }
      case "orders": {
        const env = body as ImportOrdersEnvelope;
        errors = checkReferences
          ? await validateOrdersWithReferences(env, {
              customer_link_strategy: customerLinkStrategy,
            })
          : validateOrders(env);
        total = env.records?.length ?? 0;
        break;
      }
      case "discounts": {
        const env = body as ImportDiscountsEnvelope;
        errors = validateDiscounts(env);
        total = env.records?.length ?? 0;
        break;
      }
      case "redirects": {
        const env = body as ImportRedirectsEnvelope;
        errors = validateRedirects(env);
        total = env.records?.length ?? 0;
        break;
      }
      default:
        throw new ValidationError(`unsupported type: ${type}`);
    }

    const failed = new Set(errors.map((e) => e.record_index)).size;
    const result: ImportBatchResult = {
      ok: errors.length === 0,
      job_type: type as ImportBatchResult["job_type"],
      total,
      success: total - failed,
      failed,
      errors,
    };
    if (format === "csv") {
      const rows: unknown[][] = [
        ["job_type", "record_index", "row_number", "source_id", "code", "field", "message"],
        ...errors.map((error) => [
          type,
          error.record_index,
          error.record_index + 1,
          error.source_id ?? "",
          error.code,
          error.field ?? "",
          error.message,
        ]),
      ];
      return new NextResponse(`\uFEFF${toCsv(rows)}`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="import-${type}-validation-errors.csv"`,
          "X-Import-Validation-Ok": String(result.ok),
          "X-Import-Validation-Total": String(result.total),
          "X-Import-Validation-Failed": String(result.failed),
        },
      });
    }
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
