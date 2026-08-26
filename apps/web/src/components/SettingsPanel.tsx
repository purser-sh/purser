import { generatePairingCode, PAIRING_CODE_LENGTH } from "@purser-sh/integrations/pairing-code";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRunner } from "@/lib/client";
import { parseUsdToMicros } from "@/lib/money";
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
  const budgets = useDeckStore((state) => state.budgets);
  const selectedSessionId = useDeckStore((state) => state.selectedSessionId);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [relayUrl, setRelayUrl] = useState("ws://127.0.0.1:7430");
  const [code, setCode] = useState(() => generatePairingCode());
  const [inboxPath, setInboxPath] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [limitTokens, setLimitTokens] = useState("100000");
  const [limitUsd, setLimitUsd] = useState("");
  const [budgetAction, setBudgetAction] = useState<"warn" | "ask" | "hard_stop">("hard_stop");
  const [budgetWindow, setBudgetWindow] = useState<"run" | "day" | "month">("day");
  const workspace = workspaces.find((item) => item.id === selectedWorkspaceId);

  return (
    <div className="max-h-[70vh] space-y-4 overflow-y-auto text-sm">
      <section>
        <h3 className="mb-2 font-medium">API keys</h3>
        <p className="mb-2 text-xs text-muted-foreground">
          Keys are stored in <code className="font-mono">~/.purser/secrets.json</code>, never in SQLite.
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
                  variant="outline"
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
          variant="outline"
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
          variant="outline"
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
          variant="outline"
        >
          Link repository
        </Button>
        {workspace?.gitRemote ? (
          <p className="mt-1 font-mono text-xs text-muted-foreground">{workspace.gitRemote}</p>
        ) : null}
      </section>
      <section>
        <h3 className="mb-2 font-medium">Budgets</h3>
        <p className="mb-2 text-xs text-muted-foreground">
          USD limits apply to metered APIs we can price. Token limits apply to every cost model. Day/month buckets use the
          run start time (UTC).
        </p>
        <div className="flex flex-wrap gap-2">
          <select
            className="rounded-md border border-border bg-background px-2 py-1 text-xs"
            onChange={(event) => {
              const value = event.target.value;
              if (value === "run" || value === "day" || value === "month") {
                setBudgetWindow(value);
              }
            }}
            value={budgetWindow}
          >
            <option value="run">per run</option>
            <option value="day">per day</option>
            <option value="month">per month</option>
          </select>
          <select
            className="rounded-md border border-border bg-background px-2 py-1 text-xs"
            onChange={(event) => {
              const value = event.target.value;
              if (value === "warn" || value === "ask" || value === "hard_stop") {
                setBudgetAction(value);
              }
            }}
            value={budgetAction}
          >
            <option value="warn">warn</option>
            <option value="ask">ask</option>
            <option value="hard_stop">hard stop</option>
          </select>
        </div>
        <Input
          className="mt-2"
          onChange={(event) => setLimitTokens(event.target.value)}
          placeholder="token limit"
          value={limitTokens}
        />
        <Input
          className="mt-2"
          onChange={(event) => setLimitUsd(event.target.value)}
          placeholder="USD limit (optional, e.g. 5.00)"
          value={limitUsd}
        />
        <Button
          className="mt-2"
          onClick={() => {
            const tokens = limitTokens.trim().length === 0 ? null : Number(limitTokens);
            const usd = parseUsdToMicros(limitUsd);
            if ((tokens === null || !Number.isFinite(tokens)) && usd === null) {
              return;
            }
            void client.request("set_budget", {
              scope: selectedWorkspaceId === null ? "global" : "workspace",
              scopeId: selectedWorkspaceId,
              window: budgetWindow,
              limitTokens: tokens !== null && Number.isFinite(tokens) ? Math.trunc(tokens) : null,
              limitUsdMicros: usd,
              action: budgetAction,
              enabled: true,
            });
          }}
          size="sm"
          type="button"
        >
          Save workspace budget
        </Button>
        {selectedSessionId !== null ? (
          <Button
            className="mt-2 ml-2"
            onClick={() => {
              const tokens = limitTokens.trim().length === 0 ? null : Number(limitTokens);
              void client.request("set_budget", {
                scope: "session",
                scopeId: selectedSessionId,
                window: budgetWindow,
                limitTokens: tokens !== null && Number.isFinite(tokens) ? Math.trunc(tokens) : null,
                limitUsdMicros: null,
                action: budgetAction,
                enabled: true,
              });
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            Save session token cap
          </Button>
        ) : null}
        <div className="mt-2 space-y-1">
          {budgets.map((budget) => (
            <div className="flex items-center justify-between text-xs text-muted-foreground" key={budget.id}>
              <span>
                {budget.scope}/{budget.window} · {budget.action}
                {budget.limitTokens !== null ? ` · ${budget.limitTokens} tok` : ""}
                {budget.limitUsdMicros !== null ? ` · ${budget.limitUsdMicros} µUSD` : ""}
              </span>
              <button
                className="text-destructive"
                onClick={() => void client.request("delete_budget", { budgetId: budget.id })}
                type="button"
              >
                delete
              </button>
            </div>
          ))}
        </div>
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
