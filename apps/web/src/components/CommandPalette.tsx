import type { PermissionMode } from "@purser-sh/protocol";
import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useRunner } from "@/lib/client";
import { PERMISSION_MODES, useDeckStore, workspaceSessions } from "@/lib/store";

type Command = {
  id: string;
  label: string;
  group: string;
  run: () => void;
};

export function CommandPalette(props: { onOpenWorkspace: () => void }) {
  const open = useDeckStore((state) => state.commandPaletteOpen);
  const setOpen = useDeckStore((state) => state.setCommandPaletteOpen);
  const setRightPanelTab = useDeckStore((state) => state.setRightPanelTab);
  const workspaces = useDeckStore((state) => state.workspaces);
  const sessions = useDeckStore((state) => state.sessions);
  const selectedSessionId = useDeckStore((state) => state.selectedSessionId);
  const selectWorkspace = useDeckStore((state) => state.selectWorkspace);
  const selectSession = useDeckStore((state) => state.selectSession);
  const providerConfigs = useDeckStore((state) => state.providerConfigs);
  const client = useRunner();
  const [query, setQuery] = useState("");

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(!open);
      }
      if (event.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  const session = sessions.find((item) => item.id === selectedSessionId);

  const commands = useMemo(() => {
    const list: Command[] = [
      {
        id: "open-spend",
        label: "Open Spend tab",
        group: "Navigation",
        run: () => {
          setRightPanelTab("spend");
          setOpen(false);
        },
      },
      {
        id: "open-files",
        label: "Open Files tab",
        group: "Navigation",
        run: () => {
          setRightPanelTab("files");
          setOpen(false);
        },
      },
      {
        id: "open-setup",
        label: "Open Setup tab",
        group: "Navigation",
        run: () => {
          setRightPanelTab("setup");
          setOpen(false);
        },
      },
      {
        id: "open-folder",
        label: "Open a folder...",
        group: "Workspace",
        run: () => {
          setOpen(false);
          props.onOpenWorkspace();
        },
      },
    ];

    for (const workspace of workspaces) {
      list.push({
        id: `ws:${workspace.id}`,
        label: `Workspace: ${workspace.name}`,
        group: "Sessions",
        run: () => {
          selectWorkspace(workspace.id);
          setOpen(false);
        },
      });
      for (const item of workspaceSessions(sessions, workspace.id)) {
        list.push({
          id: `sess:${item.id}`,
          label: `Session: ${item.title}`,
          group: "Sessions",
          run: () => {
            selectSession(item.id);
            setOpen(false);
          },
        });
      }
    }

    if (session !== undefined) {
      for (const config of providerConfigs) {
        list.push({
          id: `prov:${config.providerId}`,
          label: `Provider: ${config.label}`,
          group: "Session",
          run: () => {
            void client.request("set_session_provider", {
              sessionId: session.id,
              providerId: config.providerId,
              permissionMode: session.permissionMode,
            });
            setOpen(false);
          },
        });
      }
      for (const mode of PERMISSION_MODES) {
        list.push({
          id: `perm:${mode.id}`,
          label: `Permission: ${mode.label}`,
          group: "Session",
          run: () => {
            if (mode.id === "bypass") {
              setRightPanelTab("setup");
              setOpen(false);
              return;
            }
            void client.request("set_session_provider", {
              sessionId: session.id,
              providerId: session.providerId,
              modelId: session.modelId ?? undefined,
              permissionMode: mode.id as PermissionMode,
            });
            setOpen(false);
          },
        });
      }
    }

    return list;
  }, [
    client,
    props,
    providerConfigs,
    selectSession,
    selectWorkspace,
    session,
    sessions,
    setOpen,
    setRightPanelTab,
    workspaces,
  ]);

  const filtered = commands.filter((command) => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) {
      return true;
    }
    return command.label.toLowerCase().includes(q) || command.group.toLowerCase().includes(q);
  });

  const groups = [...new Set(filtered.map((item) => item.group))];

  if (!open) {
    return null;
  }

  return (
    <Dialog onClose={() => setOpen(false)} open={open} title="Command palette">
      <Input
        autoFocus
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Jump to a session, provider, or the Spend tab"
        value={query}
      />
      <div className="mt-3 max-h-80 space-y-3 overflow-y-auto">
        {groups.map((group) => (
          <div key={group}>
            <p className="mb-1 text-[length:var(--text-2xs)] label-caps text-muted-foreground">{group}</p>
            <div className="space-y-0.5">
              {filtered
                .filter((item) => item.group === group)
                .map((item) => (
                  <button
                    className="block w-full rounded-[var(--radius-control)] px-2 py-1.5 text-left text-[length:var(--text-sm)] hover:bg-surface-2"
                    key={item.id}
                    onClick={item.run}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 ? <p className="text-[length:var(--text-sm)] text-muted-foreground">No matches.</p> : null}
      </div>
      <p className="mt-3 text-[length:var(--text-2xs)] text-muted-foreground">⌘K or Ctrl+K. Esc to close.</p>
    </Dialog>
  );
}
