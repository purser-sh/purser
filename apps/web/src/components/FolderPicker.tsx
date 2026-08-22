import type { FsEntry } from "@agentdeck/protocol";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useRunner } from "@/lib/client";

export function FolderPicker(props: { open: boolean; onClose: () => void }) {
  const client = useRunner();
  const startPath = client.bootstrap.allowedRoots[0] ?? "/home";
  const [path, setPath] = useState(startPath);
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

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
        setEntries(message.payload.entries.filter((entry) => entry.kind === "dir"));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "could not list folder");
    }
  }

  const parent = path === "/" ? null : path.split("/").slice(0, -1).join("/") || "/";

  return (
    <Dialog onClose={props.onClose} open={props.open} title="Choose a folder">
      <p className="mb-2 truncate font-mono text-xs text-muted-foreground">{path}</p>
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
      </div>
      <div className="flex justify-end gap-2">
        <Button onClick={props.onClose} type="button" variant="ghost">
          Cancel
        </Button>
        <Button
          onClick={() => {
            const name = path.split("/").filter(Boolean).at(-1) ?? path;
            void client.request("create_workspace", { name, absPath: path }).then(props.onClose);
          }}
          type="button"
        >
          Use this folder
        </Button>
      </div>
    </Dialog>
  );
}
