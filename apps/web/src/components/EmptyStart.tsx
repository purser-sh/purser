import { FolderPlus, FolderSync, Mic, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRunner } from "@/lib/client";
import { openFolderWithSession } from "@/lib/open-workspace";
import { useState } from "react";

export function EmptyStart(props: { onChooseFolder: () => void }) {
  const client = useRunner();
  const suggested = client.bootstrap.defaultWorkspace;
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
      <h2 className="text-lg font-semibold">Open a project. Then talk, type, or drop files.</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        AgentDeck is the operator console around your agents — not another editor chat. Echo needs no key so you can
        click around; switch provider on the right to run on real code.
      </p>
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      <div className="mt-4 flex flex-col items-center gap-2">
        {suggested !== undefined ? (
          <Button disabled={busy} onClick={() => void openSuggested()} type="button">
            <FolderPlus className="h-4 w-4" />
            {busy ? "Opening…" : `Open ${suggested.name}`}
          </Button>
        ) : null}
        <Button onClick={props.onChooseFolder} type="button" variant={suggested !== undefined ? "outline" : "default"}>
          Choose a folder
        </Button>
      </div>
      <ul className="mt-6 grid gap-2 text-left text-xs text-muted-foreground sm:grid-cols-3">
        <li className="rounded-lg border border-border bg-card/60 p-3">
          <Mic className="mb-1 h-4 w-4 text-foreground" />
          Voice in the composer. Stop, approve, reject by speaking.
        </li>
        <li className="rounded-lg border border-border bg-card/60 p-3">
          <FolderSync className="mb-1 h-4 w-4 text-foreground" />
          Watch <code className="font-mono">~/xyz</code> — files land in <code className="font-mono">.inbox/</code>.
        </li>
        <li className="rounded-lg border border-border bg-card/60 p-3">
          <Sparkles className="mb-1 h-4 w-4 text-foreground" />
          Token coach shows spend, then a shorter prompt, before you send.
        </li>
      </ul>
    </div>
  );
}
