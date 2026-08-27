import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createSessionWorktree, applyApprovedPath, keepPath, removeSessionWorktree, revertPath, worktreeSessionNotice } from "./worktree.ts";

describe("session worktree", () => {
  test("creates a worktree for a git repo and reverts a file", () => {
    const home = mkdtempSync(join(tmpdir(), ".tmp-home-wt-"));
    process.env.PURSER_HOME = home;
    const repo = mkdtempSync(join(tmpdir(), ".tmp-git-"));
    spawnSync("git", ["-C", repo, "init"], { encoding: "utf8" });
    spawnSync("git", ["-C", repo, "config", "user.email", "test@purser.local"], { encoding: "utf8" });
    spawnSync("git", ["-C", repo, "config", "user.name", "Purser"], { encoding: "utf8" });
    writeFileSync(join(repo, "README.md"), "one\n");
    spawnSync("git", ["-C", repo, "add", "."], { encoding: "utf8" });
    spawnSync("git", ["-C", repo, "commit", "-m", "init"], { encoding: "utf8" });
    const dest = createSessionWorktree(repo, "ses_test_worktree");
    expect(dest).not.toBeNull();
    if (dest === null) {
      throw new Error("expected worktree");
    }
    writeFileSync(join(dest, "README.md"), "two\n");
    expect(revertPath(dest, "README.md").ok).toBe(true);
    expect(keepPath(dest, "README.md").ok).toBe(true);
    writeFileSync(join(dest, "README.md"), "three\n");
    expect(applyApprovedPath(dest, repo, "README.md").ok).toBe(true);
    expect(readFileSync(join(repo, "README.md"), "utf8")).toBe("three\n");
    removeSessionWorktree(dest);
  });

  test("warns when the open folder has uncommitted changes", () => {
    const repo = mkdtempSync(join(tmpdir(), ".tmp-git-dirty-"));
    spawnSync("git", ["-C", repo, "init"], { encoding: "utf8" });
    spawnSync("git", ["-C", repo, "config", "user.email", "test@purser.local"], { encoding: "utf8" });
    spawnSync("git", ["-C", repo, "config", "user.name", "Purser"], { encoding: "utf8" });
    writeFileSync(join(repo, "README.md"), "one\n");
    spawnSync("git", ["-C", repo, "add", "."], { encoding: "utf8" });
    spawnSync("git", ["-C", repo, "commit", "-m", "init"], { encoding: "utf8" });
    writeFileSync(join(repo, "README.md"), "dirty\n");
    const notice = worktreeSessionNotice(repo);
    expect(notice).toContain("uncommitted");
  });

  test("returns null for a non-git folder", () => {
    const dir = mkdtempSync(join(tmpdir(), ".tmp-nogit-"));
    mkdirSync(join(dir, "src"));
    expect(createSessionWorktree(dir, "ses_none")).toBeNull();
  });
});
