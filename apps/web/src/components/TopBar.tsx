import type { PermissionMode } from "@purser-sh/protocol";
import { modelOptionLabel, modelSelectState } from "@purser-sh/protocol";
import { Moon, Settings, Sun, SunMoon, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { ModeSegment } from "@/components/ModeSegment";
import { RunMeter } from "@/components/RunMeter";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRunner } from "@/lib/client";
import { isBlocked, shortReason } from "@/lib/readiness";
import { ollamaModelEditWarning } from "@/lib/ollama-models";
import {
  activeRunForSession,
  consoleRunState,
  consoleRunStateLabel,
} from "@/lib/run-state";
import { cycleTheme, readThemePreference, themeLabel, type ThemePreference } from "@/lib/theme";
import { selectedSession, selectedWorkspace, useDeckStore } from "@/lib/store";
import { cn } from "@/lib/utils";

function ThemeIcon({ preference }: { preference: ThemePreference }) {
  if (preference === "light") {
    return <Sun className="h-4 w-4" />;
  }
  if (preference === "dark") {
    return <Moon className="h-4 w-4" />;
  }
  return <SunMoon className="h-4 w-4" />;
}

function bypassCountdown(expiresAt: string | null, runsRemaining: number | null): string | null {
  const parts: string[] = [];
  if (expiresAt !== null) {
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms > 0) {
      parts.push(`${Math.ceil(ms / 60_000)}m left`);
    }
  }
  if (runsRemaining !== null) {
    parts.push(`${runsRemaining} run${runsRemaining === 1 ? "" : "s"}`);
  }
  return parts.length > 0 ? parts.join(", ") : null;
}

