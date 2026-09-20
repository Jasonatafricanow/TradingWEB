# Migration Journal Reconciliation Runbook

## Purpose and authority boundary

This workflow determines whether migrations `0026` through `0032` are already
present in schema and data but missing from Drizzle's
`__drizzle_migrations` journal. It produces a snapshot, audit reports, and—only
for a fully verified missing suffix—a review-only SQL proposal.

The CLI has no command that applies SQL. It does not mutate production,
deploy code, or authorize a repair. Production journal changes remain a
separate DBA action outside this implementation.

## Production account requirements

Use a dedicated MySQL account limited to:

- `SELECT` on `information_schema`;
- `SELECT` on `__drizzle_migrations`;
- `SELECT` only on the metadata and aggregate-count sources named by the fixed
  query catalog.

The account must not have `INSERT`, `UPDATE`, `DELETE`, `ALTER`, `CREATE`,
`DROP`, `GRANT`, or application-writer privileges. Configure credentials in the
operator's secure environment; never put them in shell history, artifacts, or
this document.

Example placeholders:

```powershell
$env:DB_HOST = '<production-db-host>'
$env:DB_PORT = '3306'
$env:DB_USER = '<read-only-reconciliation-user>'
$env:DB_PASSWORD = '<set-through-approved-secret-channel>'
$env:DB_NAME = '<production-database-name>'
```

## Capture live read-only evidence

The parent of the output directory must already exist and the selected output
directory must not exist.

```powershell
pnpm.cmd migration:reconcile -- capture `
  --out C:\migration-audits\capture-20260726 `
  --profile production-normalized
```

Capture uses one connection, disables multiple statements, requires
transaction-level read-only mode, runs only the fixed query catalog, and closes
the connection. If the server refuses read-only mode, capture fails with exit
code `30`; it never falls back to a writable transaction.

## Reconcile a saved snapshot offline

```powershell
pnpm.cmd migration:reconcile -- reconcile `
  --snapshot C:\migration-audits\capture-20260726\snapshot.json `
  --out C:\migration-audits\review-20260726
```

Offline reconciliation strictly validates the schema and content fingerprint.
It does not fill missing arrays, coerce values, recalculate a wrong
fingerprint, refresh `captured_at`, or convert live evidence into a fixture.

## Exit codes

| Code | Decision | Meaning |
| ---: | --- | --- |
| `0` | `REGISTERED_EXACT` | Repository, journal, schema, data, routines, and collation evidence are exact. |
| `10` | `JOURNAL_REPAIR_ELIGIBLE` | A complete verified suffix is absent from the journal; review-only SQL is emitted. |
| `20` | `BLOCKED` | Identity conflict, journal gap, incomplete evidence, schema drift, data drift, or collation drift blocks SQL. |
| `30` | `OPERATIONAL_ERROR` | Configuration, connection, query, parsing, or artifact writing failed. |

Live snapshots are eligible for action-oriented reconciliation for 24 hours
from `captured_at`. Older live snapshots remain readable for historical review
but produce a blocking `SNAPSHOT_EXPIRED` finding.

## Collation profiles and reconstructed evidence

`migration-native` represents raw replay behavior using
`utf8mb4_unicode_ci`. It is intended for the isolated integration fixture, not
as evidence of current production normalization.

`production-normalized` expects `utf8mb4_0900_ai_ci` on the policy-owned
tables. The following 13 conversion entries are explicitly reconstructed
evidence because the original generated `/tmp/collation_fixes.sql` was not
preserved:

1. `import_jobs`
2. `import_sessions`
3. `order_payments`
4. `pos_approval_tokens`
5. `pos_audit_outbox`
6. `pos_cash_movements`
7. `pos_device_audit_logs`
8. `pos_exchanges`
9. `pos_idempotency_keys`
10. `pos_inventory_migration_exceptions`
11. `pos_operator_sessions`
12. `pos_refund_items`
13. `pos_shifts`

`pos_purchase_orders` and `pos_purchase_order_items` are separately classified
as tables created during migration `0031`; their expected normalized collation
is verified but is not presented as recovered evidence from the missing file.

## Artifact bundle and checksums

Each output directory is non-overwriting and self-contained:

