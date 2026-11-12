// The repair tool is deliberately frozen at 0033. Exercise that reviewed
// snapshot independently of later application migrations, without relaxing its gate.
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readRepositoryManifest } from "../repository-manifest";
export async function withReviewedRepository<T>(work: (root: string) => Promise<T>): Promise<T> {
  const source = join(process.cwd(), "drizzle");
  const journal = JSON.parse(await readFile(join(source, "meta", "_journal.json"), "utf8"));
  journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx <= 32);
  const root = await mkdtemp(join(tmpdir(), "reviewed-migrations-"));
  try {
    await mkdir(join(root, "drizzle", "meta"), { recursive: true });
    await writeFile(join(root, "drizzle", "meta", "_journal.json"), JSON.stringify(journal));
    for (const entry of journal.entries) await copyFile(join(source, `${entry.tag}.sql`), join(root, "drizzle", `${entry.tag}.sql`));
    return await work(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

export const readReviewedManifest = () => withReviewedRepository(readRepositoryManifest);
