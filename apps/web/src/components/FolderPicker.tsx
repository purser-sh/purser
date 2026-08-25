import type { FsEntry } from "@agentdeck/protocol";
import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useRunner } from "@/lib/client";
import { openFolderWithSession } from "@/lib/open-workspace";

export function FolderPicker(props: { open: boolean; onClose: () => void }) {
  const client = useRunner();
  const startPath = client.bootstrap.defaultWorkspace?.absPath ?? client.bootstrap.allowedRoots[0] ?? "/home";
  const [path, setPath] = useState(startPath);
  const [draft, setDraft] = useState(startPath);
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!props.open) {
      return;
    }
    void load(path);
  }, [props.open, path]);

  async function load(next: string) {
    setError(null);
    try {
      const message = await client.request("browse_fs", { path: next });
      if (message.type === "fs_listing") {
        setPath(message.payload.path);
        setDraft(message.payload.path);
        setEntries(message.payload.entries.filter((entry) => entry.kind === "dir"));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "could not list folder");
    }
  }

  async function useFolder() {
    setBusy(true);
    setError(null);
    try {
      await openFolderWithSession(client, path);
      props.onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "could not open folder");
    } finally {
      setBusy(false);
    }
  }

  function onPathSubmit(event: FormEvent) {
    event.preventDefault();
    const next = draft.trim();
    if (next.startsWith("/")) {
      setPath(next);
    }
  }

  function onPathKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      const next = draft.trim();
      if (next.startsWith("/")) {
        setPath(next);
      }
    }
  }

  const parent = path === "/" ? null : path.split("/").slice(0, -1).join("/") || "/";

  return (
    <Dialog onClose={props.onClose} open={props.open} title="Open a folder">
      <p className="mb-2 text-sm text-muted-foreground">
        Pick a project directory. AgentDeck will create a session so you can chat right away.
      </p>
      <form className="mb-2" onSubmit={onPathSubmit}>
        <Input onChange={(event) => setDraft(event.target.value)} onKeyDown={onPathKeyDown} value={draft} />
      </form>
      {error ? <p className="mb-2 text-sm text-destructive">{error}</p> : null}
      <div className="mb-3 max-h-80 overflow-y-auto rounded-md border border-border">
        {parent ? (
          <button
            className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
            onClick={() => setPath(parent)}
            type="button"
          >
            ..
          </button>
        ) : null}
        {entries.map((entry) => (
          <button
            className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
            key={entry.path}
            onClick={() => setPath(entry.path)}
            type="button"
          >
            {entry.name}
          </button>
        ))}
        {entries.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">No subfolders here.</p>
        ) : null}
      </div>
      <div className="flex justify-end gap-2">
        <Button onClick={props.onClose} type="button" variant="ghost">
          Cancel
        </Button>
        <Button disabled={busy} onClick={() => void useFolder()} type="button">
          {busy ? "Opening…" : "Use this folder"}
        </Button>
      </div>
    </Dialog>
  );
}
