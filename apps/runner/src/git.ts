import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";

export function isGitRepo(absPath: string): boolean {
  const top = spawnSync("git", ["-C", absPath, "rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  });
  if (top.status !== 0) {
    return false;
  }
  try {
    return realpathSync(top.stdout.trim()) === realpathSync(absPath);
  } catch {
    return false;
  }
}

export function detectGitRemote(absPath: string): string | null {
  const inside = spawnSync("git", ["-C", absPath, "rev-parse", "--is-inside-work-tree"], {
    encoding: "utf8",
  });
  if (inside.status !== 0 || inside.stdout.trim() !== "true") {
    return null;
  }
  const remote = spawnSync("git", ["-C", absPath, "remote", "get-url", "origin"], {
    encoding: "utf8",
  });
  if (remote.status !== 0) {
    return null;
  }
  const url = remote.stdout.trim();
  return url.length > 0 ? url : null;
}

export function detectGitBranch(absPath: string): string | null {
  const result = spawnSync("git", ["-C", absPath, "rev-parse", "--abbrev-ref", "HEAD"], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    return null;
  }
  const branch = result.stdout.trim();
  return branch.length > 0 ? branch : null;
}
