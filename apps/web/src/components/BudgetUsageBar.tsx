import type { Budget, SpendSummary } from "@purser-sh/protocol";
import { ledgerTokenLabel } from "@purser-sh/protocol";
import { cn } from "@/lib/utils";

function barClass(pct: number): string {
  if (pct >= 100) {
    return "bg-block";
  }
  if (pct >= 75) {
    return "bg-warn";
  }
  return "bg-pass";
}

function pickDayTokenBudget(budgets: Budget[], workspaceId: string | null): Budget | undefined {
  const enabled = budgets.filter((budget) => budget.enabled && budget.window === "day" && budget.limitTokens !== null);
  const workspace = enabled.find((budget) => budget.scope === "workspace" && budget.scopeId === workspaceId);
  if (workspace !== undefined) {
    return workspace;
  }
  return enabled.find((budget) => budget.scope === "global");
}

export function BudgetUsageBar(props: {
  budgets: Budget[];
  spendSummary: SpendSummary;
  workspaceId: string | null;
  className?: string;
}) {
  const budget = pickDayTokenBudget(props.budgets, props.workspaceId);
  if (budget === undefined || budget.limitTokens === null) {
    return null;
  }
  const spent = props.spendSummary.today.tokens;
  const limit = budget.limitTokens;
  const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;

  return (
    <div className={cn("space-y-1", props.className)}>
      <div className="flex items-center justify-between gap-2 text-[length:var(--text-xs)]">
        <span className="text-muted-foreground">Daily token budget</span>
        <span className="tabular-nums text-foreground">
          {ledgerTokenLabel(spent, "provider_usage")} of {ledgerTokenLabel(limit, "provider_usage")} tokens today
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-border">
        <div className={cn("h-full motion-safe:transition-all", barClass(pct))} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[length:var(--text-2xs)] text-muted-foreground">
        Subscription and local providers count tokens only — never dollars.
      </p>
    </div>
  );
}
