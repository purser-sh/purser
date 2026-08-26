import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { insertSession, insertWorkspace, openSqliteDatabase, seedDefaults } from "@purser-sh/db";
import { bypassStillActive, consumeBypassRun, enableBypass, refreshBypass } from "./bypass.ts";
import { appendAudit, auditPath } from "./audit.ts";

describe("bypass guard", () => {
  test("expires after TTL", async () => {
    process.env.PURSER_HOME = mkdtempSync(join(tmpdir(), ".tmp-home-"));
    const db = openSqliteDatabase(":memory:");
    await seedDefaults(db);
    const workspace = insertWorkspace(db, {
      name: "Demo",
      absPath: process.cwd(),
      gitRemote: null,
    });
    const session = insertSession(db, {
      workspaceId: workspace.id,
      title: "s",
      providerId: "echo",
      modelId: null,
      permissionMode: "ask",
    });
    const now = Date.parse("2026-08-25T12:00:00.000Z");
    const enabled = enableBypass(db, session.id, { token: "test-token-1234567890", port: 7420, allowedRoots: ["/home"], bypassTtlMs: 1000, bypassMaxRuns: 10 }, now);
    if (enabled === undefined) {
      throw new Error("expected bypass session");
    }
    expect(enabled.permissionMode).toBe("bypass");
    expect(bypassStillActive(enabled, now + 500)).toBe(true);
    const expired = refreshBypass(db, enabled, now + 2000);
    expect(expired.permissionMode).toBe("ask");
  });

  test("run count reaches zero after the last run slot is consumed", async () => {
    process.env.PURSER_HOME = mkdtempSync(join(tmpdir(), ".tmp-home-"));
    const db = openSqliteDatabase(":memory:");
    await seedDefaults(db);
    const workspace = insertWorkspace(db, {
      name: "Demo",
      absPath: process.cwd(),
      gitRemote: null,
    });
    const session = insertSession(db, {
      workspaceId: workspace.id,
      title: "s",
      providerId: "echo",
      modelId: null,
      permissionMode: "ask",
    });
    const enabled = enableBypass(db, session.id, { token: "test-token-1234567890", port: 7420, allowedRoots: ["/home"], bypassMaxRuns: 1 }, Date.now());
    if (enabled === undefined) {
      throw new Error("expected bypass session");
    }
    const after = consumeBypassRun(db, enabled);
    expect(after.bypassRunsRemaining).toBe(0);
    expect(after.permissionMode).toBe("bypass");
  });
});

describe("audit jsonl", () => {
  test("appends bypassed tool calls without secrets or file bodies", () => {
    const home = mkdtempSync(join(tmpdir(), ".tmp-home-"));
    appendAudit(home, {
      ts: "2026-08-25T12:00:00.000Z",
      type: "tool_call",
      sessionId: "ses_1",
      runId: "run_1",
      toolName: "write_file",
      bypassed: true,
    });
    const text = readFileSync(auditPath(home), "utf8");
    expect(text.includes("bypassed")).toBe(true);
    expect(text.includes("sk-")).toBe(false);
    expect(text.includes("-----BEGIN")).toBe(false);
  });
});
