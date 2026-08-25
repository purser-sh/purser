import { appendFileSync, existsSync, mkdirSync, openSync, closeSync } from "node:fs";
import { join } from "node:path";

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
  detail?: string;
};

/**
 * Phase 0 writes append-only JSONL without a hash chain.
 * Phase 3 will add prevHash chaining, rotation, and `agentdeck audit verify`.
 */
export function auditPath(home: string): string {
  return join(home, "audit.jsonl");
}

export function appendAudit(home: string, event: AuditEvent): void {
  mkdirSync(home, { recursive: true, mode: 0o700 });
  const path = auditPath(home);
  const line = `${JSON.stringify({ ...event, ts: event.ts })}`;
  if (!existsSync(path)) {
    const fd = openSync(path, "w", 0o600);
    closeSync(fd);
  }
  appendFileSync(path, `${line}\n`, { mode: 0o600 });
}
