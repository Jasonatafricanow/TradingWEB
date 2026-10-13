// Cells starting with these are evaluated as formulas by Excel / Sheets.
const FORMULA_TRIGGER = /^[=+\-@\t\r]/
const PLAIN_NUMBER = /^[+-]?\d+(\.\d+)?$/

export function escapeCsvField(value: unknown): string {
  let str = String(value ?? "");
  // Customer- or import-controlled text (names, titles) must not run as a
  // formula when staff open the export; plain numbers like -5 stay intact.
  if (FORMULA_TRIGGER.test(str) && !PLAIN_NUMBER.test(str)) {
    str = "'" + str;
  }
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((row) => row.map(escapeCsvField).join(",")).join("\n");
}
