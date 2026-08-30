import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ApprovedChange,
  StagedChange,
  checkSizeDelta,
  commitToWorkspace,
  gateToolCall,
  runGatedTool,
} from "@purser-sh/adapters";

const REGISTERED = new Set([
  "read_file",
  "write_file",
  "apply_patch",
  "list_dir",
  "ripgrep_search",
  "run_bash",
  "web_search",
]);

describe("ApprovedChange and commitToWorkspace", () => {
  test("zero-byte overwrite of a non-empty file raises a size-delta warning without writing", () => {
    const root = mkdtempSync(join(tmpdir(), "purser-size-delta-"));
    const target = join(root, "README.md");
    const before = "x".repeat(8412);
    writeFileSync(target, before, "utf8");

    const staged = StagedChange.create({
      path: "README.md",
      newContent: "",
      oldContent: before,
      patch: "",
      added: 0,
      removed: 1,
    });
    const approved = ApprovedChange.fromImmediate(staged);
    const result = commitToWorkspace(approved, root);
    expect(result.status).toBe("size_delta_warning");
    if (result.status === "size_delta_warning") {
      expect(result.warning.message).toBe("This will replace 8,412 bytes with 0.");
    }
    expect(readFileSync(target, "utf8")).toBe(before);
  });

  test("checkSizeDelta names exact byte counts", () => {
    expect(checkSizeDelta(8412, 0)?.message).toBe("This will replace 8,412 bytes with 0.");
  });

  test("ask mode cannot commit without an ApprovedChange mint path", async () => {
    const root = mkdtempSync(join(tmpdir(), "purser-ask-no-write-"));
    writeFileSync(join(root, "README.md"), "before\n", "utf8");
    const gate = gateToolCall(
      "write_file",
      JSON.stringify({ path: "README.md", content: "after\n" }),
      REGISTERED,
    );
    expect(gate.ok).toBe(true);
    if (!gate.ok) {
      return;
    }
    await runGatedTool({
      gate: gate as Extract<typeof gate, { name: "write_file" }>,
      cwd: root,
      mutationPolicy: "stage-only",
    });
    expect(readFileSync(join(root, "README.md"), "utf8")).toBe("before\n");
  });
});
