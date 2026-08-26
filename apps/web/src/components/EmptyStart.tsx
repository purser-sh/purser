import { FolderPlus, FolderSync, Mic, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRunner } from "@/lib/client";
import { openFolderWithSession } from "@/lib/open-workspace";
import { useDeckStore } from "@/lib/store";

const SUGGESTIONS = [
  "Summarize this repo and suggest a first task.",
  "Find failing tests and propose a fix.",
  "Watch a drop folder and triage new files.",
];

export function EmptyStart(props: { onChooseFolder: () => void }) {
  const client = useRunner();
  const providerConfigs = useDeckStore((state) => state.providerConfigs);
  const suggested = client.bootstrap.defaultWorkspace;
  const defaultProvider = providerConfigs[0]?.label ?? "Echo";
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function openSuggested() {
    if (suggested === undefined) {
      props.onChooseFolder();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await openFolderWithSession(client, suggested.absPath);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "could not open folder");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-6 text-center">
      <h2 className="text-[length:var(--text-lg)] font-semibold">Open a folder to get started</h2>
      <p className="mt-2 text-[length:var(--text-sm)] text-muted-foreground">
        You'll start on {defaultProvider}. Echo doesn't need a key. Change provider in the top bar whenever you like.
      </p>
      {error ? <p className="mt-2 text-[length:var(--text-sm)] text-destructive">{error}</p> : null}
      <div className="mt-4 flex flex-col items-center gap-2">
        {suggested !== undefined ? (
          <Button disabled={busy} onClick={() => void openSuggested()} type="button">
            <FolderPlus className="h-4 w-4" />
            {busy ? "Opening..." : `Open ${suggested.name}`}
          </Button>
        ) : null}
        <Button onClick={props.onChooseFolder} type="button" variant={suggested !== undefined ? "outline" : "default"}>
          Choose a folder
        </Button>
      </div>
      <ul className="mt-6 space-y-2 text-left">
        {SUGGESTIONS.map((item) => (
          <li className="rounded-[var(--radius-card)] border border-border bg-card/60 p-3 text-[length:var(--text-xs)] text-text-2" key={item}>
            {item}
          </li>
        ))}
      </ul>
      <ul className="mt-4 grid gap-2 text-left text-[length:var(--text-xs)] text-muted-foreground sm:grid-cols-3">
        <li className="rounded-[var(--radius-card)] border border-border bg-card/60 p-3">
          <Mic className="mb-1 h-4 w-4 text-foreground" />
          Voice in the composer.
        </li>
        <li className="rounded-[var(--radius-card)] border border-border bg-card/60 p-3">
          <FolderSync className="mb-1 h-4 w-4 text-foreground" />
          Drop files into <code className="font-mono">.inbox/</code>.
        </li>
        <li className="rounded-[var(--radius-card)] border border-border bg-card/60 p-3">
          <Sparkles className="mb-1 h-4 w-4 text-foreground" />
          Prompt coach before Send.
        </li>
      </ul>
    </div>
  );
}
