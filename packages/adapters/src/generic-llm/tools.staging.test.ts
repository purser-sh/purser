import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gateToolCall } from "../tool-gate.ts";
import { runGatedTool } from "./tools.ts";

const REGISTERED = new Set([
  "read_file",
  "read_document",
  "write_file",
  "apply_patch",
  "list_dir",
  "ripgrep_search",
  "run_bash",
  "web_search",
]);

async function runTool(
  name: string,
  args: unknown,
  cwd: string,
  mutationPolicy: "stage-only" | "commit-immediate" = "commit-immediate",
) {
  const gate = gateToolCall(name, typeof args === "string" ? args : JSON.stringify(args), REGISTERED);
  if (!gate.ok) {
    throw new Error(gate.reason);
  }
  if (gate.name === "run_bash") {
    throw new Error("staging tests do not exercise run_bash");
  }
  return runGatedTool({
    gate: gate as Extract<typeof gate, { name: Exclude<typeof gate.name, "run_bash"> }>,
    cwd,
    mutationPolicy,
  });
}

describe("mutating tool staging", () => {
  test("write_file in ask mode stages with a unified diff and does not write", async () => {
    const root = mkdtempSync(join(tmpdir(), "purser-stage-write-"));
    writeFileSync(join(root, "README.md"), "before\n", "utf8");
    const result = await runTool(
      "write_file",
      { path: "README.md", content: "after\n" },
      root,
      "stage-only",
    );
    expect(result.ok).toBe(true);
    expect(result.fileDiff?.staged).toBe(true);
    expect(result.fileDiff?.newContent).toBe("after\n");
    expect(result.fileDiff?.patch).toContain("-before");
    expect(result.fileDiff?.patch).toContain("+after");
    expect(await Bun.file(join(root, "README.md")).text()).toBe("before\n");
  });
});
