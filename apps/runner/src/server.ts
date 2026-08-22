import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import {
  deleteSession as dbDeleteSession,
  deleteWorkspace as dbDeleteWorkspace,
  getProviderConfig,
  getSession,
  getWorkspace,
  insertSession,
  insertWorkspace,
  loadState,
  seedDefaults,
  updateSession,
  upsertProviderConfig,
  upsertVoiceProfile,
  type AppDatabase,
} from "@agentdeck/db";
import {
  parseClientMessage,
  PROTOCOL_VERSION,
  type ClientMessage,
  type ServerMessage,
} from "@agentdeck/protocol";
import type { RunnerConfig } from "./config.ts";
import { detectGitRemote } from "./git.ts";
import {
  assertAllowed,
  assertDirectory,
  PathError,
  resolveInsideWorkspace,
  SKIP_DIR_NAMES,
} from "./paths.ts";
import { getAdapter } from "./registry.ts";
import { executeRun, prepareRun } from "./session-run.ts";
import { createSessionWorktree, keepPath, removeSessionWorktree, revertPath } from "./worktree.ts";
import { getSecret, setSecret, takeApiKeyFromSettings } from "./secrets.ts";
import { connectRelay, type RelayHandle } from "./relay.ts";
import { VoiceSession, toBase64Pcm } from "./voice-session.ts";
import { describeRunning, lastAssistantText, parseLocalCommand } from "./voice-commands.ts";

const CLIENT_VERSION = "0.1.0";
const MAX_FILE_BYTES = 512 * 1024;

export type Client = {
  ws: WebSocket;
  authed: boolean;
  viaRelay?: boolean;
};

export type AppContext = {
  config: RunnerConfig;
  db: AppDatabase;
  clients: Set<Client>;
  activeRuns: Map<string, AbortController>;
  pendingPermissions: Map<string, (allow: boolean) => void>;
  relay: RelayHandle | null;
  voice: VoiceSession | null;
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
  if (client.ws.readyState === WebSocket.OPEN) {
    client.ws.send(JSON.stringify(message));
  }
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

function latestSession(ctx: AppContext) {
  const sessions = loadState(ctx.db).sessions;
  return sessions[sessions.length - 1];
}

function startRun(ctx: AppContext, sessionId: string, prompt: string, replyId: string): void {
  const run = prepareRun(ctx.db, sessionId, prompt);
  const controller = new AbortController();
  ctx.activeRuns.set(run.id, controller);
  broadcast(ctx, { id: replyId, type: "run_started", payload: { runId: run.id, sessionId: run.sessionId } });
  void executeRun({
    db: ctx.db,
    sessionId: run.sessionId,
    runId: run.id,
    prompt,
    signal: controller.signal,
    broadcast: (payload) => broadcast(ctx, payload),
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
        modelId: session?.modelId ?? null,
        permissionMode: "ask",
      });
      broadcast(ctx, { type: "state", payload: loadState(ctx.db) });
    }
    return;
  }
  if (command.kind === "switch_provider" && session) {
    updateSession(ctx.db, session.id, { providerId: command.providerId });
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
      const tokenOk =
        message.payload.token === ctx.config.token ||
        (ctx.relay !== null && message.payload.token === ctx.relay.code);
      if (!tokenOk) {
        throw new HandlerError("unauthorized", "invalid token");
      }
      if (message.payload.protocolVersion !== PROTOCOL_VERSION) {
        throw new HandlerError("protocol", `unsupported protocol version ${message.payload.protocolVersion}`);
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
        modelId: message.payload.modelId ?? null,
        permissionMode: message.payload.permissionMode,
      });
      const worktreePath = createSessionWorktree(workspace.absPath, session.id);
      const withTree =
        worktreePath === null ? session : (updateSession(ctx.db, session.id, { worktreePath }) ?? session);
      send(client, { id: message.id, type: "session_created", payload: withTree });
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
      const session = updateSession(ctx.db, message.payload.sessionId, {
        providerId: message.payload.providerId,
        modelId: message.payload.modelId,
        permissionMode: message.payload.permissionMode,
      });
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
      send(client, { id: message.id, type: "state", payload: loadState(ctx.db) });
      return;
    }
    case "permission_response": {
      const pending = ctx.pendingPermissions.get(message.payload.requestId);
      if (pending !== undefined) {
        pending(message.payload.allow);
        ctx.pendingPermissions.delete(message.payload.requestId);
      }
      send(client, { id: message.id, type: "state", payload: loadState(ctx.db) });
      return;
    }
    case "list_models": {
      const adapter = getAdapter(message.payload.providerId);
      if (adapter === undefined) {
        throw new HandlerError("provider", `provider ${message.payload.providerId} is not available yet`);
      }
      const models = await adapter.listModels(adapterConfig(ctx, adapter.id));
      send(client, { id: message.id, type: "models", payload: { providerId: adapter.id, models } });
      return;
    }
    case "check_provider_health": {
      const adapter = getAdapter(message.payload.providerId);
      if (adapter === undefined) {
        send(client, {
          id: message.id,
          type: "provider_health",
          payload: {
            providerId: message.payload.providerId,
            ok: false,
            detail: "provider is not available yet",
          },
        });
        return;
      }
      const health = await adapter.checkHealth(adapterConfig(ctx, adapter.id));
      send(client, {
        id: message.id,
        type: "provider_health",
        payload: { providerId: adapter.id, ok: health.ok, detail: health.detail },
      });
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
      const result = message.payload.approve
        ? keepPath(cwd, message.payload.path)
        : revertPath(cwd, message.payload.path);
      if (!result.ok) {
        throw new HandlerError("git", result.detail);
      }
      send(client, { id: message.id, type: "state", payload: loadState(ctx.db) });
      return;
    }
    case "upsert_provider_config": {
      const stripped = takeApiKeyFromSettings(message.payload.settings);
      if (stripped.apiKey !== null) {
        setSecret(message.payload.providerId, stripped.apiKey);
      }
      const config = upsertProviderConfig(ctx.db, {
        id: message.payload.id,
        providerId: message.payload.providerId,
        label: message.payload.label,
        baseUrl: message.payload.baseUrl,
        authMode: message.payload.authMode,
        settings: stripped.settings,
      });
      send(client, { id: message.id, type: "state", payload: loadState(ctx.db) });
      void config;
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
  res.end(JSON.stringify({ ok: true, clientVersion: CLIENT_VERSION }));
}

export function startServer(ctx: AppContext): Promise<{ port: number; close: () => Promise<void> }> {
  const httpServer = createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      health(req, res);
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "not found" }));
  });

  const wss = new WebSocketServer({ server: httpServer });
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
    httpServer.on("error", reject);
    httpServer.listen(ctx.config.port, "127.0.0.1", () => {
      const address = httpServer.address();
      const port = typeof address === "object" && address !== null ? address.port : ctx.config.port;
      resolve({
        port,
        close: () =>
          new Promise((closeResolve) => {
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
