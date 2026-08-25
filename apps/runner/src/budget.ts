import {
  listBudgets,
  listLedgerByRun,
  listLedgerForRuns,
  listRunsStartedBetween,
  loadState,
  nextUtcDay,
  nextUtcMonth,
  sumLedgerRows,
  utcDayStart,
  utcMonthStart,
  type AppDatabase,
  type LedgerTotals,
} from "@agentdeck/db";
import { BUILTIN_CATALOG, catalogStale, countTokens, familyForProvider, priceFor } from "@agentdeck/pricing";
import type {
  Budget,
  BudgetStatus,
  CostModel,
  GetSpendPayload,
  Session,
  SpendReportPayload,
  SpendUpdatePayload,
} from "@agentdeck/protocol";
import { getAdapter } from "./registry.ts";

export type GateResult =
  | { kind: "ok"; statuses: BudgetStatus[] }
  | { kind: "warn"; statuses: BudgetStatus[]; status: BudgetStatus }
  | { kind: "ask"; statuses: BudgetStatus[]; status: BudgetStatus }
  | { kind: "hard_stop"; statuses: BudgetStatus[]; status: BudgetStatus };

function costModelFor(providerId: string): CostModel {
  return getAdapter(providerId)?.costModel ?? "local";
}

export function decorateState(db: AppDatabase) {
  const state = loadState(db);
  return {
    ...state,
    spendSummary: {
      ...state.spendSummary,
      catalogStale: BUILTIN_CATALOG.some((row) => catalogStale(row)),
    },
  };
}

export function applicableBudgets(db: AppDatabase, session: Session): Budget[] {
  return listBudgets(db).filter((budget) => {
    if (!budget.enabled) {
      return false;
    }
    if (budget.scope === "global") {
      return true;
    }
    if (budget.scope === "workspace") {
      return budget.scopeId === session.workspaceId;
    }
    return budget.scopeId === session.id;
  });
}

/** Day/month windows bucket by the run start timestamp (UTC), not by each ledger row. */
export function runIdsForWindow(
  db: AppDatabase,
  window: Budget["window"],
  startedAt: Date,
  runId: string | null,
): string[] {
  if (window === "run") {
    return runId === null ? [] : [runId];
  }
  if (window === "day") {
    return listRunsStartedBetween(db, utcDayStart(startedAt), nextUtcDay(startedAt)).map((run) => run.id);
  }
  return listRunsStartedBetween(db, utcMonthStart(startedAt), nextUtcMonth(startedAt)).map((run) => run.id);
}

function totalsForBudget(
  db: AppDatabase,
  budget: Budget,
  session: Session,
  startedAt: Date,
  runId: string | null,
): LedgerTotals {
  const ids = runIdsForWindow(db, budget.window, startedAt, runId);
  const rows = listLedgerForRuns(db, ids).filter((row) => {
    if (budget.scope === "workspace") {
      return row.workspaceId === session.workspaceId;
    }
    if (budget.scope === "session") {
      return row.sessionId === session.id;
    }
    return true;
  });
  return sumLedgerRows(rows);
}

function statusFor(
  budget: Budget,
  totals: LedgerTotals,
  costModel: CostModel,
  extraUsdMicros: number,
): BudgetStatus | null {
  const candidates: BudgetStatus[] = [];
  if (budget.limitTokens !== null && budget.limitTokens > 0) {
    candidates.push({
      budgetId: budget.id,
      scope: budget.scope,
      window: budget.window,
      spent: totals.tokens,
      limit: budget.limitTokens,
      pct: (totals.tokens / budget.limitTokens) * 100,
      action: budget.action,
      unit: "tokens",
    });
  }
  if (budget.limitUsdMicros !== null && budget.limitUsdMicros > 0 && costModel === "metered") {
    const limit = budget.limitUsdMicros + extraUsdMicros;
    const spent = totals.costUsdMicros ?? 0;
    if (limit > 0) {
      candidates.push({
        budgetId: budget.id,
        scope: budget.scope,
        window: budget.window,
        spent,
        limit,
        pct: (spent / limit) * 100,
        action: budget.action,
        unit: "usd_micros",
      });
    }
  }
  if (candidates.length === 0) {
    return null;
  }
  return candidates.reduce((best, item) => (item.pct >= best.pct ? item : best));
}

export function evaluateBudgets(
  db: AppDatabase,
  session: Session,
  startedAt: Date,
  runId: string | null,
  extraUsdByBudget: Map<string, number> = new Map(),
): BudgetStatus[] {
  const costModel = costModelFor(session.providerId);
  const statuses: BudgetStatus[] = [];
  for (const budget of applicableBudgets(db, session)) {
    const status = statusFor(budget, totalsForBudget(db, budget, session, startedAt, runId), costModel, extraUsdByBudget.get(budget.id) ?? 0);
    if (status !== null) {
      statuses.push(status);
    }
  }
  return statuses;
}

function pickOver(statuses: BudgetStatus[], action: BudgetStatus["action"]): BudgetStatus | undefined {
  return statuses.find((status) => status.pct >= 100 && status.action === action);
}

