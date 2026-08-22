import type { AgentEvent, StoredEvent } from "@agentdeck/protocol";
import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { MarkdownBody } from "@/components/MarkdownBody";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useRunner } from "@/lib/client";
import { selectedSession, sessionEvents, useDeckStore } from "@/lib/store";

function asAgent(event: StoredEvent): AgentEvent | null {
  if (event.payload.kind === "user_message") {
    return null;
  }
  return event.payload;
}

function ToolCard({ event }: { event: Extract<AgentEvent, { kind: "tool_call" | "tool_result" }> }) {
  const [open, setOpen] = useState(false);
  if (event.kind === "tool_call") {
    return (
      <div className="mx-auto w-full max-w-xl rounded-lg border border-border bg-card/80 px-3 py-2 text-center">
        <button className="text-xs font-medium text-muted-foreground" onClick={() => setOpen((value) => !value)} type="button">
          {event.name} · {event.summary}
        </button>
        {open ? (
          <pre className="mt-2 overflow-x-auto text-left text-[11px] text-muted-foreground">
            {JSON.stringify(event.input, null, 2)}
          </pre>
        ) : null}
      </div>
    );
  }
  return (
    <div className="mx-auto w-full max-w-xl rounded-lg border border-border bg-card/80 px-3 py-2 text-center text-xs text-muted-foreground">
      {event.ok ? "ok" : "failed"} · {event.ms}ms
      <pre className="mt-2 overflow-x-auto text-left text-[11px]">{JSON.stringify(event.output, null, 2)}</pre>
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
      <div className="w-full max-w-xl rounded-lg border border-border bg-black/30 p-3">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-mono">{agent.path}</span>
          <span className="text-muted-foreground">
            +{agent.added} / −{agent.removed}
          </span>
        </div>
        <pre className="overflow-x-auto text-[11px] text-emerald-300">{agent.patch}</pre>
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
      <div className="w-full max-w-xl rounded-lg border border-amber-500/40 bg-amber-950/40 p-3 text-sm">
        <p className="font-medium">Allow {agent.action}?</p>
        <pre className="mt-2 overflow-x-auto text-[11px] text-muted-foreground">{JSON.stringify(agent.detail, null, 2)}</pre>
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

export function ChatPane() {
  const client = useRunner();
  const events = useDeckStore((state) => state.events);
  const sessions = useDeckStore((state) => state.sessions);
  const selectedSessionId = useDeckStore((state) => state.selectedSessionId);
  const liveText = useDeckStore((state) => state.liveText);
  const pending = useDeckStore((state) => state.pendingPermissions);
  const session = selectedSession(sessions, selectedSessionId);
  const [draft, setDraft] = useState("");
  const visible = useMemo(() => sessionEvents(events, selectedSessionId), [events, selectedSessionId]);

  async function send() {
    const text = draft.trim();
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
      <main className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Select a workspace and start a session.
      </main>
    );
  }

  const streaming = liveText[session.id] ?? "";
  const sessionPending = pending.filter((item) => item.sessionId === session.id);

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      {session.permissionMode === "bypass" ? (
        <div className="bg-destructive px-4 py-2 text-center text-sm font-medium text-white">
          Bypass is on for this session. The agent can edit without asking.
        </div>
      ) : null}
      <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
        {visible.map((event) => (
          <EventView event={event} key={event.id} sessionId={session.id} />
        ))}
        {sessionPending.map((item) => (
          <div className="w-full max-w-xl rounded-lg border border-amber-500/40 bg-amber-950/40 p-3 text-sm" key={item.requestId}>
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
          <div className="max-w-[80%] rounded-2xl border border-dashed border-border px-3 py-2 text-sm">
            {streaming}
          </div>
        ) : null}
      </div>
      <form className="border-t border-border p-4" onSubmit={onSubmit}>
        <Textarea
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Message the agent"
          value={draft}
        />
        <div className="mt-2 flex justify-end">
          <Button disabled={session.status === "running" || draft.trim().length === 0} type="submit">
            Send
          </Button>
        </div>
      </form>
    </main>
  );
}
