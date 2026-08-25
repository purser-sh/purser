import { generatePairingCode, PAIRING_CODE_LENGTH } from "@agentdeck/integrations";
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
  const workspaces = useDeckStore((state) => state.workspaces);
  const selectedWorkspaceId = useDeckStore((state) => state.selectedWorkspaceId);
  const folderWatches = useDeckStore((state) => state.folderWatches);
  const lastSyncEvent = useDeckStore((state) => state.lastSyncEvent);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [relayUrl, setRelayUrl] = useState("ws://127.0.0.1:7430");
  const [code, setCode] = useState(() => generatePairingCode());
  const [inboxPath, setInboxPath] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");
  const workspace = workspaces.find((item) => item.id === selectedWorkspaceId);

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
          Start the relay, pair here, then open <code className="font-mono">/phone</code> with the same {PAIRING_CODE_LENGTH}
          -character code. Codes expire in 2 minutes and work once. Frames are sealed so the relay forwards ciphertext.
        </p>
        <Input onChange={(event) => setRelayUrl(event.target.value)} value={relayUrl} />
        <Input className="mt-2" onChange={(event) => setCode(event.target.value)} value={code} />
        <Button
          className="mt-2"
          disabled={code.trim().length < PAIRING_CODE_LENGTH}
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
        <h3 className="mb-2 font-medium">Auto-sync folder</h3>
        <p className="mb-2 text-xs text-muted-foreground">
          Grant a drop folder (for example <code className="font-mono">~/xyz</code>). New files are copied into
          <code className="font-mono"> .inbox/</code> in the current workspace.
        </p>
        <Input
          onChange={(event) => setInboxPath(event.target.value)}
          placeholder="~/xyz or /absolute/path"
          value={inboxPath}
        />
        <Button
          className="mt-2"
          disabled={
            workspace === undefined ||
            !(inboxPath.startsWith("/") || inboxPath === "~" || inboxPath.startsWith("~/"))
          }
          onClick={() => {
            if (workspace === undefined) return;
            void client.request("watch_folder", { workspaceId: workspace.id, absPath: inboxPath });
          }}
          size="sm"
          type="button"
        >
          Watch this folder
        </Button>
        <div className="mt-2 space-y-1">
          {folderWatches.map((watch) => (
            <div className="flex items-center justify-between text-xs text-muted-foreground" key={`${watch.workspaceId}:${watch.absPath}`}>
              <span className="truncate font-mono">{watch.absPath}</span>
              <button
                className="text-destructive"
                onClick={() =>
                  void client.request("unwatch_folder", { workspaceId: watch.workspaceId, absPath: watch.absPath })
                }
                type="button"
              >
                stop
              </button>
            </div>
          ))}
        </div>
        {lastSyncEvent !== null ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Last sync: {lastSyncEvent.action} {lastSyncEvent.destPath}
            {lastSyncEvent.detail ? ` (${lastSyncEvent.detail})` : ""}
          </p>
        ) : null}
      </section>
      <section>
        <h3 className="mb-2 font-medium">GitHub / GitLab</h3>
        <p className="mb-2 text-xs text-muted-foreground">
          Link origin on the current workspace if it is already a git repo. Clone stays a local git operation.
        </p>
        <Input onChange={(event) => setRemoteUrl(event.target.value)} placeholder="https://github.com/org/repo.git" value={remoteUrl} />
        <Button
          className="mt-2"
          disabled={workspace === undefined || remoteUrl.length < 8}
          onClick={() => {
            if (workspace === undefined) return;
            void client.request("link_repository", { workspaceId: workspace.id, remoteUrl });
          }}
          size="sm"
          type="button"
        >
          Link repository
        </Button>
        {workspace?.gitRemote ? (
          <p className="mt-1 font-mono text-xs text-muted-foreground">{workspace.gitRemote}</p>
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
