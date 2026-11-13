/**
 * TW-10 crash experiment for POS idempotency, on a disposable MySQL.
 *
 *   IDEMPOTENCY_EXPERIMENT_ALLOW_DISPOSABLE_DB=1 DB_HOST=… DB_USER=… DB_PASSWORD=… DB_NAME=tw_replay_<x>  *   pnpm tsx scripts/integration/idempotency-crash-experiment.ts
 *
 * Run replay-latest.ts first (it creates the schema). Scenarios:
 *   1. business write then an exception before commit
 *   2. the DB connection is killed mid-transaction
 *   3. the response is lost after commit (same key replays, work not re-run)
 *   4. same key with different parameters is rejected
 * Each key must end with exactly one business row.
 * Result on MySQL 8.4 (2026-11-12): all four pass.
 */
import { sql } from "drizzle-orm";
import mysql from "mysql2/promise";

import { db } from "@/lib/db";
import { posTransaction, runIdempotent } from "@/services/admin/pos-idempotency-service";

if (process.env.IDEMPOTENCY_EXPERIMENT_ALLOW_DISPOSABLE_DB !== "1" || !/^tw_replay_[a-z0-9_]+$/.test(process.env.DB_NAME ?? "")) {
  throw new Error("refusing to run: set IDEMPOTENCY_EXPERIMENT_ALLOW_DISPOSABLE_DB=1 and DB_NAME=tw_replay_*");
}
const admin = mysql.createPool({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
});
let runs = 0;
const count = async (q: string) => Number(((await admin.query(q))[0] as Array<{ n: number }>)[0].n);
const business = (crash?: "throw" | "kill") => async () => {
  runs += 1;
  return posTransaction(async (tx) => {
    await tx.execute(sql`INSERT INTO crash_ledger (op) VALUES ('refund')`);
    if (crash === "throw") throw new Error("simulated crash before commit");
    if (crash === "kill") {
      const [[row]] = await tx.execute(sql`SELECT CONNECTION_ID() AS id`) as unknown as [[{ id: number }]];
      await admin.query(`KILL ${Number(row.id)}`); // the DB connection dies mid-transaction
      await tx.execute(sql`SELECT 1`);
    }
    return { refund_id: "r1", amount: "10.00" };
  });
};

async function main() {
  await admin.query("CREATE TABLE IF NOT EXISTS crash_ledger (id int AUTO_INCREMENT PRIMARY KEY, op varchar(20))");
  await admin.query("DELETE FROM crash_ledger");
  await admin.query("DELETE FROM pos_idempotency_keys");
  const input = { key: "exp-1", operation: "refund" as const, storeId: "s1", requestHash: "h1" };

  for (const mode of ["throw", "kill"] as const) {
    try { await runIdempotent({ ...input, key: `exp-${mode}` }, business(mode), { responseStatus: 201 }); } catch (e) { console.log(`${mode}: failed as expected (${(e as Error).message.split("\n")[0].slice(0, 60)})`); }
    console.log(`${mode}: ledger rows=${await count("SELECT COUNT(*) n FROM crash_ledger")}, key rows=${await count(`SELECT COUNT(*) n FROM pos_idempotency_keys WHERE idempotency_key='exp-${mode}'`)}`);
    const retried = await runIdempotent({ ...input, key: `exp-${mode}` }, business(), { responseStatus: 201 });
    console.log(`${mode}: retry ok=${JSON.stringify(retried)} ledger rows=${await count("SELECT COUNT(*) n FROM crash_ledger")}`);
  }
  const before = runs;
  const replay = await runIdempotent({ ...input, key: "exp-throw" }, business(), { responseStatus: 201 });
  console.log(`lost response replay: same=${JSON.stringify(replay)} work ran again=${runs !== before} ledger rows=${await count("SELECT COUNT(*) n FROM crash_ledger")}`);
  try { await runIdempotent({ ...input, key: "exp-throw", requestHash: "different" }, business()); } catch (e) { console.log(`changed parameters: rejected (${(e as { code?: string }).code})`); }
  await admin.end();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
