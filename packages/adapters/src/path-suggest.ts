import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, extname, join, relative, sep } from "node:path";
import { resolveInRoot, SandboxError } from "./sandbox.ts";

const COMMON_EXTENSIONS = [".md", ".txt", ".json", ".ts", ".tsx", ".js", ".jsx", ".py", ".rs", ".go"];

/**
 * Paths that look like the one the agent asked for. Prefer an unambiguous
 * extensionless hit (README → README.md) so a one-character miss does not burn
 * a whole turn.
 */
export function suggestNearPaths(root: string, requested: string, limit = 5): string[] {
  const cleaned = requested.replace(/^\.\//, "").replace(/\/+$/, "");
  if (cleaned.length === 0) {
    return [];
  }
  const dirRel = dirname(cleaned);
  const base = basename(cleaned);
  const baseLower = base.toLowerCase();
  const baseStem = baseLower.includes(".") ? baseLower.slice(0, baseLower.lastIndexOf(".")) : baseLower;

  let dirAbs: string;
  try {
    dirAbs = resolveInRoot(root, dirRel === "." ? "." : dirRel);
  } catch {
    return [];
  }
  if (!existsSync(dirAbs) || !statSync(dirAbs).isDirectory()) {
    return [];
  }

  const names = readdirSync(dirAbs);
  const scored: { path: string; score: number }[] = [];
  for (const name of names) {
    const nameLower = name.toLowerCase();
    const stem = nameLower.includes(".") ? nameLower.slice(0, nameLower.lastIndexOf(".")) : nameLower;
    let score = 0;
    if (nameLower === baseLower) {
      score = 100;
    } else if (stem === baseStem) {
      score = 90;
    } else if (nameLower.startsWith(baseLower) || stem.startsWith(baseStem)) {
      score = 70;
    } else if (nameLower.includes(baseLower) || stem.includes(baseStem)) {
      score = 40;
    } else {
      continue;
    }
    const abs = join(dirAbs, name);
    const rel = relative(root, abs).split(sep).join("/");
    scored.push({ path: rel.length === 0 ? name : rel, score });
  }
  scored.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return scored.slice(0, limit).map((item) => item.path);
}

/**
 * Resolve a path the agent asked for. If the exact path is missing, try an
 * unambiguous extensionless match in the same directory before giving up.
 */
export function resolveRequestedPath(
  root: string,
  requested: string,
): { kind: "exact" | "resolved"; path: string } | { kind: "missing"; suggestions: string[] } {
  const cleaned = requested.replace(/^\.\//, "");
  try {
    const abs = resolveInRoot(root, cleaned);
    if (existsSync(abs)) {
      return { kind: "exact", path: cleaned };
    }
  } catch (error) {
    if (error instanceof SandboxError) {
      throw error;
    }
  }

  // Extensionless: README → README.md when that is the only match.
  if (extname(cleaned).length === 0) {
    const candidates: string[] = [];
    for (const ext of COMMON_EXTENSIONS) {
      const withExt = `${cleaned}${ext}`;
      try {
        if (existsSync(resolveInRoot(root, withExt))) {
          candidates.push(withExt);
        }
      } catch {
        // outside workspace — ignore
      }
    }
    if (candidates.length === 1) {
      const only = candidates[0];
      if (only !== undefined) {
        return { kind: "resolved", path: only };
      }
    }
    if (candidates.length > 1) {
      return { kind: "missing", suggestions: candidates };
    }
  }

  return { kind: "missing", suggestions: suggestNearPaths(root, cleaned) };
}

export function formatMissingPath(requested: string, suggestions: string[]): string {
  if (suggestions.length === 0) {
    return `${requested} not found in the workspace.`;
  }
  return `${requested} not found. Did you mean: ${suggestions.join(", ")}?`;
}
