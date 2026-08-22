import { describe, expect, test } from "bun:test";
import { openSqliteDatabase } from "./client.ts";
import {
  insertEvent,
  insertRun,
  insertSession,
  insertWorkspace,
  loadState,
  seedDefaults,
  updateSession,
} from "./queries.ts";

function openMemory() {
  return openSqliteDatabase(":memory:");
}

describe("sqlite core", () => {
  test("migrates, seeds, and roundtrips workspace session events", async () => {
    const db = openMemory();
    await seedDefaults(db);

    const workspace = insertWorkspace(db, {
      name: "AgentDeck",
      absPath: "/home/aksingh/AgentDeck",
      gitRemote: null,
    });
    const session = insertSession(db, {
      workspaceId: workspace.id,
      title: "New session",
      providerId: "echo",
      modelId: "echo-v1",
      permissionMode: "ask",
    });
    insertEvent(db, {
      sessionId: session.id,
      kind: "user_message",
      role: "user",
      payload: { kind: "user_message", text: "hello" },
    });
    insertEvent(db, {
      sessionId: session.id,
      kind: "text",
      role: "assistant",
      payload: { kind: "text", text: "You said: hello" },
    });
    const run = insertRun(db, session.id);
    expect(run.status).toBe("running");

    const updated = updateSession(db, session.id, { title: "hello" });
    expect(updated?.title).toBe("hello");

    const state = loadState(db);
    expect(state.workspaces).toHaveLength(1);
    expect(state.sessions).toHaveLength(1);
    expect(state.events).toHaveLength(2);
    expect(state.events[0]?.seq).toBe(0);
    expect(state.events[1]?.seq).toBe(1);
    expect(state.providerConfigs.some((config) => config.providerId === "echo")).toBe(true);
    expect(state.settings.some((setting) => setting.key === "theme")).toBe(true);
  });

  test("rejects postgres urls", () => {
    expect(() => openSqliteDatabase("postgres://localhost/agentdeck")).toThrow(/Postgres/);
  });
});
