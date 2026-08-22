import type { FsEntry, PermissionMode } from "@agentdeck/protocol";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useRunner } from "@/lib/client";
import { PERMISSION_MODES, selectedSession, selectedWorkspace, useDeckStore } from "@/lib/store";

export function RightPanel() {
  const client = useRunner();
  const workspaces = useDeckStore((state) => state.workspaces);
  const sessions = useDeckStore((state) => state.sessions);
  const runs = useDeckStore((state) => state.runs);
  const providerConfigs = useDeckStore((state) => state.providerConfigs);
  const modelsByProvider = useDeckStore((state) => state.modelsByProvider);
  const healthByProvider = useDeckStore((state) => state.healthByProvider);
  const workspace = selectedWorkspace(workspaces, useDeckStore((state) => state.selectedWorkspaceId));
  const session = selectedSession(sessions, useDeckStore((state) => state.selectedSessionId));
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [bypassOpen, setBypassOpen] = useState(false);
  const [bypassText, setBypassText] = useState("");

  useEffect(() => {
    if (workspace === undefined) {
      setEntries([]);
      return;
    }
    void client.request("browse_fs", { path: workspace.absPath }).then((message) => {
      if (message.type === "fs_listing") {
        setEntries(message.payload.entries);
      }
    });
  }, [client, workspace]);

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

  const models = session ? (modelsByProvider[session.providerId] ?? []) : [];
  const health = session ? healthByProvider[session.providerId] : undefined;
  const activeRuns = runs.filter((run) => run.status === "running");

  return (
    <aside className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border bg-card/30 p-4">
      <section>
        <h3 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Provider</h3>
        <select
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          disabled={session === undefined}
          onChange={(event) => {
            if (session === undefined) return;
            void client.request("set_session_provider", {
              sessionId: session.id,
              providerId: event.target.value,
              permissionMode: session.permissionMode,
            });
          }}
          value={session?.providerId ?? ""}
        >
          {providerConfigs.map((config) => (
            <option key={config.id} value={config.providerId}>
              {config.label}
            </option>
          ))}
        </select>
        <select
          className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          disabled={session === undefined}
          onChange={(event) => {
            if (session === undefined) return;
            void client.request("set_session_provider", {
              sessionId: session.id,
              providerId: session.providerId,
              modelId: event.target.value,
              permissionMode: session.permissionMode,
            });
          }}
          value={session?.modelId ?? models[0]?.id ?? ""}
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
              variant={session?.permissionMode === mode.id ? "default" : "outline"}
            >
              {mode.label}
            </Button>
          ))}
        </div>
      </section>
      <section>
        <h3 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Task board</h3>
        <div className="space-y-1">
          {runs.slice(-8).reverse().map((run) => {
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
        <p className="text-sm">{session?.tokensIn ?? 0} in / {session?.tokensOut ?? 0} out</p>
        <p className="text-xs text-muted-foreground">${(session?.costUsd ?? 0).toFixed(4)}</p>
      </section>
      <section>
        <h3 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Workspace</h3>
        <p className="font-mono text-[11px] break-all text-muted-foreground">{workspace?.absPath ?? "—"}</p>
        <p className="mt-1 text-xs text-muted-foreground">{workspace?.gitRemote ?? "no git remote"}</p>
        {session?.worktreePath ? (
          <p className="mt-1 font-mono text-[11px] break-all text-muted-foreground">worktree: {session.worktreePath}</p>
        ) : null}
      </section>
      <section className="min-h-0 flex-1">
        <h3 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Files</h3>
        <div className="space-y-0.5">
          {entries.map((entry) => (
            <div className="truncate font-mono text-xs text-muted-foreground" key={entry.path}>
              {entry.kind === "dir" ? "▸ " : "  "}
              {entry.name}
            </div>
          ))}
        </div>
      </section>
      <Dialog onClose={() => setBypassOpen(false)} open={bypassOpen} title="Enable bypass?">
        <p className="mb-3 text-sm text-muted-foreground">Type bypass to confirm. This session will show a red banner.</p>
        <Input onChange={(event) => setBypassText(event.target.value)} value={bypassText} />
        <div className="mt-3 flex justify-end gap-2">
          <Button onClick={() => setBypassOpen(false)} type="button" variant="ghost">
            Cancel
          </Button>
          <Button
            disabled={bypassText !== "bypass" || session === undefined}
            onClick={() => {
              if (session === undefined) {
                return;
              }
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
