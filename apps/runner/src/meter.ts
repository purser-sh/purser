import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentEvent, CostModel, Session } from "@purser-sh/protocol";
import {
  appendLedgerEntry,
  listLedgerByRun,
  type AppDatabase,
  type LedgerSource,
} from "@purser-sh/db";
import {
  countTokens,
  mergeCatalog,
  parseUserPricingJson,
  priceFor,
  type CatalogRow,
} from "@purser-sh/pricing";
import { purserDir } from "./config.ts";
import { getAdapter } from "./registry.ts";

function loadCatalog(): CatalogRow[] {
  const path = join(purserDir(), "pricing.json");
  if (!existsSync(path)) {
    return mergeCatalog([]);
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return mergeCatalog(parseUserPricingJson(parsed));
  } catch {
    return mergeCatalog([]);
  }
}

function costModelFor(providerId: string): CostModel {
  return getAdapter(providerId)?.costModel ?? "local";
}

function tokenOrZero(value: number | null): number {
  return value ?? 0;
}

export function recordUsageEvent(
  db: AppDatabase,
  session: Session,
  runId: string,
  event: Extract<AgentEvent, { kind: "usage" }>,
  now = new Date(),
): void {
  const costModel = costModelFor(session.providerId);
  const priced =
    costModel === "metered"
      ? priceFor(session.providerId, session.modelId, event, loadCatalog())
      : { kind: "unpriced" as const, reason: costModel };
  appendLedgerEntry(db, {
    workspaceId: session.workspaceId,
    sessionId: session.id,
    runId,
    providerId: session.providerId,
    model: session.modelId,
    costModel,
    inputTokens: tokenOrZero(event.inputTokens),
    outputTokens: tokenOrZero(event.outputTokens),
    cacheReadTokens: tokenOrZero(event.cacheReadTokens),
    cacheWriteTokens: tokenOrZero(event.cacheWriteTokens),
    costUsdMicros: priced.kind === "priced" ? priced.usdMicros : null,
    source: event.source,
    ts: now,
  });
}

export function finalizeRunLedger(
  db: AppDatabase,
  session: Session,
  runId: string,
  observedText: string,
  options: {
    /**
     * Whether a run the provider never billed should still be charged our own
     * token estimate. True for runs that reached the provider (the prompt was
     * spent even if no usage came back) and false for runs that never left
     * Purser, where an estimate would be invented spend.
     */
    estimateWhenSilent?: boolean;
    now?: Date;
  } = {},
): void {
  const now = options.now ?? new Date();
  const existing = listLedgerByRun(db, runId);
  const hasPositive = existing.some(
    (row) => row.inputTokens + row.outputTokens + row.cacheReadTokens + row.cacheWriteTokens > 0,
  );
  const costModel = costModelFor(session.providerId);
  let inputTokens = 0;
  let outputTokens = 0;
  let source: LedgerSource = "provider_usage";
  if (!hasPositive && options.estimateWhenSilent !== false) {
    const counted = countTokens(observedText, session.modelId);
    inputTokens = counted.value;
    source = "estimated";
  }
  const priced =
    costModel === "metered"
      ? priceFor(
          session.providerId,
          session.modelId,
          { inputTokens, outputTokens, cacheReadTokens: null, cacheWriteTokens: null },
          loadCatalog(),
        )
      : { kind: "unpriced" as const, reason: costModel };
  appendLedgerEntry(db, {
    workspaceId: session.workspaceId,
    sessionId: session.id,
    runId,
    providerId: session.providerId,
    model: session.modelId,
    costModel,
    inputTokens,
    outputTokens,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costUsdMicros: priced.kind === "priced" && inputTokens + outputTokens > 0 ? priced.usdMicros : null,
    source,
    ts: now,
  });
}
