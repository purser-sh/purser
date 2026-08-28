import type { CostModel } from "@purser-sh/protocol";
import { ledgerCostCompact, ledgerTokenLabel } from "@purser-sh/protocol";

/** Compact token display for the run meter — derived from ledger source. */
export function formatTokenCompact(count: number, source: "estimated" | "provider_usage"): string {
  return ledgerTokenLabel(count, source);
}

export function formatCostCompact(micros: number | null, costModel: CostModel): string {
  return ledgerCostCompact(micros, costModel);
}