export function classifyGate(statuses: BudgetStatus[]): GateResult {
  const hard = pickOver(statuses, "hard_stop");
  if (hard !== undefined) {
    return { kind: "hard_stop", statuses, status: hard };
  }
  const ask = pickOver(statuses, "ask");
  if (ask !== undefined) {
    return { kind: "ask", statuses, status: ask };
  }
  const warn = pickOver(statuses, "warn") ?? statuses.find((status) => status.pct >= 80);
  if (warn !== undefined && warn.pct >= 100) {
    return { kind: "warn", statuses, status: warn };
  }
  if (warn !== undefined && warn.pct >= 80) {
    return { kind: "ok", statuses };
  }
  return { kind: "ok", statuses };
}

export function preRunGate(db: AppDatabase, session: Session, now = new Date()): GateResult {
  return classifyGate(evaluateBudgets(db, session, now, null));
}

export function inFlightGate(
  db: AppDatabase,
  session: Session,
  startedAt: Date,
  runId: string,
  extraUsdByBudget: Map<string, number> = new Map(),
): GateResult {
  return classifyGate(evaluateBudgets(db, session, startedAt, runId, extraUsdByBudget));
}

export function buildSpendUpdate(
  db: AppDatabase,
  session: Session,
  runId: string,
  startedAt: Date,
  extraUsdByBudget: Map<string, number> = new Map(),
): SpendUpdatePayload {
  const runRows = listLedgerByRun(db, runId);
  const totals = sumLedgerRows(runRows);
  const statuses = evaluateBudgets(db, session, startedAt, runId, extraUsdByBudget);
  const warning = statuses.some((status) => status.pct >= 80);
  return {
    runId,
    sessionId: session.id,
    workspaceId: session.workspaceId,
    tokens: {
      input: totals.inputTokens,
      output: totals.outputTokens,
      cacheRead: totals.cacheReadTokens,
      cacheWrite: totals.cacheWriteTokens,
    },
    costUsdMicros: totals.costUsdMicros,
    costModel: costModelFor(session.providerId),
    source: totals.source,
    level: warning ? "warning" : "info",
    budgets: statuses,
  };
}

export function createSpendThrottle(
  emit: (payload: SpendUpdatePayload) => void,
  intervalMs = 500,
): { push: (payload: SpendUpdatePayload, terminal?: boolean) => void } {
  let lastSent = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: SpendUpdatePayload | null = null;
  function flush(): void {
    if (pending === null) {
      return;
    }
    emit(pending);
    lastSent = Date.now();
    pending = null;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }
  return {
    push(payload: SpendUpdatePayload, terminal = false) {
      pending = payload;
      if (terminal) {
        flush();
        return;
      }
      const wait = intervalMs - (Date.now() - lastSent);
      if (wait <= 0) {
        flush();
        return;
      }
      if (timer === null) {
        timer = setTimeout(flush, wait);
      }
    },
  };
}

export function withLedgerLock<T>(db: AppDatabase, fn: () => T): T {
  return db.$client.transaction(fn)();
}

export function buildSpendReport(db: AppDatabase, query: GetSpendPayload, now = new Date()): SpendReportPayload {
  const ids = runIdsForWindow(db, query.window, now, null);
  let rows = listLedgerForRuns(db, ids);
  if (query.scope === "workspace" && query.scopeId !== undefined) {
    rows = rows.filter((row) => row.workspaceId === query.scopeId);
  }
  if (query.scope === "session" && query.scopeId !== undefined) {
    rows = rows.filter((row) => row.sessionId === query.scopeId);
  }
  const groupBy = query.groupBy ?? "provider";
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const key =
      groupBy === "session"
        ? row.sessionId
        : groupBy === "workspace"
          ? row.workspaceId
          : groupBy === "day"
            ? utcDayStart(row.ts).toISOString().slice(0, 10)
            : row.providerId;
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }
  const reportRows = [...grouped.entries()].map(([groupKey, list]) => {
    const totals = sumLedgerRows(list);
    return {
      groupKey,
      inputTokens: totals.inputTokens,
      outputTokens: totals.outputTokens,
      cacheReadTokens: totals.cacheReadTokens,
      cacheWriteTokens: totals.cacheWriteTokens,
      costUsdMicros: totals.costUsdMicros,
    };
  });
  const totals = sumLedgerRows(rows);
  return {
    rows: reportRows,
    totals: {
      groupKey: "totals",
      inputTokens: totals.inputTokens,
      outputTokens: totals.outputTokens,
      cacheReadTokens: totals.cacheReadTokens,
      cacheWriteTokens: totals.cacheWriteTokens,
      costUsdMicros: totals.costUsdMicros,
    },
    generatedAt: now.toISOString(),
    unpricedModels: totals.unpricedModels,
  };
}

export function estimateRunSpend(db: AppDatabase, session: Session, text: string, now = new Date()) {
  const counted = countTokens(text, familyForProvider(session.providerId));
  const costModel = costModelFor(session.providerId);
  const priced =
    costModel === "metered"
      ? priceFor(session.providerId, session.modelId, {
          inputTokens: counted.value,
          outputTokens: 0,
          cacheReadTokens: null,
          cacheWriteTokens: null,
        })
      : { kind: "unpriced" as const, reason: costModel };
  const statuses = evaluateBudgets(db, session, now, null);
  return {
    tokens: counted.value,
    costUsdMicros: priced.kind === "priced" ? priced.usdMicros : null,
    costModel,
    unpriced: priced.kind !== "priced",
    budgets: statuses,
  };
}

export function tightestBudget(statuses: BudgetStatus[]): BudgetStatus | undefined {
  if (statuses.length === 0) {
    return undefined;
  }
  return statuses.reduce((best, item) => (item.pct >= best.pct ? item : best));
}
