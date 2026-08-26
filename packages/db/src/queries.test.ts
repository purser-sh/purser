import { describe, expect, test } from "bun:test";
import { openSqliteDatabase } from "./client.ts";
import {
  appendLedgerEntry,
  insertEvent,
  insertRun,
  insertSession,
  insertWorkspace,
  listLedgerByRun,
  loadState,
  saveFolderWatches,
  seedDefaults,
  updateSession,
  upsertBudget,
  listBudgets,
} from "./queries.ts";

function openMemory() {
  return openSqliteDatabase(":memory:");
}

describe("sqlite core", () => {
  test("migrates, seeds, and roundtrips workspace session events", async () => {
    const db = openMemory();
    await seedDefaults(db);

    const workspace = insertWorkspace(db, {
      name: "Purser",
      absPath: process.cwd(),
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
    expect(state.folderWatches).toEqual([]);
  });

  test("persists folder watches without leaking them into settings", async () => {
    const db = openMemory();
    await seedDefaults(db);
    const workspace = insertWorkspace(db, {
      name: "Purser",
      absPath: process.cwd(),
      gitRemote: null,
    });
    saveFolderWatches(db, [{ workspaceId: workspace.id, absPath: "/home/aksingh/xyz", enabled: true }]);
    const state = loadState(db);
    expect(state.folderWatches).toEqual([
      { workspaceId: workspace.id, absPath: "/home/aksingh/xyz", enabled: true },
    ]);
    expect(state.settings.some((setting) => setting.key === "folder_watches")).toBe(false);
  });

  test("rejects postgres urls", () => {
    expect(() => openSqliteDatabase("postgres://localhost/purser")).toThrow(/Postgres/);
  });

  test("token_ledger is append-only and stores NULL cost for unpriced rows", async () => {
    const db = openMemory();
    await seedDefaults(db);
    const workspace = insertWorkspace(db, {
      name: "Purser",
      absPath: process.cwd(),
      gitRemote: null,
    });
    const session = insertSession(db, {
      workspaceId: workspace.id,
      title: "s",
      providerId: "generic_llm",
      modelId: "mystery-model",
      permissionMode: "ask",
    });
    const run = insertRun(db, session.id);
    const row = appendLedgerEntry(db, {
      workspaceId: workspace.id,
      sessionId: session.id,
      runId: run.id,
      providerId: "generic_llm",
      model: "mystery-model",
      costModel: "metered",
      inputTokens: 10,
      outputTokens: 4,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUsdMicros: null,
      source: "provider_usage",
    });
    expect(row.costUsdMicros).toBeNull();
    expect(listLedgerByRun(db, run.id)).toHaveLength(1);
    expect(() => db.$client.exec("UPDATE token_ledger SET source = 'x'")).toThrow(/append-only/);
    expect(() => db.$client.exec("DELETE FROM token_ledger")).toThrow(/append-only/);
  });

  test("budgets persist outside the settings array", async () => {
    const db = openMemory();
    await seedDefaults(db);
    const workspace = insertWorkspace(db, {
      name: "Purser",
      absPath: process.cwd(),
      gitRemote: null,
    });
    upsertBudget(db, {
      scope: "workspace",
      scopeId: workspace.id,
      window: "day",
      limitUsdMicros: null,
      limitTokens: 1000,
      action: "hard_stop",
      enabled: true,
    });
    expect(listBudgets(db)).toHaveLength(1);
    const state = loadState(db);
    expect(state.budgets).toHaveLength(1);
    expect(state.settings.some((setting) => setting.key === "budgets")).toBe(false);
    expect(state.protocolVersion).toBe(3);
  });
});
