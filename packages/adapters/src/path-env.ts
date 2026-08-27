import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { which } from "./cli/which.ts";

const SUPPLEMENTAL_BIN_DIRS = [
  "/usr/share/cursor/resources/app/node_modules/@vscode/ripgrep/bin",
  "/usr/share/code/resources/app/node_modules/@vscode/ripgrep/bin",
  "/opt/homebrew/bin",
  "/usr/local/bin",
];

function mergePathFront(...segments: Array<string | undefined>): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const segment of segments) {
    if (segment === undefined || segment.length === 0) {
      continue;
    }
    for (const part of segment.split(":")) {
      if (part.length > 0 && !seen.has(part)) {
        seen.add(part);
        parts.push(part);
      }
    }
  }
  return parts.join(":");
}

function loginShellPath(): string | undefined {
  const shell = which("bash") ?? which("sh");
  if (shell === null) {
    return undefined;
  }
  const result = spawnSync(shell, ["-lc", "printf %s \"$PATH\""], {
    encoding: "utf8",
    env: process.env,
  });
  const path = result.stdout?.trim();
  return result.status === 0 && path !== undefined && path.length > 0 ? path : undefined;
}

function supplementalBinDirs(): string[] {
  const home = process.env.HOME ?? "";
  const dirs = [...SUPPLEMENTAL_BIN_DIRS, join(home, ".local", "bin")];
  return dirs.filter((dir) => existsSync(dir));
}

/**
 * Merge login-shell and editor-bundled bin dirs into the runner process PATH.
 * GUI-launched runners often inherit a minimal PATH that omits Cursor/VS Code's
 * bundled `rg`, even though the user's interactive shell has it.
 */
export function augmentProcessPath(): void {
  const extra = supplementalBinDirs().join(":");
  process.env.PATH = mergePathFront(extra, loginShellPath(), process.env.PATH);
}
