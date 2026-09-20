import { access, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, execFileSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

import { MigrationReconciliationError } from "../errors";
import { runCli } from "../cli";
import {
  buildReconcileFixture,
  refreshFixtureFingerprint,
  removeJournalRowsFrom,
} from "./reconcile-fixture";

function currentRepositoryHead(): string {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();
}

async function bindSnapshotToHead(
  fixture: Awaited<ReturnType<typeof buildReconcileFixture>>,
  head = currentRepositoryHead(),
): Promise<void> {
  fixture.snapshot.repository_commit = head;
  fixture.repositoryCommit = head;
  refreshFixtureFingerprint(fixture.snapshot);
}

const temporaryDirectories: string[] = [];
const cliPath = join(
  process.cwd(),
  "scripts",
  "migration-reconciliation",
  "cli.ts",
);

async function temporaryParent(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "migration-cli-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    ),
  );
});

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function spawnCli(
  args: string[],
  environment: Readonly<Record<string, string | undefined>> = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", cliPath, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, ...environment },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ exitCode: code ?? 30, stdout, stderr });
    });
  });
}

async function writeSnapshot(
  path: string,
  snapshot: Awaited<ReturnType<typeof buildReconcileFixture>>["snapshot"],
): Promise<void> {
  await writeFile(path, JSON.stringify(snapshot), "utf8");
}

describe("migration reconciliation CLI boundaries", () => {
  it("help lists only capture and reconcile", async () => {
    const result = await spawnCli(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("capture --out");
    expect(result.stdout).toContain("reconcile --snapshot");
    expect(result.stdout).not.toMatch(/\b(?:apply|repair|execute)\b/i);
  });

  it.each(["unknown", "apply", "repair", "execute"])(
    "rejects unknown command %s with exit 30 without printing environment values",
    async (command) => {
      const result = await spawnCli([command], {
        DB_PASSWORD: "sentinel-password-value",
      });

      expect(result.exitCode).toBe(30);
      expect(`${result.stdout}${result.stderr}`)
        .not.toContain("sentinel-password-value");
    },
    15_000,
  );

  it("rejects missing flags before creating the output directory", async () => {
    const parent = await temporaryParent();
    const output = join(parent, "must-not-exist");

    const result = await spawnCli(["reconcile", "--out", output]);

    expect(result.exitCode).toBe(30);
    expect(await pathExists(output)).toBe(false);
  });

  it("writes reports without SQL and exits 20 for blocked evidence", async () => {
    const parent = await temporaryParent();
    const fixture = await buildReconcileFixture();
    await bindSnapshotToHead(fixture);
    fixture.snapshot.aggregates[0]!.count = "1";
    refreshFixtureFingerprint(fixture.snapshot);
    const snapshotPath = join(parent, "blocked.json");
    const output = join(parent, "blocked-output");
    await writeSnapshot(snapshotPath, fixture.snapshot);

    const result = await spawnCli([
      "reconcile",
      "--snapshot",
      snapshotPath,
      "--out",
      output,
    ]);

    expect(result.exitCode).toBe(20);
    expect(await readdir(output)).not.toContain("proposed-journal-repair.sql");
    expect(await readFile(join(output, "report.md"), "utf8"))
      .toContain("Overall decision: BLOCKED");
  });

  it("writes snapshot-bound SQL and exits 10 for an eligible suffix", async () => {
    const parent = await temporaryParent();
    const fixture = await buildReconcileFixture();
    await bindSnapshotToHead(fixture);
    removeJournalRowsFrom(fixture, "0026");
    const snapshotPath = join(parent, "eligible.json");
    const output = join(parent, "eligible-output");
    await writeSnapshot(snapshotPath, fixture.snapshot);

    const result = await spawnCli([
      "reconcile",
      "--snapshot",
      snapshotPath,
      "--out",
      output,
    ]);

    expect(result.exitCode).toBe(10);
    expect(await readdir(output)).toContain("proposed-journal-repair.sql");
  });

  it("exits 0 and writes no SQL for exact evidence", async () => {
    const parent = await temporaryParent();
    const fixture = await buildReconcileFixture();
    await bindSnapshotToHead(fixture);
    const snapshotPath = join(parent, "exact.json");
    const output = join(parent, "exact-output");
    await writeSnapshot(snapshotPath, fixture.snapshot);

    const result = await spawnCli([
      "reconcile",
      "--snapshot",
      snapshotPath,
      "--out",
      output,
    ]);

    expect(result.exitCode).toBe(0);
    expect(await readdir(output)).not.toContain("proposed-journal-repair.sql");
  });

  it("blocks a snapshot bound to a different repository commit with exit 20", async () => {
    const parent = await temporaryParent();
    const fixture = await buildReconcileFixture();
    await bindSnapshotToHead(fixture, "c".repeat(40));
    removeJournalRowsFrom(fixture, "0026");
    const snapshotPath = join(parent, "mismatched-commit.json");
    const output = join(parent, "mismatch-output");
    await writeSnapshot(snapshotPath, fixture.snapshot);

    const result = await spawnCli([
      "reconcile",
      "--snapshot",
      snapshotPath,
      "--out",
      output,
    ]);

    expect(result.exitCode).toBe(20);
    const report = JSON.parse(
      await readFile(join(output, "report.json"), "utf8"),
    ) as { decision: { kind: string }; findings: Array<{ code: string; expected: unknown; actual: unknown }> };
    expect(report.decision.kind).toBe("BLOCKED");
    expect(report.findings.some((finding) =>
      finding.code === "REPOSITORY_COMMIT_MISMATCH"
    )).toBe(true);
    expect(await readdir(output)).not.toContain("proposed-journal-repair.sql");
  });

  it("capture failure exits 30 and leaves no final artifacts", async () => {
    const parent = await temporaryParent();
    const output = join(parent, "capture-output");
    const stderr: string[] = [];

    const exitCode = await runCli(["capture", "--out", output], {
      environment: {
        DB_HOST: "db.internal",
        DB_PORT: "3306",
        DB_USER: "audit",
        DB_PASSWORD: "sentinel-password-value",
        DB_NAME: "pos",
      },
      capture: async () => {
        throw new MigrationReconciliationError(
          "CONNECTION_ERROR",
          "Read-only MySQL connection could not be established",
        );
      },
      stderr: (message) => stderr.push(message),
      stdout: () => undefined,
      now: () => new Date("2026-07-26T14:00:00.000Z"),
      repositoryCommit: async () => "b".repeat(40),
      repositoryRoot: process.cwd(),
    });

    expect(exitCode).toBe(30);
    expect(await pathExists(output)).toBe(false);
    expect(stderr.join("\n")).not.toContain("sentinel-password-value");
  });
});
