import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { which } from "./cli/which.ts";

function countDiffLines(patch: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")) {
      continue;
    }
    if (line.startsWith("+")) {
      added += 1;
    } else if (line.startsWith("-")) {
      removed += 1;
    }
  }
  return { added, removed };
}

function buildSimpleDiff(relativePath: string, oldContent: string, newContent: string): {
  patch: string;
  added: number;
  removed: number;
} {
  const oldLines = oldContent.length > 0 ? oldContent.replace(/\n$/, "").split("\n") : [];
  const newLines = newContent.length > 0 ? newContent.replace(/\n$/, "").split("\n") : [];
  const lines = [`--- a/${relativePath}`, `+++ b/${relativePath}`, `@@ -1,${oldLines.length} +1,${newLines.length} @@`];
  for (const line of oldLines) {
    lines.push(`-${line}`);
  }
  for (const line of newLines) {
    lines.push(`+${line}`);
  }
  const patch = lines.join("\n");
  return { patch, added: newLines.length, removed: oldLines.length };
}

/** Build a unified diff between two file contents. */
export function buildUnifiedDiff(
  relativePath: string,
  oldContent: string,
  newContent: string,
): { patch: string; added: number; removed: number } {
  if (oldContent === newContent) {
    return { patch: "", added: 0, removed: 0 };
  }
  const dir = mkdtempSync(join(tmpdir(), "purser-diff-"));
  try {
    const oldPath = join(dir, "old");
    const newPath = join(dir, "new");
    writeFileSync(oldPath, oldContent);
    writeFileSync(newPath, newContent);
    const git = which("git");
    if (git !== null) {
      const result = spawnSync(git, ["diff", "--no-index", "--no-color", "--", oldPath, newPath], {
        encoding: "utf8",
      });
      const raw = (result.stdout ?? "").trimEnd();
      if (raw.length > 0) {
        const patch = raw
          .replace(/^--- .*\/old$/m, `--- a/${relativePath}`)
          .replace(/^\+\+\+ .*\/new$/m, `+++ b/${relativePath}`);
        return { patch, ...countDiffLines(patch) };
      }
    }
    return buildSimpleDiff(relativePath, oldContent, newContent);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Paths referenced in a unified diff (---/+++ headers). */
export function pathsFromPatch(patch: string): string[] {
  const paths = new Set<string>();
  for (const line of patch.split("\n")) {
    const match = line.match(/^(?:---|\+\+\+) [ab]\/(.*)$/);
    if (match?.[1] !== undefined && match[1] !== "/dev/null") {
      paths.add(match[1]);
    }
  }
  return [...paths];
}
