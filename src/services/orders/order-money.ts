export class MoneyFormatError extends Error {
  constructor(public readonly code: "INVALID_MONEY" | "INVALID_CENTS") {
    super(code);
    this.name = "MoneyFormatError";
  }
}

export function parseMoneyToCents(value: string): number {
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(value)) {
    throw new MoneyFormatError("INVALID_MONEY");
  }

  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction = ""] = unsigned.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) {
    throw new MoneyFormatError("INVALID_MONEY");
  }
  return negative ? -cents : cents;
}

export function formatCents(value: number): string {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyFormatError("INVALID_CENTS");
  }
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}
