import { lstatSync, realpathSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";

export class PathError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PathError";
    this.code = code;
  }
}

function normalizeAbsolute(path: string): string {
  if (!path.startsWith("/")) {
    throw new PathError("path_invalid", "path must be absolute");
  }
  return resolve(path);
}

export function isInsideRoot(candidate: string, root: string): boolean {
  const resolvedCandidate = normalizeAbsolute(candidate);
  const resolvedRoot = normalizeAbsolute(root);
  return resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(`${resolvedRoot}${sep}`);
}

export function assertAllowed(absPath: string, allowedRoots: readonly string[]): string {
  const resolved = realpathIfExists(absPath);
  const ok = allowedRoots.some((root) => {
    try {
      return isInsideRoot(resolved, realpathIfExists(root));
    } catch {
      return isInsideRoot(resolved, normalizeAbsolute(root));
    }
  });
  if (!ok) {
    throw new PathError("path_forbidden", "path is outside the allowlist");
  }
  return resolved;
}

function realpathIfExists(path: string): string {
  const normalized = normalizeAbsolute(path);
  try {
    return realpathSync(normalized);
  } catch {
    return normalized;
  }
}

export function resolveInsideWorkspace(workspaceRoot: string, relativePath: string): string {
  if (relativePath.startsWith("/") || relativePath.split("/").includes("..")) {
    throw new PathError("path_invalid", "path must be workspace-relative");
  }
  const rootReal = realpathSync(workspaceRoot);
  const joined = resolve(join(rootReal, relativePath));
  if (!isInsideRoot(joined, rootReal)) {
    throw new PathError("path_forbidden", "path escapes the workspace");
  }
  let targetReal: string;
  try {
    targetReal = realpathSync(joined);
  } catch {
    throw new PathError("not_found", "file not found");
  }
  if (!isInsideRoot(targetReal, rootReal)) {
    throw new PathError("path_forbidden", "symlink escapes the workspace");
  }
  const stat = statSync(targetReal);
  if (!stat.isFile()) {
    throw new PathError("not_a_file", "path is not a file");
  }
  return targetReal;
}

export function assertDirectory(absPath: string): string {
  let real: string;
  try {
    real = realpathSync(absPath);
  } catch {
    throw new PathError("not_found", "path not found");
  }
  const stat = lstatSync(real);
  if (stat.isSymbolicLink()) {
    const target = realpathSync(real);
    const targetStat = statSync(target);
    if (!targetStat.isDirectory()) {
      throw new PathError("not_a_directory", "path is not a directory");
    }
    return target;
  }
  if (!stat.isDirectory()) {
    throw new PathError("not_a_directory", "path is not a directory");
  }
  return real;
}

export const SKIP_DIR_NAMES = new Set(["node_modules", ".git"]);
