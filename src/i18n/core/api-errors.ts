export const API_ERROR_CONTRACT_VERSION = 1 as const;

export const API_ERROR_CODES = [
  "UNEXPECTED_ERROR",
  "INVALID_REQUEST",
  "AUTH_REQUIRED",
  "FORBIDDEN",
  "OPERATOR_SESSION_EXPIRED",
  "OPERATOR_MISMATCH",
  "PRICING_CHANGED",
  "INSUFFICIENT_INVENTORY",
  "IDEMPOTENCY_KEY_REUSED",
  "CHECKOUT_IDEMPOTENCY_REQUIRED",
  "PRODUCT_NOT_FOUND",
  "VARIANT_NOT_FOUND",
  "PAYMENT_REQUIRED",
  "PAYMENT_TOTAL_MISMATCH",
  "ORDER_DISCOUNT_INVALID",
  "LINE_INVALID",
  "FULFILLMENT_MIXED",
  "APPROVAL_REQUIRED",
  "AUTHENTICATION_REQUIRED",
  "INVALID_JSON",
  "INTERNAL_ERROR",
  "STORE_ID_REQUIRED",
  "SESSION_INPUT_INVALID",
  "DEVICE_ID_INVALID",
  "DEVICE_ID_REQUIRED",
  "STAFF_NOT_FOUND",
  "STAFF_INACTIVE",
  "POS_DISABLED",
  "STORE_MISMATCH",
  "PIN_NOT_CONFIGURED",
  "PIN_LOCKED",
  "PIN_INVALID",
  "OPERATOR_SESSION_REQUIRED",
  "OPERATOR_SESSION_INVALID",
  "OPERATOR_ACCOUNT_MISMATCH",
  "OPERATOR_DEVICE_MISMATCH",
  "OPERATOR_STORE_MISMATCH",
  "CHECKOUT_REQUEST_INVALID",
  "CHECKOUT_PERMISSION_REQUIRED",
  "STORE_NOT_FOUND",
  "STORE_INACTIVE",
  "CURRENCY_MISMATCH",
  "PRICING_VERSION_CHANGED",
  "PAYMENT_METHOD_NOT_ALLOWED",
  "AUDIT_BATCH_REQUEST_INVALID",
  "AUDIT_UUID_CONFLICT",
  "LOCATION_PURPOSE_INVALID",
  "LOCATION_STORE_MISMATCH",
  "SHIFT_REQUEST_INVALID",
  "SHIFT_ALREADY_OPEN",
  "SHIFT_NOT_FOUND",
  "SHIFT_STORE_MISMATCH",
  "SHIFT_CLOSE_REQUEST_INVALID",
  "SHIFT_CLOSED",
  "CASH_MOVEMENT_REQUEST_INVALID",
  "CASH_KIND_INVALID",
  "CASH_REASON_INVALID",
  "TELEMETRY_REQUEST_INVALID",
  "TELEMETRY_STORE_REQUIRED",
  "ORDER_ID_INVALID",
  "ORDER_NOT_FOUND",
  "ORDER_STORE_MISMATCH",
  "ORDER_ITEM_NOT_FOUND",
  "FULFILLMENT_REQUEST_INVALID",
  "IDEMPOTENCY_KEY_INVALID",
  "MONEY_INVALID",
  "POS_ORDER_REQUIRED",
  "POS_PERMISSION_REQUIRED",
  "APPROVAL_INVALID_OR_CONSUMED",
  "DIFFERENCE_PAYMENT_MISMATCH",
  "PRODUCT_VARIANT_MISMATCH",
  "REFUND_TOTAL_EXCEEDED",
  "RETURN_QUANTITY_EXCEEDED",
  "STORE_LOCATION_REQUIRED",
  "STORE_UNAVAILABLE",
  "INVENTORY_CREATE_CONFLICT",
  "INVENTORY_SCOPE_MISMATCH",
  "TRANSFER_ACK_INVALID",
  "TRANSFER_DESTINATION_NOT_FOUND",
  "TRANSFER_NOT_FOUND",
  "TRANSFER_STATE_CONFLICT",
  "PURCHASE_ORDER_ALREADY_RECEIVED",
  "PURCHASE_ORDER_EMPTY",
  "PURCHASE_ORDER_NOT_FOUND",
  "PURCHASE_ORDER_NOT_RECEIVABLE",
  "PURCHASE_ORDER_SCOPE_MISMATCH",
  "PARTIAL_RECEIPT_UNSUPPORTED",
  "REFUND_REQUEST_INVALID",
  "EXCHANGE_REQUEST_INVALID",
  "INVENTORY_ADJUSTMENT_REQUEST_INVALID",
  "PURCHASE_ORDER_REQUEST_INVALID",
  "PURCHASE_ORDER_RECEIVE_REQUEST_INVALID",
  "INVENTORY_TRANSFER_REQUEST_INVALID",
  "FULFILLMENT_FORBIDDEN",
  "REPORT_QUERY_INVALID",
  "REFUND_PERMISSION_REQUIRED",
  "EXCHANGE_PERMISSION_REQUIRED",
  "APPROVAL_OPERATION_INVALID",
  "APPROVAL_RESOURCE_HASH_INVALID",
  "APPROVER_NOT_FOUND",
  "APPROVER_INACTIVE",
  "APPROVER_ROLE_REQUIRED",
  "APPROVER_STORE_MISMATCH",
  "ORDER_QUERY_INVALID",
  "ORDER_READ_FORBIDDEN",
  "PICKUP_STATE_INVALID",
  "ORDER_NOT_PICKUP",
  "PICKUP_TRANSITION_INVALID",
  "REPORT_FORBIDDEN",
  "REPORT_STORE_MISMATCH",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];
