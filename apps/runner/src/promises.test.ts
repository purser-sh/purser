import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gateToolCall, runGatedTool } from "@purser-sh/adapters";
import {
  insertRun,
  insertSession,
  insertWorkspace,
  listLedgerByRun,
  openSqliteDatabase,
  seedDefaults,
} from "@purser-sh/db";
import { ledgerCostLabel, ledgerTokenLabel } from "@purser-sh/protocol";
import { tokensToUsdMicros } from "@purser-sh/pricing";
import {
  appendAudit,
  auditPath,
  printVerify,
  verifyAudit,
} from "./audit.ts";
import { loadOrCreateConfig, purserDir } from "./config.ts";
import { recordUsageEvent } from "./meter.ts";
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

function tempHome(): string {
  const home = mkdtempSync(join(tmpdir(), "purser-promise-"));
  process.env.PURSER_HOME = home;
  return home;
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

    const staged = await runGatedTool({ gate, cwd: root, mutationPolicy: "stage-only" });
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
      title: "grok",
      providerId: "grok",
      modelId: "grok-4.6",
      permissionMode: "ask",
    });
    const run = insertRun(db, session.id);
    recordUsageEvent(db, session, run.id, {
      kind: "usage",
      inputTokens: 1_000,
      outputTokens: 250,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      source: "provider_usage",
    });
    const row = listLedgerByRun(db, run.id)[0]!;
    const total = row.inputTokens + row.outputTokens;
    expect(total).toBe(1_250);
    expect(row.costUsdMicros).toBeGreaterThan(0);
    expect(ledgerTokenLabel(total, row.source)).toBe(ledgerTokenLabel(total, "provider_usage"));
    expect(ledgerCostLabel(row.costUsdMicros, row.costModel)).toBe(ledgerCostLabel(row.costUsdMicros, "metered"));
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

    const emptyContent = gateToolCall(
      "write_file",
      JSON.stringify({ path: "README.md", content: "" }),
      REGISTERED,
    );
    expect(emptyContent.ok).toBe(true);
    if (!emptyContent.ok) {
      return;
    }
    const staged = await runGatedTool({ gate: emptyContent, cwd: root, mutationPolicy: "stage-only" });
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

  test("the config directory and everything in it is private to the user", () => {
    const home = tempHome();
    loadOrCreateConfig();
    const dir = purserDir();
    expect(dir).toBe(home);
    const dirMode = statSync(dir).mode & 0o777;
    expect(dirMode).toBe(0o700);
    const configMode = statSync(join(dir, "config.json")).mode & 0o777;
    expect(configMode).toBe(0o600);
    chmodSync(join(dir, "config.json"), 0o644);
    expect((statSync(join(dir, "config.json")).mode & 0o777) !== 0o600).toBe(true);
  });
});
