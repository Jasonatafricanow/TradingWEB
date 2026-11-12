/**
 * Seeds a disposable database for clicking through the admin / checkout UI.
 *
 *   UI_CHECK_ALLOW_DISPOSABLE_DB=1 DB_HOST=… DB_USER=… DB_PASSWORD=… DB_NAME=tw_replay_<x> \
 *   pnpm tsx scripts/integration/seed-ui-check.ts
 *
 * Creates an admin, a store manager and a buyer with random passwords and
 * appends them to .env.local (gitignored) as UI_CHECK_* lines. Never point
 * this at a real database.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { appendFile } from "node:fs/promises";
import mysql from "mysql2/promise";

import { hashPassword } from "@/lib/auth-local";

if (process.env.UI_CHECK_ALLOW_DISPOSABLE_DB !== "1" || !/^tw_replay_[a-z0-9_]+$/.test(process.env.DB_NAME ?? "")) {
  throw new Error("refusing to run: set UI_CHECK_ALLOW_DISPOSABLE_DB=1 and DB_NAME=tw_replay_*");
}

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  const store = randomUUID();
  await pool.query("INSERT INTO stores (id, name, status) VALUES (?, 'UI Check Store', 'active')", [store]);
  const lines: string[] = [];
  for (const [label, role] of [["ADMIN", "admin"], ["MANAGER", "manager"], ["BUYER", null]] as const) {
    const id = randomUUID();
    const email = `ui-${label.toLowerCase()}-${id.slice(0, 6)}@check.test`;
    const password = randomBytes(9).toString("base64url");
    await pool.query("INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)", [id, email, label, hashPassword(password)]);
    if (role) {
      await pool.query("INSERT INTO staff (id, user_id, role, name, email, store_id) VALUES (?, ?, ?, ?, ?, ?)",
        [randomUUID(), id, role, label, email, role === "manager" ? store : null]);
    }
    if (!role) {
      await pool.query("INSERT INTO wallet_credits (id, user_id, amount, remaining, source, note, expires_at) VALUES (?, ?, '40.00', '40.00', 'admin_grant', 'ui check', NULL)", [randomUUID(), id]);
    }
    lines.push(`UI_CHECK_${label}_EMAIL=${email}`, `UI_CHECK_${label}_PASSWORD=${password}`);
  }
  await appendFile(".env.local", `\n# UI check accounts (disposable DB ${process.env.DB_NAME})\n${lines.join("\n")}\n`);
  console.log("seeded; accounts appended to .env.local");
  await pool.end();
}

main().catch((error) => { console.error(error); process.exit(1); });