export type ApiErrorParamValue = string | number | boolean;

const codeSet = new Set<string>(API_ERROR_CODES);

const SAFE_PARAMS: Partial<Record<ApiErrorCode, ReadonlySet<string>>> = {
  UNEXPECTED_ERROR: new Set(),
  INVALID_REQUEST: new Set(["field"]),
  AUTH_REQUIRED: new Set(),
  FORBIDDEN: new Set(),
  OPERATOR_SESSION_EXPIRED: new Set(),
  OPERATOR_MISMATCH: new Set(),
  PRICING_CHANGED: new Set(["authoritative_total", "currency"]),
  INSUFFICIENT_INVENTORY: new Set(["available", "requested", "sku"]),
  IDEMPOTENCY_KEY_REUSED: new Set(),
  CHECKOUT_IDEMPOTENCY_REQUIRED: new Set(),
  PRODUCT_NOT_FOUND: new Set(["product_id"]),
  VARIANT_NOT_FOUND: new Set(["variant_id", "sku"]),
  PAYMENT_REQUIRED: new Set(),
  PAYMENT_TOTAL_MISMATCH: new Set(["order_total", "payment_total", "currency"]),
  ORDER_DISCOUNT_INVALID: new Set(),
  LINE_INVALID: new Set(["line"]),
  FULFILLMENT_MIXED: new Set(),
  APPROVAL_REQUIRED: new Set(["operation"]),
};

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    params: Record<string, ApiErrorParamValue>;
    request_id?: string;
    retryable: boolean;
  };
}

export interface CreateApiErrorInput {
  code: ApiErrorCode;
  status: number;
  params?: Readonly<Record<string, unknown>>;
  requestId?: string;
  retryable?: boolean;
}

export type ParsedApiError =
  | {
      kind: "coded";
      code: ApiErrorCode;
      params: Record<string, ApiErrorParamValue>;
      requestId: string | undefined;
      retryable: boolean;
    }
  | {
      kind: "legacy";
      message: string;
      retryable: false;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeParamValue(value: unknown): value is ApiErrorParamValue {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function sanitizeParams(
  code: ApiErrorCode,
  params: unknown,
): Record<string, ApiErrorParamValue> {
  if (!isRecord(params)) return {};

  const allowed = SAFE_PARAMS[code] ?? new Set<string>();
  return Object.entries(params).reduce<Record<string, ApiErrorParamValue>>(
    (safe, [key, value]) => {
      if (allowed.has(key) && isSafeParamValue(value)) {
        safe[key] = value;
      }
      return safe;
    },
    {},
  );
}

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === "string" && codeSet.has(value);
}

export function createApiError(input: CreateApiErrorInput): ApiErrorBody {
  return {
    error: {
      code: input.code,
      params: sanitizeParams(input.code, input.params),
      request_id: input.requestId,
      retryable: input.retryable === true && isRetryableHttpStatus(input.status),
    },
  };
}

function unexpectedError(): ParsedApiError {
  return {
    kind: "coded",
    code: "UNEXPECTED_ERROR",
    params: {},
    requestId: undefined,
    retryable: false,
  };
}

function isRetryableHttpStatus(status: number | undefined): boolean {
  return status !== undefined && status >= 500;
}

export function parseApiErrorResponse(
  value: unknown,
  status?: number,
): ParsedApiError {
  if (!isRecord(value)) return unexpectedError();

  const rawError = value.error;
  if (typeof rawError === "string") {
    return {
      kind: "legacy",
      message: rawError,
      retryable: false,
    };
  }
  if (!isRecord(rawError) || !isApiErrorCode(rawError.code)) {
    return unexpectedError();
  }

  return {
    kind: "coded",
    code: rawError.code,
    params: sanitizeParams(rawError.code, rawError.params),
    requestId:
      typeof rawError.request_id === "string" ? rawError.request_id : undefined,
    retryable: rawError.retryable === true && isRetryableHttpStatus(status),
  };
}