- `snapshot.json`;
- `report.json`;
- `report.md`;
- `checksums.sha256`;
- `proposed-journal-repair.sql` only for exit code `10`.

Files are written through same-directory temporary files, synchronized, closed,
and renamed. The checksum file covers every other final artifact in filename
order.

Verify a checksum in PowerShell:

```powershell
Get-FileHash C:\migration-audits\review-20260726\report.json -Algorithm SHA256
Get-Content C:\migration-audits\review-20260726\checksums.sha256
```

## DBA review and maintenance-window procedure

The generated SQL is a proposal, not an executable CLI action. Before a DBA
considers it:

1. Stop application and administrative writers for the maintenance window.
2. Take a fresh production capture.
3. Require the new snapshot fingerprint and repository commit to match the SQL
   comments exactly.
4. Require reconciliation exit code `10` with the expected ordered suffix.
5. Review the exact predecessor hash and timestamp.
6. Review every proposed suffix hash and timestamp against the repository
   manifest.
7. Require `GET_LOCK` to return `1`.
8. Require the preflight exact-predecessor count to be `1`.
9. Require the preflight later-row count to be `0`.
10. Require `ROW_COUNT()` to equal the suffix length.

Zero or unexpected affected rows mean the guard rejected current state or the
state changed concurrently. Roll back where the transaction remains open,
release the advisory lock, investigate, and do not retry with weakened guards.

After any separately authorized DBA action:

1. keep writers stopped;
2. capture a new snapshot;
3. reconcile it into a new output directory;
4. require exit code `0`;
5. verify the new artifact checksums;
6. only then resume writers under the normal change-management procedure.

Production mutation, deployment, and DBA authorization are outside this
implementation's scope.

## Disposable integration database

The integration harness may mutate only a separately approved, newly created
database whose name ends in `_test` or `_tmp`, and only when
`MIGRATION_RECONCILIATION_ALLOW_DISPOSABLE_DB=1`.

The harness now uses a stricter create-new-only rule:

- it queries `information_schema.SCHEMATA` first;
- if the selected database already exists, it fails without mutation;
- it creates the exact approved database once;
- it never runs `DROP DATABASE`;
- drift scenarios restore only their exact allowlisted test mutation.

Example:

```powershell
$env:MIGRATION_RECONCILIATION_ALLOW_DISPOSABLE_DB = '1'
$env:DB_NAME = 'tradingweb_migration_reconciliation_20260726_test'
pnpm.cmd test:migration-reconciliation:integration
```

Do not redirect this harness to a production-like database name for
convenience. The test database is retained after the run for operator
inspection; later cleanup requires its own explicit approval.

## Verified non-production evidence (2026-07-26)

The approved create-only integration run completed against a new `_test`
database. The database was retained for inspection; no database was dropped.
No production capture, production mutation, deployment, push, or DBA action was
performed by the reconciliation implementation.

The integration matrix produced these expected decisions:

- raw replay: `REGISTERED_EXACT`;
- normalized replay: `REGISTERED_EXACT`;
- seven-row candidate: `JOURNAL_REPAIR_ELIGIBLE`;
- post-repair: `REGISTERED_EXACT`;
- final Drizzle no-replay proof: `REGISTERED_EXACT`;
- index, hash, journal-gap, unknown-row, collation, 0027-data,
  0031-data, and stale-offline scenarios: `BLOCKED`.

For disposable replay only, normalization covers every actual `utf8mb4` table
so foreign-key and aggregate joins remain compatible. The report still treats
only the 15 policy tables as collation evidence, including the 13 reconstructed
conversion-table entries.

Repository and database gates passed:

- unit tests: 54 files and 425 tests;
- TypeScript and lint/build checks: exit code `0`;
- schema integrity: exit code `0`, no hard drift, with four pre-existing soft
  differences (`url_redirects.new_path` width and three extra
  `stock_transfers` columns);
- POS integration: 58 of 58 scenarios;
- reconciliation: all 12 checks reported no critical or informational
  inconsistencies.

The repository journal timestamps for entries 0003 through 0010 were adjusted
under explicit approval to encode a strictly increasing reconstructed order.
No `drizzle/*.sql` migration file or shared schema file was changed.
