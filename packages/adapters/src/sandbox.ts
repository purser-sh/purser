import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve, sep } from "node:path";

export class SandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxError";
  }
}

export function resolveInRoot(root: string, relativePath: string): string {
  if (relativePath.split("/").includes("..")) {
    throw new SandboxError("path must not contain '..'");
  }
  const rootReal = realpathSync(root);
  const joined = resolve(join(rootReal, relativePath.replace(/^\//, "")));
  if (joined !== rootReal && !joined.startsWith(rootReal + sep)) {
    throw new SandboxError("path escapes the workspace");
  }
  return joined;
}

export function readWorkspaceFile(root: string, relativePath: string, maxBytes: number): string {
  const target = resolveInRoot(root, relativePath);
  const real = realpathSync(target);
  if (real !== realpathSync(root) && !real.startsWith(realpathSync(root) + sep)) {
    throw new SandboxError("symlink escapes the workspace");
  }
  const buf = readFileSync(real);
  return buf.subarray(0, maxBytes).toString("utf8");
}

export function listWorkspaceDir(
  root: string,
  relativePath: string,
): { name: string; kind: "file" | "dir" }[] {
  const target = resolveInRoot(root, relativePath === "" || relativePath === "." ? "." : relativePath);
  return readdirSync(target, { withFileTypes: true }).map((entry) => ({
    name: entry.name,
    kind: entry.isDirectory() ? "dir" : "file",
  }));
}
