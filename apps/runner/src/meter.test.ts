import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  insertRun,
  insertSession,
  insertWorkspace,
  listLedgerByRun,
  openSqliteDatabase,
  seedDefaults,
} from "@purser-sh/db";
import { tokensToUsdMicros } from "@purser-sh/pricing";
import { finalizeRunLedger, recordUsageEvent } from "./meter.ts";
import { executeRun } from "./session-run.ts";

function openHomeDb() {
  const home = mkdtempSync(join(tmpdir(), ".tmp-meter-"));
  process.env.PURSER_HOME = home;
  return { db: openSqliteDatabase(":memory:"), home };
}

const GROK_USAGE = {
  kind: "usage" as const,
  inputTokens: 1_000,
  outputTokens: 0,
  cacheReadTokens: null,
  cacheWriteTokens: null,
  source: "provider_usage" as const,
};

const UNPRICED_USAGE = {
  kind: "usage" as const,
  inputTokens: 10,
  outputTokens: 4,
  cacheReadTokens: null,
  cacheWriteTokens: null,
  source: "provider_usage" as const,
};

const CACHE_WRITE_USAGE = {
  kind: "usage" as const,
  inputTokens: 100,
  outputTokens: 10,
  cacheReadTokens: null,
  cacheWriteTokens: 8,
  source: "provider_usage" as const,
};

describe("meter", () => {
  test("records priced grok usage and a zero-token finalising row", async () => {
    const { db } = openHomeDb();
    await seedDefaults(db);
    const workspace = insertWorkspace(db, {
      name: "Purser",
      absPath: process.cwd(),
      gitRemote: null,
    });
    const session = insertSession(db, {
      workspaceId: workspace.id,
      title: "grok",
      providerId: "grok",
      modelId: "grok-4.6",
      permissionMode: "ask",
    });
    const run = insertRun(db, session.id);
    recordUsageEvent(db, session, run.id, GROK_USAGE);
    finalizeRunLedger(db, session, run.id, "hello");
    const rows = listLedgerByRun(db, run.id);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.costUsdMicros).toBe(tokensToUsdMicros(1_000, "2.00"));
    expect(rows[0]?.source).toBe("provider_usage");
    expect(rows[0]?.costModel).toBe("metered");
    expect(rows[1]?.inputTokens).toBe(0);
    expect(rows[1]?.outputTokens).toBe(0);
    expect(rows[1]?.costUsdMicros).toBeNull();
  });

  test("leaves cost NULL for unpriced generic_llm, never 0", async () => {
    const { db } = openHomeDb();
    await seedDefaults(db);
    const workspace = insertWorkspace(db, {
      name: "Purser",
      absPath: process.cwd(),
      gitRemote: null,
    });
    const session = insertSession(db, {
      workspaceId: workspace.id,
      title: "openai",
      providerId: "generic_llm",
      modelId: "gpt-5.6",
      permissionMode: "ask",
    });
    const run = insertRun(db, session.id);
    recordUsageEvent(db, session, run.id, UNPRICED_USAGE);
    const rows = listLedgerByRun(db, run.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.costUsdMicros).toBeNull();
    expect(rows[0]?.costUsdMicros).not.toBe(0);
    expect(rows[0]?.inputTokens).toBe(10);
  });

  test("does not invent a grok cache-write price", async () => {
    const { db } = openHomeDb();
    await seedDefaults(db);
    const workspace = insertWorkspace(db, {
      name: "Purser",
      absPath: process.cwd(),
      gitRemote: null,
    });
    const session = insertSession(db, {
      workspaceId: workspace.id,
      title: "grok",
      providerId: "grok",
      modelId: "grok-4.6",
      permissionMode: "ask",
    });
    const run = insertRun(db, session.id);
    recordUsageEvent(db, session, run.id, CACHE_WRITE_USAGE);
    expect(listLedgerByRun(db, run.id)[0]?.costUsdMicros).toBeNull();
    expect(tokensToUsdMicros(100, "2.00")).toBeGreaterThan(0);
  });

  test("echo run writes estimated usage then a finalising row", async () => {
    const { db } = openHomeDb();
    await seedDefaults(db);
    const workspace = insertWorkspace(db, {
      name: "ws",
      absPath: process.cwd(),
      gitRemote: null,
    });
    const session = insertSession(db, {
      workspaceId: workspace.id,
      title: "echo",
      providerId: "echo",
      modelId: "echo-v1",
      permissionMode: "ask",
    });
    const run = insertRun(db, session.id);
    await executeRun({
      db,
      sessionId: session.id,
      runId: run.id,
      prompt: "hello deck",
      signal: new AbortController().signal,
      broadcast: () => undefined,
      askPermission: async () => true,
    });
    const rows = listLedgerByRun(db, run.id);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0]?.source).toBe("estimated");
    expect(rows[0]?.costModel).toBe("local");
    expect(rows[0]?.costUsdMicros).toBeNull();
    expect(rows[0]?.inputTokens).toBeGreaterThan(0);
  });

  test("a run the provider refused records no estimated tokens", async () => {
    const { db } = openHomeDb();
    await seedDefaults(db);
    const workspace = insertWorkspace(db, {
      name: "ws",
      absPath: process.cwd(),
      gitRemote: null,
    });
    const session = insertSession(db, {
      workspaceId: workspace.id,
      title: "claude",
      providerId: "claude_code",
      modelId: "sonnet",
      permissionMode: "ask",
    });
    const run = insertRun(db, session.id);
    // No CLI, no credentials: the adapter refuses before the provider is called.
    const path = process.env.PATH;
    const home = process.env.HOME;
    process.env.PATH = mkdtempSync(join(tmpdir(), ".tmp-nopath-"));
    process.env.HOME = mkdtempSync(join(tmpdir(), ".tmp-nohome-"));
    delete process.env.ANTHROPIC_API_KEY;
    try {
      await executeRun({
        db,
        sessionId: session.id,
        runId: run.id,
        prompt: "a prompt long enough to count for something",
        signal: new AbortController().signal,
        broadcast: () => undefined,
        askPermission: async () => true,
      });
    } finally {
      process.env.PATH = path;
      process.env.HOME = home;
    }
    const rows = listLedgerByRun(db, run.id);
    /*
     * Nothing was spent, so nothing may be billed. An estimate here would be
     * the coach's number leaking into the ledger as if it were spend.
     */
    expect(rows.every((row) => row.inputTokens + row.outputTokens === 0)).toBe(true);
    expect(rows.some((row) => row.source === "estimated")).toBe(false);
  });

  test("cancelled run still records partial estimated spend", async () => {
    const { db } = openHomeDb();
    await seedDefaults(db);
    const workspace = insertWorkspace(db, {
      name: "ws",
      absPath: process.cwd(),
      gitRemote: null,
    });
    const session = insertSession(db, {
      workspaceId: workspace.id,
      title: "echo",
      providerId: "echo",
      modelId: "echo-v1",
      permissionMode: "ask",
    });
    const run = insertRun(db, session.id);
    const controller = new AbortController();
    controller.abort();
    await executeRun({
      db,
      sessionId: session.id,
      runId: run.id,
      prompt: "cancel me please",
      signal: controller.signal,
      broadcast: () => undefined,
      askPermission: async () => true,
    });
    const rows = listLedgerByRun(db, run.id);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.some((row) => row.source === "estimated" && row.inputTokens > 0)).toBe(true);
    expect(rows.every((row) => row.costUsdMicros === null)).toBe(true);
  });
});
