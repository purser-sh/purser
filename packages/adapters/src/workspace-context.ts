import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const TARGET_CHARS = 1_500 * 4;
const MAX_CHARS = 3_000 * 4;

const ALWAYS_SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "target",
  ".next",
  ".purser",
  "__pycache__",
  ".venv",
  ".turbo",
  "coverage",
]);

const LOCKFILE_NAMES = new Set(["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "Cargo.lock"]);

const BINARY_EXT = /\.(png|jpe?g|gif|webp|ico|pdf|zip|tar|gz|bz2|xz|7z|wasm|so|dylib|exe|dll|bin|o|a|class|pyc|mp3|mp4|avi|mov|woff2?|ttf|eot)$/i;

type GitignoreRule = { pattern: string; negated: boolean };

function parseGitignore(root: string): GitignoreRule[] {
  const path = join(root, ".gitignore");
  if (!existsSync(path)) {
    return [];
  }
  const rules: GitignoreRule[] = [];
  for (const rawLine of readFileSync(path, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }
    const negated = line.startsWith("!");
    const pattern = negated ? line.slice(1) : line;
    rules.push({ pattern, negated });
  }
  return rules;
}

function simpleMatch(relativePath: string, pattern: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  if (pattern.includes("*")) {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, "§§")
      .replace(/\*/g, "[^/]*")
      .replace(/§§/g, ".*");
    return new RegExp(`^${escaped}$`).test(normalized) || normalized.split("/").some((part) => new RegExp(`^${escaped}$`).test(part));
  }
  return normalized === pattern || normalized.endsWith(`/${pattern}`) || normalized.split("/").includes(pattern);
}

function gitignored(relativePath: string, rules: GitignoreRule[]): boolean {
  let ignored = false;
  for (const rule of rules) {
    if (simpleMatch(relativePath, rule.pattern)) {
      ignored = !rule.negated;
    }
  }
  return ignored;
}

function shouldSkipEntry(name: string, relPath: string, isDir: boolean, gitignore: GitignoreRule[]): boolean {
  if (isDir && ALWAYS_SKIP_DIRS.has(name)) {
    return true;
  }
  if (!isDir && (LOCKFILE_NAMES.has(name) || BINARY_EXT.test(name))) {
    return true;
  }
  return gitignored(relPath, gitignore);
}

function appendLine(lines: string[], line: string, budget: { used: number; max: number }): boolean {
  const next = budget.used + line.length + 1;
  if (next > budget.max) {
    return false;
  }
  lines.push(line);
  budget.used = next;
  return true;
}

function walkDir(
  root: string,
  relDir: string,
  depth: number,
  maxDepth: number,
  prefix: string,
  lines: string[],
  budget: { used: number; max: number },
  gitignore: GitignoreRule[],
): "ok" | "truncated" {
  let absDir = join(root, relDir);
  if (!existsSync(absDir)) {
    return "ok";
  }
  let entries: string[];
  try {
    entries = readdirSync(absDir).sort((a, b) => a.localeCompare(b));
  } catch {
    return "ok";
  }
  for (let index = 0; index < entries.length; index += 1) {
    const name = entries[index]!;
    const relPath = relDir.length === 0 ? name : `${relDir}/${name}`;
    let isDir = false;
    try {
      isDir = statSync(join(root, relPath)).isDirectory();
    } catch {
      continue;
    }
    if (shouldSkipEntry(name, relPath, isDir, gitignore)) {
      continue;
    }
    const isLast = index === entries.length - 1;
    const branch = isLast ? "└── " : "├── ";
    const childPrefix = isLast ? "    " : "│   ";
    if (!appendLine(lines, `${prefix}${branch}${name}${isDir ? "/" : ""}`, budget)) {
      return "truncated";
    }
    if (budget.used >= TARGET_CHARS && depth >= 1) {
      return "truncated";
    }
    if (isDir && depth < maxDepth) {
      const child = walkDir(root, relPath, depth + 1, maxDepth, prefix + childPrefix, lines, budget, gitignore);
      if (child === "truncated") {
        return "truncated";
      }
    }
  }
  return "ok";
}

/** Shallow workspace tree for the agent system prompt (~1.5k tokens target, 3k hard cap). */
export function buildWorkspaceContext(workspaceRoot: string): string {
  const gitignore = parseGitignore(workspaceRoot);
  const lines: string[] = [`Workspace root: ${workspaceRoot}`, ""];
  const budget = { used: 0, max: MAX_CHARS };
  const status = walkDir(workspaceRoot, "", 0, 3, "", lines, budget, gitignore);
  if (status === "truncated") {
    lines.push("", "(Tree truncated — use list_dir and ripgrep_search to explore further.)");
  }
  return ["<workspace>", ...lines, "</workspace>"].join("\n");
}
