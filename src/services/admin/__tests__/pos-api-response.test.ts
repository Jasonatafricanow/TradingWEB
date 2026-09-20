import { describe, expect, it } from "vitest";

import { posApiErrorResponse } from "../pos-api-response";
import { PosApiError } from "../pos-errors";

describe("POS API error responses", () => {
  it("does not expose an unexpected server error message", async () => {
    const response = posApiErrorResponse(new Error("SQL password leaked in driver message"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error",
        retryable: true,
        details: null,
      },
    });
  });

  it("preserves explicitly typed POS errors", async () => {
    const response = posApiErrorResponse(new PosApiError("STORE_INACTIVE", "Store is not active", 409));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "STORE_INACTIVE", message: "Store is not active" },
    });
  });
});
