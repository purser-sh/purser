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
import { basename, join } from "node:path";
import { purserDir } from "./config.ts";

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
  return appendAudit(purserDir(), event, options);
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

export type AuditBreakKind = "not_json" | "missing_prev_hash" | "not_canonical" | "prev_hash_mismatch";

export type AuditVerifyBreak = {
  file: string;
  line: number;
  kind: AuditBreakKind;
  expectedHash: string;
  foundHash: string;
  entry: AuditEvent | null;
};

export type AuditVerifyResult = {
  ok: boolean;
  home: string;
  primaryFile: string | null;
  files: number;
  totalEntries: number;
  verifiedEntries: number;
  dateFrom: string | null;
  dateTo: string | null;
  break: AuditVerifyBreak | null;
};

function parseAuditEvent(parsed: Record<string, unknown>): AuditEvent | null {
  if (typeof parsed.ts !== "string" || typeof parsed.type !== "string") {
    return null;
  }
  const event: AuditEvent = { ts: parsed.ts, type: parsed.type };
  for (const key of [
    "sessionId",
    "runId",
    "workspaceId",
    "toolName",
    "toolId",
    "action",
    "path",
    "providerId",
    "settingKey",
    "detail",
    "outcome",
  ] as const) {
    const value = parsed[key];
    if (typeof value === "string") {
      event[key] = value;
    }
  }
  if (typeof parsed.bypassed === "boolean") {
    event.bypassed = parsed.bypassed;
  }
  return event;
}

function trackTimestamp(range: { from: string | null; to: string | null }, ts: string | undefined): void {
  if (ts === undefined) {
    return;
  }
  const day = ts.slice(0, 10);
  if (range.from === null || day < range.from) {
    range.from = day;
  }
  if (range.to === null || day > range.to) {
    range.to = day;
  }
}

export function verifyAudit(home: string): AuditVerifyResult {
  const files = listAuditFiles(home);
  const primaryFile = files[0] ?? null;
  const range = { from: null as string | null, to: null as string | null };
  if (files.length === 0) {
    return {
      ok: true,
      home,
      primaryFile: null,
      files: 0,
      totalEntries: 0,
      verifiedEntries: 0,
      dateFrom: null,
      dateTo: null,
      break: null,
    };
  }

  let expected = ZERO_HASH;
  let totalEntries = 0;
  let verifiedEntries = 0;

  for (const file of files) {
    const contents = readFileSync(file, "utf8");
    const fileLines = contents.split("\n").filter((line) => line.length > 0);
    for (let index = 0; index < fileLines.length; index += 1) {
      const raw = fileLines[index];
      if (raw === undefined) {
        continue;
      }
      totalEntries += 1;
      const lineNo = index + 1;

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return {
          ok: false,
          home,
          primaryFile,
          files: files.length,
          totalEntries,
          verifiedEntries,
          dateFrom: range.from,
          dateTo: range.to,
          break: {
            file,
            line: lineNo,
            kind: "not_json",
            expectedHash: shortHash(expected),
            foundHash: "—",
            entry: null,
          },
        };
      }

      if (!isRecord(parsed) || typeof parsed.prevHash !== "string") {
        return {
          ok: false,
          home,
          primaryFile,
          files: files.length,
          totalEntries,
          verifiedEntries,
          dateFrom: range.from,
          dateTo: range.to,
          break: {
            file,
            line: lineNo,
            kind: "missing_prev_hash",
            expectedHash: shortHash(expected),
            foundHash: "—",
            entry: isRecord(parsed) ? parseAuditEvent(parsed) : null,
          },
        };
      }

      const canonical = canonicalJson(parsed);
      if (canonical !== raw) {
        return {
          ok: false,
          home,
          primaryFile,
          files: files.length,
          totalEntries,
          verifiedEntries,
          dateFrom: range.from,
          dateTo: range.to,
          break: {
            file,
            line: lineNo,
            kind: "not_canonical",
            expectedHash: shortHash(expected),
            foundHash: shortHash(parsed.prevHash),
            entry: parseAuditEvent(parsed),
          },
        };
      }

      trackTimestamp(range, typeof parsed.ts === "string" ? parsed.ts : undefined);

      if (parsed.prevHash !== expected) {
        return {
          ok: false,
          home,
          primaryFile,
          files: files.length,
          totalEntries,
          verifiedEntries,
          dateFrom: range.from,
          dateTo: range.to,
          break: {
            file,
            line: lineNo,
            kind: "prev_hash_mismatch",
            expectedHash: shortHash(expected),
            foundHash: shortHash(parsed.prevHash),
            entry: parseAuditEvent(parsed),
          },
        };
      }

      verifiedEntries += 1;
      expected = sha256Hex(canonical);
    }
  }

  return {
    ok: true,
    home,
    primaryFile,
    files: files.length,
    totalEntries,
    verifiedEntries: totalEntries,
    dateFrom: range.from,
    dateTo: range.to,
    break: null,
  };
}

