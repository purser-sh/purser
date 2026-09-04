import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function docCacheDir(home?: string): string {
  const root = home ?? process.env.PURSER_HOME ?? join(homedir(), ".purser");
  return join(root, "doc-cache");
}

export function hashFileContents(absPath: string): string {
  const buf = readFileSync(absPath);
  return createHash("sha256").update(buf).digest("hex");
}

export function cachePathForHash(hash: string, home?: string): string {
  return join(docCacheDir(home), `${hash}.md`);
}

export function readCachedMarkdown(hash: string, home?: string): string | null {
  const path = cachePathForHash(hash, home);
  if (!existsSync(path)) {
    return null;
  }
  return readFileSync(path, "utf8");
}

export function writeCachedMarkdown(hash: string, markdown: string, home?: string): void {
  const dir = docCacheDir(home);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = cachePathForHash(hash, home);
  writeFileSync(path, markdown, { mode: 0o600 });
  chmodSync(path, 0o600);
}

export function docCacheSizeBytes(home?: string): number {
  const dir = docCacheDir(home);
  if (!existsSync(dir)) {
    return 0;
  }
  let total = 0;
  for (const name of readdirSync(dir)) {
    try {
      total += statSync(join(dir, name)).size;
    } catch {
      // ignore
    }
  }
  return total;
}

export function clearDocCache(home?: string): { removed: number } {
  const dir = docCacheDir(home);
  if (!existsSync(dir)) {
    return { removed: 0 };
  }
  let removed = 0;
  for (const name of readdirSync(dir)) {
    try {
      unlinkSync(join(dir, name));
      removed += 1;
    } catch {
      // ignore
    }
  }
  return { removed };
}
