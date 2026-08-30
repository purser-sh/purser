import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createShellRestorePoint, undoShellRestorePoint } from "./shell-snapshot.ts";

function gitInit(cwd: string): void {
  spawnSync("git", ["init"], { cwd, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "test@purser.local"], { cwd, encoding: "utf8" });
  spawnSync("git", ["config", "user.name", "Purser Test"], { cwd, encoding: "utf8" });
}

describe("shell restore points", () => {
  test("a mutating command in a git repo produces a restore point", () => {
    const root = mkdtempSync(join(tmpdir(), "purser-shell-git-"));
    writeFileSync(join(root, "README.md"), "before\n");
    gitInit(root);
    spawnSync("git", ["add", "README.md"], { cwd: root, encoding: "utf8" });
    spawnSync("git", ["commit", "-m", "init"], { cwd: root, encoding: "utf8" });
    writeFileSync(join(root, "README.md"), "after\n");

    const sessionId = "ses_shell_test";
    const restorePointId = "shell_test_point";
    const snapshot = createShellRestorePoint(sessionId, root, restorePointId);
    expect(snapshot.undoAvailable).toBe(true);
    expect(snapshot.restorePointId).toBe(restorePointId);

    const undo = undoShellRestorePoint(sessionId);
    expect(undo.ok).toBe(true);
    expect(readFileSync(join(root, "README.md"), "utf8")).toBe("before\n");
  });

  test("in a non-git folder the card says undo is unavailable", () => {
    const root = mkdtempSync(join(tmpdir(), "purser-shell-nogit-"));
    mkdirSync(root, { recursive: true });
    const snapshot = createShellRestorePoint("ses_nogit", root, "shell_nogit");
    expect(snapshot.undoAvailable).toBe(false);
    expect(snapshot.undoNote).toContain("isn't a git repository");
  });
});
