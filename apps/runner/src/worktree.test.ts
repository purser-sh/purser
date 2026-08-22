import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createSessionWorktree, keepPath, removeSessionWorktree, revertPath } from "./worktree.ts";

describe("session worktree", () => {
  test("creates a worktree for a git repo and reverts a file", () => {
    const home = mkdtempSync(join("/home/aksingh/AgentDeck", ".tmp-home-wt-"));
    process.env.AGENTDECK_HOME = home;
    const repo = mkdtempSync(join("/home/aksingh/AgentDeck", ".tmp-git-"));
    spawnSync("git", ["-C", repo, "init"], { encoding: "utf8" });
    spawnSync("git", ["-C", repo, "config", "user.email", "test@agentdeck.local"], { encoding: "utf8" });
    spawnSync("git", ["-C", repo, "config", "user.name", "AgentDeck"], { encoding: "utf8" });
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
    removeSessionWorktree(dest);
  });

  test("returns null for a non-git folder", () => {
    const dir = mkdtempSync(join("/home/aksingh/AgentDeck", ".tmp-nogit-"));
    mkdirSync(join(dir, "src"));
    expect(createSessionWorktree(dir, "ses_none")).toBeNull();
  });
});
