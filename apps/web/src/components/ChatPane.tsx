import type { AgentEvent, BudgetStatus, StoredEvent } from "@agentdeck/protocol";
import { ArrowUp, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { EmptyStart } from "@/components/EmptyStart";
import { MarkdownBody } from "@/components/MarkdownBody";
import { VoiceButton } from "@/components/VoiceButton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useRunner } from "@/lib/client";
import { selectedSession, sessionEvents, useDeckStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { coachPrompt } from "@agentdeck/prompt-coach";
import { formatUsdMicros } from "@/lib/money";

function asAgent(event: StoredEvent): AgentEvent | null {
  if (event.payload.kind === "user_message") {
    return null;
  }
  return event.payload;
}

function formatUnknown(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function DiffPatch({ patch }: { patch: string }) {
  const lines = patch.replace(/\n$/, "").split("\n");
  return (
    <pre className="overflow-x-auto rounded-md bg-black/50 p-2 font-mono text-[12px] leading-5">
      {lines.map((line, index) => {
        const tone =
          line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")
            ? "text-muted-foreground"
            : line.startsWith("+")
              ? "bg-emerald-500/15 text-emerald-300"
              : line.startsWith("-")
                ? "bg-red-500/15 text-red-300"
                : "text-zinc-300";
        return (
          <div className={cn("px-1", tone)} key={`${index}:${line}`}>
            {line.length === 0 ? " " : line}
          </div>
        );
      })}
    </pre>
  );
}

function ToolCard({ event }: { event: Extract<AgentEvent, { kind: "tool_call" | "tool_result" }> }) {
  const [open, setOpen] = useState(false);
  if (event.kind === "tool_call") {
    return (
      <div className="w-full max-w-2xl rounded-lg border border-border bg-card/80 px-3 py-2">
        <button className="flex w-full items-center justify-between text-left text-xs" onClick={() => setOpen((value) => !value)} type="button">
          <span className="font-medium text-foreground">{event.name}</span>
          <span className="text-muted-foreground">{event.summary}</span>
        </button>
        {open ? (
          <pre className="mt-2 overflow-x-auto text-left text-[11px] text-muted-foreground">{formatUnknown(event.input)}</pre>
        ) : null}
      </div>
    );
  }
  return (
    <div className="w-full max-w-2xl rounded-lg border border-border bg-card/60 px-3 py-2 text-xs text-muted-foreground">
      <button className="flex w-full items-center justify-between text-left" onClick={() => setOpen((value) => !value)} type="button">
        <span>{event.ok ? "ok" : "failed"}</span>
        <span>{event.ms}ms</span>
      </button>
      {open ? <pre className="mt-2 overflow-x-auto text-left text-[11px] text-foreground">{formatUnknown(event.output)}</pre> : null}
    </div>
  );
}

function EventView({ event, sessionId }: { event: StoredEvent; sessionId: string }) {
  const client = useRunner();
  if (event.payload.kind === "user_message") {
    return (
      <div className="ml-auto max-w-[75%] rounded-2xl bg-primary px-3 py-2 text-sm text-primary-foreground">
        {event.payload.text}
      </div>
    );
  }
  const agent = asAgent(event);
  if (agent === null) {
    return null;
  }
  if (agent.kind === "thinking") {
    return (
      <details className="max-w-[80%] text-xs text-muted-foreground">
        <summary className="cursor-pointer">thinking</summary>
        <p className="mt-1 whitespace-pre-wrap">{agent.text}</p>
      </details>
    );
  }
  if (agent.kind === "text") {
    return (
      <div className="max-w-[80%] rounded-2xl border border-border bg-card px-3 py-2">
        <MarkdownBody text={agent.text} />
      </div>
    );
  }
  if (agent.kind === "tool_call" || agent.kind === "tool_result") {
    return <ToolCard event={agent} />;
  }
  if (agent.kind === "file_diff") {
    return (
      <div className="w-full max-w-2xl rounded-lg border border-border bg-black/30 p-3">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-mono text-foreground">{agent.path}</span>
          <span className="text-muted-foreground">
            +{agent.added} / −{agent.removed}
          </span>
        </div>
        <DiffPatch patch={agent.patch} />
        <div className="mt-2 flex justify-end gap-2">
          <Button
            onClick={() => void client.request("diff_response", { sessionId, path: agent.path, approve: false })}
            size="sm"
            type="button"
            variant="outline"
          >
            Reject
          </Button>
          <Button
            onClick={() => void client.request("diff_response", { sessionId, path: agent.path, approve: true })}
            size="sm"
            type="button"
          >
            Approve
          </Button>
        </div>
      </div>
    );
  }
  if (agent.kind === "permission_request") {
    return (
      <div className="w-full max-w-2xl rounded-lg border border-amber-500/40 bg-amber-950/40 p-3 text-sm">
        <p className="font-medium">Allow {agent.action}?</p>
        <pre className="mt-2 overflow-x-auto text-[11px] text-muted-foreground">{formatUnknown(agent.detail)}</pre>
        <div className="mt-2 flex justify-end gap-2">
          <Button
            onClick={() => void client.request("permission_response", { requestId: agent.requestId, allow: false })}
            size="sm"
            type="button"
            variant="outline"
          >
            Deny
          </Button>
          <Button
            onClick={() => void client.request("permission_response", { requestId: agent.requestId, allow: true })}
            size="sm"
            type="button"
          >
            Allow
          </Button>
        </div>
      </div>
    );
  }
  if (agent.kind === "done") {
    return <p className="text-center text-xs text-muted-foreground">{agent.summary}</p>;
  }
  if (agent.kind === "error") {
    return <p className="text-sm text-destructive">{agent.message}</p>;
  }
  return null;
}

export function ChatPane(props: { onOpenWorkspace: () => void }) {
  const client = useRunner();
  const events = useDeckStore((state) => state.events);
  const sessions = useDeckStore((state) => state.sessions);
  const selectedSessionId = useDeckStore((state) => state.selectedSessionId);
  const liveText = useDeckStore((state) => state.liveText);
  const pending = useDeckStore((state) => state.pendingPermissions);
  const pendingBudgets = useDeckStore((state) => state.pendingBudgets);
  const lastSpendBySession = useDeckStore((state) => state.lastSpendBySession);
  const costModelByProvider = useDeckStore((state) => state.costModelByProvider);
  const configs = useDeckStore((state) => state.providerConfigs);
  const session = selectedSession(sessions, selectedSessionId);
  const [draft, setDraft] = useState("");
  const visible = useMemo(() => sessionEvents(events, selectedSessionId), [events, selectedSessionId]);
  const estimate = useMemo(() => (draft.trim().length === 0 ? null : coachPrompt(draft)), [draft]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const providerLabel = configs.find((config) => config.providerId === session?.providerId)?.label ?? session?.providerId;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [visible, liveText, pending.length, pendingBudgets.length]);

  async function send(text = draft.trim()) {
    if (session === undefined || text.length === 0) {
      return;
    }
    setDraft("");
    await client.request("send_message", { sessionId: session.id, text });
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  if (session === undefined) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <EmptyStart onChooseFolder={props.onOpenWorkspace} />
      </main>
    );
  }

  const streaming = liveText[session.id] ?? "";
  const sessionPending = pending.filter((item) => item.sessionId === session.id);
  const sessionBudgets = pendingBudgets.filter((item) => item.sessionId === session.id);
  const demo = session.providerId === "echo";
  const spend = lastSpendBySession[session.id];
  const costModel = costModelByProvider[session.providerId] ?? "local";
  const tightest: BudgetStatus | undefined = spend?.budgets.reduce<BudgetStatus | undefined>(
    (best, item) => (best === undefined || item.pct >= best.pct ? item : best),
    undefined,
  );

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{session.title}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {providerLabel}
            {session.modelId ? ` · ${session.modelId}` : ""} · {session.permissionMode.replace("_", " ")}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wide",
            session.status === "running"
              ? "border-amber-500/40 text-amber-300"
              : session.status === "error"
                ? "border-destructive/40 text-destructive"
                : "border-border text-muted-foreground",
          )}
        >
          {session.status}
        </span>
      </div>
      {demo ? (
        <div className="border-b border-amber-500/30 bg-amber-950/40 px-4 py-2 text-center text-xs text-amber-100">
          Echo is a fake agent so you can test the console with no API key. Switch provider on the right to run Claude,
          Codex, Cursor, Gemini, Grok, or Ollama on this folder.
        </div>
      ) : null}
      <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
        {visible.map((event) => (
          <EventView event={event} key={event.id} sessionId={session.id} />
        ))}
        {sessionBudgets.map((item) => (
          <div className="w-full max-w-2xl rounded-lg border border-amber-500/40 bg-amber-950/40 p-3 text-sm" key={item.requestId}>
            <p className="font-medium">
              Budget {item.budget.scope}/{item.budget.window} is at {Math.trunc(item.budget.pct)}%
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {item.budget.unit === "usd_micros"
                ? `${formatUsdMicros(item.budget.spent)} of ${formatUsdMicros(item.budget.limit)}`
                : `${item.budget.spent} / ${item.budget.limit} tokens`}
            </p>
            <div className="mt-2 flex flex-wrap justify-end gap-2">
              <Button
                onClick={() => void client.request("budget_response", { requestId: item.requestId, decision: "deny" })}
                size="sm"
                type="button"
                variant="outline"
              >
                Stop
              </Button>
              <Button
                onClick={() =>
                  void client.request("budget_response", {
                    requestId: item.requestId,
                    decision: "allow_with_headroom",
                    headroomUsdMicros: 1_000_000,
                  })
                }
                size="sm"
                type="button"
                variant="outline"
              >
                Allow with +$1
              </Button>
              <Button
                onClick={() => void client.request("budget_response", { requestId: item.requestId, decision: "allow_once" })}
                size="sm"
                type="button"
              >
                Allow once
              </Button>
            </div>
          </div>
        ))}
        {sessionPending.map((item) => (
          <div className="w-full max-w-2xl rounded-lg border border-amber-500/40 bg-amber-950/40 p-3 text-sm" key={item.requestId}>
            <p className="font-medium">Allow {item.action}?</p>
            <div className="mt-2 flex justify-end gap-2">
              <Button
                onClick={() => void client.request("permission_response", { requestId: item.requestId, allow: false })}
                size="sm"
                type="button"
                variant="outline"
              >
                Deny
              </Button>
              <Button
                onClick={() => void client.request("permission_response", { requestId: item.requestId, allow: true })}
                size="sm"
                type="button"
              >
                Allow
              </Button>
            </div>
          </div>
        ))}
        {streaming.length > 0 && session.status === "running" ? (
          <div className="max-w-[80%] rounded-2xl border border-dashed border-border px-3 py-2 text-sm">{streaming}</div>
        ) : null}
        <div ref={bottomRef} />
      </div>
      <form className="border-t border-border p-4" onSubmit={onSubmit}>
        <Textarea
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask the agent, or speak with the mic. Shift+Enter for a new line."
          value={draft}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1 rounded-md border border-border bg-card/70 px-3 py-1.5 text-[11px] text-muted-foreground">
            {spend !== undefined ? (
              <div className="space-y-1">
                <p>
                  <span className="font-medium text-foreground">
                    {spend.tokens.input + spend.tokens.output} tokens
                  </span>
                  {" · "}
                  {costModel === "metered" && spend.costUsdMicros !== null ? formatUsdMicros(spend.costUsdMicros) : "—"}
                  {spend.source === "estimated" ? <span className="text-amber-300"> · source: estimated</span> : null}
                </p>
                {tightest !== undefined ? (
                  <div className="h-1 overflow-hidden rounded-full bg-border">
                    <div
                      className={cn("h-full", tightest.pct >= 100 ? "bg-destructive" : tightest.pct >= 80 ? "bg-amber-400" : "bg-emerald-400")}
                      style={{ width: `${Math.min(100, Math.trunc(tightest.pct))}%` }}
                    />
                  </div>
                ) : null}
              </div>
            ) : estimate === null ? (
              <p>Spend meter · send a run to see live tokens. Prompt coach still estimates before send.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p>
                  <span className="font-medium text-foreground">{estimate.tokens}</span> prompt tokens (coach, not the loop)
                  {estimate.savedTokens > 0 ? (
                    <>
                      {" "}
                      → <span className="text-emerald-400">{estimate.compactTokens}</span> if shortened
                    </>
                  ) : null}
                </p>
                {estimate.savedTokens > 0 ? (
                  <Button
                    className="h-6 px-2"
                    onClick={() => setDraft(estimate.compactText)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <Sparkles className="h-3 w-3" />
                    Use shorter prompt
                  </Button>
                ) : null}
              </div>
            )}
          </div>
          <VoiceButton compact />
          <Button disabled={session.status === "running" || draft.trim().length === 0} type="submit">
            <ArrowUp className="h-4 w-4" />
            Send
          </Button>
        </div>
        {estimate !== null && estimate.savedTokens > 0 ? (
          <p className="mt-2 line-clamp-2 font-mono text-[11px] text-muted-foreground">{estimate.compactText}</p>
        ) : null}
      </form>
    </main>
  );
}
