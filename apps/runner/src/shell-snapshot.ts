import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { which } from "@purser-sh/adapters";
import { purserDir } from "./config.ts";

export type ShellRestorePoint = {
  restorePointId: string;
  sessionId: string;
  cwd: string;
  stashRef: string | null;
  headCommit: string | null;
  createdAt: string;
};

const WORKTREE_BYTE_CAP = 50 * 1024 * 1024;

function restoreDir(sessionId: string): string {
  return join(purserDir(), "shell-restore", sessionId);
}

function restorePath(sessionId: string): string {
  return join(restoreDir(sessionId), "latest.json");
}

function isGitRepo(cwd: string): boolean {
  const git = which("git");
  if (git === null) {
    return false;
  }
  const result = spawnSync(git, ["rev-parse", "--is-inside-work-tree"], { cwd, encoding: "utf8" });
  return result.status === 0 && result.stdout.trim() === "true";
}

function workingTreeBytes(cwd: string): number | null {
  const du = which("du");
  if (du === null) {
    return null;
  }
  const result = spawnSync(du, ["-sb", "."], { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    return null;
  }
  const match = result.stdout.trim().split(/\s+/)[0];
  const kb = match !== undefined ? Number(match) : Number.NaN;
  return Number.isFinite(kb) ? kb * 1024 : null;
}

export function readShellRestorePoint(sessionId: string): ShellRestorePoint | null {
  const path = restorePath(sessionId);
  if (!existsSync(path)) {
    return null;
  }
  return JSON.parse(readFileSync(path, "utf8")) as ShellRestorePoint;
}

export function createShellRestorePoint(
  sessionId: string,
  cwd: string,
  restorePointId: string,
): {
  undoAvailable: boolean;
  undoNote: string;
  restorePointId: string;
} {
  if (!isGitRepo(cwd)) {
    return {
      restorePointId,
      undoAvailable: false,
      undoNote: "No undo available — this folder isn't a git repository.",
    };
  }
  const bytes = workingTreeBytes(cwd);
  if (bytes !== null && bytes > WORKTREE_BYTE_CAP) {
    return {
      restorePointId,
      undoAvailable: false,
      undoNote: "No undo snapshot — the working tree is too large for Purser to capture safely.",
    };
  }
  const git = which("git")!;
  const head = spawnSync(git, ["rev-parse", "HEAD"], { cwd, encoding: "utf8" });
  const stash = spawnSync(git, ["stash", "create"], { cwd, encoding: "utf8" });
  const point: ShellRestorePoint = {
    restorePointId,
    sessionId,
    cwd,
    stashRef: stash.status === 0 && stash.stdout.trim().length > 0 ? stash.stdout.trim() : null,
    headCommit: head.status === 0 ? head.stdout.trim() : null,
    createdAt: new Date().toISOString(),
  };
  mkdirSync(restoreDir(sessionId), { recursive: true, mode: 0o700 });
  writeFileSync(restorePath(sessionId), `${JSON.stringify(point, null, 2)}\n`, { mode: 0o600 });
  return {
    restorePointId,
    undoAvailable: true,
    undoNote: "Undo last command is available for this session.",
  };
}

export function undoShellRestorePoint(sessionId: string): { ok: boolean; detail: string } {
  const point = readShellRestorePoint(sessionId);
  if (point === null) {
    return { ok: false, detail: "No shell restore point for this session." };
  }
  const git = which("git");
  if (git === null) {
    return { ok: false, detail: "git is not on PATH." };
  }
  if (point.stashRef !== null) {
    const apply = spawnSync(git, ["stash", "apply", point.stashRef], {
      cwd: point.cwd,
      encoding: "utf8",
    });
    if (apply.status === 0) {
      return { ok: true, detail: "Restored workspace from the shell restore point." };
    }
    const retry = spawnSync(git, ["stash", "apply", "--index", point.stashRef], {
      cwd: point.cwd,
      encoding: "utf8",
    });
    if (retry.status === 0) {
      return { ok: true, detail: "Restored workspace from the shell restore point." };
    }
  }
  if (point.headCommit !== null) {
    const reset = spawnSync(git, ["reset", "--hard", point.headCommit], { cwd: point.cwd, encoding: "utf8" });
    if (reset.status !== 0) {
      return { ok: false, detail: reset.stderr || reset.stdout || "git reset failed" };
    }
    return { ok: true, detail: "Restored workspace to the pre-command commit." };
  }
  return { ok: false, detail: "Restore point has no stash or commit." };
}
