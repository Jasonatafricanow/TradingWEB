export interface PosApiErrorBody {
  error: {
    code: string;
    message: string;
    retryable: boolean;
    details: unknown;
  };
}

export class PosApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly retryable = false,
    public readonly details: unknown = null,
  ) {
    super(message);
    this.name = "PosApiError";
  }

  toJSON(): PosApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        retryable: this.retryable,
        details: this.details,
      },
    };
  }
}
