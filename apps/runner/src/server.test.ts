import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { Socket } from "node:net";
import { join } from "node:path";
import { WebSocket } from "ws";
import { openSqliteDatabase } from "@agentdeck/db";
import { parseServerMessage, PROTOCOL_VERSION, type ServerMessage } from "@agentdeck/protocol";
import { startServer, type AppContext } from "./server.ts";

const TOKEN = "test-token-1234567890";

function inboxOf(ws: WebSocket) {
  const messages: ServerMessage[] = [];
  ws.on("message", (data) => {
    try {
      messages.push(parseServerMessage(JSON.parse(data.toString())));
    } catch (error) {
      throw new Error(`invalid server frame ${data.toString()}: ${error instanceof Error ? error.message : "parse"}`);
    }
  });
  return {
    async wait(predicate: (message: ServerMessage) => boolean, timeoutMs = 5000): Promise<ServerMessage> {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const found = messages.find(predicate);
        if (found) {
          return found;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error(
        `timed out waiting for message; saw ${JSON.stringify(messages.map((message) => ({ id: message.id, type: message.type })))}`,
      );
    },
  };
}

async function boot(): Promise<{ ctx: AppContext; server: { port: number; close: () => Promise<void> } }> {
  const home = mkdtempSync(join("/home/aksingh/AgentDeck", ".tmp-home-"));
  process.env.AGENTDECK_HOME = home;
  const db = openSqliteDatabase(":memory:");
  const ctx: AppContext = {
    config: { token: TOKEN, port: 0, allowedRoots: ["/home/aksingh/AgentDeck"] },
    db,
    clients: new Set(),
    activeRuns: new Map(),
    pendingPermissions: new Map(),
    pendingBudgets: new Map(),
    relay: null,
    voice: null,
    folderWatch: null,
  };
  const server = await startServer(ctx);
  return { ctx, server };
}

function connect(port: number, headers: Record<string, string>): WebSocket {
  return new WebSocket(`ws://127.0.0.1:${port}`, { headers });
}

describe("runner websocket", () => {
  test("hello, workspace, session, echo, and persisted history", async () => {
    const workspacePath = mkdtempSync(join("/home/aksingh/AgentDeck", ".tmp-ws-"));
    const { server } = await boot();
    const ws = connect(server.port, { Authorization: `Bearer ${TOKEN}` });
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
      setTimeout(() => reject(new Error("websocket open timeout")), 3000);
    });
    const inbox = inboxOf(ws);

    ws.send(
      JSON.stringify({
        id: "hello",
        type: "hello",
        payload: { token: TOKEN, clientVersion: "test", protocolVersion: PROTOCOL_VERSION },
      }),
    );
    const hello = await inbox.wait((message) => message.id === "hello");
    expect(hello.type).toBe("state");

    ws.send(
      JSON.stringify({
        id: "ws1",
        type: "create_workspace",
        payload: { name: "Demo", absPath: workspacePath },
      }),
    );
    const createdWs = await inbox.wait((message) => message.id === "ws1");
    expect(createdWs.type).toBe("workspace_created");
    if (createdWs.type !== "workspace_created") {
      throw new Error("expected workspace");
    }

    ws.send(
      JSON.stringify({
        id: "ses1",
        type: "create_session",
        payload: {
          workspaceId: createdWs.payload.id,
          providerId: "echo",
          permissionMode: "ask",
        },
      }),
    );
    const createdSession = await inbox.wait((message) => message.id === "ses1");
    expect(createdSession.type).toBe("session_created");
    if (createdSession.type !== "session_created") {
      throw new Error("expected session");
    }

    ws.send(
      JSON.stringify({
        id: "msg1",
        type: "send_message",
        payload: { sessionId: createdSession.payload.id, text: "hello deck" },
      }),
    );
    const started = await inbox.wait((message) => message.id === "msg1");
    expect(started.type).toBe("run_started");
    await inbox.wait((message) => message.type === "run_finished");

    ws.send(JSON.stringify({ id: "state2", type: "get_state", payload: {} }));
    const state = await inbox.wait((message) => message.id === "state2");
    expect(state.type).toBe("state");
    if (state.type !== "state") {
      throw new Error("expected state");
    }
    expect(state.payload.events.some((event) => event.kind === "user_message")).toBe(true);
    expect(state.payload.events.some((event) => event.kind === "text")).toBe(true);
    expect(state.payload.events.some((event) => event.kind === "done")).toBe(true);

    ws.terminate();
    await server.close();
  }, 20_000);

  test("health body is only ok and protocolVersion", async () => {
    const { server } = await boot();
    const response = await fetch(`http://127.0.0.1:${server.port}/health`);
    const body: unknown = await response.json();
    expect(body).toEqual({ ok: true, protocolVersion: PROTOCOL_VERSION });
    const text = JSON.stringify(body);
    expect(text.includes("token")).toBe(false);
    expect(text.includes("allowedRoots")).toBe(false);
    expect(text.includes("/home")).toBe(false);
    expect(text.toLowerCase().includes("workspace")).toBe(false);
    await server.close();
  });

  test("hello with protocol 1 returns a typed protocol_version error", async () => {
    const { server } = await boot();
    const ws = connect(server.port, { Authorization: `Bearer ${TOKEN}` });
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
      setTimeout(() => reject(new Error("websocket open timeout")), 3000);
    });
    const inbox = inboxOf(ws);
    ws.send(
      JSON.stringify({
        id: "hello",
        type: "hello",
        payload: { token: TOKEN, clientVersion: "test", protocolVersion: 1 },
      }),
    );
    const reply = await inbox.wait((message) => message.id === "hello");
    expect(reply.type).toBe("error");
    if (reply.type === "error") {
      expect(reply.payload.code).toBe("protocol_version");
    }
    ws.terminate();
    await server.close();
  });

  test("upgrade with a foreign Origin is rejected", async () => {
    const { server } = await boot();
    const status = await rawUpgradeStatus(server.port, [
      `Host: 127.0.0.1:${server.port}`,
      "Origin: https://evil.example",
    ]);
    expect(status).toBe(403);
    await server.close();
  });

  test("upgrade with a rebound Host is rejected", async () => {
    const { server } = await boot();
    const status = await rawUpgradeStatus(server.port, [
      "Host: evil.example",
      "Origin: http://127.0.0.1:7410",
    ]);
    expect(status).toBe(403);
    await server.close();
  });

  test("upgrade from the real UI succeeds", async () => {
    const { server } = await boot();
    const ws = connect(server.port, { Origin: "http://127.0.0.1:7410" });
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
      setTimeout(() => reject(new Error("ui origin should connect")), 3000);
    });
    ws.terminate();
    await server.close();
  });

  test("token-only client with no Origin succeeds", async () => {
    const { server } = await boot();
    const ws = connect(server.port, { Authorization: `Bearer ${TOKEN}` });
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
      setTimeout(() => reject(new Error("token client should connect")), 3000);
    });
    ws.terminate();
    await server.close();
  });

  test("upgrade without Origin or token is rejected", async () => {
    const { server } = await boot();
    const status = await rawUpgradeStatus(server.port, [`Host: 127.0.0.1:${server.port}`]);
    expect(status).toBe(403);
    await server.close();
  });
});

async function rawUpgradeStatus(port: number, extraHeaders: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    const key = randomBytes(16).toString("base64");
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("raw upgrade timeout"));
    }, 3000);
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.connect(port, "127.0.0.1", () => {
      socket.write(
        ["GET / HTTP/1.1", ...extraHeaders, "Connection: Upgrade", "Upgrade: websocket", "Sec-WebSocket-Version: 13", `Sec-WebSocket-Key: ${key}`, "\r\n"].join(
          "\r\n",
        ),
      );
    });
    socket.once("data", (data) => {
      clearTimeout(timer);
      const line = data.toString("utf8").split("\r\n")[0] ?? "";
      const status = Number(line.split(" ")[1]);
      socket.destroy();
      resolve(status);
    });
  });
}
