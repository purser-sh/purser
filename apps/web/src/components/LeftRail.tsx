import { ChevronDown, MoreHorizontal, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useRunner } from "@/lib/client";
import { useDeckStore, workspaceSessions } from "@/lib/store";

export function LeftRail(props: { onOpenWorkspace: () => void }) {
  const client = useRunner();
  const workspaces = useDeckStore((state) => state.workspaces);
  const sessions = useDeckStore((state) => state.sessions);
  const selectedWorkspaceId = useDeckStore((state) => state.selectedWorkspaceId);
  const selectedSessionId = useDeckStore((state) => state.selectedSessionId);
  const selectWorkspace = useDeckStore((state) => state.selectWorkspace);
  const selectSession = useDeckStore((state) => state.selectSession);
  const search = useDeckStore((state) => state.search);
  const providerConfigs = useDeckStore((state) => state.providerConfigs);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [menuWorkspaceId, setMenuWorkspaceId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workspaces.filter((workspace) => {
      if (q.length === 0) {
        return true;
      }
      const sessionHit = workspaceSessions(sessions, workspace.id).some((session) =>
        session.title.toLowerCase().includes(q),
      );
      return workspace.name.toLowerCase().includes(q) || workspace.absPath.toLowerCase().includes(q) || sessionHit;
    });
  }, [workspaces, sessions, search]);

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card/40">
      <div className="flex items-center justify-between px-3 py-3 text-[length:var(--text-2xs)] label-caps text-muted-foreground">
        Workspaces
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {filtered.map((workspace) => {
          const expanded = open[workspace.id] ?? workspace.id === selectedWorkspaceId;
          const kids = workspaceSessions(sessions, workspace.id);
          return (
            <div className="mb-1" key={workspace.id}>
              <div
                className={`flex w-full items-center gap-1 rounded-md px-1 py-1 hover:bg-accent ${
                  workspace.id === selectedWorkspaceId ? "bg-accent" : ""
                }`}
              >
                <button
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-0.5 text-left text-sm"
                  onClick={() => {
                    selectWorkspace(workspace.id);
                    setOpen((current) => ({ ...current, [workspace.id]: !expanded }));
                  }}
                  title={workspace.absPath}
                  type="button"
                >
                  <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition ${expanded ? "" : "-rotate-90"}`} />
                  <span className="truncate font-medium">{workspace.name}</span>
                  {workspace.gitRemote ? (
                    <span className="rounded border border-border px-1 text-[length:var(--text-2xs)] label-caps text-muted-foreground">
                      git
                    </span>
                  ) : null}
                </button>
                <button
                  aria-label="Workspace menu"
                  className="rounded p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                  onClick={() => setMenuWorkspaceId(menuWorkspaceId === workspace.id ? null : workspace.id)}
                  type="button"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </div>
              {menuWorkspaceId === workspace.id ? (
                <div className="ml-6 mb-1 rounded-[var(--radius-control)] border border-border bg-card p-1">
                  <button
                    className="block w-full rounded px-2 py-1 text-left text-[length:var(--text-xs)] text-block hover:bg-block-soft"
                    onClick={() => {
                      setDeleteTarget({ id: workspace.id, name: workspace.name });
                      setMenuWorkspaceId(null);
                      setDeleteConfirm("");
                    }}
                    type="button"
                  >
                    Delete workspace…
                  </button>
                </div>
              ) : null}
              {expanded ? (
                <div className="ml-4 mt-1 space-y-0.5">
                  {kids.map((session) => (
                    <button
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-accent ${
                        session.id === selectedSessionId ? "bg-accent" : ""
                      }`}
                      key={session.id}
                      onClick={() => selectSession(session.id)}
                      type="button"
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${
                          session.status === "running"
                            ? "animate-pulse bg-warn"
                            : session.status === "error"
                              ? "bg-block"
                              : "bg-muted-foreground/50"
                        }`}
                      />
                      <span className="flex-1 truncate">{session.title}</span>
                    </button>
                  ))}
                  <Button
                    className="w-full justify-start"
                    onClick={() => {
                      const prior = workspaceSessions(sessions, workspace.id).sort((a, b) =>
                        b.updatedAt.localeCompare(a.updatedAt),
                      )[0];
                      const providerId = prior?.providerId ?? providerConfigs[0]?.providerId ?? "echo";
                      void client.request("create_session", {
                        workspaceId: workspace.id,
                        providerId,
                        permissionMode: "ask",
                      });
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New session
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
        {filtered.length === 0 ? (
          <div className="px-2">
            <p className="mb-2 text-sm text-muted-foreground">No workspaces yet.</p>
            <Button className="w-full" onClick={props.onOpenWorkspace} size="sm" type="button" variant="outline">
              <Plus className="h-3.5 w-3.5" />
              Open a folder
            </Button>
          </div>
        ) : null}
      </div>

      <Dialog
        onClose={() => {
          setDeleteTarget(null);
          setDeleteConfirm("");
        }}
        open={deleteTarget !== null}
        title="Delete workspace?"
      >
        {deleteTarget !== null ? (
          <>
            <p className="mb-3 text-[length:var(--text-sm)] text-muted-foreground">
              Type <strong>{deleteTarget.name}</strong> to confirm. Sessions and local history for this workspace will
              be removed. The audit log is not touched.
            </p>
            <Input onChange={(event) => setDeleteConfirm(event.target.value)} placeholder={deleteTarget.name} value={deleteConfirm} />
            <div className="mt-3 flex justify-end gap-2">
              <Button
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteConfirm("");
                }}
                type="button"
                variant="ghost"
              >
                Cancel
              </Button>
              <Button
                disabled={deleteConfirm !== deleteTarget.name}
                onClick={() => {
                  void client.request("delete_workspace", { workspaceId: deleteTarget.id }).then(() => {
                    setDeleteTarget(null);
                    setDeleteConfirm("");
                  });
                }}
                type="button"
                variant="destructive"
              >
                Delete workspace
              </Button>
            </div>
          </>
        ) : null}
      </Dialog>
    </aside>
  );
}
