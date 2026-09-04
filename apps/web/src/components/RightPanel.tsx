import type { FileContentPayload, FsEntry, SpendReportPayload } from "@purser-sh/protocol";
import { FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { BudgetUsageBar } from "@/components/BudgetUsageBar";
import { PathDisclosure } from "@/components/PathDisclosure";
import { RunMeter } from "@/components/RunMeter";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useRunner } from "@/lib/client";
import { providerSpendRows, sessionSpendRows } from "@/lib/session-spend";
import {
  detectDocumentFormat,
  formatLabel,
  isDocumentPath,
} from "@/lib/documents";
import {
  type RightPanelTab,
  selectedSession,
  selectedWorkspace,
  sessionEvents,
  useDeckStore,
} from "@/lib/store";
import { cn } from "@/lib/utils";

const TABS: { id: RightPanelTab; label: string }[] = [
  { id: "spend", label: "Spend" },
  { id: "files", label: "Files" },
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

function documentTokenHint(events: ReturnType<typeof useDeckStore.getState>["events"], sessionId: string, relPath: string): string | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event === undefined || event.sessionId !== sessionId) {
      continue;
    }
    const payload = event.payload;
    if (payload.kind !== "tool_call" || payload.name !== "read_document") {
      continue;
    }
    const input = payload.input as { path?: string };
    if (input.path !== relPath || payload.summary.length === 0) {
      continue;
    }
    const match = payload.summary.match(/·\s*([≈\d,]+)\s*tok/);
    return match?.[1] ?? null;
  }
  return null;
}

export function RightPanel(props: { onOpenWorkspace: () => void; onOpenSettings: () => void }) {
  const client = useRunner();
  const tab = useDeckStore((state) => state.rightPanelTab);
  const setTab = useDeckStore((state) => state.setRightPanelTab);
  const workspaces = useDeckStore((state) => state.workspaces);
  const sessions = useDeckStore((state) => state.sessions);
  const events = useDeckStore((state) => state.events);
  const spendSummary = useDeckStore((state) => state.spendSummary);
  const budgets = useDeckStore((state) => state.budgets);
  const costModelByProvider = useDeckStore((state) => state.costModelByProvider);
  const lastSpendBySession = useDeckStore((state) => state.lastSpendBySession);
  const folderWatches = useDeckStore((state) => state.folderWatches);
  const providerConfigs = useDeckStore((state) => state.providerConfigs);
  const lastSyncEvent = useDeckStore((state) => state.lastSyncEvent);
  const selectedWorkspaceId = useDeckStore((state) => state.selectedWorkspaceId);
  const selectedSessionId = useDeckStore((state) => state.selectedSessionId);
  const workspace = selectedWorkspace(workspaces, selectedWorkspaceId);
  const session = selectedSession(sessions, selectedSessionId);
  const [listingPath, setListingPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [preview, setPreview] = useState<FileContentPayload | null>(null);
  const [providerReport, setProviderReport] = useState<SpendReportPayload | undefined>();
  const [sessionReport, setSessionReport] = useState<SpendReportPayload | undefined>();

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
            <BudgetUsageBar budgets={budgets} spendSummary={spendSummary} workspaceId={selectedWorkspaceId} />
            <RunMeter
              costModel={costModel}
              costModelByProvider={costModelByProvider}
              providerRows={providerSpendRows(providerReport, providerConfigs)}
              sessionRows={sessionSpendRows(sessionReport, sessions, events)}
              spend={spend}
              spendSummary={spendSummary}
              variant="full"
            />
            <Button className="w-full" onClick={props.onOpenSettings} size="sm" type="button" variant="outline">
              Edit budgets in Settings
            </Button>
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
                {entries.map((entry) => {
                  const rel =
                    workspace !== undefined && entry.kind === "file"
                      ? relativeToWorkspace(workspace.absPath, entry.path)
                      : "";
                  const docFormat = entry.kind === "file" && rel.length > 0 ? detectDocumentFormat(entry.name) : null;
                  const tokenHint =
                    session !== undefined && rel.length > 0
                      ? documentTokenHint(sessionEvents(events, session.id), session.id, rel)
                      : null;
                  return (
                  <button
                    className="flex w-full items-center gap-1 truncate text-left font-mono text-[length:var(--text-xs)] text-muted-foreground hover:text-foreground"
                    key={entry.path}
                    onClick={() => void openEntry(entry)}
                    type="button"
                  >
                    {entry.kind === "dir" ? <span>▸</span> : <FileText className="h-3 w-3 shrink-0" />}
                    <span className="truncate">{entry.name}</span>
                    {docFormat !== null && isDocumentPath(entry.name) ? (
                      <span className="shrink-0 rounded border border-border px-1 text-[length:var(--text-2xs)] text-muted-foreground">
                        {formatLabel(docFormat)}
                      </span>
                    ) : null}
                    {tokenHint !== null ? (
                      <span className="ml-auto shrink-0 tabular-nums text-[length:var(--text-2xs)] text-muted-foreground">
                        {tokenHint} tok
                      </span>
                    ) : null}
                  </button>
                  );
                })}
                {entries.length === 0 ? (
                  <p className="text-[length:var(--text-xs)] text-muted-foreground">No entries.</p>
                ) : null}
              </div>
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
    </aside>
  );
}
