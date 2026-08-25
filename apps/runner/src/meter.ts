import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentEvent, CostModel, Session } from "@agentdeck/protocol";
import {
  appendLedgerEntry,
  listLedgerByRun,
  type AppDatabase,
  type LedgerSource,
} from "@agentdeck/db";
import {
  countTokens,
  familyForProvider,
  mergeCatalog,
  parseUserPricingJson,
  priceFor,
  type CatalogRow,
} from "@agentdeck/pricing";
import { agentdeckDir } from "./config.ts";
import { getAdapter } from "./registry.ts";

function loadCatalog(): CatalogRow[] {
  const path = join(agentdeckDir(), "pricing.json");
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
  now = new Date(),
): void {
  const existing = listLedgerByRun(db, runId);
  const hasPositive = existing.some(
    (row) => row.inputTokens + row.outputTokens + row.cacheReadTokens + row.cacheWriteTokens > 0,
  );
  const costModel = costModelFor(session.providerId);
  let inputTokens = 0;
  let outputTokens = 0;
  let source: LedgerSource = "provider_usage";
  if (!hasPositive) {
    const counted = countTokens(observedText, familyForProvider(session.providerId));
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
