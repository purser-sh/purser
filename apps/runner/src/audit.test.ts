import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendAudit,
  auditPath,
  canonicalJson,
  hashPath,
  printVerify,
  verifyAudit,
  ZERO_HASH,
} from "./audit.ts";

describe("audit chain", () => {
  test("chains prevHash and verify succeeds", () => {
    const home = mkdtempSync(join(tmpdir(), ".tmp-audit-"));
    const first = appendAudit(home, { ts: "2026-08-25T12:00:00.000Z", type: "run_started", runId: "run_1" });
    expect(first.prevHash).toBe(ZERO_HASH);
    appendAudit(home, { ts: "2026-08-25T12:00:01.000Z", type: "run_finished", runId: "run_1", outcome: "ok" });
    const result = verifyAudit(home);
    expect(result.ok).toBe(true);
    expect(result.totalEntries).toBe(2);
    expect(result.verifiedEntries).toBe(2);
  });

  test("printVerify shows header and success footer", () => {
    const home = mkdtempSync(join(tmpdir(), ".tmp-audit-"));
    appendAudit(home, { ts: "2026-08-01T12:00:00.000Z", type: "run_started", runId: "run_1" });
    appendAudit(home, { ts: "2026-08-24T09:41:22.000Z", type: "run_finished", runId: "run_1", outcome: "ok" });
    const out = printVerify(verifyAudit(home));
    expect(out).toContain("reading ");
    expect(out).toContain("entries 2 · 2026-08-01 to 2026-08-24");
    expect(out).toContain("chain sha256, genesis 0000…");
    expect(out).toContain("✓ 2 of 2 entries verified");
  });

  test("detects a deleted prevHash when the whole line is replaced", () => {
    const home = mkdtempSync(join(tmpdir(), ".tmp-audit-"));
    appendAudit(home, { ts: "2026-08-25T12:00:00.000Z", type: "secret_write", providerId: "grok" });
    appendAudit(home, { ts: "2026-08-25T12:00:01.000Z", type: "relay_pair" });
    const path = auditPath(home);
    const lines = readFileSync(path, "utf8").trim().split("\n");
    lines[0] = '{"ts":"2026-08-25T12:00:00.000Z","type":"tampered"}';
    writeFileSync(path, `${lines.join("\n")}\n`);
    const result = verifyAudit(home);
    expect(result.ok).toBe(false);
    expect(result.break?.kind).toBe("missing_prev_hash");
    const out = printVerify(result);
    expect(out).toContain("missing prevHash");
  });

  test("detects a subtle field edit with non-canonical JSON on the tampered line", () => {
    const home = mkdtempSync(join(tmpdir(), ".tmp-audit-"));
    appendAudit(home, {
      ts: "2026-08-24T09:41:22.000Z",
      type: "run_started",
      runId: "run_4471",
      providerId: "claude_code",
    });
    appendAudit(home, { ts: "2026-08-24T09:41:23.000Z", type: "tool_call", runId: "run_4471", toolName: "read_file" });
    const path = auditPath(home);
    const lines = readFileSync(path, "utf8").trim().split("\n");
    if (lines[0] === undefined) {
      throw new Error("expected a line");
    }
    // Edit type in the raw bytes but keep prevHash — trailing whitespace makes the line non-canonical.
    lines[0] = lines[0].replace('"type":"run_started"', '"type":"run_started_tampered"') + " ";
    writeFileSync(path, `${lines.join("\n")}\n`);
    const result = verifyAudit(home);
    expect(result.ok).toBe(false);
    expect(result.break?.kind).toBe("not_canonical");
    expect(result.break?.line).toBe(1);
    const out = printVerify(result);
    expect(out).toContain("canonical hash mismatch");
    expect(out).toContain("run run_4471 · claude_code");
    expect(out).toContain("written 2026-08-24T09:41:22.000Z");
  });

  test("detects a re-canonicalized tamper as a prevHash chain break on the next line", () => {
    const home = mkdtempSync(join(tmpdir(), ".tmp-audit-"));
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
    expect(result.break?.kind).toBe("prev_hash_mismatch");
    expect(result.break?.line).toBe(2);
    const out = printVerify(result);
    expect(out).toContain("chain broken");
    expect(out).toContain("expected sha256:");
    expect(out).toContain("found    sha256:");
    expect(out).toContain("✗ 1 of 2 entries verified");
  });

  test("continues the chain across rotation", () => {
    const home = mkdtempSync(join(tmpdir(), ".tmp-audit-"));
    appendAudit(home, { ts: "2026-08-25T12:00:00.000Z", type: "run_started" }, { rotateAt: 80 });
    appendAudit(home, { ts: "2026-08-25T12:00:01.000Z", type: "tool_call", toolName: "write_file", path: "/tmp/a.ts" }, { rotateAt: 80 });
    const result = verifyAudit(home);
    expect(result.ok).toBe(true);
    expect(result.files).toBeGreaterThanOrEqual(2);
  });

  test("redactPaths hashes companion paths", () => {
    const home = mkdtempSync(join(tmpdir(), ".tmp-audit-"));
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
