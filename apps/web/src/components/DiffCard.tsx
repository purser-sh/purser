import { useMemo, useState } from "react";
import { DecisionCard } from "@/components/DecisionCard";
import { Button } from "@/components/ui/button";
import { truncatePathFromLeft } from "@/lib/paths";
import { cn } from "@/lib/utils";

const HUNK_COLLAPSE = 40;

function DiffLine({ line }: { line: string }) {
  const tone =
    line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")
      ? "text-muted-foreground"
      : line.startsWith("+")
        ? "border-l-2 border-pass bg-pass-soft text-pass"
        : line.startsWith("-")
          ? "border-l-2 border-block bg-block-soft text-block"
          : "text-text-2";
  const gutter = line.startsWith("+") || line.startsWith("-") ? line[0] : " ";
  const body = line.startsWith("+") || line.startsWith("-") ? line.slice(1) : line;
  return (
    <div className={cn("flex font-mono text-[length:var(--text-xs)] leading-5", tone)}>
      <span className="w-4 shrink-0 select-none text-muted-foreground">{gutter}</span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-all">{body.length === 0 ? " " : body}</span>
    </div>
  );
}

export function DiffCard(props: {
  path: string;
  added: number;
  removed: number;
  patch: string;
  onApprove: () => void;
  onReject: () => void;
  cardRef?: (node: HTMLDivElement | null) => void;
}) {
  const lines = useMemo(() => props.patch.replace(/\n$/, "").split("\n"), [props.patch]);
  const [expanded, setExpanded] = useState(lines.length <= HUNK_COLLAPSE);
  const hidden = Math.max(0, lines.length - HUNK_COLLAPSE);
  const visible = expanded ? lines : lines.slice(0, HUNK_COLLAPSE);

  return (
    <div className="w-full" ref={props.cardRef}>
      <div className="rounded-[var(--radius-card)] border border-border bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
          <span className="min-w-0 truncate font-mono text-[length:var(--text-xs)] text-foreground" title={props.path}>
            {truncatePathFromLeft(props.path, 56)}
          </span>
          <span className="shrink-0 font-mono tabular-nums text-[length:var(--text-xs)]">
            <span className="text-pass">+{props.added}</span>
            {" / "}
            <span className="text-block">−{props.removed}</span>
          </span>
        </div>
        <pre className="max-h-[min(60vh,28rem)] overflow-auto bg-surface-2 p-2">
          {visible.map((line, index) => (
            <DiffLine key={`${index}:${line}`} line={line} />
          ))}
        </pre>
        {!expanded && hidden > 0 ? (
          <div className="border-t border-border px-3 py-2">
            <Button onClick={() => setExpanded(true)} size="sm" type="button" variant="ghost">
              Show {hidden} more lines
            </Button>
          </div>
        ) : null}
        <div className="flex justify-end gap-2 border-t border-border px-3 py-2">
          <Button onClick={props.onReject} size="sm" type="button" variant="outline">
            Reject
          </Button>
          <Button onClick={props.onApprove} size="sm" type="button" variant="pass">
            Approve
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PermissionDecisionCard(props: {
  action: string;
  detail: unknown;
  onAllow: () => void;
  onDeny: () => void;
  cardRef?: (node: HTMLDivElement | null) => void;
}) {
  const body =
    typeof props.detail === "string"
      ? props.detail
      : JSON.stringify(props.detail, null, 2);

  return (
    <div ref={props.cardRef}>
      <DecisionCard
        actions={[
          { label: "Deny", onClick: props.onDeny, variant: "outline" },
          { label: "Allow", onClick: props.onAllow, variant: "pass" },
        ]}
        severity="info"
        title={`Allow ${props.action}?`}
      >
        <pre className="overflow-x-auto font-mono whitespace-pre-wrap">{body}</pre>
      </DecisionCard>
    </div>
  );
}

export function BudgetDecisionCard(props: {
  title: string;
  detail: string;
  onStop: () => void;
  onAllowHeadroom: () => void;
  onAllowOnce: () => void;
  cardRef?: (node: HTMLDivElement | null) => void;
}) {
  return (
    <div ref={props.cardRef}>
      <DecisionCard
        actions={[
          { label: "Stop", onClick: props.onStop, variant: "outline" },
          { label: "Allow +$1", onClick: props.onAllowHeadroom, variant: "outline" },
          { label: "Allow once", onClick: props.onAllowOnce, variant: "pass" },
        ]}
        severity="warn"
        title={props.title}
      >
        {props.detail}
      </DecisionCard>
    </div>
  );
}