export function TopBar(props: { onSettings: () => void }) {
  const client = useRunner();
  const workspaces = useDeckStore((state) => state.workspaces);
  const sessions = useDeckStore((state) => state.sessions);
  const runs = useDeckStore((state) => state.runs);
  const events = useDeckStore((state) => state.events);
  const selectedWorkspaceId = useDeckStore((state) => state.selectedWorkspaceId);
  const selectedSessionId = useDeckStore((state) => state.selectedSessionId);
  const providerConfigs = useDeckStore((state) => state.providerConfigs);
  const modelsByProvider = useDeckStore((state) => state.modelsByProvider);
  const costModelByProvider = useDeckStore((state) => state.costModelByProvider);
  const lastSpendBySession = useDeckStore((state) => state.lastSpendBySession);
  const healthByProvider = useDeckStore((state) => state.healthByProvider);
  const pendingPermissions = useDeckStore((state) => state.pendingPermissions);
  const pendingBudgets = useDeckStore((state) => state.pendingBudgets);
  const pendingDocuments = useDeckStore((state) => state.pendingDocuments);
  const connection = useDeckStore((state) => state.connection);
  const setRightPanelTab = useDeckStore((state) => state.setRightPanelTab);
  const workspace = selectedWorkspace(workspaces, selectedWorkspaceId);
  const session = selectedSession(sessions, selectedSessionId);
  const [theme, setTheme] = useState<ThemePreference>(() => readThemePreference());
  const [, tick] = useState(0);
  const [bypassOpen, setBypassOpen] = useState(false);
  const [bypassText, setBypassText] = useState("");
  const [bypassAck, setBypassAck] = useState(false);

  useEffect(() => {
    if (session?.permissionMode !== "bypass") {
      return;
    }
    const id = window.setInterval(() => tick((value) => value + 1), 30_000);
    return () => window.clearInterval(id);
  }, [session?.permissionMode]);

  useEffect(() => {
    if (session === undefined) {
      return;
    }
    void client.request("list_models", { providerId: session.providerId });
  }, [client, session?.providerId, session]);

  const loadedModels = session ? modelsByProvider[session.providerId] : undefined;
  const models = loadedModels ?? [];
  const storedModelId = session?.modelId ?? null;
  const modelState = modelSelectState(storedModelId, loadedModels);
  const spend = session ? lastSpendBySession[session.id] : undefined;
  const costModel = session ? (costModelByProvider[session.providerId] ?? "local") : "local";
  const ollamaEditWarning =
    session?.providerId === "ollama" ? ollamaModelEditWarning(storedModelId) : null;
  const runState =
    session === undefined
      ? null
      : consoleRunState({
          session,
          health: healthByProvider[session.providerId],
          runs,
          events,
          pendingPermissions,
          pendingBudgets,
        });
  const activeRun = session === undefined ? undefined : activeRunForSession(runs, session.id);
  const pendingCount =
    session === undefined
      ? 0
      : pendingPermissions.filter((item) => item.sessionId === session.id).length +
        pendingBudgets.filter((item) => item.sessionId === session.id).length +
        pendingDocuments.filter((item) => item.sessionId === session.id).length +
        events.filter(
          (event) =>
            event.sessionId === session.id &&
            event.payload.kind === "file_diff" &&
            event.payload.staged === true,
        ).length;
  const bypassRemaining =
    session?.permissionMode === "bypass"
      ? bypassCountdown(session.bypassExpiresAt, session.bypassRunsRemaining)
      : null;

  async function setProvider(providerId: string) {
    if (session === undefined) {
      return;
    }
    await client.request("set_session_provider", {
      sessionId: session.id,
      providerId,
      permissionMode: session.permissionMode,
    });
  }

  async function setModel(modelId: string) {
    if (session === undefined) {
      return;
    }
    await client.request("set_session_provider", {
      sessionId: session.id,
      providerId: session.providerId,
      modelId,
      permissionMode: session.permissionMode,
    });
  }

  async function setMode(permissionMode: PermissionMode) {
    if (session === undefined) {
      return;
    }
    if (permissionMode === "bypass") {
      setBypassOpen(true);
      return;
    }
    await client.request("set_session_provider", {
      sessionId: session.id,
      providerId: session.providerId,
      modelId: session.modelId ?? undefined,
      permissionMode,
    });
  }

  async function stopRun() {
    if (activeRun === undefined) {
      return;
    }
    await client.request("cancel_run", { runId: activeRun.id });
  }

  return (
    <>
      <header
        className={cn(
          "flex h-14 shrink-0 items-center gap-3 border-b border-border px-4",
          session?.permissionMode === "bypass" && "border-b-2 border-warn",
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-border bg-card font-mono text-sm font-bold text-foreground">
            P
          </div>
          <span className="hidden text-sm font-semibold tracking-wide sm:inline">Purser</span>
          {workspace !== undefined ? (
            <span className="hidden max-w-[8rem] truncate text-[length:var(--text-xs)] text-muted-foreground md:inline" title={workspace.absPath}>
              {workspace.name}
            </span>
          ) : null}
        </div>

        {session !== undefined ? (
          <div className="mx-auto flex min-w-0 flex-wrap items-center justify-center gap-2">
            <select
              className={cn(
                "max-w-[8rem] truncate rounded-[var(--radius-control)] border bg-background px-2 py-1 text-[length:var(--text-xs)]",
                isBlocked(healthByProvider[session.providerId]) ? "border-block text-block" : "border-border",
              )}
              onChange={(event) => void setProvider(event.target.value)}
              value={session.providerId}
            >
              {providerConfigs.map((config) => {
                const health = healthByProvider[config.providerId];
                const blocked = isBlocked(health);
                return (
                  <option
                    disabled={blocked && config.providerId !== session.providerId}
                    key={config.id}
                    title={health?.detail}
                    value={config.providerId}
                  >
                    {config.label}
                    {blocked && health !== undefined ? ` · ${shortReason(health)}` : ""}
                  </option>
                );
              })}
            </select>
            <span className="text-muted-foreground">·</span>
            <select
              aria-invalid={modelState === "invalid"}
              className={cn(
                "max-w-[10rem] truncate rounded-[var(--radius-control)] border bg-background px-2 py-1 text-[length:var(--text-xs)]",
                modelState === "invalid" ? "border-block text-block" : "border-border",
              )}
              onChange={(event) => void setModel(event.target.value)}
              title={
                modelState === "invalid" && storedModelId !== null
                  ? `${storedModelId} is not a model of ${session.providerId}. Pick one of its models.`
                  : undefined
              }
              value={storedModelId ?? ""}
            >
              {modelState === "invalid" && storedModelId !== null ? (
                <option disabled value={storedModelId}>
                  {modelOptionLabel(storedModelId, loadedModels)}
                </option>
              ) : null}
              {modelState === "loading" && storedModelId !== null ? (
                <option disabled value={storedModelId}>
                  {modelOptionLabel(storedModelId, loadedModels)}
                </option>
              ) : null}
              {storedModelId === null ? (
                <option disabled value="">
                  {loadedModels === undefined ? "loading models" : "select a model"}
                </option>
              ) : null}
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {modelOptionLabel(model.id, loadedModels)}
                </option>
              ))}
            </select>
            <span className="text-muted-foreground">·</span>
            <ModeSegment
              bypassCountdown={bypassRemaining}
              onChange={(mode) => void setMode(mode)}
              value={session.permissionMode}
            />
            {runState !== null ? (
              <Badge
                className={cn(
                  runState === "waiting" && "border-warn/40 text-warn",
                  runState === "running" && "border-info/40 text-info",
                  runState === "blocked" && "border-block/40 text-block",
                  runState === "ready" && "border-pass/40 text-pass",
                )}
              >
                {consoleRunStateLabel(runState)}
              </Badge>
            ) : null}
            {pendingCount > 0 ? (
              <Badge className="border-accent/40 text-accent">
                {pendingCount} pending
              </Badge>
            ) : null}
            <RunMeter
              costModel={costModel}
              onClick={() => setRightPanelTab("spend")}
              running={session.status === "running"}
              spend={spend}
              variant="compact"
            />
            {session.permissionMode === "bypass" && bypassRemaining ? (
              <span className="text-[length:var(--text-2xs)] text-warn">Bypass · {bypassRemaining}</span>
            ) : null}
            {ollamaEditWarning ? (
              <p className="w-full basis-full text-center text-[length:var(--text-2xs)] text-warn">{ollamaEditWarning}</p>
            ) : null}
          </div>
        ) : (
          <p className="mx-auto text-[length:var(--text-xs)] text-muted-foreground">Open a folder to start a session</p>
        )}

        <div className="ml-auto flex items-center gap-2">
          {session !== undefined && activeRun !== undefined ? (
            <Button className="text-block" onClick={() => void stopRun()} size="sm" type="button" variant="outline">
              <Square className="h-3.5 w-3.5 fill-current" />
              Stop
            </Button>
          ) : null}
          <Badge
            className={
              connection === "ready"
                ? "border-pass/40 text-pass"
                : connection === "error"
                  ? "border-block/40 text-block"
                  : "border-warn/40 text-warn"
            }
          >
            {connection}
          </Badge>
          <Button
            aria-label={themeLabel(theme)}
            onClick={() => setTheme(cycleTheme(theme))}
            size="icon"
            title={themeLabel(theme)}
            type="button"
            variant="ghost"
          >
            <ThemeIcon preference={theme} />
          </Button>
          <Button aria-label="Settings" onClick={props.onSettings} size="icon" type="button" variant="ghost">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </header>

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
                    permissionMode: "bypass",
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
    </>
  );
}
