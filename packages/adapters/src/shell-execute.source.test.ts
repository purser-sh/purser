import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const ADAPTERS_SRC = join(ROOT, "src");
const RUNNER_SRC = join(ROOT, "..", "..", "apps", "runner", "src");
const EXECUTOR_FILE = join(ADAPTERS_SRC, "shell-execute.ts");
const GATE_FILE = join(ADAPTERS_SRC, "generic-llm", "tools.ts");

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectTsFiles(path));
      continue;
    }
    if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".guard.test.ts")) {
      out.push(path);
    }
  }
  return out;
}

describe("shell execute path enforcement", () => {
  test("executeApprovedShell is the only workspace shell executor and is called only from runGatedTool", () => {
    const executeCallSites: string[] = [];
    const spawnOffenders: string[] = [];

    for (const file of [...collectTsFiles(ADAPTERS_SRC), ...collectTsFiles(RUNNER_SRC)]) {
      if (file === EXECUTOR_FILE || file === join(ADAPTERS_SRC, "index.ts")) {
        continue;
      }
      const source = readFileSync(file, "utf8");
      if (/\bexecuteApprovedShell\s*\(/.test(source)) {
        executeCallSites.push(file);
      }
      if (/spawnSync\(\s*bash\s*,\s*\[\s*"-lc"/.test(source)) {
        spawnOffenders.push(file);
      }
    }

    expect(executeCallSites).toEqual([GATE_FILE]);
    expect(spawnOffenders).toEqual([]);

    const gateSource = readFileSync(GATE_FILE, "utf8");
    const executeMatches = gateSource.match(/\bexecuteApprovedShell\s*\(/g) ?? [];
    expect(executeMatches).toHaveLength(1);
    expect(gateSource).toMatch(/case "run_bash":[\s\S]*executeApprovedShell\s*\(/);
  });
});
