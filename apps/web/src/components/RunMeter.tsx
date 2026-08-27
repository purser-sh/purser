import type { BudgetStatus, CostModel, SpendSummary, SpendUpdatePayload } from "@purser-sh/protocol";
import { Sparkles } from "lucide-react";
import { TokenCountLabel } from "@/components/TokenCountLabel";
import { Button } from "@/components/ui/button";
import type { PromptEstimate } from "@purser-sh/prompt-coach";
import { formatCostCompact, formatTokenCompact } from "@/lib/format-tokens";
import { formatUsdMicros } from "@/lib/money";
import { cn } from "@/lib/utils";

function tightestBudget(budgets: BudgetStatus[] | undefined): BudgetStatus | undefined {
  return budgets?.reduce<BudgetStatus | undefined>(
    (best, item) => (best === undefined || item.pct >= best.pct ? item : best),
    undefined,
  );
}

function budgetBarClass(pct: number): string {
  if (pct >= 100) {
    return "bg-block";
  }
  if (pct >= 80) {
    return "bg-warn";
  }
  return "bg-pass";
}

function meterTooltip(spend: SpendUpdatePayload | undefined): string {
  if (spend === undefined) {
    return "Send a run to see live token counts.";
  }
  const src = spend.source === "estimated" ? "approximate (estimated)" : "from provider usage";
  return `${spend.tokens.input + spend.tokens.output} tokens (${src}). Cost only shows up for providers we can price.`;
}

type CompactProps = {
  variant: "compact";
  spend?: SpendUpdatePayload;
  costModel: CostModel;
  running: boolean;
  onClick?: () => void;
};

type FullProps = {
  variant: "full";
  spend?: SpendUpdatePayload;
  spendSummary: SpendSummary;
  costModel: CostModel;
  providerRows: { key: string; tokens: number; costUsdMicros: number | null }[];
  sessionRows: { key: string; tokens: number; costUsdMicros: number | null; isOthers?: boolean }[];
  estimate?: PromptEstimate | null;
  onUseShorter?: () => void;
};

export function RunMeter(props: CompactProps | FullProps) {
  if (props.variant === "compact") {
    return <RunMeterCompact {...props} />;
  }
  return <RunMeterFull {...props} />;
}

function RunMeterCompact(props: CompactProps) {
  const tokens = props.spend ? props.spend.tokens.input + props.spend.tokens.output : 0;
  const approximate = props.spend?.source === "estimated";
  const metered = props.costModel === "metered";
  const cost = props.spend?.costUsdMicros ?? null;
  const tightest = tightestBudget(props.spend?.budgets);
  const pct = tightest !== undefined ? Math.min(100, Math.trunc(tightest.pct)) : 0;
  const idle = !props.running && props.spend === undefined;

  const inner = (
    <>
      <span
        aria-hidden
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          props.running ? "animate-pulse bg-warn" : idle ? "bg-muted-foreground/40" : "bg-pass",
        )}
      />
      <span className="tabular-nums text-[length:var(--text-xs)] text-foreground">
        {props.spend !== undefined ? `${formatTokenCompact(tokens, approximate)} tok` : "not yet"}
      </span>
      <span className="tabular-nums text-[length:var(--text-xs)] text-muted-foreground">
        {formatCostCompact(cost, metered)}
      </span>
      {tightest !== undefined ? (
        <span className="flex min-w-[4rem] flex-1 items-center gap-1">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
            <span className={cn("block h-full motion-safe:transition-all", budgetBarClass(pct))} style={{ width: `${pct}%` }} />
          </span>
          <span className="tabular-nums text-[length:var(--text-2xs)] text-muted-foreground">{pct}%</span>
        </span>
      ) : null}
    </>
  );

  const className =
    "flex min-w-0 max-w-md items-center gap-2 rounded-[var(--radius-control)] border border-border px-2 py-1";

  if (props.onClick) {
    return (
      <button className={cn(className, "hover:bg-surface-2")} onClick={props.onClick} title={meterTooltip(props.spend)} type="button">
        {inner}
      </button>
    );
  }

  return (
    <div className={className} title={meterTooltip(props.spend)}>
      {inner}
    </div>
  );
}

