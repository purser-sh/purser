import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readWorkspaceFile, resolveInRoot, SandboxError } from "./sandbox.ts";
import { gateToolCall } from "./tool-gate.ts";
import { runGatedTool } from "./generic-llm/tools.ts";
import { mapJsonlEvent } from "./cli/map-jsonl.ts";
import { which } from "./cli/which.ts";

const REGISTERED = new Set([
  "read_file",
  "write_file",
  "apply_patch",
  "list_dir",
  "ripgrep_search",
  "run_bash",
  "web_search",
]);

async function executeTool(input: { name: string; args: Record<string, unknown>; cwd: string }) {
  const gate = gateToolCall(input.name, JSON.stringify(input.args), REGISTERED);
  if (!gate.ok) {
    return { ok: false, output: gate.reason, summary: gate.reason };
  }
  if (gate.name === "run_bash") {
    throw new Error("adapter.test does not exercise run_bash");
  }
  return runGatedTool({
    gate: gate as Extract<typeof gate, { name: Exclude<typeof gate.name, "run_bash"> }>,
    cwd: input.cwd,
    mutationPolicy: "commit-immediate",
  });
}

describe("sandbox", () => {
  test("rejects path traversal", () => {
    const root = mkdtempSync(join(tmpdir(), ".tmp-sb-"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "a.ts"), "export {}\n");
    expect(() => resolveInRoot(root, "../etc/passwd")).toThrow(SandboxError);
    expect(readWorkspaceFile(root, "src/a.ts", 1000)).toContain("export");
  });
});

describe("tools", () => {
  test("lists and reads inside the workspace", async () => {
    const root = mkdtempSync(join(tmpdir(), ".tmp-tool-"));
    writeFileSync(join(root, "hello.txt"), "hi\n");
    const listed = await executeTool({ name: "list_dir", args: { path: "." }, cwd: root });
    expect(listed.ok).toBe(true);
    const read = await executeTool({ name: "read_file", args: { path: "hello.txt" }, cwd: root });
    expect(read.output).toBe("hi\n");
  });
});

describe("jsonl mapper", () => {
  test("maps a text delta and result", () => {
    expect(mapJsonlEvent({ type: "assistant.delta", delta: "Hi" })).toEqual([
      { kind: "text_delta", text: "Hi" },
    ]);
    const done = mapJsonlEvent({ type: "result", result: "ok", usage: { input_tokens: 1, output_tokens: 2 } });
    expect(done).toContainEqual({
      kind: "usage",
      inputTokens: 1,
      outputTokens: 2,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      source: "provider_usage",
    });
    expect(done.some((event) => event.kind === "done")).toBe(true);
  });
});

describe("which", () => {
  test("finds sh", () => {
    expect(which("sh")).not.toBeNull();
    expect(which("definitely-not-a-binary-purser")).toBeNull();
  });
});
