import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import {
  deleteSession as dbDeleteSession,
  deleteWorkspace as dbDeleteWorkspace,
  getProviderConfig,
  getSession,
  getWorkspace,
  insertSession,
  insertWorkspace,
  listFolderWatches,
  expandHome,
  saveFolderWatches,
  seedDefaults,
  updateSession,
  updateWorkspace,
  upsertProviderConfig,
  upsertVoiceProfile,
  upsertBudget,
  deleteBudget as dbDeleteBudget,
  type AppDatabase,
} from "@purser-sh/db";
import {
  describeIncoherentPair,
  parseClientMessage,
  PROTOCOL_VERSION,
  resolveModelId,
  type ClientMessage,
  type ServerMessage,
  type Session,
  type BudgetDecision,
  type BudgetStatus,
} from "@purser-sh/protocol";
import type { RunnerConfig } from "./config.ts";
import { purserDir, resolvedHosts, resolvedOrigins } from "./config.ts";
import { detectGitRemote, setOriginRemote } from "./git.ts";
import {
  assertAllowed,
  assertDirectory,
  PathError,
  resolveInsideWorkspace,
  SKIP_DIR_NAMES,
} from "./paths.ts";
import { getAdapter } from "./registry.ts";
import { forgetProviderReadiness, providerReadiness, unavailableProvider } from "./readiness.ts";
import { formatListenError } from "./listen-error.ts";
import { executeRun, prepareRun } from "./session-run.ts";
import { createSessionWorktree, applyApprovedPath, keepPath, removeSessionWorktree, revertPath, worktreeSessionNotice } from "./worktree.ts";
import { applyStaged, discardStaged, hasStaged } from "./staging.ts";
import { getSecret, setSecret, takeApiKeyFromSettings } from "./secrets.ts";
import { connectRelay, type RelayHandle } from "./relay.ts";
import { VoiceSession, toBase64Pcm } from "./voice-session.ts";
import { describeRunning, lastAssistantText, parseLocalCommand } from "./voice-commands.ts";
import { FolderWatchService } from "./folder-watch.ts";
import { coachPrompt } from "@purser-sh/prompt-coach";
import { checkWebsocketUpgrade, pairingCodesEqual, parseRemote, sealJson, timingSafeEqualString } from "@purser-sh/integrations";
import { hasEmbeddedUi, serveEmbeddedUi, writeConfigRouteGone } from "./ui-serve.ts";
import {
  consumeBypassRun,
  enableBypass,
  expireBypassIfConsumed,
  refreshBypass,
} from "./bypass.ts";
import {
  buildSpendReport,
  decorateState,
  estimateRunSpend,
  preRunGate,
  withLedgerLock,
} from "./budget.ts";
import { appendAudit } from "./audit.ts";

function loadState(db: AppDatabase) {
  return decorateState(db);
}

function writeAudit(ctx: AppContext, event: Parameters<typeof appendAudit>[1]): void {
  appendAudit(purserDir(), event, { redactPaths: ctx.config.redactPaths === true });
}

const MAX_FILE_BYTES = 512 * 1024;

export type Client = {
  ws: WebSocket;
  authed: boolean;
  viaRelay?: boolean;
  relaySealKey?: CryptoKey;
};

export type AppContext = {
  config: RunnerConfig;
  db: AppDatabase;
  clients: Set<Client>;
  activeRuns: Map<string, AbortController>;
  pendingPermissions: Map<string, (allow: boolean) => void>;
  pendingBudgets: Map<string, (reply: { decision: BudgetDecision; headroomUsdMicros?: number }) => void>;
  relay: RelayHandle | null;
  voice: VoiceSession | null;
  folderWatch: FolderWatchService | null;
  uiDir?: string;
};

class HandlerError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "HandlerError";
    this.code = code;
  }
}

function newFrameId(): string {
  return crypto.randomUUID();
}

function send(client: Client, message: ServerMessage): void {
  if (client.ws.readyState !== WebSocket.OPEN) {
    return;
  }
  if (client.relaySealKey !== undefined) {
    void sealJson(client.relaySealKey, message).then((sealed) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(sealed));
      }
    });
    return;
  }
  client.ws.send(JSON.stringify(message));
}

function errorMessage(id: string, message: string, code?: string): ServerMessage {
  return {
    id,
    type: "error",
    payload: code === undefined ? { message } : { message, code },
  };
}

export function broadcast(ctx: AppContext, message: Omit<ServerMessage, "id"> & { id?: string }): void {
  const frame = { ...message, id: message.id ?? newFrameId() } as ServerMessage;
  for (const client of ctx.clients) {
    if (client.authed || client.viaRelay) {
      send(client, frame);
    }
  }
}

export async function handleIncoming(ctx: AppContext, client: Client, raw: unknown): Promise<void> {
  await handleMessage(ctx, client, raw);
}

