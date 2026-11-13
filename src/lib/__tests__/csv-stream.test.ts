import { describe, expect, it, vi } from "vitest";

import { csvStream } from "@/lib/csv";

const read = (stream: ReadableStream<Uint8Array>) => new Response(stream).text();

describe("csvStream", () => {
  it("pages until a short page and never loads everything at once", async () => {
    const data = Array.from({ length: 5 }, (_, i) => [`row${i}`, i]);
    const fetchPage = vi.fn(async (offset: number, limit: number) => data.slice(offset, offset + limit));
    const text = await read(csvStream(["Name", "N"], fetchPage, { pageSize: 2 }));
    expect(text.split("\n")).toEqual(["Name,N", "row0,0", "row1,1", "row2,2", "row3,3", "row4,4"]);
    expect(fetchPage.mock.calls.map(([offset, limit]) => [offset, limit])).toEqual([[0, 2], [2, 2], [4, 2]]);
  });

  it("neutralises formulas and keeps an exact multiple of the page size complete", async () => {
    const pages = [[["=HYPERLINK(1)", "-5"], ["ok", "x,y"]], []];
    const text = await read(csvStream(["A", "B"], async () => pages.shift() ?? [], { pageSize: 2 }));
    expect(text).toBe("A,B\n'=HYPERLINK(1),-5\nok,\"x,y\"");
  });

  it("errors the stream when a page query fails", async () => {
    const stream = csvStream(["A"], async () => { throw new Error("db down"); });
    await expect(read(stream)).rejects.toThrow();
  });
});
