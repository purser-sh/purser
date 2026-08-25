import type { AgentEvent, EventRole, ServerMessage } from "@agentdeck/protocol";
import {
  finishRun,
  getProviderConfig,
  getSession,
  getWorkspace,
  insertEvent,
  insertRun,
  updateSession,
  type AppDatabase,
} from "@agentdeck/db";
import { getAdapter } from "./registry.ts";
import { appendRunLog } from "./run-log.ts";
import { getSecret } from "./secrets.ts";
import { buildExtraPrompt } from "./skills.ts";
import { appendAudit } from "./audit.ts";
import { agentdeckDir } from "./config.ts";
import { finalizeRunLedger, recordUsageEvent } from "./meter.ts";

const SKIP_PERSIST = new Set<AgentEvent["kind"]>(["text_delta"]);

function roleFor(event: AgentEvent): EventRole {
  if (event.kind === "tool_call" || event.kind === "tool_result") {
    return "tool";
  }
  return "assistant";
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.message === "Aborted");
}

export type RunBroadcast = (message: Omit<ServerMessage, "id"> & { id?: string }) => void;

export type AskPermission = (request: {
  requestId: string;
  action: string;
  detail: unknown;
}) => Promise<boolean>;

export async function executeRun(input: {
  db: AppDatabase;
  sessionId: string;
  runId: string;
  prompt: string;
  signal: AbortSignal;
  broadcast: RunBroadcast;
  askPermission: AskPermission;
}): Promise<void> {
  const session = getSession(input.db, input.sessionId);
  if (session === undefined) {
    throw new Error("session not found");
  }
  const workspace = getWorkspace(input.db, session.workspaceId);
  if (workspace === undefined) {
    throw new Error("workspace not found");
  }
  const adapter = getAdapter(session.providerId);
  if (adapter === undefined) {
    throw new Error(`provider ${session.providerId} is not available yet`);
  }

  const cwd = session.worktreePath ?? workspace.absPath;
  const provider = getProviderConfig(input.db, session.providerId);
  const apiKey = getSecret(session.providerId);
  const extra = [buildExtraPrompt(workspace.absPath), provider?.settings.personaPrompt]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join("\n\n");

  let seq = 0;
  let runStatus: "ok" | "cancelled" | "error" = "ok";
  let runError: string | null = null;
  let observedText = input.prompt;
  let liveSession = session;

  try {
    for await (const event of adapter.run({
      runId: input.runId,
      cwd,
      workspaceRoot: cwd,
      prompt: input.prompt,
      modelId: session.modelId ?? undefined,
      providerSessionId: session.providerSessionId ?? undefined,
      permissionMode: session.permissionMode,
      signal: input.signal,
      extraSystemPrompt: extra.length > 0 ? extra : undefined,
      config: {
        baseUrl: provider?.baseUrl ?? null,
        apiKey,
        settings: provider?.settings ?? {},
      },
      askPermission: async (request) =>
        input.askPermission({
          requestId: request.requestId,
          action: request.action,
          detail: request.detail,
        }),
    })) {
      appendRunLog(input.runId, event);
      input.broadcast({
        type: "agent_event",
        payload: { sessionId: input.sessionId, runId: input.runId, seq, event },
      });
      seq += 1;

      if (!SKIP_PERSIST.has(event.kind)) {
        insertEvent(input.db, {
          sessionId: input.sessionId,
          kind: event.kind,
          role: roleFor(event),
          payload: event,
        });
      }

      if (event.kind === "text" || event.kind === "text_delta") {
        observedText += `\n${event.text}`;
      }
      if (event.kind === "tool_call") {
        const live = getSession(input.db, input.sessionId);
        if (live?.permissionMode === "bypass") {
          appendAudit(agentdeckDir(), {
            ts: new Date().toISOString(),
            type: "tool_call",
            sessionId: input.sessionId,
            runId: input.runId,
            toolName: event.name,
            toolId: event.toolId,
            bypassed: true,
          });
        }
      }
      if (event.kind === "session_started" && session.providerSessionId === null) {
        updateSession(input.db, input.sessionId, { providerSessionId: event.providerSessionId });
      }
      if (event.kind === "usage") {
        const latest = getSession(input.db, input.sessionId);
        liveSession = latest ?? liveSession;
        recordUsageEvent(input.db, liveSession, input.runId, event);
        updateSession(input.db, input.sessionId, {
          tokensIn: (latest?.tokensIn ?? 0) + (event.inputTokens ?? 0),
          tokensOut: (latest?.tokensOut ?? 0) + (event.outputTokens ?? 0),
        });
      }
      if (event.kind === "done") {
        runStatus = event.status;
      }
      if (event.kind === "error" && event.fatal) {
        runStatus = "error";
        runError = event.message;
      }
    }
  } catch (error) {
    if (isAbortError(error) || input.signal.aborted) {
      runStatus = "cancelled";
      const cancelled: AgentEvent = { kind: "done", status: "cancelled", summary: "Run cancelled" };
      appendRunLog(input.runId, cancelled);
      input.broadcast({
        type: "agent_event",
        payload: { sessionId: input.sessionId, runId: input.runId, seq, event: cancelled },
      });
      insertEvent(input.db, {
        sessionId: input.sessionId,
        kind: "done",
        role: "assistant",
        payload: cancelled,
      });
    } else {
      runStatus = "error";
      runError = error instanceof Error ? error.message : "run failed";
      const failed: AgentEvent = { kind: "error", message: runError, fatal: true };
      appendRunLog(input.runId, failed);
      input.broadcast({
        type: "agent_event",
        payload: { sessionId: input.sessionId, runId: input.runId, seq, event: failed },
      });
      insertEvent(input.db, {
        sessionId: input.sessionId,
        kind: "error",
        role: "assistant",
        payload: failed,
      });
    }
  } finally {
    const latest = getSession(input.db, input.sessionId) ?? liveSession;
    finalizeRunLedger(input.db, latest, input.runId, observedText);
    finishRun(input.db, input.runId, runStatus === "ok" ? "ok" : runStatus, runError);
    updateSession(input.db, input.sessionId, { status: runStatus === "error" ? "error" : "idle" });
    const finished = {
      type: "run_finished" as const,
      payload: {
        runId: input.runId,
        sessionId: input.sessionId,
        status: runStatus === "ok" ? ("ok" as const) : runStatus,
      },
    };
    input.broadcast(finished);
  }
}

export function prepareRun(db: AppDatabase, sessionId: string, prompt: string) {
  const session = getSession(db, sessionId);
  if (session === undefined) {
    throw new Error("session not found");
  }
  if (session.status === "running") {
    throw new Error("session already has a running turn");
  }
  insertEvent(db, {
    sessionId,
    kind: "user_message",
    role: "user",
    payload: { kind: "user_message", text: prompt },
  });
  if (session.title === "New session") {
    const title = prompt.length > 48 ? `${prompt.slice(0, 48)}…` : prompt;
    updateSession(db, sessionId, { title });
  }
  const run = insertRun(db, sessionId);
  updateSession(db, sessionId, { status: "running" });
  return run;
}
