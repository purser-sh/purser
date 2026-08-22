import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useRunner } from "@/lib/client";
import { useDeckStore, workspaceSessions } from "@/lib/store";

export function LeftRail() {
  const client = useRunner();
  const workspaces = useDeckStore((state) => state.workspaces);
  const sessions = useDeckStore((state) => state.sessions);
  const selectedWorkspaceId = useDeckStore((state) => state.selectedWorkspaceId);
  const selectedSessionId = useDeckStore((state) => state.selectedSessionId);
  const selectWorkspace = useDeckStore((state) => state.selectWorkspace);
  const selectSession = useDeckStore((state) => state.selectSession);
  const search = useDeckStore((state) => state.search);
  const [open, setOpen] = useState<Record<string, boolean>>({});

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
    <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-card/40">
      <div className="flex items-center justify-between px-3 py-3 text-xs uppercase tracking-wider text-muted-foreground">
        Workspaces
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {filtered.map((workspace) => {
          const expanded = open[workspace.id] ?? workspace.id === selectedWorkspaceId;
          const kids = workspaceSessions(sessions, workspace.id);
          return (
            <div className="mb-1" key={workspace.id}>
              <button
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent ${
                  workspace.id === selectedWorkspaceId ? "bg-accent" : ""
                }`}
                onClick={() => {
                  selectWorkspace(workspace.id);
                  setOpen((current) => ({ ...current, [workspace.id]: !expanded }));
                }}
                type="button"
              >
                <ChevronDown className={`h-3.5 w-3.5 transition ${expanded ? "" : "-rotate-90"}`} />
                <span className="flex-1 truncate font-medium">{workspace.name}</span>
                <button
                  className="text-muted-foreground hover:text-destructive"
                  onClick={(event) => {
                    event.stopPropagation();
                    void client.request("delete_workspace", { workspaceId: workspace.id });
                  }}
                  type="button"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </button>
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
                            ? "animate-pulse bg-amber-400"
                            : session.status === "error"
                              ? "bg-destructive"
                              : "bg-zinc-500"
                        }`}
                      />
                      <span className="flex-1 truncate">{session.title}</span>
                    </button>
                  ))}
                  <Button
                    className="w-full justify-start"
                    onClick={() => {
                      void client.request("create_session", {
                        workspaceId: workspace.id,
                        providerId: "echo",
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
          <p className="px-2 text-sm text-muted-foreground">Pick a folder to add a workspace.</p>
        ) : null}
      </div>
    </aside>
  );
}
