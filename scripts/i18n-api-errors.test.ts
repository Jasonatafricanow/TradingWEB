import { describe, expect, it } from "vitest";

import {
  API_ERROR_CODES,
  API_ERROR_CONTRACT_VERSION,
  createApiError,
  parseApiErrorResponse,
} from "@/i18n/core/api-errors";

describe("versioned API error contract", () => {
  it("covers the active POS request, fulfillment, and reporting codes", () => {
    expect(API_ERROR_CODES).toEqual(expect.arrayContaining([
      "REFUND_REQUEST_INVALID",
      "EXCHANGE_REQUEST_INVALID",
      "INVENTORY_ADJUSTMENT_REQUEST_INVALID",
      "PURCHASE_ORDER_REQUEST_INVALID",
      "INVENTORY_TRANSFER_REQUEST_INVALID",
      "FULFILLMENT_FORBIDDEN",
      "REPORT_QUERY_INVALID",
      "APPROVER_NOT_FOUND",
      "APPROVER_STORE_MISMATCH",
      "ORDER_QUERY_INVALID",
      "PICKUP_TRANSITION_INVALID",
      "REPORT_FORBIDDEN",
    ]));
  });

  it("creates a stable coded envelope and keeps only allow-listed safe params", () => {
    const result = createApiError({
      code: "PRICING_CHANGED",
      status: 409,
      params: {
        authoritative_total: "18.00",
        currency: "USD",
        session_token: "must-not-leak",
      },
      requestId: "req-42",
      retryable: false,
    });

    expect(API_ERROR_CONTRACT_VERSION).toBe(1);
    expect(result).toEqual({
      error: {
        code: "PRICING_CHANGED",
        params: {
          authoritative_total: "18.00",
          currency: "USD",
        },
        request_id: "req-42",
        retryable: false,
      },
    });
  });

  it("prefers a coded error over compatibility message fields", () => {
    expect(
      parseApiErrorResponse({
        error: {
          code: "OPERATOR_SESSION_EXPIRED",
          params: {},
          request_id: "req-expired",
          retryable: false,
          message: "legacy text must not drive behavior",
        },
      }, 401),
    ).toEqual({
      kind: "coded",
      code: "OPERATOR_SESSION_EXPIRED",
      params: {},
      requestId: "req-expired",
      retryable: false,
    });
  });

  it("keeps HTTP status authoritative over an untrusted retryable flag", () => {
    const body = {
      error: {
        code: "FORBIDDEN",
        params: {},
        retryable: true,
      },
    };

    expect(parseApiErrorResponse(body, 403)).toMatchObject({ retryable: false });
    expect(parseApiErrorResponse(body, 500)).toMatchObject({ retryable: true });
    expect(parseApiErrorResponse(body, 503)).toMatchObject({ retryable: true });
    expect(createApiError({
      code: "AUTH_REQUIRED",
      status: 401,
      retryable: true,
    }).error.retryable).toBe(false);
  });

  it("accepts legacy free text only as non-retryable compatibility data", () => {
    expect(parseApiErrorResponse({ error: "gateway timeout, retry now" })).toEqual({
      kind: "legacy",
      message: "gateway timeout, retry now",
      retryable: false,
    });
  });

  it("maps malformed or unknown exceptions to a safe unexpected error", () => {
    expect(parseApiErrorResponse({ error: { code: "SQL_CONNECTION_FAILED" } })).toEqual({
      kind: "coded",
      code: "UNEXPECTED_ERROR",
      params: {},
      requestId: undefined,
      retryable: false,
    });
    expect(parseApiErrorResponse(new Error("password=secret"))).toEqual({
      kind: "coded",
      code: "UNEXPECTED_ERROR",
      params: {},
      requestId: undefined,
      retryable: false,
    });
  });
});
