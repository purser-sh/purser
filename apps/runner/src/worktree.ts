import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { purserDir } from "./config.ts";
import { isGitRepo } from "./git.ts";

export function createSessionWorktree(workspaceAbsPath: string, sessionId: string): string | null {
  if (!isGitRepo(workspaceAbsPath)) {
    return null;
  }
  const dest = join(purserDir(), "worktrees", sessionId);
  if (existsSync(dest)) {
    return dest;
  }
  mkdirSync(join(purserDir(), "worktrees"), { recursive: true, mode: 0o700 });
  const branch = `purser/${sessionId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24)}`;
  const result = spawnSync(
    "git",
    ["-C", workspaceAbsPath, "worktree", "add", "-b", branch, dest, "HEAD"],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    const retry = spawnSync("git", ["-C", workspaceAbsPath, "worktree", "add", dest, "HEAD"], {
      encoding: "utf8",
    });
    if (retry.status !== 0) {
      return null;
    }
  }
  return dest;
}

export function removeSessionWorktree(worktreePath: string | null): void {
  if (worktreePath === null || !existsSync(worktreePath)) {
    return;
  }
  spawnSync("git", ["worktree", "remove", "-f", worktreePath], { encoding: "utf8" });
}

export function revertPath(cwd: string, relativePath: string): { ok: boolean; detail: string } {
  const result = spawnSync("git", ["-C", cwd, "restore", "--source=HEAD", "--", relativePath], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    return { ok: false, detail: (result.stderr || result.stdout).trim() || "git restore failed" };
  }
  return { ok: true, detail: `reverted ${relativePath}` };
}

export function keepPath(cwd: string, relativePath: string): { ok: boolean; detail: string } {
  const result = spawnSync("git", ["-C", cwd, "add", "--", relativePath], { encoding: "utf8" });
  if (result.status !== 0) {
    return { ok: false, detail: (result.stderr || result.stdout).trim() || "git add failed" };
  }
  return { ok: true, detail: `kept ${relativePath}` };
}