async function handleMessage(ctx: AppContext, client: Client, raw: unknown): Promise<void> {
  let message: ClientMessage;
  try {
    message = parseClientMessage(raw);
  } catch (error) {
    send(client, errorMessage(newFrameId(), error instanceof Error ? error.message : "invalid frame", "bad_request"));
    return;
  }

  try {
    if (!client.authed && message.type !== "hello") {
      throw new HandlerError("unauthorized", "send hello first");
    }
    await dispatch(ctx, client, message);
  } catch (error) {
    if (error instanceof PathError || error instanceof HandlerError) {
      send(client, errorMessage(message.id, error.message, error.code));
      return;
    }
    send(
      client,
      errorMessage(message.id, error instanceof Error ? error.message : "internal error", "internal"),
    );
  }
}

function adapterConfig(ctx: AppContext, providerId: string) {
  const provider = getProviderConfig(ctx.db, providerId);
  return {
    baseUrl: provider?.baseUrl ?? null,
    apiKey: getSecret(providerId),
    settings: provider?.settings ?? {},
  };
}

function resolveUserFsPath(path: string): string {
  const expanded = expandHome(path);
  if (!expanded.startsWith("/")) {
    throw new HandlerError("path_invalid", "path must be absolute");
  }
  return resolve(expanded);
}

function latestSession(ctx: AppContext) {
  const sessions = loadState(ctx.db).sessions;
  return sessions[sessions.length - 1];
}

function startRun(ctx: AppContext, sessionId: string, prompt: string, replyId: string): void {
  const existing = getSession(ctx.db, sessionId);
  if (existing === undefined) {
    throw new HandlerError("not_found", "session not found");
  }
  void startRunAfterGate(ctx, existing, prompt, replyId);
}

function askBudgetDecision(
  ctx: AppContext,
  controller: AbortController,
  request: { requestId: string; runId: string | null; sessionId: string; status: BudgetStatus },
): Promise<{ decision: BudgetDecision; headroomUsdMicros?: number }> {
  return new Promise((resolve) => {
    ctx.pendingBudgets.set(request.requestId, resolve);
    broadcast(ctx, {
      type: "budget_request",
      payload: {
        requestId: request.requestId,
        runId: request.runId,
        sessionId: request.sessionId,
        budget: request.status,
      },
    });
    controller.signal.addEventListener("abort", () => {
      ctx.pendingBudgets.delete(request.requestId);
      resolve({ decision: "deny" });
    });
  });
}

async function startRunAfterGate(
  ctx: AppContext,
  existing: Session,
  prompt: string,
  replyId: string,
): Promise<void> {
  const refreshed = refreshBypass(ctx.db, existing);
  const adapter = getAdapter(refreshed.providerId);
  const readiness =
    adapter === undefined
      ? unavailableProvider(refreshed.providerId)
      : await providerReadiness(adapter, adapterConfig(ctx, adapter.id));
  if (!readiness.ok) {
    // The prompt is not stored and no run is created: a provider we know will
    // fail never gets one.
    broadcast(ctx, { type: "provider_health", payload: readiness });
    broadcast(ctx, {
      id: replyId,
      type: "error",
      payload: {
        message: readiness.detail,
        code: `provider_${readiness.state}`,
        remedy: readiness.remedy,
      },
    });
    return;
  }
  const extraUsdByBudget = new Map<string, number>();
  const preController = new AbortController();
  const gate = withLedgerLock(ctx.db, () => preRunGate(ctx.db, refreshed));
  if (gate.kind === "hard_stop") {
    broadcast(ctx, {
      id: replyId,
      type: "budget_exceeded",
      payload: { runId: null, sessionId: refreshed.id, budget: gate.status, outcome: "stopped" },
    });
    broadcast(ctx, {
      id: replyId,
      type: "error",
      payload: { message: "budget hard stop: this run was not started", code: "budget" },
    });
    return;
  }
  if (gate.kind === "ask") {
    const requestId = crypto.randomUUID();
    const reply = await askBudgetDecision(ctx, preController, {
      requestId,
      runId: null,
      sessionId: refreshed.id,
      status: gate.status,
    });
    if (reply.decision === "deny") {
      broadcast(ctx, {
        id: replyId,
        type: "budget_exceeded",
        payload: { runId: null, sessionId: refreshed.id, budget: gate.status, outcome: "stopped" },
      });
      return;
    }
    if (reply.decision === "allow_with_headroom" && reply.headroomUsdMicros !== undefined) {
      extraUsdByBudget.set(gate.status.budgetId, reply.headroomUsdMicros);
    }
    appendAudit(purserDir(), {
      ts: new Date().toISOString(),
      type: "budget_override",
      sessionId: refreshed.id,
      action: reply.decision,
      detail: reply.headroomUsdMicros !== undefined ? String(reply.headroomUsdMicros) : undefined,
    });
    broadcast(ctx, {
      type: "budget_exceeded",
      payload: { runId: null, sessionId: refreshed.id, budget: gate.status, outcome: "overridden" },
    });
  }
  if (gate.kind === "warn") {
    broadcast(ctx, {
      type: "budget_exceeded",
      payload: { runId: null, sessionId: refreshed.id, budget: gate.status, outcome: "warned" },
    });
  }
  consumeBypassRun(ctx.db, refreshed);
  const run = prepareRun(ctx.db, refreshed.id, prompt);
  broadcast(ctx, { type: "state", payload: loadState(ctx.db) });
  const controller = new AbortController();
  ctx.activeRuns.set(run.id, controller);
  broadcast(ctx, { id: replyId, type: "run_started", payload: { runId: run.id, sessionId: run.sessionId } });
  appendAudit(purserDir(), {
    ts: new Date().toISOString(),
    type: "run_started",
    sessionId: run.sessionId,
    runId: run.id,
    workspaceId: refreshed.workspaceId,
  }, { redactPaths: ctx.config.redactPaths === true });
  void executeRun({
    db: ctx.db,
    sessionId: run.sessionId,
    runId: run.id,
    prompt,
    signal: controller.signal,
    extraUsdByBudget,
    onHardStop: () => controller.abort(),
    broadcast: (payload) => broadcast(ctx, payload),
    onSpendUpdate: (payload, terminal) => {
      broadcast(ctx, { type: "spend_update", payload });
      if (terminal) {
        // Today / This month live in state.spendSummary; refresh so they cannot
        // disagree with This run after the ledger write.
        broadcast(ctx, { type: "state", payload: loadState(ctx.db) });
      }
    },
    askBudget: (request) => askBudgetDecision(ctx, controller, { ...request, runId: run.id, sessionId: run.sessionId }),
    askPermission: (request) =>
      new Promise((resolve) => {
        ctx.pendingPermissions.set(request.requestId, resolve);
        broadcast(ctx, {
          type: "permission_request",
          payload: {
            requestId: request.requestId,
            sessionId: run.sessionId,
            runId: run.id,
            action: request.action,
            detail: request.detail,
          },
        });
        controller.signal.addEventListener("abort", () => {
          ctx.pendingPermissions.delete(request.requestId);
          resolve(false);
        });
      }),
  }).finally(() => {
    ctx.activeRuns.delete(run.id);
    expireBypassIfConsumed(ctx.db, run.sessionId);
  });
}

