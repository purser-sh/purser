import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gateToolCall } from "./tool-gate.ts";
import { runGatedTool } from "./generic-llm/tools.ts";
import { ApprovedShellCommand } from "./shell-execute.ts";
import { classifyShellCommand } from "./shell-classify.ts";
import { formatMissingPath, resolveRequestedPath, suggestNearPaths } from "./path-suggest.ts";
import { which } from "./cli/which.ts";

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

async function executeTool(input: { name: string; args: Record<string, unknown>; cwd: string }) {
  const gate = gateToolCall(input.name, JSON.stringify(input.args), REGISTERED);
  if (!gate.ok) {
    return { ok: false, output: gate.reason, summary: gate.reason };
  }
  if (gate.name === "run_bash") {
    const command = (gate.args as { command: string }).command;
    const classification = classifyShellCommand(command);
    if (classification.kind === "refused") {
      return { ok: false, output: classification.reason, summary: classification.reason };
    }
    return runGatedTool({
      gate: gate as Extract<typeof gate, { name: "run_bash" }>,
      cwd: input.cwd,
      mutationPolicy: "commit-immediate",
      approvedShell: ApprovedShellCommand.fromImmediate(command, classification),
    });
  }
  return runGatedTool({
    gate: gate as Extract<typeof gate, { name: Exclude<typeof gate.name, "run_bash"> }>,
    cwd: input.cwd,
    mutationPolicy: "commit-immediate",
  });
}

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), ".tmp-tools-"));
  writeFileSync(join(root, "README.md"), "# Hello\n");
  writeFileSync(join(root, "package.json"), "{}\n");
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "index.ts"), "export {}\n");
  return root;
}

describe("path suggestions", () => {
  test("resolves an unambiguous extensionless README to README.md", () => {
    const root = workspace();
    expect(resolveRequestedPath(root, "README")).toEqual({ kind: "resolved", path: "README.md" });
  });

  test("lists near matches when the path is wrong", () => {
    const root = workspace();
    const suggestions = suggestNearPaths(root, "READM");
    expect(suggestions).toContain("README.md");
    expect(formatMissingPath("READM", suggestions)).toContain("Did you mean");
  });
});

describe("tool smoke against a real workspace", () => {
  const savedPath = process.env.PATH;

  afterEach(() => {
    process.env.PATH = savedPath;
  });

  test("read_file recovers from README → README.md", async () => {
    const root = workspace();
    const result = await executeTool({ name: "read_file", args: { path: "README" }, cwd: root });
    expect(result.ok).toBe(true);
    expect(String(result.output)).toContain("# Hello");
  });

  test("read_file names near matches on a miss", async () => {
    const root = workspace();
    const result = await executeTool({ name: "read_file", args: { path: "READM" }, cwd: root });
    expect(result.ok).toBe(false);
    expect(String(result.output)).toContain("Did you mean");
    expect(String(result.output)).toContain("README.md");
  });

  test("list_dir lists the workspace root", async () => {
    const root = workspace();
    const result = await executeTool({ name: "list_dir", args: { path: "." }, cwd: root });
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result.output)).toContain("README.md");
  });

  test("write_file then read_file roundtrips", async () => {
    const root = workspace();
    const wrote = await executeTool({
      name: "write_file",
      args: { path: "note.txt", content: "hi" },
      cwd: root,
    });
    expect(wrote.ok).toBe(true);
    const read = await executeTool({ name: "read_file", args: { path: "note.txt" }, cwd: root });
    expect(read.ok).toBe(true);
    expect(read.output).toBe("hi");
  });

  test("run_bash succeeds", async () => {
    const root = workspace();
    const result = await executeTool({ name: "run_bash", args: { command: "echo ok" }, cwd: root });
    expect(result.ok).toBe(true);
    expect(String(result.output)).toContain("ok");
  });

  test("ripgrep_search finds a hit when rg is on PATH", async () => {
    const root = workspace();
    if (which("rg") === null) {
      // Environment without rg: assert the failure names the cause.
      const missing = await executeTool({
        name: "ripgrep_search",
        args: { query: "Hello" },
        cwd: root,
      });
      expect(missing.ok).toBe(false);
      expect(String(missing.output)).toMatch(/Cause: rg not on PATH/i);
      return;
    }
    const result = await executeTool({
      name: "ripgrep_search",
      args: { query: "Hello" },
      cwd: root,
    });
    expect(result.ok).toBe(true);
    expect(String(result.output)).toContain("README.md");
  });

  test("ripgrep_search says when rg is missing from PATH", async () => {
    const root = workspace();
    process.env.PATH = "/usr/bin:/bin";
    const result = await executeTool({
      name: "ripgrep_search",
      args: { query: "Hello" },
      cwd: root,
    });
    if (which("rg") !== null) {
      // System rg exists — search should still work.
      expect(result.ok).toBe(true);
      return;
    }
    expect(result.ok).toBe(false);
    expect(String(result.output)).toMatch(/Cause: rg not on PATH/i);
  });

  test("ripgrep_search names invalid regex separately from PATH failures", async () => {
    const root = workspace();
    const binDir = mkdtempSync(join(tmpdir(), ".tmp-rg-stub-"));
    const stub = join(binDir, "rg");
    writeFileSync(
      stub,
      `#!/bin/sh
echo "rg: regex parse error:" >&2
echo "    (?:[invalid)" >&2
echo "error: unclosed character class" >&2
exit 2
`,
    );
    chmodSync(stub, 0o755);
    process.env.PATH = binDir;
    const result = await executeTool({
      name: "ripgrep_search",
      args: { query: "[invalid" },
      cwd: root,
    });
    expect(result.ok).toBe(false);
    expect(String(result.output)).toMatch(/Cause: invalid regex/i);
  });

  test("apply_patch reports a clear failure on a bad patch", async () => {
    const root = workspace();
    const result = await executeTool({
      name: "apply_patch",
      args: { patch: "not a patch" },
      cwd: root,
    });
    expect(result.ok).toBe(false);
  });

  test("web_search without a key says so", async () => {
    const root = workspace();
    const result = await executeTool({ name: "web_search", args: { query: "purser" }, cwd: root });
    expect(result.ok).toBe(true);
    expect(String(result.output)).toContain("not configured");
  });
});
