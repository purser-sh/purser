import type { PermissionMode, Session } from "@agentdeck/protocol";
import { getSession, updateSession, type AppDatabase } from "@agentdeck/db";
import type { RunnerConfig } from "./config.ts";
import { appendAudit } from "./audit.ts";
import { agentdeckDir } from "./config.ts";

export const DEFAULT_BYPASS_TTL_MS = 30 * 60 * 1000;
export const DEFAULT_BYPASS_MAX_RUNS = 10;

export function bypassTtlMs(config: RunnerConfig): number {
  return config.bypassTtlMs ?? DEFAULT_BYPASS_TTL_MS;
}

export function bypassMaxRuns(config: RunnerConfig): number {
  return config.bypassMaxRuns ?? DEFAULT_BYPASS_MAX_RUNS;
}

export function bypassStillActive(session: Session, now = Date.now()): boolean {
  if (session.permissionMode !== "bypass") {
    return false;
  }
  if (session.bypassExpiresAt !== null) {
    const expires = Date.parse(session.bypassExpiresAt);
    if (Number.isFinite(expires) && expires <= now) {
      return false;
    }
  }
  if (session.bypassRunsRemaining !== null && session.bypassRunsRemaining <= 0) {
    return false;
  }
  return true;
}

export function enableBypass(db: AppDatabase, sessionId: string, config: RunnerConfig, now = Date.now()): Session | undefined {
  const expires = new Date(now + bypassTtlMs(config)).toISOString();
  const session = updateSession(db, sessionId, {
    permissionMode: "bypass",
    bypassExpiresAt: expires,
    bypassRunsRemaining: bypassMaxRuns(config),
  });
  if (session !== undefined) {
    appendAudit(agentdeckDir(), {
      ts: new Date(now).toISOString(),
      type: "bypass_enable",
      sessionId,
      bypassed: true,
      detail: `ttlMs=${bypassTtlMs(config)} maxRuns=${bypassMaxRuns(config)}`,
    });
  }
  return session;
}

export function clearBypass(
  db: AppDatabase,
  sessionId: string,
  permissionMode: PermissionMode,
  reason: string,
  now = Date.now(),
): Session | undefined {
  const session = updateSession(db, sessionId, {
    permissionMode,
    bypassExpiresAt: null,
    bypassRunsRemaining: null,
  });
  appendAudit(agentdeckDir(), {
    ts: new Date(now).toISOString(),
    type: "bypass_expire",
    sessionId,
    detail: reason,
  });
  return session;
}

/** Drop expired bypass before a run. Returns the session after any revert. */
export function refreshBypass(db: AppDatabase, session: Session, now = Date.now()): Session {
  if (session.permissionMode !== "bypass") {
    return session;
  }
  if (bypassStillActive(session, now)) {
    return session;
  }
  const cleared = clearBypass(db, session.id, "ask", "ttl_or_runs_exhausted", now);
  return cleared ?? session;
}

/** Consume one bypass run slot. Remaining 0 still allows this run; clear after it finishes. */
export function consumeBypassRun(db: AppDatabase, session: Session): Session {
  if (session.permissionMode !== "bypass") {
    return session;
  }
  const remaining = session.bypassRunsRemaining;
  if (remaining === null) {
    return session;
  }
  const next = Math.max(0, remaining - 1);
  return (
    updateSession(db, session.id, {
      bypassRunsRemaining: next,
      permissionMode: "bypass",
      bypassExpiresAt: session.bypassExpiresAt,
    }) ?? session
  );
}

export function expireBypassIfConsumed(db: AppDatabase, sessionId: string, now = Date.now()): void {
  const session = getSession(db, sessionId);
  if (session === undefined || session.permissionMode !== "bypass") {
    return;
  }
  if (session.bypassRunsRemaining === 0) {
    clearBypass(db, sessionId, "ask", "run_count", now);
  }
}

