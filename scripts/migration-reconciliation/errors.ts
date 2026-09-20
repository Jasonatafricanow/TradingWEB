export type OperationalErrorCode =
  | "CONFIGURATION_ERROR"
  | "CONNECTION_ERROR"
  | "QUERY_ERROR"
  | "PARSE_ERROR"
  | "ARTIFACT_WRITE_ERROR";

export class MigrationReconciliationError extends Error {
  readonly code: OperationalErrorCode;

  constructor(code: OperationalErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "MigrationReconciliationError";
    this.code = code;
  }
}

export function redactSecrets(
  message: string,
  secrets: ReadonlyArray<string | undefined>,
): string {
  let redacted = message;
  for (const secret of secrets) {
    if (secret) {
      redacted = redacted.split(secret).join("[REDACTED]");
    }
  }
  return redacted;
}
