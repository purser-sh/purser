import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { agentdeckDir } from "./config.ts";

export const ZERO_HASH = "0".repeat(64);
export const AUDIT_ROTATE_BYTES = 64 * 1024 * 1024;

export type AuditEvent = {
  ts: string;
  type: string;
  sessionId?: string;
  runId?: string;
  workspaceId?: string;
  toolName?: string;
  toolId?: string;
  action?: string;
  bypassed?: boolean;
  path?: string;
  providerId?: string;
  settingKey?: string;
  detail?: string;
  outcome?: string;
};

export type ChainedAuditEvent = AuditEvent & { prevHash: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (!isRecord(value)) {
    return JSON.stringify(null);
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function hashPath(path: string): string {
  return `sha256:${sha256Hex(path).slice(0, 16)}`;
}

export function auditPath(home: string): string {
  return join(home, "audit.jsonl");
}

export function listAuditFiles(home: string): string[] {
  if (!existsSync(home)) {
    return [];
  }
  return readdirSync(home)
    .filter((name) => name.startsWith("audit") && name.endsWith(".jsonl"))
    .sort()
    .map((name) => join(home, name));
}

function redactEvent(event: AuditEvent, redactPaths: boolean): AuditEvent {
  const copy: AuditEvent = { ...event };
  if (redactPaths && copy.path !== undefined) {
    copy.path = hashPath(copy.path);
  }
  return copy;
}

function readLastCanonical(filePath: string): string | null {
  if (!existsSync(filePath)) {
    return null;
  }
  const contents = readFileSync(filePath, "utf8");
  const lines = contents.split("\n").filter((line) => line.length > 0);
  return lines.at(-1) ?? null;
}

export type AppendAuditOptions = {
  redactPaths?: boolean;
  rotateAt?: number;
};

export function logAudit(event: AuditEvent, options: AppendAuditOptions = {}): ChainedAuditEvent {
  return appendAudit(agentdeckDir(), event, options);
}

export function appendAudit(home: string, event: AuditEvent, options: AppendAuditOptions = {}): ChainedAuditEvent {
  mkdirSync(home, { recursive: true, mode: 0o700 });
  const path = auditPath(home);
  if (!existsSync(path)) {
    const fd = openSync(path, "w", 0o600);
    closeSync(fd);
  }
  const rotateAt = options.rotateAt ?? AUDIT_ROTATE_BYTES;
  const last = readLastCanonical(path);
  let prevHash = last === null ? ZERO_HASH : sha256Hex(last);
  const size = statSync(path).size;
  const candidate = redactEvent(event, options.redactPaths === true);
  const chained: ChainedAuditEvent = { ...candidate, prevHash };
  const line = canonicalJson(chained);
  if (size > 0 && size + line.length + 1 > rotateAt) {
    const rotated = join(home, `audit-${new Date().toISOString().replaceAll(":", "-")}.jsonl`);
    renameSync(path, rotated);
    const fd = openSync(path, "w", 0o600);
    closeSync(fd);
    const head: ChainedAuditEvent = {
      ts: event.ts,
      type: "rotate_head",
      prevHash,
    };
    const headLine = canonicalJson(head);
    writeFileSync(path, `${headLine}\n`, { mode: 0o600 });
    prevHash = sha256Hex(headLine);
    const next: ChainedAuditEvent = { ...candidate, prevHash };
    const nextLine = canonicalJson(next);
    appendFileSync(path, `${nextLine}\n`, { mode: 0o600 });
    return next;
  }
  appendFileSync(path, `${line}\n`, { mode: 0o600 });
  return chained;
}

export type AuditVerifyResult =
  | { ok: true; files: number; lines: number }
  | { ok: false; file: string; line: number; detail: string };

export function verifyAudit(home: string): AuditVerifyResult {
  const files = listAuditFiles(home);
  if (files.length === 0) {
    return { ok: true, files: 0, lines: 0 };
  }
  let expected = ZERO_HASH;
  let lines = 0;
  for (const file of files) {
    const contents = readFileSync(file, "utf8");
    const fileLines = contents.split("\n").filter((line) => line.length > 0);
    for (let index = 0; index < fileLines.length; index += 1) {
      const raw = fileLines[index];
      if (raw === undefined) {
        continue;
      }
      lines += 1;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return { ok: false, file, line: index + 1, detail: "line is not JSON" };
      }
      if (!isRecord(parsed) || typeof parsed.prevHash !== "string") {
        return { ok: false, file, line: index + 1, detail: "missing prevHash" };
      }
      const canonical = canonicalJson(parsed);
      if (canonical !== raw) {
        return { ok: false, file, line: index + 1, detail: "line is not canonical JSON" };
      }
      if (parsed.prevHash !== expected) {
        return { ok: false, file, line: index + 1, detail: `prevHash mismatch: expected ${expected}` };
      }
      expected = sha256Hex(canonical);
    }
  }
  return { ok: true, files: files.length, lines };
}

export function printVerify(result: AuditVerifyResult): string {
  if (result.ok) {
    return `audit ok: ${result.lines} lines in ${result.files} file(s)`;
  }
  return `audit break at ${result.file}:${result.line}: ${result.detail}`;
}