async function speakText(ctx: AppContext, text: string): Promise<void> {
  if (ctx.voice === null || text.length === 0) {
    return;
  }
  let sent = false;
  for await (const chunk of ctx.voice.speak(text)) {
    sent = true;
    broadcast(ctx, {
      type: "tts_audio_chunk",
      payload: { pcm16Base64: toBase64Pcm(chunk), sampleRate: 16000 },
    });
  }
  if (!sent) {
    broadcast(ctx, { type: "transcript_final", payload: { text: `SPEAK:${text}` } });
  }
}

async function handleUtterance(ctx: AppContext, text: string): Promise<void> {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return;
  }
  const profile = ctx.voice?.profile;
  if (ctx.voice?.mode === "wake_word") {
    const wake = profile?.wakeWord?.toLowerCase();
    if (wake === undefined || wake.length === 0 || !trimmed.toLowerCase().startsWith(wake)) {
      return;
    }
  }
  broadcast(ctx, { type: "transcript_final", payload: { text: trimmed } });
  const command = parseLocalCommand(trimmed.replace(new RegExp(`^${profile?.wakeWord ?? ""}\\s*`, "i"), ""));
  const session = latestSession(ctx);
  if (command.kind === "stop" || command.kind === "cancel") {
    for (const controller of ctx.activeRuns.values()) {
      controller.abort();
    }
    ctx.voice?.stopTts();
    return;
  }
  if (command.kind === "repeat") {
    if (session) await speakText(ctx, lastAssistantText(ctx.db, session.id));
    return;
  }
  if (command.kind === "whats_running") {
    await speakText(ctx, describeRunning(ctx.db));
    return;
  }
  if (command.kind === "read_last") {
    if (session) await speakText(ctx, lastAssistantText(ctx.db, session.id));
    return;
  }
  if (command.kind === "approve" || command.kind === "reject") {
    const first = ctx.pendingPermissions.keys().next().value;
    if (typeof first === "string") {
      ctx.pendingPermissions.get(first)?.(command.kind === "approve");
      ctx.pendingPermissions.delete(first);
    }
    return;
  }
  if (command.kind === "new_session") {
    const workspace = loadState(ctx.db).workspaces[0];
    if (workspace) {
      insertSession(ctx.db, {
        workspaceId: workspace.id,
        title: "Voice session",
        providerId: session?.providerId ?? "echo",
        modelId: resolveModelId(session?.providerId ?? "echo", session?.modelId ?? null),
        permissionMode: "ask",
      });
      broadcast(ctx, { type: "state", payload: loadState(ctx.db) });
    }
    return;
  }
  if (command.kind === "switch_provider" && session) {
    updateSession(ctx.db, session.id, {
      providerId: command.providerId,
      modelId: resolveModelId(command.providerId, null),
    });
    broadcast(ctx, { type: "state", payload: loadState(ctx.db) });
    return;
  }
  if (command.kind === "open_workspace") {
    const workspace = loadState(ctx.db).workspaces[0];
    await speakText(ctx, workspace?.absPath ?? "No workspace open.");
    return;
  }
  if (command.kind === "volume") {
    await speakText(ctx, command.delta > 0 ? "Louder." : "Quieter.");
    return;
  }
  if (command.kind === "chat" && session) {
    startRun(ctx, session.id, command.text, newFrameId());
  }
}

