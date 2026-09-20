import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  ManifestId,
  MigrationManifestEntry,
} from "./types";

interface ExpectedEntry {
  id: ManifestId;
  idx: number;
  tag: string;
  when: number;
  role: MigrationManifestEntry["role"];
}

const expectedEntries: readonly ExpectedEntry[] = [
  {
    id: "0025",
    idx: 24,
    tag: "0025_repair_health_check",
    when: 1782950400000,
    role: "predecessor-anchor",
  },
  {
    id: "0026",
    idx: 25,
    tag: "0026_pos_idempotency",
    when: 1783968842846,
    role: "repair-target",
  },
  {
    id: "0027",
    idx: 26,
    tag: "0027_order_payments",
    when: 1784073600000,
    role: "repair-target",
  },
  {
    id: "0028",
    idx: 27,
    tag: "0028_pos_operator_sessions",
    when: 1784160000000,
    role: "repair-target",
  },
  {
    id: "0029",
    idx: 28,
    tag: "0029_pos_exchanges",
    when: 1784246400000,
    role: "repair-target",
  },
  {
    id: "0030",
    idx: 29,
    tag: "0030_pos_shifts_outbox",
    when: 1784419200000,
    role: "repair-target",
  },
  {
    id: "0031",
    idx: 30,
    tag: "0031_pos_purchase_orders",
    when: 1784505600000,
    role: "repair-target",
  },
  {
    id: "0032",
    idx: 31,
    tag: "0032_pos_fulfillment",
    when: 1784592000000,
    role: "repair-target",
  },
  {
    id: "0033",
    idx: 32,
    tag: "0033_add_orders_pos_attribution",
    when: 1784678400000,
    role: "repair-target",
  },
];

interface JournalEntry {
  idx: unknown;
  tag: unknown;
  when: unknown;
}

function parseJournal(value: unknown): JournalEntry[] {
  if (
    typeof value !== "object"
    || value === null
    || !("dialect" in value)
    || value.dialect !== "mysql"
    || !("entries" in value)
    || !Array.isArray(value.entries)
  ) {
    throw new Error("Invalid MySQL drizzle/meta/_journal.json");
  }
  return value.entries as JournalEntry[];
}

function findExactJournalEntry(
  entries: JournalEntry[],
  expected: ExpectedEntry,
): JournalEntry {
  const candidates = entries.filter(
    (entry) => typeof entry.tag === "string" && entry.tag.startsWith(`${expected.id}_`),
  );
  if (candidates.length > 1) {
    throw new Error(`Duplicate migration id ${expected.id} in journal`);
  }
  if (candidates.length === 0 || candidates[0]!.tag !== expected.tag) {
    throw new Error(`Expected journal tag ${expected.tag}`);
  }

  const entry = candidates[0]!;
  if (entry.idx !== expected.idx) {
    throw new Error(`Expected ${expected.tag} at idx ${expected.idx}`);
  }
  if (entry.when !== expected.when) {
    throw new Error(`Expected ${expected.tag} timestamp ${expected.when}`);
  }
  return entry;
}

export async function readRepositoryManifest(
  rootDir: string,
): Promise<MigrationManifestEntry[]> {
  const drizzleDir = join(rootDir, "drizzle");
  const journalPath = join(drizzleDir, "meta", "_journal.json");
  const journalText = await readFile(journalPath, "utf8");
  const entries = parseJournal(JSON.parse(journalText) as unknown);
  const unexpectedLaterEntry = entries.find((entry) => {
    if (typeof entry.tag !== "string") return false;
    const match = /^([0-9]{4})_/.exec(entry.tag);
    return match !== null && Number(match[1]) > 33;
  });
  if (unexpectedLaterEntry && typeof unexpectedLaterEntry.tag === "string") {
    throw new Error(`Unexpected migration after reviewed boundary: ${unexpectedLaterEntry.tag}`);
  }
  const selected = expectedEntries.map((expected) => ({
    expected,
    entry: findExactJournalEntry(entries, expected),
  }));

  const timestamps = selected.map(({ entry }) => entry.when);
  if (new Set(timestamps).size !== timestamps.length) {
    throw new Error("Duplicate timestamp in migration manifest");
  }

  return Promise.all(selected.map(async ({ expected }) => {
    const filename = `${expected.tag}.sql`;
    const sqlPath = join(drizzleDir, filename);
    let sqlText: string;
    try {
      sqlText = await readFile(sqlPath, "utf8");
    } catch (error) {
      throw new Error(`Cannot read migration file ${filename}`, { cause: error });
    }
    return {
      id: expected.id,
      idx: expected.idx,
      tag: expected.tag,
      filename,
      when: expected.when,
      sha256: createHash("sha256").update(sqlText).digest("hex"),
      role: expected.role,
    };
  }));
}
