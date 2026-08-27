import { describe, expect, test } from "bun:test";
import { PROTOCOL_VERSION } from "@purser-sh/protocol";
import { openSqliteDatabase } from "./client.ts";
import {
  appendLedgerEntry,
  insertEvent,
  insertRun,
  insertSession,
  insertWorkspace,
  LedgerIntegrityError,
  listBudgets,
  listLedgerByRun,
  loadSpendSummary,
  loadState,
  localDayStart,
  nextLocalDay,
  saveFolderWatches,
  seedDefaults,
  updateSession,
  upsertBudget,
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

  test("the ledger rejects a model that does not belong to its provider", async () => {
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
      providerId: "claude_code",
      modelId: "sonnet",
      permissionMode: "ask",
    });
    const run = insertRun(db, session.id);

    /*
     * The pair a provider switch used to leave behind: the session moved to
     * claude_code while still holding echo's model id. It cannot exist, so it
     * must be refused at the boundary rather than stored.
     */
    const incoherent = {
      workspaceId: workspace.id,
      sessionId: session.id,
      runId: run.id,
      providerId: "claude_code",
      model: "echo-v1",
      costModel: "subscription" as const,
      inputTokens: 50,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUsdMicros: null,
      source: "estimated" as const,
    };

    expect(() => appendLedgerEntry(db, incoherent)).toThrow(LedgerIntegrityError);
    expect(() => appendLedgerEntry(db, incoherent)).toThrow(/echo-v1 does not belong to provider claude_code/);
    /* Rejected at the boundary means nothing was written. */
    expect(listLedgerByRun(db, run.id)).toHaveLength(0);

    /* The same row with the provider's own model is accepted. */
    const ok = appendLedgerEntry(db, { ...incoherent, model: "sonnet" });
    expect(ok.model).toBe("sonnet");
    expect(listLedgerByRun(db, run.id)).toHaveLength(1);

    /* A null model means "the provider's default", which is unknown, not impossible. */
    const unset = appendLedgerEntry(db, { ...incoherent, model: null });
    expect(unset.model).toBeNull();
    expect(listLedgerByRun(db, run.id)).toHaveLength(2);
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
    expect(state.protocolVersion).toBe(PROTOCOL_VERSION);
  });

  test("spend today uses the local calendar and matches the sum of today's runs", async () => {
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
      providerId: "echo",
      modelId: "echo-v1",
      permissionMode: "ask",
    });

    const now = new Date(2026, 7, 27, 12, 0, 0); // local noon Aug 27
    const lateTonight = new Date(2026, 7, 27, 23, 50, 0);
    const justAfterMidnight = new Date(2026, 7, 28, 0, 10, 0);

    const runToday = insertRun(db, session.id);
    const runTonight = insertRun(db, session.id);
    const runTomorrow = insertRun(db, session.id);

    const base = {
      workspaceId: workspace.id,
      sessionId: session.id,
      providerId: "echo",
      model: "echo-v1",
      costModel: "local" as const,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUsdMicros: null,
      source: "provider_usage" as const,
    };
    appendLedgerEntry(db, { ...base, runId: runToday.id, inputTokens: 100, ts: now });
    appendLedgerEntry(db, { ...base, runId: runTonight.id, inputTokens: 50, ts: lateTonight });
    appendLedgerEntry(db, { ...base, runId: runTomorrow.id, inputTokens: 7, ts: justAfterMidnight });

    const summaryToday = loadSpendSummary(db, now);
    expect(summaryToday.today.tokens).toBe(150);
    expect(summaryToday.month.tokens).toBe(157);

    // A run at 23:50 local is still today; 00:10 is tomorrow.
    expect(loadSpendSummary(db, lateTonight).today.tokens).toBe(150);
    expect(loadSpendSummary(db, justAfterMidnight).today.tokens).toBe(7);

    // sum(this run) over today == today's total — the two must never disagree.
    const dayStart = localDayStart(now);
    const dayEnd = nextLocalDay(now);
    const dayRows = [runToday, runTonight]
      .flatMap((run) => listLedgerByRun(db, run.id))
      .filter((row) => row.ts >= dayStart && row.ts < dayEnd);
    const sumRuns = dayRows.reduce(
      (sum, row) => sum + row.inputTokens + row.outputTokens + row.cacheReadTokens + row.cacheWriteTokens,
      0,
    );
    expect(sumRuns).toBe(summaryToday.today.tokens);

    // Month boundary: last day of July vs first of August.
    const endOfJuly = new Date(2026, 6, 31, 23, 50, 0);
    const startOfAugust = new Date(2026, 7, 1, 0, 10, 0);
    const julyRun = insertRun(db, session.id);
    appendLedgerEntry(db, { ...base, runId: julyRun.id, inputTokens: 9, ts: endOfJuly });
    expect(loadSpendSummary(db, endOfJuly).month.tokens).toBe(9);
    expect(loadSpendSummary(db, startOfAugust).month.tokens).toBe(157);
  });
});
