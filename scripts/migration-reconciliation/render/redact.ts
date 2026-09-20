const secretAssignment =
  /\b(?:DB_PASSWORD|DATABASE_URL|MYSQL_PWD|PASSWORD|SECRET|TOKEN)\b\s*[:=]\s*[^\s,;"'}]+/gi;

function redactString(value: string): string {
  return value.replace(secretAssignment, "[REDACTED]");
}

export function redactAuditValue(value: unknown): unknown {
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map(redactAuditValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        /password|secret|token/i.test(key)
          ? "[REDACTED]"
          : redactAuditValue(item),
      ]),
    );
  }
  return value;
}
