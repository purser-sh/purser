import type { AgentEvent, EventRole, ServerMessage } from "@purser-sh/protocol";
import {
  finishRun,
  getProviderConfig,
  getRun,
  getSession,
  getWorkspace,
  insertEvent,
  insertRun,
  updateSession,
  getWorkspaceShellSettings,
  LedgerIntegrityError,
  type AppDatabase,
} from "@purser-sh/db";
import { describeVendorFailure } from "@purser-sh/adapters";
import { getAdapter } from "./registry.ts";
import { appendRunLog } from "./run-log.ts";
import { getSecret } from "./secrets.ts";
import { buildExtraPrompt } from "./skills.ts";
import { appendAudit } from "./audit.ts";
import { purserDir } from "./config.ts";
import { writeStaged } from "./staging.ts";
import { createShellRestorePoint } from "./shell-snapshot.ts";
import { finalizeRunLedger, recordUsageEvent } from "./meter.ts";
import {
  buildSpendUpdate,
  createSpendThrottle,
  inFlightGate,
  withLedgerLock,
} from "./budget.ts";
import type { BudgetDecision, BudgetStatus, SpendUpdatePayload } from "@purser-sh/protocol";

const SKIP_PERSIST = new Set<AgentEvent["kind"]>(["text_delta"]);

/**
 * Events that prove the provider did work on this run. A failed login reaches
 * `session_started` and nothing else, and must not be billed an estimate.
 */
const SPEND_EVIDENCE = new Set<AgentEvent["kind"]>([
  "text",
  "text_delta",
  "thinking",
  "tool_call",
  "tool_result",
  "file_diff",
  "permission_request",
  "usage",
]);

function roleFor(event: AgentEvent): EventRole {
  if (event.kind === "tool_call" || event.kind === "tool_result") {
    return "tool";
  }
  return "assistant";
}

