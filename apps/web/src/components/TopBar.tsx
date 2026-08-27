import type { PermissionMode } from "@purser-sh/protocol";
import { Moon, Settings, Sun, SunMoon } from "lucide-react";
import { useEffect, useState } from "react";
import { RunMeter } from "@/components/RunMeter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRunner } from "@/lib/client";
import { isBlocked, shortReason } from "@/lib/readiness";
import { cycleTheme, readThemePreference, themeLabel, type ThemePreference } from "@/lib/theme";
import { PERMISSION_MODES, selectedSession, useDeckStore } from "@/lib/store";
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
      parts.push(`${Math.ceil(ms / 60_000)}m`);
    }
  }
  if (runsRemaining !== null) {
    parts.push(`${runsRemaining} run${runsRemaining === 1 ? "" : "s"}`);
  }
  return parts.length > 0 ? parts.join(", ") : null;
}

export function TopBar(props: { onSettings: () => void }) {
  const client = useRunner();
  const sessions = useDeckStore((state) => state.sessions);
  const selectedSessionId = useDeckStore((state) => state.selectedSessionId);
  const providerConfigs = useDeckStore((state) => state.providerConfigs);
  const modelsByProvider = useDeckStore((state) => state.modelsByProvider);
  const costModelByProvider = useDeckStore((state) => state.costModelByProvider);
  const lastSpendBySession = useDeckStore((state) => state.lastSpendBySession);
  const healthByProvider = useDeckStore((state) => state.healthByProvider);
  const connection = useDeckStore((state) => state.connection);
  const setRightPanelTab = useDeckStore((state) => state.setRightPanelTab);
  const session = selectedSession(sessions, selectedSessionId);
  const [theme, setTheme] = useState<ThemePreference>(() => readThemePreference());
  const [, tick] = useState(0);

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

  /*
   * `undefined` means list_models has not answered yet, which is not the same
   * as a provider that answered with nothing. Only a loaded list can prove a
   * stored model id is unresolvable.
   */
  const loadedModels = session ? modelsByProvider[session.providerId] : undefined;
  const models = loadedModels ?? [];
  const storedModelId = session?.modelId ?? null;
  const unresolvableModelId =
    loadedModels !== undefined && storedModelId !== null && !models.some((model) => model.id === storedModelId)
      ? storedModelId
      : null;
  const spend = session ? lastSpendBySession[session.id] : undefined;
  const costModel = session ? (costModelByProvider[session.providerId] ?? "local") : "local";

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
      setRightPanelTab("setup");
      return;
    }
    await client.request("set_session_provider", {
      sessionId: session.id,
      providerId: session.providerId,
      modelId: session.modelId ?? undefined,
      permissionMode,
    });
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] border border-border bg-card font-mono text-sm font-bold text-foreground">
          P
        </div>
        <span className="text-sm font-semibold tracking-wide">Purser</span>
      </div>

      {session !== undefined ? (
        <div className="mx-auto flex min-w-0 flex-wrap items-center justify-center gap-2">
          {/*
            Unready providers stay visible but unselectable, with the reason in
            the label. The Setup tab carries the command that fixes it.
          */}
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
          {/*
            The stored value is rendered as-is and always has a matching option,
            so the control can never show one model while the session holds
            another. A value the provider does not offer is surfaced as an error,
            never silently replaced by the first option's label.
          */}
          <select
            aria-invalid={unresolvableModelId !== null}
            className={cn(
              "max-w-[10rem] truncate rounded-[var(--radius-control)] border bg-background px-2 py-1 text-[length:var(--text-xs)]",
              unresolvableModelId !== null ? "border-block text-block" : "border-border",
            )}
            onChange={(event) => void setModel(event.target.value)}
            title={
              unresolvableModelId !== null
                ? `${unresolvableModelId} is not a model of ${session.providerId}. Pick one of its models.`
                : undefined
            }
            value={storedModelId ?? ""}
          >
            {unresolvableModelId !== null ? (
              <option disabled value={unresolvableModelId}>
                invalid: {unresolvableModelId}
              </option>
            ) : null}
            {unresolvableModelId === null && storedModelId !== null && loadedModels === undefined ? (
              <option disabled value={storedModelId}>
                {storedModelId}
              </option>
            ) : null}
            {storedModelId === null ? (
              <option disabled value="">
                {loadedModels === undefined ? "loading models" : "select a model"}
              </option>
            ) : null}
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
          <span className="text-muted-foreground">·</span>
          <div className="flex flex-wrap gap-1">
            {PERMISSION_MODES.map((mode) => {
              const active = session.permissionMode === mode.id;
              const countdown =
                mode.id === "bypass" && active
                  ? bypassCountdown(session.bypassExpiresAt, session.bypassRunsRemaining)
                  : null;
              return (
                <Button
                  className={cn(
                    mode.id === "bypass" && active ? "border-block text-block hover:bg-block-soft" : "",
                  )}
                  key={mode.id}
                  onClick={() => void setMode(mode.id)}
                  size="sm"
                  type="button"
                  variant={active ? "selected" : "outline"}
                >
                  {mode.label}
                  {countdown ? <span className="tabular-nums text-[length:var(--text-2xs)]">({countdown})</span> : null}
                </Button>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="mx-auto text-[length:var(--text-xs)] text-muted-foreground">Open a folder to start a session</p>
      )}

      <div className="ml-auto flex items-center gap-2">
        {session !== undefined ? (
          <RunMeter
            costModel={costModel}
            onClick={() => setRightPanelTab("spend")}
            running={session.status === "running"}
            spend={spend}
            variant="compact"
          />
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
        <Button onClick={props.onSettings} size="icon" type="button" variant="ghost">
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
