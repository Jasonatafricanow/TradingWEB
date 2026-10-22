import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

// These existing suites use node:test, not Vitest. Pass concrete paths so the
// command works without shell glob expansion on Windows and Linux.
const directories = [
  "src/config/__tests__",
  "src/lib/__tests__",
  "src/services/payment/__tests__",
  "src/app/api/payment/__tests__",
];
const files = directories.flatMap((directory) =>
  readdirSync(directory).filter((name) => name.endsWith(".test.ts"))
    .map((name) => `${directory}/${name}`),
);
const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...files], {
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
