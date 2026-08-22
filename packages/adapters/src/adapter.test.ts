import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readWorkspaceFile, resolveInRoot, SandboxError } from "./sandbox.ts";
import { executeTool } from "./generic-llm/tools.ts";
import { mapJsonlEvent } from "./cli/map-jsonl.ts";
import { which } from "./cli/which.ts";

describe("sandbox", () => {
  test("rejects path traversal", () => {
    const root = mkdtempSync(join("/home/aksingh/AgentDeck", ".tmp-sb-"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "a.ts"), "export {}\n");
    expect(() => resolveInRoot(root, "../etc/passwd")).toThrow(SandboxError);
    expect(readWorkspaceFile(root, "src/a.ts", 1000)).toContain("export");
  });
});

describe("tools", () => {
  test("lists and reads inside the workspace", async () => {
    const root = mkdtempSync(join("/home/aksingh/AgentDeck", ".tmp-tool-"));
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
    expect(done.some((event) => event.kind === "done")).toBe(true);
  });
});

describe("which", () => {
  test("finds sh", () => {
    expect(which("sh")).not.toBeNull();
    expect(which("definitely-not-a-binary-agentdeck")).toBeNull();
  });
});