function shortHash(fullHex: string): string {
  if (fullHex === ZERO_HASH) {
    return `sha256:${fullHex.slice(0, 4)}…`;
  }
  return `sha256:${fullHex.slice(0, 6)}…`;
}

function formatEntryCount(n: number): string {
  return n.toLocaleString("en-US");
}

function formatDateRange(from: string | null, to: string | null): string {
  if (from === null || to === null) {
    return "no dated entries";
  }
  if (from === to) {
    return from;
  }
  return `${from} to ${to}`;
}

function breakHeadline(kind: AuditBreakKind): string {
  switch (kind) {
    case "not_json":
      return "line is not valid JSON";
    case "missing_prev_hash":
      return "missing prevHash";
    case "not_canonical":
      return "entry was edited (canonical hash mismatch)";
    case "prev_hash_mismatch":
      return "chain broken";
  }
}

function formatBreakEntry(entry: AuditEvent | null): string[] {
  if (entry === null) {
    return [];
  }
  const parts: string[] = [];
  if (entry.runId !== undefined) {
    parts.push(`run ${entry.runId}`);
  }
  if (entry.providerId !== undefined) {
    parts.push(entry.providerId);
  } else if (entry.type.includes("run") || entry.toolName !== undefined) {
    parts.push(entry.type);
  }
  const detail = parts.length > 0 ? parts.join(" · ") : entry.type;
  const lines = [`  ${detail}`];
  if (entry.ts.length > 0) {
    lines.push(`  written ${entry.ts}`);
  }
  return lines;
}

export function printVerify(result: AuditVerifyResult): string {
  const lines: string[] = [];
  const reading = result.primaryFile ?? join(result.home, "audit.jsonl");
  lines.push(`reading ${reading}`);

  const range = formatDateRange(result.dateFrom, result.dateTo);
  lines.push(`entries ${formatEntryCount(result.totalEntries)} · ${range}`);
  lines.push(`chain sha256, genesis ${ZERO_HASH.slice(0, 4)}…`);

  if (result.ok) {
    lines.push(`✓ ${formatEntryCount(result.verifiedEntries)} of ${formatEntryCount(result.totalEntries)} entries verified`);
    return lines.join("\n");
  }

  const brk = result.break;
  if (brk === null) {
    lines.push("✗ audit verification failed");
    return lines.join("\n");
  }

  const fileLabel = basename(brk.file);
  lines.push(`✗ ${breakHeadline(brk.kind)} at ${fileLabel}:${brk.line}`);
  if (brk.kind === "prev_hash_mismatch" || brk.kind === "not_canonical") {
    lines.push(`  expected ${brk.expectedHash}`);
    lines.push(`  found    ${brk.foundHash}`);
  } else if (brk.kind === "missing_prev_hash") {
    lines.push(`  expected ${brk.expectedHash}`);
  }
  lines.push(...formatBreakEntry(brk.entry));
  lines.push(`✗ ${formatEntryCount(result.verifiedEntries)} of ${formatEntryCount(result.totalEntries)} entries verified`);
  return lines.join("\n");
}
