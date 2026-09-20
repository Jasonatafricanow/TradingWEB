export function escapeCsvField(value: unknown): string {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((row) => row.map(escapeCsvField).join(",")).join("\n");
}
