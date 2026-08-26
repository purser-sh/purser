import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyDropChange } from "./folder-watch.ts";

describe("drop folder copy", () => {
  test("copies new files into .inbox and skips the inbox itself", () => {
    const root = mkdtempSync(join(tmpdir(), ".tmp-drop-"));
    const source = join(root, "xyz");
    const inbox = join(root, "project", ".inbox");
    mkdirSync(source, { recursive: true });
    mkdirSync(inbox, { recursive: true });
    writeFileSync(join(source, "notes.md"), "hello");

    const added = applyDropChange({ sourceRoot: source, inboxRoot: inbox, relPath: "notes.md" });
    expect(added.action).toBe("added");
    expect(readFileSync(join(inbox, "notes.md"), "utf8")).toBe("hello");

    writeFileSync(join(source, "notes.md"), "hello world");
    const updated = applyDropChange({ sourceRoot: source, inboxRoot: inbox, relPath: "notes.md" });
    expect(updated.action).toBe("updated");

    const skipped = applyDropChange({
      sourceRoot: join(root, "project"),
      inboxRoot: inbox,
      relPath: ".inbox/notes.md",
    });
    expect(skipped.action).toBe("skipped");

    rmSync(join(source, "notes.md"));
    const removed = applyDropChange({ sourceRoot: source, inboxRoot: inbox, relPath: "notes.md" });
    expect(removed.action).toBe("removed");
  });
});
