import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import {
  deleteSession as dbDeleteSession,
  deleteWorkspace as dbDeleteWorkspace,
  getWorkspace,
  insertSession,
  insertWorkspace,
  loadState,
  seedDefaults,
  updateSession,
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

const CLIENT_VERSION = "0.1.0";
const MAX_FILE_BYTES = 512 * 1024;

export type Client = {
  ws: WebSocket;
  authed: boolean;
};

export type AppContext = {
  config: RunnerConfig;
  db: AppDatabase;
  clients: Set<Client>;
  activeRuns: Map<string, AbortController>;
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
    if (client.authed) {
      send(client, frame);
    }
  }
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

async function dispatch(ctx: AppContext, client: Client, message: ClientMessage): Promise<void> {
  switch (message.type) {
    case "hello": {
      if (message.payload.token !== ctx.config.token) {
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
        modelId: message.payload.modelId ?? "echo-v1",
        permissionMode: message.payload.permissionMode,
      });
      send(client, { id: message.id, type: "session_created", payload: session });
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
      if (!dbDeleteSession(ctx.db, message.payload.sessionId)) {
        throw new HandlerError("not_found", "session not found");
      }
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
      const run = prepareRun(ctx.db, message.payload.sessionId, message.payload.text);
      const controller = new AbortController();
      ctx.activeRuns.set(run.id, controller);
      send(client, { id: message.id, type: "run_started", payload: { runId: run.id, sessionId: run.sessionId } });
      void executeRun({
        db: ctx.db,
        sessionId: run.sessionId,
        runId: run.id,
        prompt: message.payload.text,
        signal: controller.signal,
        broadcast: (payload) => broadcast(ctx, payload),
      }).finally(() => {
        ctx.activeRuns.delete(run.id);
      });
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
      send(client, { id: message.id, type: "state", payload: loadState(ctx.db) });
      return;
    }
    case "list_models": {
      const adapter = getAdapter(message.payload.providerId);
      if (adapter === undefined) {
        throw new HandlerError("provider", `provider ${message.payload.providerId} is not available yet`);
      }
      const models = await adapter.listModels();
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
      const health = await adapter.checkHealth();
      send(client, {
        id: message.id,
        type: "provider_health",
        payload: { providerId: adapter.id, ok: health.ok, detail: health.detail },
      });
      return;
    }
    case "voice_start":
    case "voice_audio_chunk":
    case "voice_stop":
    case "tts_speak":
    case "tts_stop": {
      throw new HandlerError("not_implemented", "Voice is Phase 6");
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

