import { describe, expect, test } from "bun:test";
import {
  insertRun,
  insertSession,
  insertWorkspace,
  openSqliteDatabase,
  seedDefaults,
  upsertBudget,
} from "@agentdeck/db";
import { recordUsageEvent } from "./meter.ts";
import { classifyGate, inFlightGate, preRunGate, runIdsForWindow } from "./budget.ts";

async function setup() {
  const db = openSqliteDatabase(":memory:");
  await seedDefaults(db);
  const workspace = insertWorkspace(db, {
    name: "ws",
    absPath: "/home/aksingh/AgentDeck",
    gitRemote: null,
  });
  const session = insertSession(db, {
    workspaceId: workspace.id,
    title: "s",
    providerId: "echo",
    modelId: "echo-v1",
    permissionMode: "ask",
  });
  return { db, workspace, session };
}

describe("budget governor", () => {
  test("hard_stop pre-run when the daily token cap is already spent", async () => {
    const { db, session } = await setup();
    upsertBudget(db, {
      scope: "global",
      scopeId: null,
      window: "day",
      limitUsdMicros: null,
      limitTokens: 5,
      action: "hard_stop",
      enabled: true,
    });
    const run = insertRun(db, session.id);
    recordUsageEvent(db, session, run.id, {
      kind: "usage",
      inputTokens: 5,
      outputTokens: 0,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      source: "estimated",
    });
    const gate = preRunGate(db, session, new Date(run.startedAt));
    expect(gate.kind).toBe("hard_stop");
  });

  test("in-flight hard_stop when the first usage already exceeds the cap", async () => {
    const { db, session } = await setup();
    upsertBudget(db, {
      scope: "session",
      scopeId: session.id,
      window: "run",
      limitUsdMicros: null,
      limitTokens: 2,
      action: "hard_stop",
      enabled: true,
    });
    const run = insertRun(db, session.id);
    recordUsageEvent(db, session, run.id, {
      kind: "usage",
      inputTokens: 10,
      outputTokens: 0,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      source: "estimated",
    });
    const gate = inFlightGate(db, session, new Date(run.startedAt), run.id);
    expect(gate.kind).toBe("hard_stop");
  });

  test("two concurrent runs share a daily cap using the ledger", async () => {
    const { db, session } = await setup();
    upsertBudget(db, {
      scope: "workspace",
      scopeId: session.workspaceId,
      window: "day",
      limitUsdMicros: null,
      limitTokens: 10,
      action: "hard_stop",
      enabled: true,
    });
    const first = insertRun(db, session.id);
    recordUsageEvent(db, session, first.id, {
      kind: "usage",
      inputTokens: 10,
      outputTokens: 0,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      source: "estimated",
    });
    const secondGate = preRunGate(db, session, new Date(first.startedAt));
    expect(secondGate.kind).toBe("hard_stop");
  });

  test("day window buckets by run start, not ledger row time", async () => {
    const { db, session } = await setup();
    const started = new Date("2026-08-24T23:30:00.000Z");
    const ids = runIdsForWindow(db, "day", started, null);
    expect(ids).toEqual([]);
    const run = insertRun(db, session.id);
    const sameDay = runIdsForWindow(db, "day", new Date(run.startedAt), run.id);
    expect(sameDay).toContain(run.id);
  });

  test("warn action classifies as warn at 100%", () => {
    const result = classifyGate([
      {
        budgetId: "bud_1",
        scope: "global",
        window: "day",
        spent: 10,
        limit: 10,
        pct: 100,
        action: "warn",
        unit: "tokens",
      },
    ]);
    expect(result.kind).toBe("warn");
  });
});
