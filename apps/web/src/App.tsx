import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ChatPane } from "@/components/ChatPane";
import { FolderPicker } from "@/components/FolderPicker";
import { LeftRail } from "@/components/LeftRail";
import { RightPanel } from "@/components/RightPanel";
import { TopBar } from "@/components/TopBar";
import { Dialog } from "@/components/ui/dialog";
import { ClientProvider } from "@/lib/client";
import { useDeckStore } from "@/lib/store";
import { fetchBootstrap, RunnerClient } from "@/lib/ws";

export function App() {
  const bootstrap = useQuery({
    queryKey: ["bootstrap"],
    queryFn: fetchBootstrap,
    retry: true,
    retryDelay: 1500,
  });
  const applyServerMessage = useDeckStore((state) => state.applyServerMessage);
  const setConnection = useDeckStore((state) => state.setConnection);
  const connection = useDeckStore((state) => state.connection);
  const connectionDetail = useDeckStore((state) => state.connectionDetail);
  const [picker, setPicker] = useState(false);
  const [settings, setSettings] = useState(false);

  const client = useMemo(() => {
    if (bootstrap.data === undefined) {
      return null;
    }
    return new RunnerClient(bootstrap.data, applyServerMessage, setConnection);
  }, [bootstrap.data, applyServerMessage, setConnection]);

  useEffect(() => {
    if (client === null) {
      return;
    }
    client.connect();
    return () => client.disconnect();
  }, [client]);

  if (bootstrap.data === undefined || client === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <h1 className="text-lg font-semibold">Waiting for the runner</h1>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Start both apps with <code className="font-mono">bun run dev</code>. The UI reads
            <code className="font-mono"> ~/.agentdeck/config.json</code> once the runner creates it. No API keys
            needed for Echo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ClientProvider value={client}>
      <div className="flex h-full flex-col">
        <TopBar onNewWorkspace={() => setPicker(true)} onSettings={() => setSettings(true)} />
        {connection === "error" && connectionDetail !== null ? (
          <div className="bg-amber-950 px-4 py-1 text-center text-xs text-amber-200">{connectionDetail}</div>
        ) : null}
        <div className="flex min-h-0 flex-1">
          <LeftRail />
          <ChatPane />
          <RightPanel />
        </div>
        <FolderPicker onClose={() => setPicker(false)} open={picker} />
        <Dialog onClose={() => setSettings(false)} open={settings} title="Settings">
          <p className="text-sm text-muted-foreground">
            Runner token and SQLite live in <code className="font-mono">~/.agentdeck</code>. Echo needs no API key.
            Claude, Codex, Cursor, Gemini, Grok, and Ollama land in later phases.
          </p>
        </Dialog>
      </div>
    </ClientProvider>
  );
}
