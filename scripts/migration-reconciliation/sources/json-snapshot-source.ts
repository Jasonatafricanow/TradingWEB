import { readFile } from "node:fs/promises";

import { MigrationReconciliationError } from "../errors";
import { parseSnapshot } from "../snapshot-schema";
import type { ReconciliationSnapshot } from "../types";

export class JsonSnapshotSource {
  static async load(
    path: string,
    now: Date,
  ): Promise<ReconciliationSnapshot> {
    if (Number.isNaN(now.getTime())) {
      throw new MigrationReconciliationError(
        "PARSE_ERROR",
        "Snapshot validation time is invalid",
      );
    }

    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch {
      throw new MigrationReconciliationError(
        "PARSE_ERROR",
        "Snapshot file could not be read",
      );
    }

    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new MigrationReconciliationError(
        "PARSE_ERROR",
        "Snapshot JSON could not be parsed",
      );
    }

    try {
      return parseSnapshot(value);
    } catch {
      throw new MigrationReconciliationError(
        "PARSE_ERROR",
        "Snapshot JSON failed strict validation",
      );
    }
  }
}
