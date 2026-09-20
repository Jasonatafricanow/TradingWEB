export interface DisposableDatabaseGate {
  database: string;
  optIn: string | undefined;
}

export interface DisposableAdminConnection {
  execute(
    sql: string,
    params?: readonly (string | number | null)[],
  ): Promise<[unknown[], unknown?]>;
}

export function assertDisposableDatabase(config: DisposableDatabaseGate): void {
  if (!/(_test|_tmp)$/i.test(config.database)) {
    throw new Error("Disposable integration database name must end in _test or _tmp");
  }
  if (!/^[A-Za-z0-9_]+$/.test(config.database)) {
    throw new Error("Disposable integration database name contains unsafe characters");
  }
  if (config.optIn !== "1") {
    throw new Error("Set MIGRATION_RECONCILIATION_ALLOW_DISPOSABLE_DB=1");
  }
}

export function buildDisposableMigrationConnectionOptions<
  T extends { multipleStatements?: boolean },
>(
  gate: DisposableDatabaseGate,
  options: T,
): Omit<T, "multipleStatements"> & { multipleStatements: true } {
  assertDisposableDatabase(gate);
  return {
    ...options,
    multipleStatements: true,
  };
}

export async function withDisposableForeignKeyChecksDisabled<T>(
  gate: DisposableDatabaseGate,
  execute: (sql: string) => Promise<unknown>,
  action: () => Promise<T>,
): Promise<T> {
  assertDisposableDatabase(gate);
  await execute("SET FOREIGN_KEY_CHECKS = 0");
  try {
    return await action();
  } finally {
    await execute("SET FOREIGN_KEY_CHECKS = 1");
  }
}

export function selectDisposableUtf8mb4Tables(
  tables: readonly { name: string; collation: string | null }[],
): string[] {
  return tables.filter((table) => {
    if (!/^[a-z0-9_]+$/.test(table.name)) {
      throw new Error("Disposable normalization found an unsafe table identifier");
    }
    return table.collation?.toLowerCase().startsWith("utf8mb4_") ?? false;
  }).map((table) => table.name);
}

export function isDrizzleMigrationBodyStatement(sql: string): boolean {
  const normalized = sql.toLowerCase();
  return !normalized.includes("__drizzle_migrations")
    && !/^\s*(?:begin|start transaction|commit|rollback)\b/.test(normalized);
}

export async function createFreshDisposableDatabase(
  connection: DisposableAdminConnection,
  config: DisposableDatabaseGate,
): Promise<void> {
  assertDisposableDatabase(config);
  const [existing] = await connection.execute(
    `SELECT SCHEMA_NAME AS schema_name
FROM information_schema.SCHEMATA
WHERE SCHEMA_NAME = ?`,
    [config.database],
  );
  if (existing.length !== 0) {
    throw new Error("Disposable integration database already exists");
  }

  assertDisposableDatabase(config);
  await connection.execute(
    `CREATE DATABASE \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    [],
  );
}
