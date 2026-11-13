/**
 * Replays every migration in drizzle/ (0000 -> latest) on a disposable
 * database and checks the schema the current code depends on.
 *
 *   MIGRATION_RECONCILIATION_ALLOW_DISPOSABLE_DB=1 \
 *   DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=... DB_PASSWORD=... \
 *   DB_NAME=tw_replay_<anything> tsx scripts/migration-reconciliation/integration/replay-latest.ts
 *
 * The database name must start with tw_replay_; it is dropped and recreated.
 * Never point this at a real database.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";

type Check = { name: string; ok: boolean; detail?: string };

async function main() {
  const database = (process.env.DB_NAME ?? "").trim();
  if (process.env.MIGRATION_RECONCILIATION_ALLOW_DISPOSABLE_DB !== "1" || !/^tw_replay_[a-z0-9_]+$/.test(database)) {
    throw new Error("refusing to run: set MIGRATION_RECONCILIATION_ALLOW_DISPOSABLE_DB=1 and DB_NAME=tw_replay_*");
  }
  const base = {
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: false,
  };
  const admin = await mysql.createConnection(base);
  await admin.query(`DROP DATABASE IF EXISTS \`${database}\``);
  await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await admin.end();

  const connection = await mysql.createConnection({ ...base, database });
  const [mode] = await connection.query("SELECT @@SESSION.sql_mode AS mode");
  const sqlMode = String((mode as Array<{ mode: string }>)[0]?.mode ?? "");
  await migrate(drizzle(connection), { migrationsFolder: resolve(process.cwd(), "drizzle") });

  const checks: Check[] = [];
  const columns = async (table: string) => {
    const [rows] = await connection.query(
      "SELECT COLUMN_NAME AS name, IS_NULLABLE AS nullable, COLUMN_DEFAULT AS dflt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?",
      [database, table],
    );
    return rows as Array<{ name: string; nullable: string; dflt: string | null }>;
  };

  const transfers = await columns("stock_transfers");
  const blocking = transfers.filter((c) => ["product_id", "quantity"].includes(c.name) && c.nullable === "NO" && c.dflt === null);
  checks.push({
    name: "stock_transfers legacy columns accept the current insert (no product_id/quantity)",
    ok: blocking.length === 0,
    detail: blocking.map((c) => c.name).join(", ") || undefined,
  });

  // Insert a header exactly like transfer-service (lines live in transfer_items).
  let insertError: string | undefined;
  try {
    await connection.query("SET FOREIGN_KEY_CHECKS = 0");
    await connection.query(
      "INSERT INTO stock_transfers (id, reference_no, from_warehouse_id, to_warehouse_id, status) VALUES ('t1', 'TR-REPLAY', 'w1', 'w2', 'pending')",
    );
  } catch (error) {
    insertError = error instanceof Error ? error.message : String(error);
  } finally {
    await connection.query("SET FOREIGN_KEY_CHECKS = 1");
  }
  checks.push({ name: "stock_transfers header insert without legacy columns", ok: !insertError, detail: insertError });

  const email = new Set((await columns("email_logs")).map((c) => c.name));
  for (const name of ["to_email", "body", "dedupe_key", "retry_of", "provider_message_id", "attempts", "updated_at"]) {
    checks.push({ name: `email_logs.${name}`, ok: email.has(name) });
  }
  const notifications = new Set((await columns("notifications")).map((c) => c.name));
  checks.push({ name: "notifications.dedupe_key", ok: notifications.has("dedupe_key") });
  checks.push({ name: "pos_refund_tenders table", ok: (await columns("pos_refund_tenders")).length > 0 });
  for (const table of ["oauth_identities", "order_stock_allocations", "revoked_sessions"]) {
    checks.push({ name: `${table} table`, ok: (await columns(table)).length > 0 });
  }

  // 0037 must be re-runnable on a database that already has its columns.
  const sql0037 = await readFile(resolve(process.cwd(), "drizzle/0037_email_outbox_notification_dedupe.sql"), "utf8");
  let rerun: string | undefined;
  try {
    for (const statement of sql0037.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
      const body = statement.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n").trim();
      if (body) await connection.query(body);
    }
  } catch (error) {
    rerun = error instanceof Error ? error.message : String(error);
  }
  checks.push({ name: "0037 re-runs without error", ok: !rerun, detail: rerun });

  // Dedupe keys really are unique (duplicate event -> one row).
  await connection.query("INSERT INTO email_logs (id, to_email, subject, status, dedupe_key) VALUES ('e1', 'a@x.test', 's', 'queued', 'k1') ON DUPLICATE KEY UPDATE dedupe_key = dedupe_key");
  await connection.query("INSERT INTO email_logs (id, to_email, subject, status, dedupe_key) VALUES ('e2', 'a@x.test', 's', 'queued', 'k1') ON DUPLICATE KEY UPDATE dedupe_key = dedupe_key");
  const [dupe] = await connection.query("SELECT COUNT(*) AS n FROM email_logs WHERE dedupe_key = 'k1'");
  checks.push({ name: "email_logs dedupe_key keeps one row per event", ok: Number((dupe as Array<{ n: number }>)[0].n) === 1 });

  await connection.end();
  console.log(`sql_mode: ${sqlMode}`);
  for (const check of checks) console.log(`${check.ok ? "PASS" : "FAIL"}  ${check.name}${check.detail ? `  (${check.detail})` : ""}`);
  process.exitCode = checks.every((c) => c.ok) ? 0 : 1;
}

main().catch((error) => {
  console.error("replay-latest failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
