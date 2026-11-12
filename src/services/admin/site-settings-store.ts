import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/** The pool or a drizzle transaction; both run `sql` templates via execute(). */
export type SettingsExecutor = Pick<typeof db, "execute">;

export async function readSettings(prefix: string, executor: SettingsExecutor = db): Promise<Map<string, string | null>> {
  const result = await executor.execute(
    sql`SELECT \`key\`, \`value\` FROM \`site_settings\` WHERE \`key\` LIKE ${`${prefix}%`}`,
  );
  const rows = (result as unknown as [Array<{ key: string; value: string | null }>])[0] ?? [];
  return new Map(rows.map((row) => [row.key, row.value]));
}

export async function writeSettings(values: Record<string, string | null>, executor: SettingsExecutor = db): Promise<void> {
  for (const [key, value] of Object.entries(values)) {
    await executor.execute(
      sql`INSERT INTO \`site_settings\` (\`key\`, \`value\`) VALUES (${key}, ${value}) ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`)`,
    );
  }
}
