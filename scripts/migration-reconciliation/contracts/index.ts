import { contract0026 } from "./0026";
import { contract0027 } from "./0027";
import { contract0028 } from "./0028";
import { contract0029 } from "./0029";
import { contract0030 } from "./0030";
import { contract0031 } from "./0031";
import { contract0032 } from "./0032";
import { contract0033 } from "./0033";
import type { MigrationContract, NamedContract, TableContract } from "./model";
import type { MigrationId } from "../types";

export type {
  AggregateContract,
  AlteredTableContract,
  CheckContract,
  ColumnContract,
  ForeignKeyContract,
  IndexColumnContract,
  IndexContract,
  MigrationContract,
  NamedContract,
  ReferentialAction,
  TableContract,
} from "./model";

export const migrationContracts: MigrationContract[] = [
  contract0026,
  contract0027,
  contract0028,
  contract0029,
  contract0030,
  contract0031,
  contract0032,
  contract0033,
];

const expectedIds: MigrationId[] = [
  "0026",
  "0027",
  "0028",
  "0029",
  "0030",
  "0031",
  "0032",
  "0033",
];

function requireUniqueNames(
  migrationId: MigrationId,
  tableName: string,
  kind: string,
  objects: NamedContract[],
): void {
  const seen = new Set<string>();
  for (const object of objects) {
    if (!object.name) {
      throw new Error(`${migrationId} ${tableName} has empty ${kind} name`);
    }
    if (seen.has(object.name)) {
      throw new Error(
        `Duplicate ${kind} ${object.name} in ${migrationId}:${tableName}`,
      );
    }
    seen.add(object.name);
  }
}

function validateTable(migrationId: MigrationId, target: TableContract): void {
  if (!target.name) {
    throw new Error(`${migrationId} contract-owned index has no table name`);
  }
  requireUniqueNames(migrationId, target.name, "column", target.columns);
  requireUniqueNames(migrationId, target.name, "index", target.indexes);
  requireUniqueNames(migrationId, target.name, "foreign key", target.foreignKeys);
  requireUniqueNames(migrationId, target.name, "check", target.checks);
}

export function validateContractRegistry(
  contracts: readonly MigrationContract[],
): void {
  const ids = contracts.map((contract) => contract.id);
  if (ids.join(",") !== expectedIds.join(",")) {
    const missing = expectedIds.find((id) => !ids.includes(id));
    throw new Error(`Migration contract registry must contain ${missing ?? expectedIds.join(",")}`);
  }

  for (const contract of contracts) {
    const tables = [...contract.requiredTables, ...contract.alteredTables];
    requireUniqueNames(contract.id, "migration", "table", tables);
    for (const target of tables) validateTable(contract.id, target);

    if (contract.id !== "0027" && contract.id !== "0031" && contract.id !== "0033" && contract.aggregates.length > 0) {
      throw new Error(`Aggregate evidence is not allowed in migration ${contract.id}`);
    }
    if (
      contract.id === "0027"
      && contract.aggregates.some((aggregate) => aggregate.name !== "legacy_orders_missing_payment")
    ) {
      throw new Error("Migration 0027 has an unknown aggregate");
    }
    if (
      contract.id === "0031"
      && contract.aggregates.some((aggregate) =>
        ![
          "product_variant_mismatch",
          "stock_total_mismatch",
          "duplicate_inventory_scope",
          "unambiguous_backfill_missing",
          "ambiguous_location_exception_missing",
        ].includes(aggregate.name)
      )
    ) {
      throw new Error("Migration 0031 has an unknown aggregate");
    }
    if (
      contract.id === "0033"
      && contract.aggregates.some((aggregate) =>
        aggregate.name !== "legacy_pos_attribution_missing"
      )
    ) {
      throw new Error("Migration 0033 has an unknown aggregate");
    }
  }
}

validateContractRegistry(migrationContracts);
