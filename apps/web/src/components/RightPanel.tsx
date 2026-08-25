import type { FileContentPayload, FsEntry, PermissionMode } from "@agentdeck/protocol";
import { FileText, FolderSync, GitBranch, Link2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useRunner } from "@/lib/client";
import { PERMISSION_MODES, selectedSession, selectedWorkspace, useDeckStore } from "@/lib/store";

function relativeToWorkspace(root: string, abs: string): string {
  const prefix = root.endsWith("/") ? root : `${root}/`;
  if (abs === root) {
    return "";
  }
  if (abs.startsWith(prefix)) {
    return abs.slice(prefix.length);
  }
  return abs;
}

function parentPath(path: string): string | null {
  if (path === "/") {
    return null;
  }
  return path.split("/").slice(0, -1).join("/") || "/";
}

export function RightPanel(props: { onOpenWorkspace: () => void }) {
  const client = useRunner();
  const workspaces = useDeckStore((state) => state.workspaces);
  const sessions = useDeckStore((state) => state.sessions);
  const runs = useDeckStore((state) => state.runs);
  const providerConfigs = useDeckStore((state) => state.providerConfigs);
  const modelsByProvider = useDeckStore((state) => state.modelsByProvider);
  const healthByProvider = useDeckStore((state) => state.healthByProvider);
  const folderWatches = useDeckStore((state) => state.folderWatches);
  const lastSyncEvent = useDeckStore((state) => state.lastSyncEvent);
  const workspace = selectedWorkspace(workspaces, useDeckStore((state) => state.selectedWorkspaceId));
  const session = selectedSession(sessions, useDeckStore((state) => state.selectedSessionId));
  const [listingPath, setListingPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [preview, setPreview] = useState<FileContentPayload | null>(null);
  const [bypassOpen, setBypassOpen] = useState(false);
  const [bypassText, setBypassText] = useState("");
  const [bypassAck, setBypassAck] = useState(false);
  const [inboxPath, setInboxPath] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");

  useEffect(() => {
    setListingPath(workspace?.absPath ?? null);
  }, [workspace?.absPath]);

  useEffect(() => {
    if (listingPath === null) {
      setEntries([]);
      return;
    }
    void client.request("browse_fs", { path: listingPath }).then((message) => {
      if (message.type === "fs_listing") {
        setEntries(message.payload.entries);
      }
    });
  }, [client, listingPath, lastSyncEvent]);

  useEffect(() => {
    if (session === undefined) {
      return;
    }
    void client.request("list_models", { providerId: session.providerId });
    void client.request("check_provider_health", { providerId: session.providerId });
  }, [client, session?.providerId, session]);

  async function setMode(permissionMode: PermissionMode) {
    if (session === undefined) {
      return;
    }
    if (permissionMode === "bypass") {
      setBypassOpen(true);
      return;
    }
    await client.request("set_session_provider", {
      sessionId: session.id,
      providerId: session.providerId,
      modelId: session.modelId ?? undefined,
      permissionMode,
    });
  }

  async function openEntry(entry: FsEntry) {
    if (workspace === undefined) {
      return;
    }
    if (entry.kind === "dir") {
      setListingPath(entry.path);
      return;
    }
    const rel = relativeToWorkspace(workspace.absPath, entry.path);
    if (rel.length === 0) {
      return;
    }
    const message = await client.request("read_file", { workspaceId: workspace.id, path: rel });
    if (message.type === "file_content") {
      setPreview(message.payload);
    }
  }

  const models = session ? (modelsByProvider[session.providerId] ?? []) : [];
  const health = session ? healthByProvider[session.providerId] : undefined;
  const activeRuns = runs.filter((run) => run.status === "running");
  const watches = folderWatches.filter((watch) => watch.workspaceId === workspace?.id);
  const listingParent =
    listingPath !== null && workspace !== undefined && listingPath !== workspace.absPath ? parentPath(listingPath) : null;

  if (session === undefined) {
    return (
      <aside className="flex w-80 shrink-0 flex-col gap-3 border-l border-border bg-card/30 p-4">
        <p className="text-sm text-muted-foreground">Open a folder to start a session, then pick a provider here.</p>
        <Button onClick={props.onOpenWorkspace} type="button">
          Open a folder
        </Button>
      </aside>
    );
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border bg-card/30 p-4">
      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
          <FolderSync className="h-3.5 w-3.5" />
          Drop folder
        </h3>
        <p className="mb-2 text-[11px] text-muted-foreground">
          Grant a folder such as <code className="font-mono">~/xyz</code>. New files copy into{" "}
          <code className="font-mono">.inbox/</code>.
        </p>
        <Input
          onChange={(event) => setInboxPath(event.target.value)}
          placeholder="~/xyz"
          value={inboxPath}
        />
        <Button
          className="mt-2 w-full"
          disabled={!(inboxPath.startsWith("/") || inboxPath === "~" || inboxPath.startsWith("~/"))}
          onClick={() => {
            if (workspace === undefined) return;
            void client.request("watch_folder", { workspaceId: workspace.id, absPath: inboxPath });
            setInboxPath("");
          }}
          size="sm"
          type="button"
        >
          Watch this folder
        </Button>
        <div className="mt-2 space-y-1">
          {watches.map((watch) => (
            <div className="flex items-center justify-between gap-2 text-[11px]" key={`${watch.workspaceId}:${watch.absPath}`}>
              <span className="truncate font-mono text-muted-foreground">{watch.absPath}</span>
              <button
                className="text-destructive"
                onClick={() =>
                  void client.request("unwatch_folder", { workspaceId: watch.workspaceId, absPath: watch.absPath })
                }
                type="button"
              >
                stop
              </button>
            </div>
          ))}
        </div>
        {lastSyncEvent !== null ? (
          <p className="mt-1 text-[11px] text-emerald-400/90">
            {lastSyncEvent.action} {lastSyncEvent.destPath}
          </p>
        ) : null}
      </section>
      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
          <GitBranch className="h-3.5 w-3.5" />
          GitHub / GitLab
        </h3>
        <p className="font-mono text-[11px] break-all text-muted-foreground">{workspace?.gitRemote ?? "no origin yet"}</p>
        <Input
          className="mt-2"
          onChange={(event) => setRemoteUrl(event.target.value)}
          placeholder="https://github.com/org/repo.git"
          value={remoteUrl}
        />
        <Button
          className="mt-2 w-full"
          disabled={remoteUrl.length < 8}
          onClick={() => {
            if (workspace === undefined) return;
            void client.request("link_repository", { workspaceId: workspace.id, remoteUrl });
            setRemoteUrl("");
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          <Link2 className="h-3.5 w-3.5" />
          Link origin
        </Button>
      </section>
      <section>
        <h3 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Provider</h3>
        <select
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          onChange={(event) => {
            void client.request("set_session_provider", {
              sessionId: session.id,
              providerId: event.target.value,
              permissionMode: session.permissionMode,
            });
          }}
          value={session.providerId}
        >
          {providerConfigs.map((config) => (
            <option key={config.id} value={config.providerId}>
              {config.label}
            </option>
          ))}
        </select>
        <select
          className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          onChange={(event) => {
            void client.request("set_session_provider", {
              sessionId: session.id,
              providerId: session.providerId,
              modelId: event.target.value,
              permissionMode: session.permissionMode,
            });
          }}
          value={session.modelId ?? models[0]?.id ?? ""}
        >
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.label}
            </option>
          ))}
        </select>
        {health !== undefined ? (
          <p className={`mt-2 text-xs ${health.ok ? "text-emerald-400" : "text-amber-400"}`}>{health.detail}</p>
        ) : null}
      </section>
      <section>
        <h3 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Permission</h3>
        <div className="flex flex-wrap gap-1">
          {PERMISSION_MODES.map((mode) => (
            <Button
              key={mode.id}
              onClick={() => void setMode(mode.id)}
              size="sm"
              type="button"
              variant={session.permissionMode === mode.id ? "default" : "outline"}
            >
              {mode.label}
            </Button>
          ))}
        </div>
      </section>
      <section>
        <h3 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Task board</h3>
        <div className="space-y-1">
          {runs
            .slice(-8)
            .reverse()
            .map((run) => {
              const owner = sessions.find((item) => item.id === run.sessionId);
              return (
                <div className="flex items-center justify-between rounded-md border border-border px-2 py-1 text-xs" key={run.id}>
                  <span className="truncate">{owner?.title ?? run.sessionId}</span>
                  <span className="flex items-center gap-2">
                    <span className={run.status === "running" ? "text-amber-400" : "text-muted-foreground"}>{run.status}</span>
                    {run.status === "running" ? (
                      <button
                        className="text-destructive"
                        onClick={() => void client.request("cancel_run", { runId: run.id })}
                        type="button"
                      >
                        cancel
                      </button>
                    ) : null}
                  </span>
                </div>
              );
            })}
          {runs.length === 0 ? <p className="text-xs text-muted-foreground">No runs yet.</p> : null}
        </div>
        {activeRuns.length > 1 ? (
          <p className="mt-1 text-[11px] text-muted-foreground">{activeRuns.length} sessions running in parallel.</p>
        ) : null}
      </section>
      <section>
        <h3 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Usage</h3>
        <p className="text-sm">
          {session.tokensIn} in / {session.tokensOut} out
        </p>
        <p className="text-xs text-muted-foreground">${session.costUsd.toFixed(4)} billed after the run</p>
        <p className="mt-1 text-[11px] text-muted-foreground">Coach tokens before send in the composer.</p>
      </section>
      <section>
        <h3 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Workspace</h3>
        <p className="font-mono text-[11px] break-all text-muted-foreground">{workspace?.absPath ?? "—"}</p>
        {session.worktreePath ? (
          <p className="mt-1 font-mono text-[11px] break-all text-muted-foreground">worktree: {session.worktreePath}</p>
        ) : null}
      </section>
      <section className="min-h-0 flex-1">
        <h3 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Files</h3>
        <p className="mb-1 truncate font-mono text-[10px] text-muted-foreground">
          {listingPath !== null && workspace !== undefined ? relativeToWorkspace(workspace.absPath, listingPath) || "." : ""}
        </p>
        <div className="space-y-0.5">
          {listingParent !== null ? (
            <button
              className="block w-full truncate text-left font-mono text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setListingPath(listingParent)}
              type="button"
            >
              ..
            </button>
          ) : null}
          {entries.map((entry) => (
            <button
              className="flex w-full items-center gap-1 truncate text-left font-mono text-xs text-muted-foreground hover:text-foreground"
              key={entry.path}
              onClick={() => void openEntry(entry)}
              type="button"
            >
              {entry.kind === "dir" ? <span>▸</span> : <FileText className="h-3 w-3 shrink-0" />}
              {entry.name}
            </button>
          ))}
        </div>
      </section>
      <Dialog className="max-w-3xl" onClose={() => setPreview(null)} open={preview !== null} title={preview?.path ?? "File"}>
        {preview !== null ? (
          preview.encoding === "base64" ? (
            <p className="text-sm text-muted-foreground">Binary file — not previewed here.</p>
          ) : (
            <pre className="max-h-[70vh] overflow-auto rounded-md border border-border bg-black/40 p-3 text-[12px] leading-5">
              {preview.content}
              {preview.truncated ? "\n\n… truncated" : ""}
            </pre>
          )
        ) : null}
      </Dialog>
      <Dialog onClose={() => setBypassOpen(false)} open={bypassOpen} title="Enable bypass for this session?">
        <p className="mb-3 text-sm text-muted-foreground">
          Re-confirm for this session only. Bypass expires after 30 minutes or 10 runs, whichever comes first. Type
          bypass and check the box.
        </p>
        <Input onChange={(event) => setBypassText(event.target.value)} value={bypassText} />
        <label className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
          <input checked={bypassAck} onChange={(event) => setBypassAck(event.target.checked)} type="checkbox" />
          I understand tools will run without asking until expiry, for this session only.
        </label>
        <div className="mt-3 flex justify-end gap-2">
          <Button onClick={() => setBypassOpen(false)} type="button" variant="ghost">
            Cancel
          </Button>
          <Button
            disabled={bypassText !== "bypass" || !bypassAck}
            onClick={() => {
              void client
                .request("set_session_provider", {
                  sessionId: session.id,
                  providerId: session.providerId,
                  modelId: session.modelId ?? undefined,
                  permissionMode: "bypass",
                })
                .then(() => {
                  setBypassOpen(false);
                  setBypassText("");
                  setBypassAck(false);
                });
            }}
            type="button"
            variant="destructive"
          >
            Enable
          </Button>
        </div>
      </Dialog>
    </aside>
  );
}
