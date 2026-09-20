import { NextResponse } from "next/server";

import { PosApiError } from "./pos-errors";

export async function parsePosJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new PosApiError("INVALID_JSON", "Request body must be a JSON object", 400);
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof PosApiError) throw error;
    throw new PosApiError("INVALID_JSON", "Request body is not valid JSON", 400);
  }
}

export function posApiErrorResponse(error: unknown): NextResponse {
  if (error instanceof PosApiError) {
    return NextResponse.json(error.toJSON(), { status: error.status });
  }
  const candidate = error as { code?: unknown; status?: unknown; message?: unknown };
  const status = typeof candidate.status === "number" ? candidate.status : 500;
  const code = typeof candidate.code === "string"
    ? candidate.code
    : status === 401
      ? "AUTHENTICATION_REQUIRED"
      : status === 403
        ? "FORBIDDEN"
        : status === 400
          ? "INVALID_REQUEST"
          : status === 409
            ? "CONFLICT"
            : "INTERNAL_ERROR";
  const message = status >= 500
    ? "Internal server error"
    : typeof candidate.message === "string" && candidate.message !== code
      ? candidate.message
      : code;
  return NextResponse.json({
    error: {
      code,
      message,
      retryable: status >= 500,
      details: null,
    },
  }, { status });
}
