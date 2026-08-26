import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type DecisionSeverity = "pass" | "block" | "info" | "warn";

const severityStyles: Record<DecisionSeverity, string> = {
  pass: "border-l-pass bg-pass-soft/30 border-pass/30",
  block: "border-l-block bg-block-soft/30 border-block/30",
  info: "border-l-info bg-info-soft/30 border-info/30",
  warn: "border-l-warn bg-warn-soft/30 border-warn/30",
};

export type DecisionAction = {
  label: string;
  onClick: () => void;
  variant?: "outline" | "pass" | "destructive" | "default";
};

export function DecisionCard(props: {
  severity: DecisionSeverity;
  title: string;
  children?: ReactNode;
  actions: DecisionAction[];
  className?: string;
  cardRef?: (node: HTMLDivElement | null) => void;
}) {
  return (
    <div
      className={cn(
        "w-full rounded-[var(--radius-card)] border border-border border-l-4 p-3 text-[length:var(--text-sm)]",
        severityStyles[props.severity],
        props.className,
      )}
      ref={props.cardRef}
    >
      <p className="font-medium text-foreground">{props.title}</p>
      {props.children ? <div className="mt-2 text-[length:var(--text-xs)] text-text-2">{props.children}</div> : null}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {props.actions.map((action) => (
          <Button key={action.label} onClick={action.onClick} size="sm" type="button" variant={action.variant ?? "outline"}>
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