function eventForClient(event: AgentEvent): AgentEvent {
  if (event.kind === "file_diff" && event.newContent !== undefined) {
    const { newContent: _ignored, ...rest } = event;
    return rest;
  }
  return event;
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
  extraUsdByBudget?: Map<string, number>;
  onHardStop?: () => void;
  askBudget?: (request: { requestId: string; status: BudgetStatus }) => Promise<{
    decision: BudgetDecision;
    headroomUsdMicros?: number;
  }>;
  onSpendUpdate?: (payload: SpendUpdatePayload, terminal?: boolean) => void;
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
  const shellSettings = getWorkspaceShellSettings(input.db, workspace.id);
  const provider = getProviderConfig(input.db, session.providerId);
  const apiKey = getSecret(session.providerId);
  const extra = [buildExtraPrompt(workspace.absPath), provider?.settings.personaPrompt]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join("\n\n");

  let seq = 0;
  let runStatus: "ok" | "cancelled" | "error" = "ok";
  let runError: string | null = null;
  let observedText = input.prompt;
  /** Whether the provider did any work. `session_started` alone is bookkeeping, not spend. */
  let producedOutput = false;
  let liveSession = session;
  const extraUsdByBudget = input.extraUsdByBudget ?? new Map<string, number>();
  const asked = new Set<string>();
  const warned = new Set<string>();
  const throttle = createSpendThrottle((payload) => input.onSpendUpdate?.(payload, false));
  const runRow = getRun(input.db, input.runId);
  const startedAt = runRow === undefined ? new Date() : new Date(runRow.startedAt);

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
      shell: {
        enabled: shellSettings.runBashEnabled,
        allowDestructive: shellSettings.allowDestructiveShell,
        prepareMutating: async ({ restorePointId }) => {
          const snapshot = createShellRestorePoint(input.sessionId, cwd, restorePointId);
          appendAudit(purserDir(), {
            ts: new Date().toISOString(),
            type: "shell_restore_point",
            sessionId: input.sessionId,
            runId: input.runId,
            workspaceId: workspace.id,
            detail: snapshot.restorePointId,
          });
          return { undoAvailable: snapshot.undoAvailable, undoNote: snapshot.undoNote };
        },
      },
    })) {
      appendRunLog(input.runId, event);
      if (SPEND_EVIDENCE.has(event.kind)) {
        producedOutput = true;
      }
      input.broadcast({
        type: "agent_event",
        payload: { sessionId: input.sessionId, runId: input.runId, seq, event: eventForClient(event) },
      });
      seq += 1;

      if (!SKIP_PERSIST.has(event.kind)) {
        if (event.kind === "file_diff" && event.staged === true && typeof event.newContent === "string") {
          writeStaged(input.sessionId, {
            path: event.path,
            newContent: event.newContent,
            oldContent: event.oldContent,
            patch: event.patch,
            added: event.added,
            removed: event.removed,
          });
          const { newContent: _ignored, ...persisted } = event;
          insertEvent(input.db, {
            sessionId: input.sessionId,
            kind: event.kind,
            role: roleFor(event),
            payload: persisted,
          });
        } else {
          insertEvent(input.db, {
            sessionId: input.sessionId,
            kind: event.kind,
            role: roleFor(event),
            payload: event,
          });
        }
      }

      if (event.kind === "text" || event.kind === "text_delta") {
        observedText += `\n${event.text}`;
      }
      if (event.kind === "tool_call") {
        const live = getSession(input.db, input.sessionId);
        appendAudit(purserDir(), {
          ts: new Date().toISOString(),
          type: "tool_call",
          sessionId: input.sessionId,
          runId: input.runId,
          toolName: event.name,
          toolId: event.toolId,
          bypassed: live?.permissionMode === "bypass",
        });
      }
      if (event.kind === "session_started" && session.providerSessionId === null) {
        updateSession(input.db, input.sessionId, { providerSessionId: event.providerSessionId });
      }
      if (event.kind === "usage") {
        const latest = getSession(input.db, input.sessionId);
        liveSession = latest ?? liveSession;
        const gate = withLedgerLock(input.db, () => {
          recordUsageEvent(input.db, liveSession, input.runId, event);
          updateSession(input.db, input.sessionId, {
            tokensIn: (latest?.tokensIn ?? 0) + (event.inputTokens ?? 0),
            tokensOut: (latest?.tokensOut ?? 0) + (event.outputTokens ?? 0),
          });
          return inFlightGate(input.db, liveSession, startedAt, input.runId, extraUsdByBudget);
        });
        throttle.push(buildSpendUpdate(input.db, liveSession, input.runId, startedAt, extraUsdByBudget));
        if (gate.kind === "warn" && !warned.has(gate.status.budgetId)) {
          warned.add(gate.status.budgetId);
          input.broadcast({
            type: "budget_exceeded",
            payload: {
              runId: input.runId,
              sessionId: input.sessionId,
              budget: gate.status,
              outcome: "warned",
            },
          });
        }
        if (gate.kind === "ask" && input.askBudget !== undefined && !asked.has(gate.status.budgetId)) {
          asked.add(gate.status.budgetId);
          const requestId = crypto.randomUUID();
          const reply = await input.askBudget({ requestId, status: gate.status });
          if (reply.decision === "deny") {
            input.broadcast({
              type: "budget_exceeded",
              payload: {
                runId: input.runId,
                sessionId: input.sessionId,
                budget: gate.status,
                outcome: "stopped",
              },
            });
            input.onHardStop?.();
          } else {
            if (reply.decision === "allow_with_headroom" && reply.headroomUsdMicros !== undefined) {
              extraUsdByBudget.set(gate.status.budgetId, (extraUsdByBudget.get(gate.status.budgetId) ?? 0) + reply.headroomUsdMicros);
            }
            input.broadcast({
              type: "budget_exceeded",
              payload: {
                runId: input.runId,
                sessionId: input.sessionId,
                budget: gate.status,
                outcome: "overridden",
              },
            });
          }
        }
        if (gate.kind === "hard_stop") {
          input.broadcast({
            type: "budget_exceeded",
            payload: {
              runId: input.runId,
              sessionId: input.sessionId,
              budget: gate.status,
              outcome: "stopped",
            },
          });
          input.onHardStop?.();
        }
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
      const described = describeVendorFailure(
        { providerId: session.providerId, label: adapter.label, baseUrl: provider?.baseUrl ?? null },
        error instanceof Error ? error.message : "run failed",
      );
      runError = described.message;
      const failed: AgentEvent = {
        kind: "error",
        message: described.message,
        fatal: true,
        remedy: described.remedy,
      };
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
    try {
      finalizeRunLedger(input.db, latest, input.runId, observedText, {
        estimateWhenSilent: runStatus !== "error" || producedOutput,
      });
    } catch (error) {
      // The ledger refused the row rather than storing an impossible pair. Fail
      // the run loudly instead of losing the rejection in cleanup.
      if (!(error instanceof LedgerIntegrityError)) {
        throw error;
      }
      runStatus = "error";
      runError = error.message;
      appendAudit(purserDir(), {
        ts: new Date().toISOString(),
        type: "ledger_rejected",
        sessionId: input.sessionId,
        runId: input.runId,
        detail: error.message,
      });
    }
    input.onSpendUpdate?.(buildSpendUpdate(input.db, latest, input.runId, startedAt, extraUsdByBudget), true);
    finishRun(input.db, input.runId, runStatus === "ok" ? "ok" : runStatus, runError);
    appendAudit(purserDir(), {
      ts: new Date().toISOString(),
      type: "run_finished",
      sessionId: input.sessionId,
      runId: input.runId,
      outcome: runStatus,
      detail: runError ?? undefined,
    });
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
