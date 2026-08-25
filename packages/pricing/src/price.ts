import { BUILTIN_CATALOG, type CatalogRow } from "./catalog.ts";
import { tokensToUsdMicros } from "./money.ts";

export type UsageCounts = {
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
};

export type PriceResult =
  | { kind: "priced"; row: CatalogRow; usdMicros: number }
  | { kind: "unpriced"; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function rowKey(providerId: string, model: string): string {
  return `${providerId}\0${model}`;
}

function parseOverrideRow(value: unknown): CatalogRow | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  if (typeof value.providerId !== "string" || typeof value.model !== "string") {
    return undefined;
  }
  if (typeof value.inputPerMTokUsd !== "string" || typeof value.outputPerMTokUsd !== "string") {
    return undefined;
  }
  if (typeof value.asOf !== "string" || typeof value.sourceUrl !== "string") {
    return undefined;
  }
  const cacheRead = value.cacheReadPerMTokUsd;
  const cacheWrite = value.cacheWritePerMTokUsd;
  return {
    providerId: value.providerId,
    model: value.model,
    inputPerMTokUsd: value.inputPerMTokUsd,
    outputPerMTokUsd: value.outputPerMTokUsd,
    cacheReadPerMTokUsd: typeof cacheRead === "string" ? cacheRead : null,
    cacheWritePerMTokUsd: typeof cacheWrite === "string" ? cacheWrite : null,
    asOf: value.asOf,
    sourceUrl: value.sourceUrl,
  };
}

export function mergeCatalog(userRows: readonly CatalogRow[]): CatalogRow[] {
  const map = new Map<string, CatalogRow>();
  for (const row of BUILTIN_CATALOG) {
    map.set(rowKey(row.providerId, row.model), row);
  }
  for (const row of userRows) {
    const existing = map.get(rowKey(row.providerId, row.model));
    map.set(rowKey(row.providerId, row.model), existing === undefined ? row : { ...existing, ...row });
  }
  return [...map.values()];
}

export function parseUserPricingJson(raw: unknown): CatalogRow[] {
  if (Array.isArray(raw)) {
    return raw.map(parseOverrideRow).filter((row): row is CatalogRow => row !== undefined);
  }
  if (isRecord(raw) && Array.isArray(raw.rows)) {
    return raw.rows.map(parseOverrideRow).filter((row): row is CatalogRow => row !== undefined);
  }
  return [];
}

export function catalogStale(row: CatalogRow, now = new Date()): boolean {
  const asOf = Date.parse(`${row.asOf}T00:00:00.000Z`);
  if (!Number.isFinite(asOf)) {
    return true;
  }
  return now.getTime() - asOf > 90 * 24 * 60 * 60 * 1000;
}

function pickRates(row: CatalogRow, inputTokens: number | null): {
  inputPerMTokUsd: string;
  outputPerMTokUsd: string;
  cacheReadPerMTokUsd: string | null;
  cacheWritePerMTokUsd: string | null;
} {
  const threshold = row.longContextThresholdTokens;
  const long = row.longContext;
  if (threshold !== undefined && long !== undefined && inputTokens !== null && inputTokens >= threshold) {
    return long;
  }
  return row;
}

function addComponent(tokens: number | null, usdPerM: string | null, into: { micros: number; ok: boolean }): void {
  if (tokens === null || tokens === 0) {
    return;
  }
  if (usdPerM === null) {
    into.ok = false;
    return;
  }
  into.micros += tokensToUsdMicros(tokens, usdPerM);
}

export function priceFor(
  providerId: string,
  model: string | null,
  usage: UsageCounts,
  catalog: readonly CatalogRow[] = BUILTIN_CATALOG,
): PriceResult {
  if (model === null || model.length === 0) {
    return { kind: "unpriced", reason: "no model id" };
  }
  const row = catalog.find((item) => item.providerId === providerId && item.model === model);
  if (row === undefined) {
    return { kind: "unpriced", reason: `no catalog row for ${providerId}/${model}` };
  }
  const rates = pickRates(row, usage.inputTokens);
  const acc = { micros: 0, ok: true };
  addComponent(usage.inputTokens, rates.inputPerMTokUsd, acc);
  addComponent(usage.outputTokens, rates.outputPerMTokUsd, acc);
  addComponent(usage.cacheReadTokens, rates.cacheReadPerMTokUsd, acc);
  addComponent(usage.cacheWriteTokens, rates.cacheWritePerMTokUsd, acc);
  if (!acc.ok) {
    return { kind: "unpriced", reason: "a used token type has no published rate" };
  }
  return { kind: "priced", row, usdMicros: acc.micros };
}
