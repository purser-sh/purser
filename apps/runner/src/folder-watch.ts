import {
  copyFileSync,
  existsSync,
  mkdirSync,
  statSync,
  unlinkSync,
  watch,
  type FSWatcher,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { FolderWatch } from "@agentdeck/protocol";
import { getWorkspace, type AppDatabase } from "@agentdeck/db";
import { assertAllowed, isInsideRoot, PathError } from "./paths.ts";
import type { RunnerConfig } from "./config.ts";

export type SyncHandler = (event: {
  workspaceId: string;
  sourcePath: string;
  destPath: string;
  action: "added" | "updated" | "removed" | "error";
  detail?: string;
}) => void;

const SKIP_SEGMENTS = new Set(["node_modules", ".git", ".DS_Store"]);
const DEBOUNCE_MS = 200;

export type DropChangeResult = {
  action: "added" | "updated" | "removed" | "skipped";
  destPath: string;
};

function isSkippedRelative(rel: string): boolean {
  return rel.split(sep).some((segment) => SKIP_SEGMENTS.has(segment));
}

/**
 * Copy or delete one drop-folder file into `{workspace}/.inbox/`.
 * Never copies a file that already lives under the inbox (loop break).
 */
export function applyDropChange(input: {
  sourceRoot: string;
  inboxRoot: string;
  relPath: string;
}): DropChangeResult {
  const rel = input.relPath.replace(/^\.\/+/, "");
  const destPath = `.inbox/${rel.split(sep).join("/")}`;
  if (rel.length === 0 || isSkippedRelative(rel) || rel.split(sep)[0] === ".inbox") {
    return { action: "skipped", destPath };
  }
  const from = resolve(input.sourceRoot, rel);
  const dest = resolve(input.inboxRoot, rel);
  if (isInsideRoot(from, input.inboxRoot)) {
    return { action: "skipped", destPath };
  }
  if (!existsSync(from)) {
    if (existsSync(dest)) {
      unlinkSync(dest);
      return { action: "removed", destPath };
    }
    return { action: "skipped", destPath };
  }
  if (!statSync(from).isFile()) {
    return { action: "skipped", destPath };
  }
  const existed = existsSync(dest);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(from, dest);
  return { action: existed ? "updated" : "added", destPath };
}

export class FolderWatchService {
  private readonly watchers = new Map<string, FSWatcher>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly db: AppDatabase,
    private readonly config: RunnerConfig,
    private readonly onSync: SyncHandler,
  ) {}

  key(watch: Pick<FolderWatch, "workspaceId" | "absPath">): string {
    return `${watch.workspaceId}:${watch.absPath}`;
  }

  start(folderWatch: FolderWatch): void {
    this.stop(folderWatch);
    const workspace = getWorkspace(this.db, folderWatch.workspaceId);
    if (workspace === undefined) {
      throw new Error("workspace not found");
    }
    const source = assertAllowed(folderWatch.absPath, this.config.allowedRoots);
    if (!existsSync(source) || !statSync(source).isDirectory()) {
      throw new PathError("not_a_directory", `${source} is not a directory`);
    }
    const workspaceRoot = assertAllowed(workspace.absPath, this.config.allowedRoots);
    if (source === workspaceRoot) {
      throw new PathError("path_invalid", "watch a drop folder, not the workspace itself");
    }
    const inbox = join(workspaceRoot, ".inbox");
    mkdirSync(inbox, { recursive: true });
    if (source === inbox || isInsideRoot(source, inbox)) {
      throw new PathError("path_invalid", "cannot watch the workspace inbox");
    }
    const watcher = watch(source, { recursive: true }, (_event, filename) => {
      if (filename === null) {
        return;
      }
      this.schedule(folderWatch.workspaceId, source, inbox, filename.toString());
    });
    this.watchers.set(this.key(folderWatch), watcher);
  }

  private schedule(workspaceId: string, source: string, inbox: string, filename: string): void {
    const timerKey = `${workspaceId}:${filename}`;
    const existing = this.timers.get(timerKey);
    if (existing !== undefined) {
      clearTimeout(existing);
    }
    this.timers.set(
      timerKey,
      setTimeout(() => {
        this.timers.delete(timerKey);
        this.ingest(workspaceId, source, inbox, filename);
      }, DEBOUNCE_MS),
    );
  }

  ingest(workspaceId: string, source: string, inbox: string, filename: string): void {
    const from = join(source, filename);
    try {
      const result = applyDropChange({ sourceRoot: source, inboxRoot: inbox, relPath: relative(source, from) });
      if (result.action === "skipped") {
        return;
      }
      this.onSync({
        workspaceId,
        sourcePath: from,
        destPath: result.destPath,
        action: result.action,
      });
    } catch (error) {
      this.onSync({
        workspaceId,
        sourcePath: from,
        destPath: ".inbox",
        action: "error",
        detail: error instanceof Error ? error.message : "sync failed",
      });
    }
  }

  stop(watch: Pick<FolderWatch, "workspaceId" | "absPath">): void {
    const existing = this.watchers.get(this.key(watch));
    if (existing) {
      existing.close();
      this.watchers.delete(this.key(watch));
    }
  }

  restore(watches: FolderWatch[]): void {
    for (const watch of watches) {
      if (watch.enabled) {
        try {
          this.start(watch);
        } catch {
          continue;
        }
      }
    }
  }

  close(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
  }
}
