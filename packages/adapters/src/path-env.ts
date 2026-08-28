import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { which } from "./cli/which.ts";

/** Always merged when present — apt/brew installs land here. */
export const STANDARD_BIN_DIRS = ["/usr/local/bin", "/usr/bin", "/bin", "/opt/homebrew/bin"] as const;

const EDITOR_BIN_DIRS = [
  "/usr/share/cursor/resources/app/node_modules/@vscode/ripgrep/bin",
  "/usr/share/code/resources/app/node_modules/@vscode/ripgrep/bin",
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

function existingDirs(dirs: readonly string[]): string {
  return dirs.filter((dir) => existsSync(dir)).join(":");
}

/**
 * Merge editor-bundled, standard system, login-shell, and user bin dirs into PATH.
 * GUI-launched runners often inherit a minimal PATH (bun/pyenv only) that omits
 * /usr/bin where apt-installed ripgrep lives, and Cursor's bundled rg.
 */
export function augmentProcessPath(): void {
  const homeLocal = join(process.env.HOME ?? "", ".local", "bin");
  const extra = existingDirs([
    ...EDITOR_BIN_DIRS,
    ...STANDARD_BIN_DIRS,
    ...(existsSync(homeLocal) ? [homeLocal] : []),
  ]);
  process.env.PATH = mergePathFront(extra, loginShellPath(), process.env.PATH);
}