async function dispatch(ctx: AppContext, client: Client, message: ClientMessage): Promise<void> {
  switch (message.type) {
    case "hello": {
      const tokenOk = client.viaRelay
        ? ctx.relay !== null && pairingCodesEqual(message.payload.token, ctx.relay.code)
        : timingSafeEqualString(message.payload.token, ctx.config.token);
      if (!tokenOk) {
        throw new HandlerError("unauthorized", "invalid token");
      }
      if (message.payload.protocolVersion !== PROTOCOL_VERSION) {
        throw new HandlerError(
          "protocol_version",
          `runner speaks protocol ${PROTOCOL_VERSION}; this client sent ${message.payload.protocolVersion}`,
        );
      }
      client.authed = true;
      await seedDefaults(ctx.db);
      send(client, { id: message.id, type: "state", payload: loadState(ctx.db) });
      return;
    }
    case "get_state": {
      send(client, { id: message.id, type: "state", payload: loadState(ctx.db) });
      return;
    }
    case "create_workspace": {
      const allowed = assertAllowed(message.payload.absPath, ctx.config.allowedRoots);
      const dir = assertDirectory(allowed);
      const workspace = insertWorkspace(ctx.db, {
        name: message.payload.name,
        absPath: dir,
        gitRemote: detectGitRemote(dir),
      });
      send(client, { id: message.id, type: "workspace_created", payload: workspace });
      return;
    }
    case "delete_workspace": {
      if (!dbDeleteWorkspace(ctx.db, message.payload.workspaceId)) {
        throw new HandlerError("not_found", "workspace not found");
      }
      send(client, { id: message.id, type: "state", payload: loadState(ctx.db) });
      return;
    }
    case "browse_fs": {
      const allowed = assertAllowed(message.payload.path, ctx.config.allowedRoots);
      const dir = assertDirectory(allowed);
      send(client, {
        id: message.id,
        type: "fs_listing",
        payload: { path: dir, entries: listDirectory(dir, ctx.config.allowedRoots) },
      });
      return;
    }
    case "read_file": {
      const workspace = getWorkspace(ctx.db, message.payload.workspaceId);
      if (workspace === undefined) {
        throw new HandlerError("not_found", "workspace not found");
      }
      assertAllowed(workspace.absPath, ctx.config.allowedRoots);
      const filePath = resolveInsideWorkspace(workspace.absPath, message.payload.path);
      const buffer = readFileSync(filePath);
      const truncated = buffer.byteLength > MAX_FILE_BYTES;
      const slice = truncated ? buffer.subarray(0, MAX_FILE_BYTES) : buffer;
      const binary = slice.includes(0);
      send(client, {
        id: message.id,
        type: "file_content",
        payload: {
          workspaceId: workspace.id,
          path: message.payload.path,
          content: binary ? slice.toString("base64") : slice.toString("utf8"),
          encoding: binary ? "base64" : "utf8",
          truncated,
        },
      });
      return;
    }
    case "create_session": {
      const workspace = getWorkspace(ctx.db, message.payload.workspaceId);
      if (workspace === undefined) {
        throw new HandlerError("not_found", "workspace not found");
      }
      if (getAdapter(message.payload.providerId) === undefined) {
        throw new HandlerError("provider", `provider ${message.payload.providerId} is not available yet`);
      }
      const session = insertSession(ctx.db, {
        workspaceId: workspace.id,
        title: message.payload.title ?? "New session",
        providerId: message.payload.providerId,
        modelId: resolveModelId(message.payload.providerId, message.payload.modelId),
        permissionMode: message.payload.permissionMode === "bypass" ? "ask" : message.payload.permissionMode,
      });
      const withBypass =
        message.payload.permissionMode === "bypass"
          ? (enableBypass(ctx.db, session.id, ctx.config) ?? session)
          : session;
      const worktreePath = createSessionWorktree(workspace.absPath, session.id);
      const withTree =
        worktreePath === null ? withBypass : (updateSession(ctx.db, session.id, { worktreePath }) ?? withBypass);
      const notice = worktreePath === null ? undefined : worktreeSessionNotice(workspace.absPath) ?? undefined;
      send(client, {
        id: message.id,
        type: "session_created",
        payload: { session: withTree, notice },
      });
      return;
    }
    case "rename_session": {
      const session = updateSession(ctx.db, message.payload.sessionId, { title: message.payload.title });
      if (session === undefined) {
        throw new HandlerError("not_found", "session not found");
      }
      send(client, { id: message.id, type: "state", payload: loadState(ctx.db) });
      return;
    }
    case "delete_session": {
      const existing = getSession(ctx.db, message.payload.sessionId);
      if (existing === undefined || !dbDeleteSession(ctx.db, message.payload.sessionId)) {
        throw new HandlerError("not_found", "session not found");
      }
      removeSessionWorktree(existing.worktreePath);
      send(client, { id: message.id, type: "state", payload: loadState(ctx.db) });
      return;
    }
    case "set_session_provider": {
      if (getAdapter(message.payload.providerId) === undefined) {
        throw new HandlerError("provider", `provider ${message.payload.providerId} is not available yet`);
      }
      const before = getSession(ctx.db, message.payload.sessionId);
      if (before === undefined) {
        throw new HandlerError("not_found", "session not found");
      }
      // A model id is only ever kept while the provider stays the same.
      const carried = message.payload.providerId === before.providerId ? before.modelId : null;
      const modelId = resolveModelId(message.payload.providerId, message.payload.modelId ?? carried);
      if (message.payload.modelId !== undefined && modelId !== message.payload.modelId) {
        throw new HandlerError(
          "model",
          `${describeIncoherentPair(message.payload.providerId, message.payload.modelId)} Pick one of its models.`,
        );
      }
      let session: Session | undefined;
      if (message.payload.permissionMode === "bypass") {
        session = enableBypass(ctx.db, message.payload.sessionId, ctx.config);
        if (session !== undefined) {
          session =
            updateSession(ctx.db, message.payload.sessionId, {
              providerId: message.payload.providerId,
              modelId,
            }) ?? session;
        }
      } else {
        session = updateSession(ctx.db, message.payload.sessionId, {
          providerId: message.payload.providerId,
          modelId,
          permissionMode: message.payload.permissionMode,
          bypassExpiresAt: message.payload.permissionMode !== undefined ? null : undefined,
          bypassRunsRemaining: message.payload.permissionMode !== undefined ? null : undefined,
        });
      }
      if (session === undefined) {
        throw new HandlerError("not_found", "session not found");
      }
      send(client, { id: message.id, type: "state", payload: loadState(ctx.db) });
      return;
    }
    case "send_message": {
      startRun(ctx, message.payload.sessionId, message.payload.text, message.id);
      return;
    }
    case "cancel_run": {
      const controller = ctx.activeRuns.get(message.payload.runId);
      if (controller === undefined) {
        throw new HandlerError("not_found", "run is not active");
      }
      controller.abort();
      writeAudit(ctx, {
        ts: new Date().toISOString(),
        type: "run_cancelled",
        runId: message.payload.runId,
      });
      send(client, { id: message.id, type: "state", payload: loadState(ctx.db) });
      return;
    }
    case "permission_response": {
      const pending = ctx.pendingPermissions.get(message.payload.requestId);
      if (pending !== undefined) {
        pending(message.payload.allow);
        ctx.pendingPermissions.delete(message.payload.requestId);
      }
      writeAudit(ctx, {
        ts: new Date().toISOString(),
        type: "permission_response",
        action: message.payload.allow ? "allow" : "deny",
        detail: message.payload.requestId,
      });
      send(client, { id: message.id, type: "state", payload: loadState(ctx.db) });
      return;
    }
    case "list_models": {
      const adapter = getAdapter(message.payload.providerId);
      if (adapter === undefined) {
        throw new HandlerError("provider", `provider ${message.payload.providerId} is not available yet`);
      }
      const models = await adapter.listModels(adapterConfig(ctx, adapter.id));
      send(client, { id: message.id, type: "models", payload: { providerId: adapter.id, costModel: adapter.costModel, models } });
      return;
    }
    case "check_provider_health": {
      const adapter = getAdapter(message.payload.providerId);
      if (adapter === undefined) {
        send(client, {
          id: message.id,
          type: "provider_health",
          payload: unavailableProvider(message.payload.providerId),
        });
        return;
      }
      const payload = await providerReadiness(adapter, adapterConfig(ctx, adapter.id), { fresh: true });
      send(client, { id: message.id, type: "provider_health", payload });
      return;
    }
    case "diff_response": {
      const session = getSession(ctx.db, message.payload.sessionId);
      if (session === undefined) {
        throw new HandlerError("not_found", "session not found");
      }
      const workspace = getWorkspace(ctx.db, session.workspaceId);
      if (workspace === undefined) {
        throw new HandlerError("not_found", "workspace not found");
      }
      const cwd = session.worktreePath ?? workspace.absPath;
      const result = hasStaged(session.id, message.payload.path)
        ? message.payload.approve
          ? applyStaged(session.id, message.payload.path, workspace.absPath, session.worktreePath)
          : discardStaged(session.id, message.payload.path)
        : message.payload.approve
          ? session.worktreePath !== null
            ? applyApprovedPath(session.worktreePath, workspace.absPath, message.payload.path)
            : keepPath(cwd, message.payload.path)
          : revertPath(cwd, message.payload.path);
      if (!result.ok) {
        throw new HandlerError("git", result.detail);
      }
      writeAudit(ctx, {
        ts: new Date().toISOString(),
        type: "diff_response",
        sessionId: session.id,
        workspaceId: session.workspaceId,
        path: message.payload.path,
        action: message.payload.approve ? "approve" : "reject",
      });
      send(client, { id: message.id, type: "state", payload: loadState(ctx.db) });
      return;
    }
    case "upsert_provider_config": {
      const stripped = takeApiKeyFromSettings(message.payload.settings);
      if (stripped.apiKey !== null) {
        setSecret(message.payload.providerId, stripped.apiKey);
        writeAudit(ctx, {
          ts: new Date().toISOString(),
          type: "secret_write",
          providerId: message.payload.providerId,
        });
      }
      upsertProviderConfig(ctx.db, {
        id: message.payload.id,
        providerId: message.payload.providerId,
        label: message.payload.label,
        baseUrl: message.payload.baseUrl,
        authMode: message.payload.authMode,
        settings: stripped.settings,
      });
      writeAudit(ctx, {
        ts: new Date().toISOString(),
        type: "provider_config",
        providerId: message.payload.providerId,
      });
      // A new key or base URL can make an unready provider ready.
      forgetProviderReadiness(message.payload.providerId);
      send(client, { id: message.id, type: "state", payload: loadState(ctx.db) });
      return;
    }
    case "upsert_voice_profile": {
      upsertVoiceProfile(ctx.db, message.payload);
      send(client, { id: message.id, type: "state", payload: loadState(ctx.db) });
      return;
    }
    case "pair_relay": {
      ctx.relay?.ws.close();
      let relayClient: Client | undefined;
      const handle = connectRelay({
        url: message.payload.relayUrl,
        code: message.payload.code,
        onOpen: (next) => {
          ctx.relay = next;
          relayClient = { ws: next.ws, authed: false, viaRelay: true };
          ctx.clients.add(relayClient);
          broadcast(ctx, {
            type: "relay_status",
            payload: { connected: true, relayUrl: next.url, code: next.code },
          });
          writeAudit(ctx, {
            ts: new Date().toISOString(),
            type: "relay_pair",
            detail: next.url,
          });
        },
        onClose: (next) => {
          if (relayClient !== undefined) {
            ctx.clients.delete(relayClient);
            relayClient = undefined;
          }
          if (ctx.relay?.ws === next.ws) {
            ctx.relay = { ...next, connected: false };
          }
          broadcast(ctx, {
            type: "relay_status",
            payload: { connected: false, relayUrl: next.url, code: next.code },
          });
        },
        onFrame: (raw) => {
          if (relayClient === undefined) {
            return;
          }
          void handleIncoming(ctx, relayClient, raw);
        },
        onSealed: (next) => {
          if (relayClient !== undefined) {
            relayClient.relaySealKey = next.sealKey;
          }
        },
      });
      ctx.relay = handle;
      send(client, {
        id: message.id,
        type: "relay_status",
        payload: { connected: false, relayUrl: handle.url, code: handle.code },
      });
      return;
    }
    case "voice_start": {
      const profiles = loadState(ctx.db).voiceProfiles;
      const profile =
        (message.payload.profileId !== undefined
          ? profiles.find((item) => item.id === message.payload.profileId)
          : undefined) ??
        profiles.find((item) => item.isDefault) ??
        profiles[0];
      ctx.voice = new VoiceSession(message.payload.mode, profile);
      send(client, { id: message.id, type: "state", payload: loadState(ctx.db) });
      return;
    }
    case "voice_audio_chunk": {
      if (ctx.voice === null) {
        throw new HandlerError("voice", "voice is not started");
      }
      const result = ctx.voice.pushBase64(message.payload.pcm16Base64);
      if (result.utterance) {
        const text = await ctx.voice.transcribe(result.utterance);
        if (text.length > 0) {
          await handleUtterance(ctx, text);
        }
      }
      send(client, { id: message.id, type: "transcript_partial", payload: { text: "" } });
      return;
    }
    case "voice_stop": {
      if (ctx.voice !== null) {
        const leftover = ctx.voice.flush();
        const text = leftover.length > 0 ? await ctx.voice.transcribe(leftover) : "";
        if (text.length > 0) {
          await handleUtterance(ctx, text);
        }
      }
      ctx.voice = null;
      send(client, { id: message.id, type: "state", payload: loadState(ctx.db) });
      return;
    }
    case "tts_speak": {
      await speakText(ctx, message.payload.text);
      send(client, { id: message.id, type: "state", payload: loadState(ctx.db) });
      return;
    }
    case "tts_stop": {
      ctx.voice?.stopTts();
      send(client, { id: message.id, type: "state", payload: loadState(ctx.db) });
      return;
    }
    case "estimate_prompt": {
      const session =
        message.payload.sessionId !== undefined ? getSession(ctx.db, message.payload.sessionId) : undefined;
      send(client, {
        id: message.id,
        type: "prompt_estimate",
        payload: coachPrompt(message.payload.text, session?.modelId),
      });
      return;
    }
    case "estimate_run": {
      const session = getSession(ctx.db, message.payload.sessionId);
      if (session === undefined) {
        throw new HandlerError("not_found", "session not found");
      }
      const coach = coachPrompt(message.payload.text, session.modelId);
      const spend = estimateRunSpend(ctx.db, session, message.payload.text);
      send(client, {
        id: message.id,
        type: "run_estimate",
        payload: {
          sessionId: session.id,
          tokens: coach.tokens,
          compactText: coach.compactText,
          compactTokens: coach.compactTokens,
          savedTokens: coach.savedTokens,
          notes: coach.notes,
          costUsdMicros: spend.costUsdMicros,
          costModel: spend.costModel,
          unpriced: spend.unpriced,
          budgets: spend.budgets,
        },
      });
      return;
    }
    case "get_spend": {
      send(client, { id: message.id, type: "spend_report", payload: buildSpendReport(ctx.db, message.payload) });
      return;
    }
    case "set_budget": {
      upsertBudget(ctx.db, {
        id: message.payload.id,
        scope: message.payload.scope,
        scopeId: message.payload.scopeId,
        window: message.payload.window,
        limitUsdMicros: message.payload.limitUsdMicros,
        limitTokens: message.payload.limitTokens,
        action: message.payload.action,
        enabled: message.payload.enabled,
      });
      writeAudit(ctx, {
        ts: new Date().toISOString(),
        type: "budget_set",
        action: message.payload.action,
        detail: `${message.payload.scope}/${message.payload.window}`,
      });
      send(client, { id: message.id, type: "state", payload: loadState(ctx.db) });
      return;
    }
    case "delete_budget": {
      if (!dbDeleteBudget(ctx.db, message.payload.budgetId)) {
        throw new HandlerError("not_found", "budget not found");
      }
      writeAudit(ctx, {
        ts: new Date().toISOString(),
        type: "budget_delete",
        detail: message.payload.budgetId,
      });
      send(client, { id: message.id, type: "state", payload: loadState(ctx.db) });
      return;
    }
    case "budget_response": {
      const pending = ctx.pendingBudgets.get(message.payload.requestId);
      if (pending !== undefined) {
        pending({
          decision: message.payload.decision,
          headroomUsdMicros: message.payload.headroomUsdMicros,
        });
        ctx.pendingBudgets.delete(message.payload.requestId);
      }
      writeAudit(ctx, {
        ts: new Date().toISOString(),
        type: "budget_response",
        action: message.payload.decision,
        detail:
          message.payload.headroomUsdMicros !== undefined ? String(message.payload.headroomUsdMicros) : undefined,
      });
      send(client, { id: message.id, type: "state", payload: loadState(ctx.db) });
      return;
    }
    case "watch_folder": {
      if (ctx.folderWatch === null) {
        throw new HandlerError("internal", "folder watch is not ready");
      }
      if (getWorkspace(ctx.db, message.payload.workspaceId) === undefined) {
        throw new HandlerError("not_found", "workspace not found");
      }
      const watch = {
        workspaceId: message.payload.workspaceId,
        absPath: resolveUserFsPath(message.payload.absPath),
        enabled: true,
      };
      ctx.folderWatch.start(watch);
      const watches = listFolderWatches(ctx.db).filter(
        (item) => !(item.workspaceId === watch.workspaceId && item.absPath === watch.absPath),
      );
      watches.push(watch);
      saveFolderWatches(ctx.db, watches);
      writeAudit(ctx, {
        ts: new Date().toISOString(),
        type: "watch_folder",
        workspaceId: watch.workspaceId,
        path: watch.absPath,
      });
      send(client, { id: message.id, type: "state", payload: loadState(ctx.db) });
      return;
    }
    case "unwatch_folder": {
      if (ctx.folderWatch === null) {
        throw new HandlerError("internal", "folder watch is not ready");
      }
      const absPath = resolveUserFsPath(message.payload.absPath);
      ctx.folderWatch.stop({ workspaceId: message.payload.workspaceId, absPath });
      saveFolderWatches(
        ctx.db,
        listFolderWatches(ctx.db).filter(
          (item) => !(item.workspaceId === message.payload.workspaceId && item.absPath === absPath),
        ),
      );
      writeAudit(ctx, {
        ts: new Date().toISOString(),
        type: "unwatch_folder",
        workspaceId: message.payload.workspaceId,
        path: absPath,
      });
      send(client, { id: message.id, type: "state", payload: loadState(ctx.db) });
      return;
    }
    case "link_repository": {
      const workspace = getWorkspace(ctx.db, message.payload.workspaceId);
      if (workspace === undefined) {
        throw new HandlerError("not_found", "workspace not found");
      }
      const parsed = parseRemote(message.payload.remoteUrl);
      const result = setOriginRemote(workspace.absPath, parsed.remoteUrl);
      if (!result.ok) {
        throw new HandlerError("git", result.detail);
      }
      updateWorkspace(ctx.db, workspace.id, { gitRemote: parsed.remoteUrl });
      writeAudit(ctx, {
        ts: new Date().toISOString(),
        type: "link_repository",
        workspaceId: workspace.id,
        detail: parsed.forge,
      });
      send(client, { id: message.id, type: "state", payload: loadState(ctx.db) });
      return;
    }
    default: {
      const _never: never = message;
      throw new HandlerError("bad_request", `unhandled message ${JSON.stringify(_never)}`);
    }
  }
}

