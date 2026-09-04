import type { CostModel, PermissionMode } from "@purser-sh/protocol";
import { budgetSummaryLabel } from "@purser-sh/protocol";
import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useRunner } from "@/lib/client";
import { parseUsdToMicros } from "@/lib/money";
import { readOperatorProfile, writeOperatorProfile } from "@/lib/operator";
import { isBlocked, shortReason, useRecheckProvider } from "@/lib/readiness";
import { formatBytes } from "@/lib/documents";
import { PERMISSION_MODES, selectedSession, selectedWorkspace, useDeckStore } from "@/lib/store";
import { cn } from "@/lib/utils";

type SettingsSection = "providers" | "workspace" | "permissions" | "budgets" | "data" | "you";

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: "providers", label: "Providers" },
  { id: "workspace", label: "Workspace" },
  { id: "permissions", label: "Permissions" },
  { id: "budgets", label: "Budgets" },
  { id: "data", label: "Data" },
  { id: "you", label: "You" },
];

const COST_MODEL_LABEL: Record<CostModel, string> = {
  metered: "metered API · dollars when priced",
  subscription: "subscription plan · tokens only",
  local: "local · tokens only",
};

function CopyButton(props: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      onClick={() => {
        void navigator.clipboard.writeText(props.text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
      size="sm"
      type="button"
      variant="outline"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      Copy
    </Button>
  );
}

export function SettingsScreen(props: { onClose: () => void }) {
  const client = useRunner();
  const recheckProvider = useRecheckProvider();
  const providerConfigs = useDeckStore((state) => state.providerConfigs);
  const healthByProvider = useDeckStore((state) => state.healthByProvider);
  const costModelByProvider = useDeckStore((state) => state.costModelByProvider);
  const budgets = useDeckStore((state) => state.budgets);
  const documentSettings = useDeckStore((state) => state.documentSettings);
  const documentCacheBytes = useDeckStore((state) => state.documentCacheBytes);
  const markitdown = useDeckStore((state) => state.markitdown);
  const workspaces = useDeckStore((state) => state.workspaces);
  const sessions = useDeckStore((state) => state.sessions);
  const selectedWorkspaceId = useDeckStore((state) => state.selectedWorkspaceId);
  const selectedSessionId = useDeckStore((state) => state.selectedSessionId);
  const workspace = selectedWorkspace(workspaces, selectedWorkspaceId);
  const session = selectedSession(sessions, selectedSessionId);

  const [section, setSection] = useState<SettingsSection>("providers");
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [baseUrls, setBaseUrls] = useState<Record<string, string>>({});
  const [testResults, setTestResults] = useState<Record<string, string>>({});
  const [limitTokens, setLimitTokens] = useState("100000");
  const [limitUsd, setLimitUsd] = useState("");
  const [budgetAction, setBudgetAction] = useState<"warn" | "ask" | "hard_stop">("hard_stop");
  const [budgetWindow, setBudgetWindow] = useState<"run" | "day" | "month">("day");
  const [budgetScope, setBudgetScope] = useState<"global" | "workspace" | "session">("global");
  const [operator, setOperator] = useState(readOperatorProfile);
  const [bypassOpen, setBypassOpen] = useState(false);
  const [bypassText, setBypassText] = useState("");
  const [bypassAck, setBypassAck] = useState(false);
  const [docTokenThreshold, setDocTokenThreshold] = useState(String(documentSettings.tokenThreshold));
  const [docMaxFileMb, setDocMaxFileMb] = useState(String(Math.round(documentSettings.maxFileBytes / (1024 * 1024))));
  const [docTimeoutSec, setDocTimeoutSec] = useState(String(Math.round(documentSettings.convertTimeoutMs / 1000)));

  useEffect(() => {
    setDocTokenThreshold(String(documentSettings.tokenThreshold));
    setDocMaxFileMb(String(Math.round(documentSettings.maxFileBytes / (1024 * 1024))));
    setDocTimeoutSec(String(Math.round(documentSettings.convertTimeoutMs / 1000)));
  }, [documentSettings]);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const config of providerConfigs) {
      if (config.baseUrl !== null) {
        next[config.providerId] = config.baseUrl;
      }
    }
    setBaseUrls(next);
  }, [providerConfigs]);

  async function testProvider(providerId: string) {
    const message = await client.request("check_provider_health", { providerId });
    if (message.type === "provider_health") {
      setTestResults((current) => ({
        ...current,
        [providerId]: message.payload.ok ? "Connected" : message.payload.detail,
      }));
    }
  }

  function saveOperator() {
    writeOperatorProfile(operator);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4">
      <div className="flex h-[min(85vh,720px)] w-[min(960px,95vw)] min-w-[760px] overflow-hidden rounded-[var(--radius-card)] border border-border bg-card shadow-lg">
        <nav className="flex w-44 shrink-0 flex-col border-r border-border bg-surface-2 p-3">
          <p className="mb-3 text-[length:var(--text-2xs)] label-caps text-muted-foreground">Settings</p>
          {SECTIONS.map((item) => (
            <button
              className={cn(
                "rounded-[var(--radius-control)] px-2 py-1.5 text-left text-[length:var(--text-sm)]",
                section === item.id ? "bg-accent-soft text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
              key={item.id}
              onClick={() => setSection(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
          <div className="mt-auto pt-4">
            <Button className="w-full" onClick={props.onClose} type="button" variant="outline">
              Close
            </Button>
          </div>
        </nav>

        <div className="flex-1 overflow-y-auto p-6">
          {section === "providers" ? (
            <div className="space-y-3">
              <h2 className="text-[length:var(--text-lg)] font-semibold">Providers</h2>
              <p className="text-[length:var(--text-sm)] text-muted-foreground">
                Keys live in <code className="font-mono">~/.purser/secrets.json</code>, never SQLite.
              </p>
              {providerConfigs.map((config) => {
                const health = healthByProvider[config.providerId];
                const blocked = isBlocked(health);
                const expanded = expandedProvider === config.providerId;
                const costModel = costModelByProvider[config.providerId] ?? "local";
                return (
                  <div className="rounded-[var(--radius-card)] border border-border p-3" key={config.id}>
                    <button
                      className="flex w-full items-center gap-2 text-left"
                      onClick={() => setExpandedProvider(expanded ? null : config.providerId)}
                      type="button"
                    >
                      <span
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-full",
                          blocked ? "bg-block" : health?.ok ? "bg-pass" : "bg-warn",
                        )}
                      />
                      <span className="flex-1 font-medium">{config.label}</span>
                      <span className="text-[length:var(--text-xs)] text-muted-foreground">
                        {health === undefined ? "checking" : blocked ? shortReason(health!) : health.ok ? "ready" : "unknown"}
                      </span>
                      <span className="rounded border border-border px-1.5 text-[length:var(--text-2xs)] text-muted-foreground">
                        {COST_MODEL_LABEL[costModel]}
                      </span>
                    </button>
                    {expanded ? (
                      <div className="mt-3 space-y-2 border-t border-border-soft pt-3">
                        {costModel === "subscription" || costModel === "local" ? (
                          <p className="text-[length:var(--text-xs)] text-muted-foreground" title="Your plan price is not knowable from the outside, so we report tokens rather than invent a currency figure.">
                            {COST_MODEL_LABEL[costModel]}. Your plan price is not knowable from the outside.
                          </p>
                        ) : (
                          <p className="text-[length:var(--text-xs)] text-muted-foreground">{COST_MODEL_LABEL[costModel]}</p>
                        )}
                        {blocked && health?.remedy !== null && health?.remedy !== undefined ? (
                          <div>
                            <p className="text-[length:var(--text-xs)] text-muted-foreground">{health.remedy.fix}</p>
                            {health.remedy.command !== null ? (
                              <div className="mt-1 flex items-start gap-2">
                                <pre className="flex-1 overflow-x-auto rounded-[var(--radius-control)] border border-border bg-surface-2 px-2 py-1 font-mono text-[length:var(--text-2xs)]">
                                  {health.remedy.command}
                                </pre>
                                <CopyButton text={health.remedy.command} />
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        {config.authMode === "keychain" ? (
                          <div className="flex gap-2">
                            <Input
                              onChange={(event) =>
                                setKeys((current) => ({ ...current, [config.providerId]: event.target.value }))
                              }
                              placeholder="API key"
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
                              Save key
                            </Button>
                          </div>
                        ) : null}
                        {config.providerId === "ollama" || config.providerId === "generic_llm" ? (
                          <Input
                            onChange={(event) =>
                              setBaseUrls((current) => ({ ...current, [config.providerId]: event.target.value }))
                            }
                            placeholder="Base URL"
                            value={baseUrls[config.providerId] ?? ""}
                          />
                        ) : null}
                        <div className="flex gap-2">
                          <Button onClick={() => void testProvider(config.providerId)} size="sm" type="button" variant="outline">
                            Test connection
                          </Button>
                          <Button onClick={() => recheckProvider(config.providerId)} size="sm" type="button" variant="ghost">
                            Re-check
                          </Button>
                        </div>
                        {testResults[config.providerId] ? (
                          <p className="text-[length:var(--text-xs)] text-muted-foreground">{testResults[config.providerId]}</p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              <div className="rounded-[var(--radius-card)] border border-border p-3">
                <div className="flex items-center gap-2">
                  <span
                    className={cn("h-2 w-2 shrink-0 rounded-full", markitdown.available ? "bg-pass" : "bg-block")}
                  />
                  <span className="font-medium">MarkItDown (optional)</span>
                  <span className="text-[length:var(--text-xs)] text-muted-foreground">
                    {markitdown.available ? "ready" : "not installed"}
                  </span>
                </div>
                <p className="mt-2 text-[length:var(--text-xs)] text-muted-foreground">
                  Unlocks PowerPoint, images with OCR, and other long-tail formats. PDF, Word, and Excel work without it.
                </p>
                {!markitdown.available && markitdown.installCommand ? (
                  <div className="mt-2 flex items-start gap-2">
                    <pre className="flex-1 overflow-x-auto rounded-[var(--radius-control)] border border-border bg-surface-2 px-2 py-1 font-mono text-[length:var(--text-2xs)]">
                      {markitdown.installCommand}
                    </pre>
                    <CopyButton text={markitdown.installCommand} />
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {section === "workspace" ? (
            <div className="space-y-4">
              <h2 className="text-[length:var(--text-lg)] font-semibold">Workspace</h2>
              <p className="text-[length:var(--text-xs)] text-muted-foreground">
                Controls for <code className="font-mono">read_document</code>. Text previews via <code className="font-mono">read_file</code> are capped at 512 KB by the runner.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="space-y-1 text-[length:var(--text-xs)]">
                  <span>Token threshold</span>
                  <Input onChange={(event) => setDocTokenThreshold(event.target.value)} value={docTokenThreshold} />
                </label>
                <label className="space-y-1 text-[length:var(--text-xs)]">
                  <span>Max document size (MB)</span>
                  <Input onChange={(event) => setDocMaxFileMb(event.target.value)} value={docMaxFileMb} />
                </label>
                <label className="space-y-1 text-[length:var(--text-xs)]">
                  <span>Convert timeout (seconds)</span>
                  <Input onChange={(event) => setDocTimeoutSec(event.target.value)} value={docTimeoutSec} />
                </label>
              </div>
              <Button
                onClick={() => {
                  const tokenThreshold = Number.parseInt(docTokenThreshold, 10);
                  const maxFileBytes = Number.parseInt(docMaxFileMb, 10) * 1024 * 1024;
                  const convertTimeoutMs = Number.parseInt(docTimeoutSec, 10) * 1000;
                  if (!Number.isFinite(tokenThreshold) || !Number.isFinite(maxFileBytes) || !Number.isFinite(convertTimeoutMs)) {
                    return;
                  }
                  void client.request("update_document_settings", { tokenThreshold, maxFileBytes, convertTimeoutMs });
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                Save document settings
              </Button>
            </div>
          ) : null}

          {section === "permissions" ? (
            <div className="space-y-4">
              <h2 className="text-[length:var(--text-lg)] font-semibold">Permissions</h2>
              <section>
                <h3 className="mb-2 text-[length:var(--text-sm)] font-medium">Default mode for new sessions</h3>
                <p className="mb-2 text-[length:var(--text-xs)] text-muted-foreground">
                  Ask stages every mutating tool. Auto edit applies file changes immediately. Bypass runs all tools until TTL expires.
                </p>
                <div className="flex flex-wrap gap-2">
                  {PERMISSION_MODES.map((mode) => (
                    <span
                      className="rounded-[var(--radius-control)] border border-border px-2 py-1 text-[length:var(--text-xs)]"
                      key={mode.id}
                    >
                      {mode.label}
                    </span>
                  ))}
                </div>
              </section>
              <section>
                <h3 className="mb-2 text-[length:var(--text-sm)] font-medium">Bypass</h3>
                <p className="mb-2 text-[length:var(--text-xs)] text-muted-foreground">
                  Default TTL: 30 minutes or 10 runs. Every bypassed tool call is audit-logged.
                </p>
                {session !== undefined ? (
                  <Button onClick={() => setBypassOpen(true)} size="sm" type="button" variant="outline">
                    Enable bypass for current session…
                  </Button>
                ) : (
                  <p className="text-[length:var(--text-xs)] text-muted-foreground">Open a session to enable bypass.</p>
                )}
              </section>
              <section>
                <h3 className="mb-2 text-[length:var(--text-sm)] font-medium">Shell (run_bash)</h3>
                <p className="mb-2 text-[length:var(--text-xs)] text-muted-foreground">
                  Off by default. When on, commands pass through an allowlist; unknown commands are mutating.
                </p>
                <label className="flex items-center gap-2 text-[length:var(--text-xs)]">
                  <input
                    checked={workspace?.runBashEnabled === true}
                    disabled={workspace === undefined}
                    onChange={(event) => {
                      if (workspace === undefined) return;
                      void client.request("update_workspace_shell", {
                        workspaceId: workspace.id,
                        runBashEnabled: event.target.checked,
                      });
                    }}
                    type="checkbox"
                  />
                  Enable run_bash for this workspace
                </label>
                <label className="mt-2 flex items-center gap-2 text-[length:var(--text-xs)]">
                  <input
                    checked={workspace?.allowDestructiveShell === true}
                    disabled={workspace === undefined || workspace.runBashEnabled !== true}
                    onChange={(event) => {
                      if (workspace === undefined) return;
                      void client.request("update_workspace_shell", {
                        workspaceId: workspace.id,
                        allowDestructiveShell: event.target.checked,
                      });
                    }}
                    type="checkbox"
                  />
                  Allow destructive shell (rm -rf, git reset --hard, curl | sh, …)
                </label>
                <p className="mt-2 text-[length:var(--text-2xs)] text-muted-foreground">
                  Refused without destructive shell: rm -rf, git reset --hard, curl | sh, and similar irreversible patterns.
                </p>
              </section>
            </div>
          ) : null}

          {section === "data" ? (
            <div className="space-y-4">
              <h2 className="text-[length:var(--text-lg)] font-semibold">Data</h2>
              <section>
                <h3 className="mb-2 text-[length:var(--text-sm)] font-medium">Document cache</h3>
                <p className="mb-2 text-[length:var(--text-xs)] text-muted-foreground">
                  Converted markdown is cached in <code className="font-mono">~/.purser/doc-cache/</code> keyed by file content hash.
                </p>
                <p className="text-[length:var(--text-sm)]">Current size: {formatBytes(documentCacheBytes)}</p>
                <Button
                  className="mt-3"
                  onClick={() => void client.request("clear_document_cache", {})}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Clear document cache
                </Button>
              </section>
            </div>
          ) : null}

          {section === "budgets" ? (
            <div className="space-y-4">
              <h2 className="text-[length:var(--text-lg)] font-semibold">Budgets</h2>
              <p className="text-[length:var(--text-xs)] text-muted-foreground">
                Token caps apply to every provider. USD caps apply only to metered APIs we can price.
              </p>
              {session !== undefined && (costModelByProvider[session.providerId] === "subscription" || costModelByProvider[session.providerId] === "local") ? (
                <p className="rounded-[var(--radius-control)] border border-border bg-surface-2 px-3 py-2 text-[length:var(--text-xs)] text-text-2">
                  This provider reports tokens only. Set a token cap to limit this run.
                  {limitUsd.trim().length > 0 && limitTokens.trim().length === 0
                    ? " A currency-only cap is ignored for subscription and local providers."
                    : ""}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <select
                  className="rounded-[var(--radius-control)] border border-border bg-background px-2 py-1 text-[length:var(--text-xs)]"
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value === "global" || value === "workspace" || value === "session") {
                      setBudgetScope(value);
                    }
                  }}
                  value={budgetScope}
                >
                  <option value="global">everything</option>
                  <option value="workspace">this workspace</option>
                  <option value="session">this session</option>
                </select>
                <select
                  className="rounded-[var(--radius-control)] border border-border bg-background px-2 py-1 text-[length:var(--text-xs)]"
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
                  className="rounded-[var(--radius-control)] border border-border bg-background px-2 py-1 text-[length:var(--text-xs)]"
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
              <label className="block space-y-1 text-[length:var(--text-xs)]">
                <span>
                  {budgetWindow === "run" ? "Tokens for this run" : "Token cap"}
                </span>
                <Input
                  onChange={(event) => setLimitTokens(event.target.value)}
                  placeholder="e.g. 100000"
                  value={limitTokens}
                />
              </label>
              <label className="block space-y-1 text-[length:var(--text-xs)]">
                <span>USD cap (metered providers only)</span>
                <Input
                  onChange={(event) => setLimitUsd(event.target.value)}
                  placeholder="optional, e.g. 5.00"
                  value={limitUsd}
                />
              </label>
              <Button
                onClick={() => {
                  const tokens = limitTokens.trim().length === 0 ? null : Number(limitTokens);
                  const usd = parseUsdToMicros(limitUsd);
                  if ((tokens === null || !Number.isFinite(tokens)) && usd === null) {
                    return;
                  }
                  void client.request("set_budget", {
                    scope: budgetScope,
                    scopeId:
                      budgetScope === "global"
                        ? null
                        : budgetScope === "workspace"
                          ? selectedWorkspaceId
                          : selectedSessionId,
                    window: budgetWindow,
                    limitTokens: tokens !== null && Number.isFinite(tokens) ? Math.trunc(tokens) : null,
                    limitUsdMicros: usd,
                    action: budgetAction,
                    enabled: true,
                  });
                }}
                type="button"
              >
                Save budget
              </Button>
              <div className="space-y-1">
                {budgets.map((budget) => (
                  <div className="flex items-center justify-between gap-2 text-[length:var(--text-xs)]" key={budget.id}>
                    <span className="min-w-0 truncate text-muted-foreground">{budgetSummaryLabel(budget)}</span>
                    <button
                      className="shrink-0 text-block"
                      onClick={() => void client.request("delete_budget", { budgetId: budget.id })}
                      type="button"
                    >
                      delete
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {section === "you" ? (
            <div className="space-y-4">
              <h2 className="text-[length:var(--text-lg)] font-semibold">You</h2>
              <p className="text-[length:var(--text-sm)] text-muted-foreground">
                The audit log records who approved each change. This name is stored locally in your browser only — it is
                never sent anywhere until config sync lands in a future release.
              </p>
              <div>
                <label className="text-[length:var(--text-xs)] text-muted-foreground">Display name</label>
                <Input
                  className="mt-1"
                  onChange={(event) => setOperator((current) => ({ ...current, displayName: event.target.value }))}
                  placeholder="Your name"
                  value={operator.displayName}
                />
              </div>
              <div>
                <label className="text-[length:var(--text-xs)] text-muted-foreground">Email</label>
                <Input
                  className="mt-1"
                  onChange={(event) => setOperator((current) => ({ ...current, email: event.target.value }))}
                  placeholder="you@example.com"
                  type="email"
                  value={operator.email}
                />
              </div>
              <Button onClick={saveOperator} type="button">
                Save
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {session !== undefined ? (
        <Dialog onClose={() => setBypassOpen(false)} open={bypassOpen} title="Enable bypass for this session?">
          <p className="mb-3 text-[length:var(--text-sm)] text-muted-foreground">
            Type bypass and confirm. Expires after 30 minutes or 10 runs.
          </p>
          <Input onChange={(event) => setBypassText(event.target.value)} value={bypassText} />
          <label className="mt-3 flex items-start gap-2 text-[length:var(--text-xs)] text-muted-foreground">
            <input checked={bypassAck} onChange={(event) => setBypassAck(event.target.checked)} type="checkbox" />
            I understand tools will run without asking until expiry.
          </label>
          <div className="mt-3 flex justify-end gap-2">
            <Button onClick={() => setBypassOpen(false)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button
              disabled={bypassText !== "bypass" || !bypassAck}
              onClick={() => {
                void client
                  .request("set_session_provider", {
                    sessionId: session.id,
                    providerId: session.providerId,
                    modelId: session.modelId ?? undefined,
                    permissionMode: "bypass" as PermissionMode,
                  })
                  .then(() => {
                    setBypassOpen(false);
                    setBypassText("");
                    setBypassAck(false);
                  });
              }}
              type="button"
              variant="destructive"
            >
              Enable bypass
            </Button>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
