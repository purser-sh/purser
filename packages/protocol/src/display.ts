import type { BudgetAction, BudgetScope, BudgetWindow, CostModel } from "./enums.ts";
import type { Budget, ModelInfo } from "./entities.ts";
import type { ReadinessState } from "./readiness.ts";

/** Label for a model id derived from the provider catalog — never a parallel display string. */
export function modelOptionLabel(modelId: string, catalog: ModelInfo[] | undefined): string {
  if (catalog === undefined) {
    return "loading…";
  }
  const match = catalog.find((model) => model.id === modelId);
  if (match === undefined) {
    return `invalid: ${modelId}`;
  }
  return match.label;
}

/** Whether the stored model id can be shown as resolved text yet. */
export function modelSelectState(
  modelId: string | null,
  catalog: ModelInfo[] | undefined,
): "empty" | "loading" | "resolved" | "invalid" {
  if (modelId === null) {
    return catalog === undefined ? "loading" : "empty";
  }
  if (catalog === undefined) {
    return "loading";
  }
  return catalog.some((model) => model.id === modelId) ? "resolved" : "invalid";
}

export function providerReadinessShortLabel(state: ReadinessState): string {
  if (state === "cli_missing" || state === "package_missing") {
    return "not installed";
  }
  if (state === "not_authenticated") {
    return "not logged in";
  }
  if (state === "api_key_missing") {
    return "no API key";
  }
  if (state === "unreachable") {
    return "not reachable";
  }
  if (state === "ready") {
    return "ready";
  }
  return "not ready";
}

export function budgetScopeLabel(scope: BudgetScope): string {
  switch (scope) {
    case "global":
      return "all workspaces";
    case "workspace":
      return "this workspace";
    case "session":
      return "this session";
  }
}

export function budgetWindowLabel(window: BudgetWindow): string {
  switch (window) {
    case "run":
      return "per run";
    case "day":
      return "per day";
    case "month":
      return "per month";
  }
}

export function budgetActionLabel(action: BudgetAction): string {
  switch (action) {
    case "warn":
      return "warn only";
    case "ask":
      return "ask before exceeding";
    case "hard_stop":
      return "hard stop";
  }
}

function formatUsdMicros(micros: number): string {
  const sign = micros < 0 ? "-" : "";
  const abs = Math.abs(micros);
  const dollars = Math.trunc(abs / 1_000_000);
  const rest = abs % 1_000_000;
  const frac = String(rest).padStart(6, "0").replace(/0+$/, "");
  const shown = frac.length === 0 ? `${dollars}.00` : `${dollars}.${frac.padEnd(2, "0")}`;
  return `${sign}$${shown}`;
}

/** Cost line derived from ledger costModel + micro-USD — never invent a figure. */
export function ledgerCostLabel(costUsdMicros: number | null, costModel: CostModel): string {
  if (costModel === "subscription") {
    return "included in plan";
  }
  if (costModel !== "metered") {
    return "n/a";
  }
  if (costUsdMicros === null) {
    return "n/a";
  }
  return formatUsdMicros(costUsdMicros);
}

/** Compact cost for the run meter — same rules as ledgerCostLabel. */
export function ledgerCostCompact(costUsdMicros: number | null, costModel: CostModel): string {
  if (costModel !== "metered" || costUsdMicros === null) {
    return ledgerCostLabel(costUsdMicros, costModel);
  }
  const dollars = costUsdMicros / 1_000_000;
  if (dollars >= 0.01) {
    return `≈$${dollars.toFixed(2)}`;
  }
  return `≈$${dollars.toFixed(4).replace(/0+$/, "").replace(/\.$/, ".0")}`;
}

/** Token total from ledger fields — approximate counts are never shown as exact. */
export function ledgerTokenLabel(total: number, source: "estimated" | "provider_usage"): string {
  const approximate = source === "estimated";
  const n = total.toLocaleString("en-US");
  if (total >= 10_000) {
    const k = (total / 1000).toFixed(1).replace(/\.0$/, "");
    return approximate ? `≈${k}k` : `${k}k`;
  }
  return approximate ? `≈${n}` : n;
}

export function budgetSummaryLabel(budget: Budget): string {
  const parts = [budgetScopeLabel(budget.scope), budgetWindowLabel(budget.window), budgetActionLabel(budget.action)];
  if (budget.limitTokens !== null) {
    parts.push(`${budget.limitTokens.toLocaleString("en-US")} tok`);
  }
  if (budget.limitUsdMicros !== null) {
    parts.push(`${formatUsdMicros(budget.limitUsdMicros)} cap`);
  }
  return parts.join(" · ");
}

export function budgetStatusTitle(scope: BudgetScope, window: BudgetWindow, pct: number): string {
  return `${budgetScopeLabel(scope)}, ${budgetWindowLabel(window)} — ${Math.trunc(pct)}% used`;
}

export function providerDisplayLabel(
  providerId: string,
  configs: ReadonlyArray<{ providerId: string; label: string }>,
): string {
  const match = configs.find((config) => config.providerId === providerId);
  return match?.label ?? `unknown provider: ${providerId}`;
}
