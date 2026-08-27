import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { BypassBanner } from "@/components/BypassBanner";
import { ChatPane } from "@/components/ChatPane";
import { CommandPalette } from "@/components/CommandPalette";
import { FirstRunTip } from "@/components/FirstRunTip";
import { FolderPicker } from "@/components/FolderPicker";
import { LeftRail } from "@/components/LeftRail";
import { RightPanel } from "@/components/RightPanel";
import { SettingsPanel } from "@/components/SettingsPanel";
import { ToastHost } from "@/components/ToastHost";
import { TopBar } from "@/components/TopBar";
import { Dialog } from "@/components/ui/dialog";
import { ClientProvider } from "@/lib/client";
import { useProviderReadiness } from "@/lib/readiness";
import { useDeckStore } from "@/lib/store";
import { fetchBootstrap, RunnerClient } from "@/lib/ws";

/** Probes every provider once the socket is authed. Renders nothing. */
function ProviderReadinessProbe() {
  useProviderReadiness();
  return null;
}

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
    const detail =
      bootstrap.error instanceof Error
        ? bootstrap.error.message
        : "Run bun run dev in the project folder. The UI connects once the runner writes ~/.purser/config.json. Echo works without API keys.";
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="rounded-[var(--radius-card)] border border-border bg-card p-6 text-center">
          <h1 className="text-[length:var(--text-lg)] font-semibold">Waiting for the runner</h1>
          <p className="mt-2 max-w-sm text-[length:var(--text-sm)] text-muted-foreground">{detail}</p>
          {bootstrap.isFetching ? (
            <p className="mt-3 text-[length:var(--text-xs)] text-muted-foreground">Retrying...</p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <ClientProvider value={client}>
      <ProviderReadinessProbe />
      <div className="flex h-full flex-col bg-background">
        <TopBar onSettings={() => setSettings(true)} />
        <BypassBanner />
        <FirstRunTip />
        {connection === "error" && connectionDetail !== null ? (
          <div className="bg-warn-soft px-4 py-1 text-center text-[length:var(--text-2xs)] text-warn">{connectionDetail}</div>
        ) : null}
        <div className="flex min-h-0 flex-1">
          <LeftRail onOpenWorkspace={() => setPicker(true)} />
          <ChatPane onOpenWorkspace={() => setPicker(true)} />
          <RightPanel onOpenWorkspace={() => setPicker(true)} />
        </div>
        <FolderPicker onClose={() => setPicker(false)} open={picker} />
        <Dialog onClose={() => setSettings(false)} open={settings} title="Settings">
          <SettingsPanel />
        </Dialog>
        <CommandPalette onOpenWorkspace={() => setPicker(true)} />
        <ToastHost />
      </div>
    </ClientProvider>
  );
}
