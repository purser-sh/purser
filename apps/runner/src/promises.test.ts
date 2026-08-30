import { describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gateToolCall, runGatedTool } from "@purser-sh/adapters";
import {
  appendLedgerEntry,
  insertRun,
  insertSession,
  insertWorkspace,
  listLedger,
  listLedgerByRun,
  loadSpendSummary,
  loadState,
  localDayStart,
  nextLocalDay,
  openSqliteDatabase,
  seedDefaults,
  sumLedgerRows,
} from "@purser-sh/db";
import { ledgerCostLabel, ledgerTokenLabel } from "@purser-sh/protocol";
import { tokensToUsdMicros } from "@purser-sh/pricing";
import {
  appendAudit,
  auditPath,
  printVerify,
  verifyAudit,
} from "./audit.ts";
import { buildSpendReport, buildSpendUpdate } from "./budget.ts";
import { loadOrCreateConfig, purserDir } from "./config.ts";
import { recordUsageEvent } from "./meter.ts";
import { setSecret } from "./secrets.ts";
import { applyStaged, discardStaged, writeStaged } from "./staging.ts";

const REGISTERED = new Set([
  "read_file",
  "write_file",
  "apply_patch",
  "list_dir",
  "ripgrep_search",
  "run_bash",
  "web_search",
]);

/** Payload that erased a real README when arguments were coerced instead of rejected. */
const ERASED_FILE_GATE_RAW =
  '{ "path": "README.md", "content": "<!-- Purser -->\\n" + (read_file("README.md") ?? "") }';

function tempHome(): string {
  const home = mkdtempSync(join(tmpdir(), "purser-promise-"));
  process.env.PURSER_HOME = home;
  return home;
}

function ledgerTokensForToday(db: Parameters<typeof listLedger>[0], now: Date): number {
  const dayStart = localDayStart(now);
  const dayEnd = nextLocalDay(now);
  const rows = listLedger(db).filter((row) => row.ts >= dayStart && row.ts < dayEnd);
  return sumLedgerRows(rows).tokens;
}

function reportTokens(report: ReturnType<typeof buildSpendReport>): number {
  const totals = report.totals;
  return totals.inputTokens + totals.outputTokens + totals.cacheReadTokens + totals.cacheWriteTokens;
}

function walkConfigTree(root: string): void {
  expect(statSync(root).mode & 0o777).toBe(0o700);
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      expect(st.mode & 0o777).toBe(0o700);
      walkConfigTree(path);
      continue;
    }
    expect(st.mode & 0o777).toBe(0o600);
  }
}

