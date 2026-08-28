import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const ADAPTERS_SRC = join(ROOT, "src");
const RUNNER_SRC = join(ROOT, "..", "..", "apps", "runner", "src");

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

describe("workspace write path enforcement", () => {
  test("commitToWorkspace is the only workspace content writer in adapters and runner", () => {
    const allowed = new Set([join(ADAPTERS_SRC, "workspace-write.ts")]);
    const offenders: string[] = [];
    for (const file of [...collectTsFiles(ADAPTERS_SRC), ...collectTsFiles(RUNNER_SRC)]) {
      if (allowed.has(file)) {
        continue;
      }
      const source = readFileSync(file, "utf8");
      if (/\bwriteWorkspaceFile\b/.test(source)) {
        offenders.push(file);
      }
      if (/writeFileSync\([^)]*resolveInRoot|writeFileSync\([^)]*workspace/i.test(source)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
