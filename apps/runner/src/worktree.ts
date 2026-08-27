import { copyFileSync, existsSync, mkdirSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { purserDir } from "./config.ts";
import { countDirtyPaths, isGitRepo } from "./git.ts";
import { isInsideRoot } from "./paths.ts";

function resolveRelativePath(root: string, relativePath: string): string {
  if (relativePath.startsWith("/") || relativePath.split("/").includes("..")) {
    throw new Error("path must be workspace-relative");
  }
  const rootReal = realpathSync(root);
  const joined = resolve(join(rootReal, relativePath));
  if (!isInsideRoot(joined, rootReal)) {
    throw new Error("path escapes the workspace");
  }
  return joined;
}

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

/** Copy an approved file from the session worktree into the user's open workspace folder. */
export function applyApprovedPath(
  worktreePath: string,
  workspaceAbsPath: string,
  relativePath: string,
): { ok: boolean; detail: string } {
  try {
    const src = resolveRelativePath(worktreePath, relativePath);
    const dest = resolveRelativePath(workspaceAbsPath, relativePath);
    if (!existsSync(src)) {
      return { ok: false, detail: `no file at ${relativePath} in the session worktree` };
    }
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    return { ok: true, detail: `applied ${relativePath} to your workspace folder` };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : "apply failed" };
  }
}

export function worktreeSessionNotice(workspaceAbsPath: string): string | null {
  if (!isGitRepo(workspaceAbsPath)) {
    return null;
  }
  const dirty = countDirtyPaths(workspaceAbsPath);
  if (dirty === 0) {
    return "Session runs in an isolated git worktree at last commit (HEAD). The agent does not see uncommitted files in your open folder. Approving a diff copies that file into your open folder.";
  }
  const noun = dirty === 1 ? "change" : "changes";
  return `Session runs in an isolated git worktree at last commit (HEAD). Your open folder has ${dirty} uncommitted ${noun} the agent will not see — commit or stash first if it needs your current files. Approving a diff copies that file into your open folder.`;
}
