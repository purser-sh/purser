import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRunner } from "@/lib/client";
import { useDeckStore } from "@/lib/store";

export function SettingsPanel() {
  const client = useRunner();
  const configs = useDeckStore((state) => state.providerConfigs);
  const profiles = useDeckStore((state) => state.voiceProfiles);
  const relay = useDeckStore((state) => state.relayStatus);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [relayUrl, setRelayUrl] = useState("ws://127.0.0.1:7430");
  const [code, setCode] = useState(() => Math.random().toString(36).slice(2, 8).toUpperCase());

  return (
    <div className="max-h-[70vh] space-y-4 overflow-y-auto text-sm">
      <section>
        <h3 className="mb-2 font-medium">API keys</h3>
        <p className="mb-2 text-xs text-muted-foreground">
          Keys are stored in <code className="font-mono">~/.agentdeck/secrets.json</code>, never in SQLite.
        </p>
        {configs
          .filter((config) => config.authMode === "keychain")
          .map((config) => (
            <div className="mb-2" key={config.id}>
              <label className="text-xs text-muted-foreground">{config.label}</label>
              <div className="mt-1 flex gap-2">
                <Input
                  onChange={(event) => setKeys((current) => ({ ...current, [config.providerId]: event.target.value }))}
                  placeholder="paste key"
                  type="password"
                  value={keys[config.providerId] ?? ""}
                />
                <Button
                  onClick={() => {
                    void client.request("upsert_provider_config", {
                      id: config.id,
                      providerId: config.providerId,
                      label: config.label,
                      baseUrl: config.baseUrl,
                      authMode: config.authMode,
                      settings: { apiKey: keys[config.providerId] ?? "" },
                    });
                  }}
                  size="sm"
                  type="button"
                >
                  Save
                </Button>
              </div>
            </div>
          ))}
      </section>
      <section>
        <h3 className="mb-2 font-medium">Relay / phone</h3>
        <p className="mb-2 text-xs text-muted-foreground">
          Start the relay, pair here, then open <code className="font-mono">/phone</code> on your phone with the same code.
        </p>
        <Input onChange={(event) => setRelayUrl(event.target.value)} value={relayUrl} />
        <Input className="mt-2" onChange={(event) => setCode(event.target.value)} value={code} />
        <Button
          className="mt-2"
          onClick={() => void client.request("pair_relay", { relayUrl, code })}
          size="sm"
          type="button"
        >
          Pair relay
        </Button>
        {relay !== null ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {relay.connected ? "connected" : "not connected"} {relay.code ?? ""}
          </p>
        ) : null}
      </section>
      <section>
        <h3 className="mb-2 font-medium">Voice profiles</h3>
        {profiles.map((profile) => (
          <p className="text-xs text-muted-foreground" key={profile.id}>
            {profile.name} · {profile.sttProvider}/{profile.ttsProvider}
            {profile.wakeWord ? ` · wake “${profile.wakeWord}”` : " · wake word off"}
          </p>
        ))}
      </section>
    </div>
  );
}