function RunMeterFull(props: FullProps) {
  const runTokens = props.spend ? props.spend.tokens.input + props.spend.tokens.output : 0;
  const approximate = props.spend?.source === "estimated";
  const metered = props.costModel === "metered";
  const runCost = props.spend?.costUsdMicros ?? null;
  const tightest = tightestBudget(props.spend?.budgets);

  const rows = [
    {
      label: "This run",
      tokens: runTokens,
      cost: metered ? runCost : null,
      approximate,
    },
    {
      label: "Today",
      tokens: props.spendSummary.today.tokens,
      cost: metered ? props.spendSummary.today.costUsdMicros : null,
      approximate: false,
    },
    {
      label: "This month",
      tokens: props.spendSummary.month.tokens,
      cost: metered ? props.spendSummary.month.costUsdMicros : null,
      approximate: false,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {rows.map((row) => (
          <div className="flex items-center justify-between gap-3 text-[length:var(--text-sm)]" key={row.label}>
            <span className="text-muted-foreground">{row.label}</span>
            <span className="tabular-nums text-foreground">
              {row.approximate ? "≈" : ""}
              {row.tokens.toLocaleString("en-US")} tok, {row.cost !== null ? formatUsdMicros(row.cost) : "n/a"}
            </span>
          </div>
        ))}
        {tightest !== undefined ? (
          <div className="h-1.5 overflow-hidden rounded-full bg-border">
            <div
              className={cn("h-full motion-safe:transition-all", budgetBarClass(Math.trunc(tightest.pct)))}
              style={{ width: `${Math.min(100, Math.trunc(tightest.pct))}%` }}
            />
          </div>
        ) : null}
      </div>

      {props.providerRows.length > 0 ? (
        <section>
          <h4 className="mb-2 text-[length:var(--text-2xs)] label-caps text-muted-foreground">By provider</h4>
          <div className="space-y-1">
            {props.providerRows.map((row) => (
              <div className="flex justify-between gap-2 tabular-nums text-[length:var(--text-xs)]" key={row.key}>
                <span className="truncate text-text-2">{row.key}</span>
                <span className="shrink-0 text-foreground">
                  {row.tokens.toLocaleString("en-US")} tok, {row.costUsdMicros !== null ? formatUsdMicros(row.costUsdMicros) : "n/a"}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {props.sessionRows.length > 0 ? (
        <section>
          <h4 className="mb-2 text-[length:var(--text-2xs)] label-caps text-muted-foreground">By session</h4>
          <div className="space-y-1">
            {props.sessionRows.map((row) => (
              <div className="flex justify-between gap-2 tabular-nums text-[length:var(--text-xs)]" key={row.key}>
                <span className={cn("truncate text-text-2", row.isOthers ? "italic text-muted-foreground" : "")}>
                  {row.key}
                </span>
                <span className="shrink-0 text-foreground">
                  {row.tokens.toLocaleString("en-US")} tok, {row.costUsdMicros !== null ? formatUsdMicros(row.costUsdMicros) : "n/a"}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {props.spendSummary.catalogStale ? (
        <p className="text-[length:var(--text-xs)] text-warn">Pricing catalog asOf is older than 90 days.</p>
      ) : null}
      {props.spendSummary.unpricedModels.length > 0 ? (
        <p className="text-[length:var(--text-xs)] text-muted-foreground">
          Unpriced models: {props.spendSummary.unpricedModels.join(", ")}
        </p>
      ) : null}

      {props.estimate !== undefined && props.estimate !== null ? (
        <div className="rounded-[var(--radius-control)] border border-border bg-surface-2 p-2 text-[length:var(--text-xs)] text-muted-foreground">
          <p>
            Prompt coach: <TokenCountLabel className="text-foreground" count={props.estimate.tokens} /> tokens for this
            prompt only
            {props.estimate.savedTokens > 0 ? (
              <>
                {" "}
                → <TokenCountLabel className="text-pass" count={props.estimate.compactTokens} /> if shortened
              </>
            ) : null}
          </p>
          {props.estimate.savedTokens > 0 && props.onUseShorter ? (
            <Button className="mt-2 h-7" onClick={props.onUseShorter} size="sm" type="button" variant="outline">
              <Sparkles className="h-3 w-3" />
              Use shorter prompt
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