describe("what Purser promises", () => {
  test("nothing lands without your approval", async () => {
    tempHome();
    const root = mkdtempSync(join(tmpdir(), "purser-promise-root-"));
    const target = join(root, "README.md");
    const before = "# Purser\n";
    writeFileSync(target, before, "utf8");

    const gate = gateToolCall(
      "write_file",
      JSON.stringify({ path: "README.md", content: "# Purser\n\napproved edit\n" }),
      REGISTERED,
    );
    expect(gate.ok).toBe(true);
    if (!gate.ok) {
      return;
    }

    const staged = await runGatedTool({
      gate: gate as Extract<typeof gate, { name: "write_file" }>,
      cwd: root,
      mutationPolicy: "stage-only",
    });
    expect(staged.ok).toBe(true);
    expect(readFileSync(target, "utf8")).toBe(before);

    writeStaged("ses_promise", {
      path: staged.fileDiff!.path,
      newContent: staged.fileDiff!.newContent!,
      oldContent: staged.fileDiff!.oldContent,
      patch: staged.fileDiff!.patch,
      added: staged.fileDiff!.added,
      removed: staged.fileDiff!.removed,
    });
    expect(discardStaged("ses_promise", "README.md").ok).toBe(true);
    expect(readFileSync(target, "utf8")).toBe(before);

    writeStaged("ses_promise", {
      path: staged.fileDiff!.path,
      newContent: staged.fileDiff!.newContent!,
      oldContent: staged.fileDiff!.oldContent,
      patch: staged.fileDiff!.patch,
      added: staged.fileDiff!.added,
      removed: staged.fileDiff!.removed,
    });
    expect(applyStaged("ses_promise", "README.md", root, null).ok).toBe(true);
    expect(readFileSync(target, "utf8")).toBe(staged.fileDiff!.newContent!);
  });

  test("we never invent a dollar figure", async () => {
    tempHome();
    const db = openSqliteDatabase(":memory:");
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
    recordUsageEvent(db, session, run.id, {
      kind: "usage",
      inputTokens: 10,
      outputTokens: 4,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      source: "provider_usage",
    });
    const row = listLedgerByRun(db, run.id)[0];
    expect(row?.costUsdMicros).toBeNull();
    expect(row?.costUsdMicros).not.toBe(0);
    expect(tokensToUsdMicros(1_000, "2.00")).toBeGreaterThan(0);
  });

  test("the number on screen equals the number in the ledger", async () => {
    tempHome();
    const db = openSqliteDatabase(":memory:");
    await seedDefaults(db);
    const workspace = insertWorkspace(db, {
      name: "Purser",
      absPath: process.cwd(),
      gitRemote: null,
    });
    const session = insertSession(db, {
      workspaceId: workspace.id,
      title: "ollama",
      providerId: "ollama",
      modelId: "qwen2.5-coder:7b",
      permissionMode: "ask",
    });

    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(22, 0, 0, 0);
    const earlierToday = new Date(now);
    earlierToday.setHours(9, 0, 0, 0);

    const runEarlier = insertRun(db, session.id);
    const runCurrent = insertRun(db, session.id);

    const base = {
      workspaceId: workspace.id,
      sessionId: session.id,
      providerId: "ollama",
      model: "qwen2.5-coder:7b",
      costModel: "local" as const,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUsdMicros: null,
      source: "provider_usage" as const,
    };

    appendLedgerEntry(db, {
      ...base,
      runId: "run_yesterday_only_in_ledger",
      inputTokens: 9_999,
      ts: yesterday,
    });
    appendLedgerEntry(db, { ...base, runId: runEarlier.id, inputTokens: 502, ts: earlierToday });
    appendLedgerEntry(db, { ...base, runId: runCurrent.id, inputTokens: 3_439, ts: now });

    const sqlToday = ledgerTokensForToday(db, now);
    expect(sqlToday).toBe(3_941);

    const spendSummary = loadSpendSummary(db, now);
    expect(spendSummary.today.tokens).toBe(sqlToday);

    const stateToday = loadState(db).spendSummary.today.tokens;
    expect(stateToday).toBe(sqlToday);

    const getSpendToday = buildSpendReport(
      db,
      { scope: "global", window: "day", groupBy: "provider" },
      now,
    );
    expect(reportTokens(getSpendToday)).toBe(sqlToday);

    const thisRun = buildSpendUpdate(db, session, runCurrent.id, now);
    const thisRunTokens =
      thisRun.tokens.input +
      thisRun.tokens.output +
      thisRun.tokens.cacheRead +
      thisRun.tokens.cacheWrite;
    expect(thisRunTokens).toBe(3_439);

    expect(spendSummary.today.tokens).not.toBe(0);
    expect(spendSummary.today.tokens).toBeGreaterThanOrEqual(thisRunTokens);
  });

  test("a malformed tool call changes nothing on disk", async () => {
    tempHome();
    const root = mkdtempSync(join(tmpdir(), "purser-promise-bad-"));
    const target = join(root, "README.md");
    const before = "# keep me\n";
    writeFileSync(target, before, "utf8");

    const gate = gateToolCall("write_file", '{"path":"README.md","content":', REGISTERED);
    expect(gate.ok).toBe(false);
    expect(readFileSync(target, "utf8")).toBe(before);

    const erasedFileGate = gateToolCall("write_file", ERASED_FILE_GATE_RAW, REGISTERED);
    expect(erasedFileGate.ok).toBe(false);
    if (!erasedFileGate.ok) {
      expect(erasedFileGate.reason).toContain("Invalid JSON");
    }
    expect(readFileSync(target, "utf8")).toBe(before);

    const emptyContent = gateToolCall(
      "write_file",
      JSON.stringify({ path: "README.md", content: "" }),
      REGISTERED,
    );
    expect(emptyContent.ok).toBe(true);
    if (!emptyContent.ok) {
      return;
    }
    const staged = await runGatedTool({
      gate: emptyContent as Extract<typeof emptyContent, { name: "write_file" }>,
      cwd: root,
      mutationPolicy: "stage-only",
    });
    expect(staged.ok).toBe(true);
    expect(readFileSync(target, "utf8")).toBe(before);
  });

  test("tampering with the audit log is always detected", () => {
    const home = tempHome();
    appendAudit(home, { ts: "2026-08-25T12:00:00.000Z", type: "run_started", runId: "run_1" });
    appendAudit(home, { ts: "2026-08-25T12:00:01.000Z", type: "run_finished", runId: "run_1", outcome: "ok" });
    const path = auditPath(home);
    const lines = readFileSync(path, "utf8").trim().split("\n");
    lines[0] = '{"ts":"2026-08-25T12:00:00.000Z","type":"tampered"}';
    writeFileSync(path, `${lines.join("\n")}\n`);
    const result = verifyAudit(home);
    expect(result.ok).toBe(false);
    expect(printVerify(result)).toContain("missing prevHash");
  });

  test("subscription providers never display a cost", () => {
    expect(ledgerCostLabel(5_000_000, "subscription")).toBe("included in plan");
    expect(ledgerCostLabel(null, "subscription")).toBe("included in plan");
    expect(ledgerCostLabel(5_000_000, "local")).toBe("n/a");
  });

  test("an approximate token count is never shown as exact", () => {
    expect(ledgerTokenLabel(4321, "estimated")).toMatch(/^≈/);
    expect(ledgerTokenLabel(4321, "provider_usage")).not.toMatch(/^≈/);
    expect(ledgerTokenLabel(4321, "provider_usage")).toBe("4,321");
  });

  test("the config directory and everything in it is private to the user", async () => {
    const previousUmask = process.umask(0o022);
    try {
      const home = tempHome();
      loadOrCreateConfig();
      setSecret("grok", "sk-test-key-not-real");
      appendAudit(home, { ts: new Date().toISOString(), type: "run_started", runId: "run_perm" });

      const db = openSqliteDatabase(`sqlite://${join(home, "purser.sqlite")}`);
      await seedDefaults(db);
      const workspace = insertWorkspace(db, {
        name: "Purser",
        absPath: process.cwd(),
        gitRemote: null,
      });
      const session = insertSession(db, {
        workspaceId: workspace.id,
        title: "perm",
        providerId: "echo",
        modelId: "echo-v1",
        permissionMode: "ask",
      });
      const run = insertRun(db, session.id);
      appendLedgerEntry(db, {
        workspaceId: workspace.id,
        sessionId: session.id,
        runId: run.id,
        providerId: "echo",
        model: "echo-v1",
        costModel: "local",
        inputTokens: 1,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        costUsdMicros: null,
        source: "provider_usage",
        ts: new Date(),
      });

      writeStaged(session.id, {
        path: "README.md",
        newContent: "staged secret source\n",
        oldContent: "before\n",
        patch: "@@\n-staged\n+staged secret source",
        added: 1,
        removed: 1,
      });

      expect(purserDir()).toBe(home);
      walkConfigTree(home);
    } finally {
      process.umask(previousUmask);
    }
  });
});
