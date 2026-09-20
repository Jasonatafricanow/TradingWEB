import { createHash, randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  open,
  rename,
  stat,
  unlink,
} from "node:fs/promises";
import { dirname, join } from "node:path";

import { canonicalStringify } from "../canonical-json";
import { MigrationReconciliationError } from "../errors";
import type {
  ReconciliationReport,
  ReconciliationSnapshot,
} from "../types";
import { renderReportJson } from "./report-json";
import { renderReportMarkdown } from "./report-markdown";

export interface ArtifactBundleInput {
  outputDirectory: string;
  snapshot: ReconciliationSnapshot;
  report: ReconciliationReport;
  proposedSql: string | null;
}

export interface ArtifactPaths {
  directory: string;
  snapshot: string;
  reportJson: string;
  reportMarkdown: string;
  proposedSql?: string;
  checksums: string;
}

interface PendingArtifact {
  filename: string;
  finalPath: string;
  temporaryPath: string;
  content: string;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function writeSynced(path: string, content: string): Promise<void> {
  const handle = await open(path, "wx");
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function checksum(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export async function writeArtifactBundle(
  input: ArtifactBundleInput,
): Promise<ArtifactPaths> {
  const parent = dirname(input.outputDirectory);
  try {
    const parentStatus = await stat(parent);
    if (!parentStatus.isDirectory()) throw new Error("Output parent is not a directory");
    if (!(await exists(input.outputDirectory))) {
      await mkdir(input.outputDirectory);
    }
  } catch (cause) {
    throw new MigrationReconciliationError(
      "ARTIFACT_WRITE_ERROR",
      "Artifact output directory could not be created",
      { cause },
    );
  }

  const contents = new Map<string, string>([
    ["snapshot.json", `${canonicalStringify(input.snapshot)}\n`],
    ["report.json", renderReportJson(input.report)],
    ["report.md", renderReportMarkdown(input.report)],
  ]);
  if (input.proposedSql !== null) {
    contents.set("proposed-journal-repair.sql", input.proposedSql);
  }
  const checksumContent = [...contents.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([filename, content]) => `${checksum(content)}  ${filename}`)
    .join("\n");
  contents.set("checksums.sha256", `${checksumContent}\n`);

  const nonce = randomUUID();
  const pending: PendingArtifact[] = [...contents.entries()].map(
    ([filename, content]) => ({
      filename,
      finalPath: join(input.outputDirectory, filename),
      temporaryPath: join(
        input.outputDirectory,
        `.${filename}.tmp-${process.pid}-${nonce}`,
      ),
      content,
    }),
  );

  try {
    for (const artifact of pending) {
      if (await exists(artifact.finalPath)) {
        throw new Error(`Final artifact already exists: ${artifact.filename}`);
      }
    }
    for (const artifact of pending) {
      await writeSynced(artifact.temporaryPath, artifact.content);
    }
    for (const artifact of pending) {
      await rename(artifact.temporaryPath, artifact.finalPath);
    }
  } catch (cause) {
    await Promise.all(
      pending.map((artifact) => unlink(artifact.temporaryPath).catch(() => undefined)),
    );
    throw new MigrationReconciliationError(
      "ARTIFACT_WRITE_ERROR",
      "Artifact bundle could not be written",
      { cause },
    );
  }

  return {
    directory: input.outputDirectory,
    snapshot: join(input.outputDirectory, "snapshot.json"),
    reportJson: join(input.outputDirectory, "report.json"),
    reportMarkdown: join(input.outputDirectory, "report.md"),
    ...(input.proposedSql === null
      ? {}
      : {
          proposedSql: join(
            input.outputDirectory,
            "proposed-journal-repair.sql",
          ),
        }),
    checksums: join(input.outputDirectory, "checksums.sha256"),
  };
}
