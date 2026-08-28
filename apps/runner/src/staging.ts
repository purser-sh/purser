import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  ApprovedChange,
  commitToWorkspace,
  commitToWorkspaceAcknowledged,
  StagedChange,
  type SizeDeltaWarning,
} from "@purser-sh/adapters";
import { purserDir } from "./config.ts";

type StagedEntry = {
  path: string;
  newContent: string;
  oldContent: string;
  patch: string;
  added: number;
  removed: number;
};

function stagingFile(sessionId: string, relativePath: string): string {
  const safe = relativePath.replace(/[^a-zA-Z0-9._/-]/g, "_");
  return join(purserDir(), "staging", sessionId, `${safe}.json`);
}

export function writeStaged(sessionId: string, fileDiff: {
  path: string;
  newContent: string;
  oldContent?: string;
  patch: string;
  added: number;
  removed: number;
}): void {
  const file = stagingFile(sessionId, fileDiff.path);
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(
    file,
    JSON.stringify({
      path: fileDiff.path,
      newContent: fileDiff.newContent,
      oldContent: fileDiff.oldContent ?? "",
      patch: fileDiff.patch,
      added: fileDiff.added,
      removed: fileDiff.removed,
    } satisfies StagedEntry),
    { mode: 0o600 },
  );
}

export function readStaged(sessionId: string, relativePath: string): StagedEntry | null {
  const file = stagingFile(sessionId, relativePath);
  if (!existsSync(file)) {
    return null;
  }
  return JSON.parse(readFileSync(file, "utf8")) as StagedEntry;
}

export function hasStaged(sessionId: string, relativePath: string): boolean {
  return existsSync(stagingFile(sessionId, relativePath));
}

export function discardStaged(sessionId: string, relativePath: string): { ok: boolean; detail: string } {
  const file = stagingFile(sessionId, relativePath);
  if (!existsSync(file)) {
    return { ok: false, detail: `no staged change for ${relativePath}` };
  }
  rmSync(file);
  return { ok: true, detail: `discarded staged change for ${relativePath}` };
}

function stagedFromEntry(entry: StagedEntry): StagedChange {
  return StagedChange.create({
    path: entry.path,
    newContent: entry.newContent,
    oldContent: entry.oldContent,
    patch: entry.patch,
    added: entry.added,
    removed: entry.removed,
  });
}

export function applyStaged(
  sessionId: string,
  relativePath: string,
  workspaceAbsPath: string,
  worktreePath: string | null,
): { ok: boolean; detail: string; sizeDeltaWarning?: SizeDeltaWarning } {
  const entry = readStaged(sessionId, relativePath);
  if (entry === null) {
    return { ok: false, detail: `no staged change for ${relativePath}` };
  }
  const staged = stagedFromEntry(entry);
  const approved = ApprovedChange.fromApproval(staged, { kind: "approve" });
  const commit = commitToWorkspace(approved, workspaceAbsPath);
  if (commit.status === "size_delta_warning") {
    commitToWorkspaceAcknowledged(approved, workspaceAbsPath);
    if (worktreePath !== null) {
      commitToWorkspaceAcknowledged(approved, worktreePath);
    }
    rmSync(stagingFile(sessionId, relativePath));
    return {
      ok: true,
      detail: commit.warning.message,
      sizeDeltaWarning: commit.warning,
    };
  }
  if (worktreePath !== null) {
    commitToWorkspaceAcknowledged(approved, worktreePath);
  }
  rmSync(stagingFile(sessionId, relativePath));
  return { ok: true, detail: `applied ${relativePath} to your workspace folder` };
}
