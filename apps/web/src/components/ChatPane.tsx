import type { AgentEvent, StoredEvent } from "@purser-sh/protocol";
import { ArrowUp, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { BudgetDecisionCard, DiffCard, PermissionDecisionCard } from "@/components/DiffCard";
import { EmptyStart } from "@/components/EmptyStart";
import { MarkdownBody } from "@/components/MarkdownBody";
import { ToolRow, ThinkingRow } from "@/components/ToolRow";
import { VoiceButton } from "@/components/VoiceButton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useRunner } from "@/lib/client";
import { formatUsdMicros } from "@/lib/money";
import { selectedSession, sessionEvents, useDeckStore } from "@/lib/store";
import { coachPrompt } from "@purser-sh/prompt-coach";
import { TokenCountLabel } from "@/components/TokenCountLabel";

function asAgent(event: StoredEvent): AgentEvent | null {
  if (event.payload.kind === "user_message") {
    return null;
  }
  return event.payload;
}

type RenderItem =
  | { kind: "event"; event: StoredEvent }
  | { kind: "tool"; call?: Extract<AgentEvent, { kind: "tool_call" }>; result?: Extract<AgentEvent, { kind: "tool_result" }> };

function buildRenderItems(events: StoredEvent[]): RenderItem[] {
  const items: RenderItem[] = [];

  for (const event of events) {
    if (event.payload.kind === "user_message") {
      items.push({ kind: "event", event });
      continue;
    }
    const agent = asAgent(event);
    if (agent === null) {
      continue;
    }
    if (agent.kind === "tool_call") {
      items.push({ kind: "tool", call: agent });
      continue;
    }
    if (agent.kind === "tool_result") {
      const last = items[items.length - 1];
      if (last?.kind === "tool" && last.call?.toolId === agent.toolId && last.result === undefined) {
        last.result = agent;
      } else {
        items.push({ kind: "tool", result: agent });
      }
      continue;
    }
    items.push({ kind: "event", event });
  }

  return items;
}

function EventView(props: { event: StoredEvent; sessionId: string; diffRef?: (node: HTMLDivElement | null) => void }) {
  const client = useRunner();
  if (props.event.payload.kind === "user_message") {
    return (
      <div className="ml-auto max-w-[75%] border-l-2 border-accent-brand bg-background py-1 pl-3 text-[length:var(--text-sm)] text-text-2">
        {props.event.payload.text}
      </div>
    );
  }
  const agent = asAgent(props.event);
  if (agent === null) {
    return null;
  }
  if (agent.kind === "thinking") {
    return <ThinkingRow text={agent.text} />;
  }
  if (agent.kind === "text") {
    return (
      <div className="w-full text-[length:var(--text-sm)] leading-relaxed text-foreground">
        <MarkdownBody text={agent.text} />
      </div>
    );
  }
  if (agent.kind === "file_diff") {
    return (
      <DiffCard
        added={agent.added}
        cardRef={props.diffRef}
        onApprove={() => void client.request("diff_response", { sessionId: props.sessionId, path: agent.path, approve: true })}
        onReject={() => void client.request("diff_response", { sessionId: props.sessionId, path: agent.path, approve: false })}
        patch={agent.patch}
        path={agent.path}
        removed={agent.removed}
      />
    );
  }
  if (agent.kind === "permission_request") {
    return (
      <PermissionDecisionCard
        action={agent.action}
        detail={agent.detail}
        onAllow={() => void client.request("permission_response", { requestId: agent.requestId, allow: true })}
        onDeny={() => void client.request("permission_response", { requestId: agent.requestId, allow: false })}
      />
    );
  }
  if (agent.kind === "done") {
    return <p className="text-center text-[length:var(--text-xs)] text-muted-foreground">{agent.summary}</p>;
  }
  if (agent.kind === "error") {
    return <p className="text-[length:var(--text-sm)] text-destructive">{agent.message}</p>;
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
  const configs = useDeckStore((state) => state.providerConfigs);
  const session = selectedSession(sessions, selectedSessionId);
  const [draft, setDraft] = useState("");
  const [focusDiff, setFocusDiff] = useState(0);
  const diffRefs = useRef<Array<HTMLDivElement | null>>([]);
  const visible = useMemo(() => sessionEvents(events, selectedSessionId), [events, selectedSessionId]);
  const renderItems = useMemo(() => buildRenderItems(visible), [visible]);
  const estimate = useMemo(
    () => (draft.trim().length === 0 ? null : coachPrompt(draft, session?.modelId)),
    [draft, session?.modelId],
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const providerLabel = configs.find((config) => config.providerId === session?.providerId)?.label ?? session?.providerId;

  const pendingDiffs = useMemo(
    () => visible.filter((event) => event.payload.kind === "file_diff"),
    [visible],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [visible, liveText, pending.length, pendingBudgets.length]);

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (pendingDiffs.length === 0 || session === undefined) {
        return;
      }
      const target = event.target;
      if (target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }
      if (event.key === "a" || event.key === "A") {
        const diff = pendingDiffs[focusDiff];
        if (diff?.payload.kind === "file_diff") {
          void client.request("diff_response", { sessionId: session.id, path: diff.payload.path, approve: true });
        }
      }
      if (event.key === "r" || event.key === "R") {
        const diff = pendingDiffs[focusDiff];
        if (diff?.payload.kind === "file_diff") {
          void client.request("diff_response", { sessionId: session.id, path: diff.payload.path, approve: false });
        }
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setFocusDiff((value) => Math.min(pendingDiffs.length - 1, value + 1));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setFocusDiff((value) => Math.max(0, value - 1));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [client, focusDiff, pendingDiffs, session]);

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
      <main className="flex min-w-0 flex-1 items-center justify-center">
        <EmptyStart onChooseFolder={props.onOpenWorkspace} />
      </main>
    );
  }

  const streaming = liveText[session.id] ?? "";
  const sessionPending = pending.filter((item) => item.sessionId === session.id);
  const sessionBudgets = pendingBudgets.filter((item) => item.sessionId === session.id);
  const demo = session.providerId === "echo";
  let diffIndex = 0;

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      {demo ? (
        <div className="border-b border-info/30 bg-info-soft px-4 py-2 text-center text-[length:var(--text-2xs)] text-info">
          Echo runs locally. No API key needed. Pick another provider in the top bar when you want a real model.
        </div>
      ) : null}

      <div className="flex flex-1 justify-center overflow-y-auto px-4 py-4">
        <div className="flex w-full min-w-[640px] max-w-[900px] flex-col gap-3">
          {renderItems.length === 0 && session.status !== "running" ? (
            <div className="rounded-[var(--radius-card)] border border-border bg-card/40 p-6 text-center">
              <p className="text-[length:var(--text-sm)] text-muted-foreground">Provider: {providerLabel}</p>
              <ul className="mt-4 space-y-2 text-left text-[length:var(--text-sm)] text-text-2">
                <li>Summarize this repo and suggest a first task.</li>
                <li>Find failing tests and propose a fix.</li>
                <li>Watch a drop folder and triage new files.</li>
              </ul>
            </div>
          ) : null}

          {renderItems.map((item) => {
            if (item.kind === "tool") {
              return <ToolRow call={item.call} key={`tool:${item.call?.toolId ?? item.result?.toolId}`} result={item.result} />;
            }
            const isDiff = item.event.payload.kind === "file_diff";
            const refIndex = isDiff ? diffIndex++ : -1;
            return (
              <EventView
                diffRef={
                  isDiff
                    ? (node) => {
                        diffRefs.current[refIndex] = node;
                      }
                    : undefined
                }
                event={item.event}
                key={item.event.id}
                sessionId={session.id}
              />
            );
          })}

          {sessionBudgets.map((item) => (
            <BudgetDecisionCard
              detail={
                item.budget.unit === "usd_micros"
                  ? `${formatUsdMicros(item.budget.spent)} of ${formatUsdMicros(item.budget.limit)}`
                  : `${item.budget.spent} / ${item.budget.limit} tokens`
              }
              key={item.requestId}
              onAllowHeadroom={() =>
                void client.request("budget_response", {
                  requestId: item.requestId,
                  decision: "allow_with_headroom",
                  headroomUsdMicros: 1_000_000,
                })
              }
              onAllowOnce={() => void client.request("budget_response", { requestId: item.requestId, decision: "allow_once" })}
              onStop={() => void client.request("budget_response", { requestId: item.requestId, decision: "deny" })}
              title={`Budget ${item.budget.scope}/${item.budget.window} is at ${Math.trunc(item.budget.pct)}%`}
            />
          ))}

          {sessionPending.map((item) => (
            <PermissionDecisionCard
              action={item.action}
              detail={item.detail}
              key={item.requestId}
              onAllow={() => void client.request("permission_response", { requestId: item.requestId, allow: true })}
              onDeny={() => void client.request("permission_response", { requestId: item.requestId, allow: false })}
            />
          ))}

          {streaming.length > 0 && session.status === "running" ? (
            <div className="w-full border-l-2 border-border pl-3 text-[length:var(--text-sm)] text-foreground">{streaming}</div>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </div>

      <form className="border-t border-border p-4" onSubmit={onSubmit}>
        <div className="mx-auto w-full min-w-[640px] max-w-[900px]">
          <Textarea
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Message the agent, or use the mic. Shift+Enter adds a new line."
            value={draft}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {estimate !== null && estimate.savedTokens > 0 ? (
              <div className="min-w-0 flex-1 text-[length:var(--text-2xs)] text-muted-foreground">
                <TokenCountLabel count={estimate.tokens} /> → <TokenCountLabel className="text-pass" count={estimate.compactTokens} /> if
                shortened
                <Button
                  className="ml-2 h-6 px-2"
                  onClick={() => setDraft(estimate.compactText)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Sparkles className="h-3 w-3" />
                  Use shorter
                </Button>
              </div>
            ) : (
              <p className="min-w-0 flex-1 text-[length:var(--text-2xs)] text-muted-foreground">
                Spend is in the top bar. Click it for the full breakdown.
              </p>
            )}
            <VoiceButton compact />
            <Button disabled={session.status === "running" || draft.trim().length === 0} type="submit">
              <ArrowUp className="h-4 w-4" />
              Send
            </Button>
          </div>
        </div>
      </form>
    </main>
  );
}
