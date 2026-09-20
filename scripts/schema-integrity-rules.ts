export interface DbIndexDefinition {
  unique: boolean;
  columns: string[];
}

export type DbIndexes = Map<string, Map<string, DbIndexDefinition>>;

export function buildDbIndexes(rows: Record<string, unknown>[]): DbIndexes {
  const indexes: DbIndexes = new Map();

  for (const row of rows) {
    const tableName = String(row.t);
    const indexName = String(row.i);
    const sequence = Number(row.seq);
    const columnName = String(row.c);

    if (!indexes.has(tableName)) indexes.set(tableName, new Map());
    const tableIndexes = indexes.get(tableName)!;
    if (!tableIndexes.has(indexName)) {
      tableIndexes.set(indexName, {
        unique: Number(row.nu) === 0,
        columns: [],
      });
    }

    const definition = tableIndexes.get(indexName)!;
    definition.columns[sequence - 1] = columnName;
  }

  return indexes;
}

export function hasExactUniqueIndex(
  indexes: DbIndexes,
  tableName: string,
  indexName: string,
  expectedColumns: string[],
): boolean {
  const definition = indexes.get(tableName)?.get(indexName);
  return Boolean(
    definition?.unique
      && definition.columns.length === expectedColumns.length
      && definition.columns.every((column, index) => column === expectedColumns[index]),
  );
}
