import { execFile } from "node:child_process";
import { lstat } from "node:fs/promises";
import { promisify } from "node:util";

import { loadCollationPolicy, type CollationProfile } from "./collation-policy";
import { migrationContracts } from "./contracts";
import { MigrationReconciliationError } from "./errors";
import { reconcile } from "./reconcile";
import { renderProposedSql } from "./render/proposed-sql";
import { writeArtifactBundle } from "./render/write-artifacts";
import { readRepositoryManifest } from "./repository-manifest";
import { evaluateSnapshotFreshness } from "./snapshot-schema";
import { JsonSnapshotSource } from "./sources/json-snapshot-source";
import {
  MySqlReadOnlySource,
  readMySqlCaptureConfig,
  type MySqlCaptureInput,
} from "./sources/mysql-read-only-source";
import type { OverallDecision, ReconciliationSnapshot } from "./types";

const execFileAsync = promisify(execFile);

const helpText = `Migration journal reconciliation

Commands:
  capture --out <new-directory> [--profile production-normalized]
  reconcile --snapshot <snapshot.json> --out <new-directory>
`;

interface CaptureArguments {
  command: "capture";
  outputDirectory: string;
  profile: CollationProfile;
}

interface ReconcileArguments {
  command: "reconcile";
  snapshotPath: string;
  outputDirectory: string;
}

type ParsedArguments =
  | { command: "help" }
  | CaptureArguments
  | ReconcileArguments;

export interface CliDependencies {
  environment: Readonly<Record<string, string | undefined>>;
  repositoryRoot: string;
  now: () => Date;
  stdout: (message: string) => void;
  stderr: (message: string) => void;
  repositoryCommit: (root: string) => Promise<string>;
  capture: (input: MySqlCaptureInput) => Promise<ReconciliationSnapshot>;
}

function configurationError(message: string): MigrationReconciliationError {
  return new MigrationReconciliationError("CONFIGURATION_ERROR", message);
}

function parseFlagPairs(args: string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag?.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw configurationError("Command flags must be explicit name/value pairs");
    }
    if (flags.has(flag)) {
      throw configurationError("Duplicate command flags are not allowed");
    }
    flags.set(flag, value);
  }
  return flags;
}

function requireOnlyFlags(
  flags: ReadonlyMap<string, string>,
  allowed: readonly string[],
): void {
  for (const flag of flags.keys()) {
    if (!allowed.includes(flag)) {
      throw configurationError("Unknown command flag");
    }
  }
}

function parseArguments(args: string[]): ParsedArguments {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    return { command: "help" };
  }
  const [command, ...rest] = args;
  if (command !== "capture" && command !== "reconcile") {
    throw configurationError("Unknown command");
  }
  const flags = parseFlagPairs(rest);
  if (command === "capture") {
    requireOnlyFlags(flags, ["--out", "--profile"]);
    const outputDirectory = flags.get("--out");
    if (!outputDirectory) throw configurationError("capture requires --out");
    const profile = flags.get("--profile") ?? "production-normalized";
    if (profile !== "production-normalized" && profile !== "migration-native") {
      throw configurationError("Unknown collation profile");
    }
    return { command, outputDirectory, profile };
  }

  requireOnlyFlags(flags, ["--snapshot", "--out"]);
  const snapshotPath = flags.get("--snapshot");
  const outputDirectory = flags.get("--out");
  if (!snapshotPath || !outputDirectory) {
    throw configurationError("reconcile requires --snapshot and --out");
  }
  return { command, snapshotPath, outputDirectory };
}

async function requireNewOutputPath(path: string): Promise<void> {
  try {
    await lstat(path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return;
    throw configurationError("Output path could not be inspected");
  }
  throw configurationError("Output path already exists");
}

async function defaultRepositoryCommit(root: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["rev-parse", "HEAD"],
      { cwd: root, windowsHide: true },
    );
    const commit = stdout.trim();
    if (!/^[0-9a-f]{40,64}$/.test(commit)) throw new Error("Invalid commit");
    return commit;
  } catch {
    throw configurationError("Repository commit could not be resolved");
  }
}

const defaultDependencies: CliDependencies = {
  environment: process.env,
  repositoryRoot: process.cwd(),
  now: () => new Date(),
  stdout: (message) => console.log(message),
  stderr: (message) => console.error(message),
  repositoryCommit: defaultRepositoryCommit,
  capture: (input) => MySqlReadOnlySource.capture(input),
};

function decisionExitCode(decision: OverallDecision): 0 | 10 | 20 | 30 {
  return decision.exitCode;
}

async function renderAndWrite(
  snapshot: ReconciliationSnapshot,
  outputDirectory: string,
  now: Date,
  dependencies: CliDependencies,
  repositoryCommit: string,
): Promise<0 | 10 | 20 | 30> {
  const manifest = await readRepositoryManifest(dependencies.repositoryRoot);
  const report = reconcile({
    manifest,
    snapshot,
    contracts: migrationContracts,
    policy: loadCollationPolicy(snapshot.collation_profile),
    freshness: evaluateSnapshotFreshness(snapshot, now),
    repositoryCommit,
  });
  const proposedSql = renderProposedSql(report, {
    manifest,
    generatedAt: now.toISOString(),
  });
  await writeArtifactBundle({
    outputDirectory,
    snapshot,
    report,
    proposedSql,
  });
  dependencies.stdout(`Overall decision: ${report.decision.kind}`);
  return decisionExitCode(report.decision);
}

export async function runCli(
  args: string[],
  overrides: Partial<CliDependencies> = {},
): Promise<0 | 10 | 20 | 30> {
  const dependencies = { ...defaultDependencies, ...overrides };
  try {
    const normalizedArgs = args[0] === "--" ? args.slice(1) : args;
    const parsed = parseArguments(normalizedArgs);
    if (parsed.command === "help") {
      dependencies.stdout(helpText);
      return 0;
    }
    await requireNewOutputPath(parsed.outputDirectory);
    const now = dependencies.now();
    if (parsed.command === "reconcile") {
      const snapshot = await JsonSnapshotSource.load(parsed.snapshotPath, now);
      const repositoryCommit = await dependencies.repositoryCommit(
        dependencies.repositoryRoot,
      );
      return await renderAndWrite(
        snapshot,
        parsed.outputDirectory,
        now,
        dependencies,
        repositoryCommit,
      );
    }

    const manifest = await readRepositoryManifest(dependencies.repositoryRoot);
    const repositoryCommit = await dependencies.repositoryCommit(
      dependencies.repositoryRoot,
    );
    const snapshot = await dependencies.capture({
      config: readMySqlCaptureConfig(dependencies.environment),
      manifest,
      contracts: migrationContracts,
      profile: parsed.profile,
      repositoryCommit,
      capturedAt: now,
    });
    return await renderAndWrite(
      snapshot,
      parsed.outputDirectory,
      now,
      dependencies,
      repositoryCommit,
    );
  } catch (error) {
    if (error instanceof MigrationReconciliationError) {
      dependencies.stderr(`Migration reconciliation failed: ${error.code}: ${error.message}`);
    } else {
      dependencies.stderr("Migration reconciliation failed: unexpected operational error");
    }
    return 30;
  }
}

if (
  process.argv[1]
  && /migration-reconciliation[\\/]cli\.(?:ts|js)$/i.test(process.argv[1])
) {
  void runCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
