import type { FileContentPayload, FsEntry, SpendReportPayload } from "@purser-sh/protocol";
import { FileText, FolderSync, GitBranch, Link2 } from "lucide-react";
import { useEffect, useState } from "react";
import { PathDisclosure } from "@/components/PathDisclosure";
import { RunMeter } from "@/components/RunMeter";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useRunner } from "@/lib/client";
import { parseUsdToMicros } from "@/lib/money";
import {
  type RightPanelTab,
  selectedSession,
  selectedWorkspace,
  useDeckStore,
} from "@/lib/store";
import { cn } from "@/lib/utils";

const TABS: { id: RightPanelTab; label: string }[] = [
  { id: "spend", label: "Spend" },
  { id: "files", label: "Files" },
  { id: "setup", label: "Setup" },
];

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

function reportRows(report: SpendReportPayload | undefined) {
  if (report === undefined) {
    return [];
  }
  return report.rows.map((row) => ({
    key: row.groupKey,
    tokens: row.inputTokens + row.outputTokens,
    costUsdMicros: row.costUsdMicros,
  }));
}

export function RightPanel(props: { onOpenWorkspace: () => void }) {
  const client = useRunner();
  const tab = useDeckStore((state) => state.rightPanelTab);
  const setTab = useDeckStore((state) => state.setRightPanelTab);
  const workspaces = useDeckStore((state) => state.workspaces);
  const sessions = useDeckStore((state) => state.sessions);
  const spendSummary = useDeckStore((state) => state.spendSummary);
  const budgets = useDeckStore((state) => state.budgets);
  const costModelByProvider = useDeckStore((state) => state.costModelByProvider);
  const lastSpendBySession = useDeckStore((state) => state.lastSpendBySession);
  const folderWatches = useDeckStore((state) => state.folderWatches);
  const lastSyncEvent = useDeckStore((state) => state.lastSyncEvent);
  const selectedWorkspaceId = useDeckStore((state) => state.selectedWorkspaceId);
  const selectedSessionId = useDeckStore((state) => state.selectedSessionId);
  const workspace = selectedWorkspace(workspaces, selectedWorkspaceId);
  const session = selectedSession(sessions, selectedSessionId);
  const [listingPath, setListingPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [preview, setPreview] = useState<FileContentPayload | null>(null);
  const [bypassOpen, setBypassOpen] = useState(false);
  const [bypassText, setBypassText] = useState("");
  const [bypassAck, setBypassAck] = useState(false);
  const [inboxPath, setInboxPath] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [providerReport, setProviderReport] = useState<SpendReportPayload | undefined>();
  const [sessionReport, setSessionReport] = useState<SpendReportPayload | undefined>();
  const [limitTokens, setLimitTokens] = useState("100000");
  const [limitUsd, setLimitUsd] = useState("");
  const [budgetAction, setBudgetAction] = useState<"warn" | "ask" | "hard_stop">("hard_stop");
  const [budgetWindow, setBudgetWindow] = useState<"run" | "day" | "month">("day");

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
    if (tab !== "spend") {
      return;
    }
    void client.request("get_spend", { scope: "global", window: "month", groupBy: "provider" }).then((message) => {
      if (message.type === "spend_report") {
        setProviderReport(message.payload);
      }
    });
    void client.request("get_spend", { scope: "global", window: "month", groupBy: "session" }).then((message) => {
      if (message.type === "spend_report") {
        setSessionReport(message.payload);
      }
    });
  }, [client, tab, spendSummary.generatedAt]);

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

  const watches = folderWatches.filter((watch) => watch.workspaceId === workspace?.id);
  const listingParent =
    listingPath !== null && workspace !== undefined && listingPath !== workspace.absPath ? parentPath(listingPath) : null;
  const spend = session ? lastSpendBySession[session.id] : undefined;
  const costModel = session ? (costModelByProvider[session.providerId] ?? "local") : "local";

  if (session === undefined) {
    return (
      <aside className="flex w-80 shrink-0 flex-col border-l border-border bg-card/30 p-4">
        <p className="text-[length:var(--text-sm)] text-muted-foreground">Open a folder to start a session.</p>
        <Button className="mt-3" onClick={props.onOpenWorkspace} type="button" variant="outline">
          Open a folder
        </Button>
      </aside>
    );
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-border bg-card/30">
      <div className="flex border-b border-border">
        {TABS.map((item) => (
          <button
            className={cn(
              "flex-1 px-2 py-2 text-[length:var(--text-2xs)] label-caps transition-colors",
              tab === item.id ? "border-b-2 border-accent-brand text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
            key={item.id}
            onClick={() => setTab(item.id)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === "spend" ? (
          <div className="space-y-4">
            <RunMeter
              costModel={costModel}
              providerRows={reportRows(providerReport)}
              sessionRows={reportRows(sessionReport).map((row) => ({
                ...row,
                key: sessions.find((item) => item.id === row.key)?.title ?? row.key,
              }))}
              spend={spend}
              spendSummary={spendSummary}
              variant="full"
            />
            <section>
              <h3 className="mb-2 text-[length:var(--text-2xs)] label-caps text-muted-foreground">Budgets</h3>
              <div className="flex flex-wrap gap-2">
                <select
                  className="rounded-[var(--radius-control)] border border-border bg-background px-2 py-1 text-[length:var(--text-xs)]"
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value === "run" || value === "day" || value === "month") {
                      setBudgetWindow(value);
                    }
                  }}
                  value={budgetWindow}
                >
                  <option value="run">per run</option>
                  <option value="day">per day</option>
                  <option value="month">per month</option>
                </select>
                <select
                  className="rounded-[var(--radius-control)] border border-border bg-background px-2 py-1 text-[length:var(--text-xs)]"
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value === "warn" || value === "ask" || value === "hard_stop") {
                      setBudgetAction(value);
                    }
                  }}
                  value={budgetAction}
                >
                  <option value="warn">warn</option>
                  <option value="ask">ask</option>
                  <option value="hard_stop">hard stop</option>
                </select>
              </div>
              <Input
                className="mt-2"
                onChange={(event) => setLimitTokens(event.target.value)}
                placeholder="token limit"
                value={limitTokens}
              />
              <Input
                className="mt-2"
                onChange={(event) => setLimitUsd(event.target.value)}
                placeholder="USD limit (optional)"
                value={limitUsd}
              />
              <Button
                className="mt-2 w-full"
                onClick={() => {
                  const tokens = limitTokens.trim().length === 0 ? null : Number(limitTokens);
                  const usd = parseUsdToMicros(limitUsd);
                  if ((tokens === null || !Number.isFinite(tokens)) && usd === null) {
                    return;
                  }
                  void client.request("set_budget", {
                    scope: selectedWorkspaceId === null ? "global" : "workspace",
                    scopeId: selectedWorkspaceId,
                    window: budgetWindow,
                    limitTokens: tokens !== null && Number.isFinite(tokens) ? Math.trunc(tokens) : null,
                    limitUsdMicros: usd,
                    action: budgetAction,
                    enabled: true,
                  });
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                Save budget
              </Button>
              <div className="mt-2 space-y-1">
                {budgets.map((budget) => (
                  <div
                    className="flex items-center justify-between gap-2 text-[length:var(--text-xs)] text-muted-foreground"
                    key={budget.id}
                  >
                    <span className="min-w-0 truncate">
                      {budget.scope}/{budget.window} · {budget.action}
                    </span>
                    <button
                      className="shrink-0 text-destructive"
                      onClick={() => void client.request("delete_budget", { budgetId: budget.id })}
                      type="button"
                    >
                      delete
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {tab === "files" ? (
          <div className="space-y-4">
            {watches.length > 0 ? (
              <section>
                <h3 className="mb-2 text-[length:var(--text-2xs)] label-caps text-muted-foreground">Drop folder inbox</h3>
                <div className="space-y-1">
                  {watches.map((watch) => (
                    <PathDisclosure key={`${watch.workspaceId}:${watch.absPath}`} path={watch.absPath} />
                  ))}
                </div>
                {lastSyncEvent !== null ? (
                  <p className="mt-2 text-[length:var(--text-2xs)] text-pass">
                    {lastSyncEvent.action} {lastSyncEvent.destPath}
                  </p>
                ) : null}
              </section>
            ) : null}
            <section>
              <h3 className="mb-2 text-[length:var(--text-2xs)] label-caps text-muted-foreground">File tree</h3>
              <p className="mb-1 font-mono text-[length:var(--text-2xs)] text-muted-foreground">
                {listingPath !== null && workspace !== undefined
                  ? relativeToWorkspace(workspace.absPath, listingPath) || "."
                  : ""}
              </p>
              <div className="space-y-0.5">
                {listingParent !== null ? (
                  <button
                    className="block w-full truncate text-left font-mono text-[length:var(--text-xs)] text-muted-foreground hover:text-foreground"
                    onClick={() => setListingPath(listingParent)}
                    type="button"
                  >
                    ..
                  </button>
                ) : null}
                {entries.map((entry) => (
                  <button
                    className="flex w-full items-center gap-1 truncate text-left font-mono text-[length:var(--text-xs)] text-muted-foreground hover:text-foreground"
                    key={entry.path}
                    onClick={() => void openEntry(entry)}
                    type="button"
                  >
                    {entry.kind === "dir" ? <span>▸</span> : <FileText className="h-3 w-3 shrink-0" />}
                    {entry.name}
                  </button>
                ))}
                {entries.length === 0 ? (
                  <p className="text-[length:var(--text-xs)] text-muted-foreground">No entries.</p>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}

        {tab === "setup" ? (
          <div className="space-y-4">
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-[length:var(--text-2xs)] label-caps text-muted-foreground">
                <FolderSync className="h-3.5 w-3.5" />
                Drop folder
              </h3>
              <Input onChange={(event) => setInboxPath(event.target.value)} placeholder="~/xyz" value={inboxPath} />
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
                variant="outline"
              >
                Watch this folder
              </Button>
            </section>
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-[length:var(--text-2xs)] label-caps text-muted-foreground">
                <GitBranch className="h-3.5 w-3.5" />
                Git origin
              </h3>
              <p className="mb-2 text-[length:var(--text-2xs)] text-muted-foreground">
                {workspace?.gitRemote ?? "No origin linked"}
              </p>
              <Input
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
              <h3 className="mb-2 text-[length:var(--text-2xs)] label-caps text-muted-foreground">Workspace</h3>
              {workspace ? <PathDisclosure path={workspace.absPath} /> : null}
              {session.worktreePath ? (
                <div className="mt-2">
                  <PathDisclosure label="worktree" path={session.worktreePath} />
                </div>
              ) : null}
            </section>
            <section>
              <h3 className="mb-2 text-[length:var(--text-2xs)] label-caps text-muted-foreground">Bypass</h3>
              <p className="mb-2 text-[length:var(--text-xs)] text-muted-foreground">
                Turn on bypass from the top bar, or use the button below.
              </p>
              <Button onClick={() => setBypassOpen(true)} size="sm" type="button" variant="outline">
                Enable bypass...
              </Button>
            </section>
          </div>
        ) : null}
      </div>

      <Dialog className="max-w-3xl" onClose={() => setPreview(null)} open={preview !== null} title={preview?.path ?? "File"}>
        {preview !== null ? (
          preview.encoding === "base64" ? (
            <p className="text-[length:var(--text-sm)] text-muted-foreground">Binary file. Can't preview it here.</p>
          ) : (
            <pre className="max-h-[70vh] overflow-auto rounded-[var(--radius-control)] border border-border bg-surface-2 p-3 font-mono text-[length:var(--text-xs)] leading-5">
              {preview.content}
              {preview.truncated ? "\n\n(truncated)" : ""}
            </pre>
          )
        ) : null}
      </Dialog>

      <Dialog onClose={() => setBypassOpen(false)} open={bypassOpen} title="Enable bypass for this session?">
        <p className="mb-3 text-[length:var(--text-sm)] text-muted-foreground">
          Re-confirm for this session only. Bypass expires after 30 minutes or 10 runs. Type bypass and check the box.
        </p>
        <Input onChange={(event) => setBypassText(event.target.value)} value={bypassText} />
        <label className="mt-3 flex items-start gap-2 text-[length:var(--text-xs)] text-muted-foreground">
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
