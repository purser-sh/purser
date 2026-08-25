import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { appendAudit, auditPath, canonicalJson, hashPath, verifyAudit, ZERO_HASH } from "./audit.ts";

describe("audit chain", () => {
  test("chains prevHash and verify succeeds", () => {
    const home = mkdtempSync(join("/home/aksingh/AgentDeck", ".tmp-audit-"));
    const first = appendAudit(home, { ts: "2026-08-25T12:00:00.000Z", type: "run_started", runId: "run_1" });
    expect(first.prevHash).toBe(ZERO_HASH);
    appendAudit(home, { ts: "2026-08-25T12:00:01.000Z", type: "run_finished", runId: "run_1", outcome: "ok" });
    const result = verifyAudit(home);
    expect(result).toEqual({ ok: true, files: 1, lines: 2 });
  });

  test("detects a tampered line", () => {
    const home = mkdtempSync(join("/home/aksingh/AgentDeck", ".tmp-audit-"));
    appendAudit(home, { ts: "2026-08-25T12:00:00.000Z", type: "secret_write", providerId: "grok" });
    appendAudit(home, { ts: "2026-08-25T12:00:01.000Z", type: "relay_pair" });
    const path = auditPath(home);
    const lines = readFileSync(path, "utf8").trim().split("\n");
    if (lines[0] === undefined) {
      throw new Error("expected a line");
    }
    const tampered = JSON.parse(lines[0]) as { type: string; prevHash: string; ts: string };
    tampered.type = "secret_write_tampered";
    lines[0] = canonicalJson(tampered);
    writeFileSync(path, `${lines.join("\n")}\n`);
    const result = verifyAudit(home);
    expect(result.ok).toBe(false);
  });

  test("continues the chain across rotation", () => {
    const home = mkdtempSync(join("/home/aksingh/AgentDeck", ".tmp-audit-"));
    appendAudit(home, { ts: "2026-08-25T12:00:00.000Z", type: "run_started" }, { rotateAt: 80 });
    appendAudit(home, { ts: "2026-08-25T12:00:01.000Z", type: "tool_call", toolName: "write_file", path: "/tmp/a.ts" }, { rotateAt: 80 });
    const result = verifyAudit(home);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.files).toBeGreaterThanOrEqual(2);
    }
  });

  test("redactPaths hashes companion paths", () => {
    const home = mkdtempSync(join("/home/aksingh/AgentDeck", ".tmp-audit-"));
    appendAudit(
      home,
      { ts: "2026-08-25T12:00:00.000Z", type: "diff_response", path: "/home/aksingh/secret/file.ts" },
      { redactPaths: true },
    );
    const text = readFileSync(auditPath(home), "utf8");
    expect(text.includes("/home/aksingh/secret/file.ts")).toBe(false);
    expect(text.includes(hashPath("/home/aksingh/secret/file.ts"))).toBe(true);
    expect(text.includes("sk-")).toBe(false);
  });
});
