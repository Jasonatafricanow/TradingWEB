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

export const CSV_EXPORT_PAGE_SIZE = 500

/**
 * Streams a CSV in pages so a large export never holds every row (or one
 * query per row) in memory. `fetchPage(offset, limit)` returns already
 * mapped rows; an empty or short page ends the stream.
 */
export function csvStream(
  header: unknown[],
  fetchPage: (offset: number, limit: number) => Promise<unknown[][]>,
  options: { pageSize?: number; bom?: boolean } = {},
): ReadableStream<Uint8Array> {
  const pageSize = options.pageSize ?? CSV_EXPORT_PAGE_SIZE
  const encoder = new TextEncoder()
  let offset = 0
  let started = false
  let done = false
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!started) {
        started = true
        controller.enqueue(encoder.encode((options.bom ? "\uFEFF" : "") + header.map(escapeCsvField).join(",")))
        return
      }
      if (done) {
        controller.close()
        return
      }
      try {
        const rows = await fetchPage(offset, pageSize)
        offset += rows.length
        if (rows.length < pageSize) done = true
        if (rows.length > 0) controller.enqueue(encoder.encode("\n" + toCsv(rows)))
        if (done) controller.close()
      } catch (error) {
        controller.error(error)
      }
    },
  })
}
