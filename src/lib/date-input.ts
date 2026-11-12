/** Parses an optional ISO date/time from a request body: undefined = not given, null = cleared. */
export function optionalDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new RangeError("INVALID_DATE");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError("INVALID_DATE");
  return date;
}

/** Throws when both ends are set and the window is empty. */
export function assertWindow(start: Date | null | undefined, end: Date | null | undefined): void {
  if (start && end && end <= start) throw new RangeError("INVALID_WINDOW");
}
