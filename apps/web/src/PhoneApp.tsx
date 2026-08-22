import { useEffect, useMemo, useState } from "react";
import { ChatPane } from "@/components/ChatPane";
import { LeftRail } from "@/components/LeftRail";
import { RightPanel } from "@/components/RightPanel";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClientProvider } from "@/lib/client";
import { useDeckStore } from "@/lib/store";
import { RunnerClient } from "@/lib/ws";

export function PhoneApp() {
  const applyServerMessage = useDeckStore((state) => state.applyServerMessage);
  const setConnection = useDeckStore((state) => state.setConnection);
  const connection = useDeckStore((state) => state.connection);
  const [relayUrl, setRelayUrl] = useState("ws://127.0.0.1:7430");
  const [code, setCode] = useState("");
  const [paired, setPaired] = useState(false);

  const client = useMemo(() => {
    if (!paired || code.length < 4) {
      return null;
    }
    return new RunnerClient(
      { wsUrl: relayUrl, token: code, allowedRoots: [], pair: { role: "phone", code } },
      applyServerMessage,
      setConnection,
    );
  }, [paired, code, relayUrl, applyServerMessage, setConnection]);

  useEffect(() => {
    if (client === null) {
      return;
    }
    client.connect();
    return () => client.disconnect();
  }, [client]);

  if (client === null) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-xl border border-border bg-card p-4">
          <h1 className="text-lg font-semibold">Pair this phone</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Use the code shown in desktop Settings after pairing the relay.
          </p>
          <Input className="mt-3" onChange={(event) => setRelayUrl(event.target.value)} value={relayUrl} />
          <Input className="mt-2" onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="CODE" value={code} />
          <Button className="mt-3 w-full" onClick={() => setPaired(true)} type="button">
            Connect
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ClientProvider value={client}>
      <div className="flex h-full flex-col">
        <TopBar onNewWorkspace={() => undefined} onSettings={() => undefined} />
        <p className="bg-card px-3 py-1 text-center text-[11px] text-muted-foreground">{connection}</p>
        <div className="flex min-h-0 flex-1">
          <LeftRail />
          <ChatPane />
          <RightPanel />
        </div>
      </div>
    </ClientProvider>
  );
}
