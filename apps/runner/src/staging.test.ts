import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gateToolCall, runGatedTool } from "@purser-sh/adapters";
import { applyStaged, discardStaged, writeStaged } from "./staging.ts";

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

describe("staged mutations safety", () => {
  test("ask-mode write_file leaves disk untouched until approve; reject preserves bytes", async () => {
    const home = mkdtempSync(join(tmpdir(), "purser-home-stage-"));
    process.env.PURSER_HOME = home;
    const root = mkdtempSync(join(tmpdir(), "purser-root-stage-"));
    const target = join(root, "README.md");
    const before = "# Purser\n\nLocal agents.\n";
    writeFileSync(target, before, "utf8");

    const gate = gateToolCall(
      "write_file",
      JSON.stringify({ path: "README.md", content: "<!-- Purser -->\n# Purser\n\nLocal agents.\n" }),
      REGISTERED,
    );
    expect(gate.ok).toBe(true);
    if (!gate.ok) {
      return;
    }
    const staged = await runGatedTool({
      gate: gate as Extract<typeof gate, { name: "write_file" }>,
      cwd: root,
      mutationPolicy: "stage-only",
    });
    expect(staged.ok).toBe(true);
    expect(staged.fileDiff?.staged).toBe(true);
    expect(readFileSync(target, "utf8")).toBe(before);

    writeStaged("ses_safety", {
      path: staged.fileDiff!.path,
      newContent: staged.fileDiff!.newContent!,
      oldContent: staged.fileDiff!.oldContent,
      patch: staged.fileDiff!.patch,
      added: staged.fileDiff!.added,
      removed: staged.fileDiff!.removed,
    });
    expect(discardStaged("ses_safety", "README.md").ok).toBe(true);
    expect(readFileSync(target, "utf8")).toBe(before);

    writeStaged("ses_safety", {
      path: staged.fileDiff!.path,
      newContent: staged.fileDiff!.newContent!,
      oldContent: staged.fileDiff!.oldContent,
      patch: staged.fileDiff!.patch,
      added: staged.fileDiff!.added,
      removed: staged.fileDiff!.removed,
    });
    expect(applyStaged("ses_safety", "README.md", root, null).ok).toBe(true);
    expect(readFileSync(target, "utf8")).toBe(staged.fileDiff!.newContent!);
    expect(staged.fileDiff!.patch).toContain("+<!-- Purser -->");
  });
});

describe("immediate mutations in auto_edit", () => {
  test("write_file applies immediately and returns a real unified diff", async () => {
    const root = mkdtempSync(join(tmpdir(), "purser-root-immediate-"));
    writeFileSync(join(root, "note.txt"), "alpha\n", "utf8");
    const gate = gateToolCall("write_file", JSON.stringify({ path: "note.txt", content: "beta\n" }), REGISTERED);
    expect(gate.ok).toBe(true);
    if (!gate.ok) {
      return;
    }
    const result = await runGatedTool({
      gate: gate as Extract<typeof gate, { name: "write_file" }>,
      cwd: root,
      mutationPolicy: "commit-immediate",
    });
    expect(result.ok).toBe(true);
    expect(readFileSync(join(root, "note.txt"), "utf8")).toBe("beta\n");
    expect(result.fileDiff?.patch).toContain("-alpha");
    expect(result.fileDiff?.patch).toContain("+beta");
    expect(result.fileDiff?.staged).toBeUndefined();
  });
});
