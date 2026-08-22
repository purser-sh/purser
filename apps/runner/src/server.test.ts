import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { WebSocket } from "ws";
import { openSqliteDatabase } from "@agentdeck/db";
import { parseServerMessage, PROTOCOL_VERSION, type ServerMessage } from "@agentdeck/protocol";
import { startServer, type AppContext } from "./server.ts";

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
      throw new Error(`timed out waiting for message; saw ${JSON.stringify(messages.map((message) => ({ id: message.id, type: message.type })))}`);
    },
  };
}

describe("runner websocket", () => {
  test("hello, workspace, session, echo, and persisted history", async () => {
    const home = mkdtempSync(join("/home/aksingh/AgentDeck", ".tmp-home-"));
    process.env.AGENTDECK_HOME = home;
    const workspacePath = mkdtempSync(join("/home/aksingh/AgentDeck", ".tmp-ws-"));
    const db = openSqliteDatabase(":memory:");
    const ctx: AppContext = {
      config: { token: "test-token-1234567890", port: 0, allowedRoots: ["/home/aksingh/AgentDeck"] },
      db,
      clients: new Set(),
      activeRuns: new Map(),
      pendingPermissions: new Map(),
      relay: null,
      voice: null,
    };
    const server = await startServer(ctx);
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
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
        payload: { token: "test-token-1234567890", clientVersion: "test", protocolVersion: PROTOCOL_VERSION },
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
});
