import type { AggregateName, MigrationId } from "../types";

export interface NamedContract {
  name: string;
}

export interface ColumnContract extends NamedContract {
  columnType: string;
  nullable: boolean;
  default: string | null;
  extra: string;
  generationExpression: string | null;
}

export interface IndexColumnContract extends NamedContract {
  order: "ASC" | "DESC";
  prefixLength: number | null;
}

export interface IndexContract extends NamedContract {
  unique: boolean;
  kind: "PRIMARY" | "BTREE";
  columns: IndexColumnContract[];
}

export type ReferentialAction =
  | "NO ACTION"
  | "RESTRICT"
  | "CASCADE"
  | "SET NULL";

export interface ForeignKeyContract extends NamedContract {
  columns: string[];
  referencedTable: string;
  referencedColumns: string[];
  onUpdate: ReferentialAction;
  onDelete: ReferentialAction;
}

export interface CheckContract extends NamedContract {
  expression: string;
}

export interface TableContract extends NamedContract {
  columns: ColumnContract[];
  indexes: IndexContract[];
  foreignKeys: ForeignKeyContract[];
  checks: CheckContract[];
}

export type AlteredTableContract = TableContract;

export interface AggregateContract {
  name: AggregateName;
}

export interface MigrationContract {
  id: MigrationId;
  requiredTables: TableContract[];
  alteredTables: AlteredTableContract[];
  aggregates: AggregateContract[];
  absentRoutines: string[];
  collationTables: string[];
}

export function column(
  name: string,
  columnType: string,
  nullable: boolean,
  defaultValue: string | null = null,
  extra = "",
  generationExpression: string | null = null,
): ColumnContract {
  return {
    name,
    columnType,
    nullable,
    default: defaultValue,
    extra,
    generationExpression,
  };
}

export function uuidPrimaryId(): ColumnContract {
  return column("id", "varchar(36)", false, "uuid()", "default_generated");
}

export function createdAt(name = "created_at"): ColumnContract {
  return column(name, "timestamp", false, "current_timestamp", "default_generated");
}

export function index(
  name: string,
  unique: boolean,
  columns: string[],
  kind: IndexContract["kind"] = "BTREE",
): IndexContract {
  return {
    name,
    unique,
    kind,
    columns: columns.map((columnName) => ({
      name: columnName,
      order: "ASC",
      prefixLength: null,
    })),
  };
}

export function primary(columnName = "id"): IndexContract {
  return index("PRIMARY", true, [columnName], "PRIMARY");
}

export function foreignKey(
  name: string,
  columns: string[],
  referencedTable: string,
  referencedColumns: string[],
  onDelete: ReferentialAction = "RESTRICT",
  onUpdate: ReferentialAction = "RESTRICT",
): ForeignKeyContract {
  return {
    name,
    columns,
    referencedTable,
    referencedColumns,
    onUpdate,
    onDelete,
  };
}

export function check(name: string, expression: string): CheckContract {
  return { name, expression };
}

export function table(
  name: string,
  columns: ColumnContract[],
  indexes: IndexContract[] = [],
  foreignKeys: ForeignKeyContract[] = [],
  checks: CheckContract[] = [],
): TableContract {
  return { name, columns, indexes, foreignKeys, checks };
}