function listDirectory(absPath: string, allowedRoots: readonly string[]) {
  const entries = readdirSync(absPath, { withFileTypes: true });
  const listing: { name: string; path: string; kind: "file" | "dir"; size?: number }[] = [];
  for (const entry of entries) {
    if (SKIP_DIR_NAMES.has(entry.name)) {
      continue;
    }
    const child = join(absPath, entry.name);
    try {
      const real = assertAllowed(child, allowedRoots);
      const stat = statSync(real);
      listing.push({
        name: entry.name,
        path: real,
        kind: stat.isDirectory() ? "dir" : "file",
        size: stat.isFile() ? stat.size : undefined,
      });
    } catch {
      continue;
    }
  }
  listing.sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === "dir" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  return listing;
}

function health(_req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true, protocolVersion: PROTOCOL_VERSION }));
}

export function startServer(ctx: AppContext): Promise<{ port: number; close: () => Promise<void> }> {
  ctx.folderWatch = new FolderWatchService(ctx.db, ctx.config, (event) => {
    broadcast(ctx, { type: "sync_event", payload: event });
  });
  ctx.folderWatch.restore(listFolderWatches(ctx.db));

  const httpServer = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/health") {
      health(req, res);
      return;
    }
    if (url.pathname === "/__purser/config") {
      writeConfigRouteGone(res);
      return;
    }
    if (req.method === "GET" && (ctx.uiDir !== undefined || hasEmbeddedUi())) {
      const address = httpServer.address();
      const port = typeof address === "object" && address !== null ? address.port : ctx.config.port;
      const served = serveEmbeddedUi({
        req,
        res,
        uiDir: ctx.uiDir,
        bootstrap: {
          wsUrl: `ws://127.0.0.1:${port}`,
          token: ctx.config.token,
          allowedRoots: ctx.config.allowedRoots,
        },
        policy: {
          allowedOrigins: resolvedOrigins(ctx.config, port),
          allowedHosts: resolvedHosts(ctx.config, port),
        },
      });
      if (served) {
        return;
      }
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "not found" }));
  });

  const wss = new WebSocketServer({
    server: httpServer,
    verifyClient: (info, callback) => {
      const address = httpServer.address();
      const port = typeof address === "object" && address !== null ? address.port : ctx.config.port;
      const url = new URL(info.req.url ?? "/", "http://127.0.0.1");
      const decision = checkWebsocketUpgrade({
        origin: info.req.headers.origin,
        host: info.req.headers.host,
        authorization: info.req.headers.authorization,
        tokenQuery: url.searchParams.get("token") ?? undefined,
        runnerToken: ctx.config.token,
        policy: {
          allowedOrigins: resolvedOrigins(ctx.config, port),
          allowedHosts: resolvedHosts(ctx.config, port),
        },
      });
      if (!decision.ok) {
        callback(false, decision.status, decision.reason);
        return;
      }
      if (decision.kind === "token-client") {
        console.info("purser: websocket upgrade from token-client (no Origin)");
      }
      callback(true);
    },
  });
  wss.on("connection", (ws) => {
    const client: Client = { ws, authed: false };
    ctx.clients.add(client);
    ws.on("message", (data) => {
      const text = typeof data === "string" ? data : data.toString();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        send(client, errorMessage(newFrameId(), "frame must be JSON", "bad_request"));
        return;
      }
      void handleMessage(ctx, client, parsed);
    });
    ws.on("close", () => {
      ctx.clients.delete(client);
    });
  });

  return new Promise((resolve, reject) => {
    httpServer.on("error", (error) => {
      reject(new Error(formatListenError(error, ctx.config.port)));
    });
    httpServer.listen(ctx.config.port, "127.0.0.1", () => {
      const address = httpServer.address();
      const port = typeof address === "object" && address !== null ? address.port : ctx.config.port;
      resolve({
        port,
        close: () =>
          new Promise((closeResolve) => {
            ctx.folderWatch?.close();
            for (const client of ctx.clients) {
              client.ws.terminate();
            }
            ctx.clients.clear();
            if (typeof httpServer.closeAllConnections === "function") {
              httpServer.closeAllConnections();
            }
            httpServer.close(() => closeResolve());
            setTimeout(closeResolve, 250);
          }),
      });
    });
  });
}
