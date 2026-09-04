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
  primary?: boolean;
}) {
  const lines = useMemo(() => props.patch.replace(/\n$/, "").split("\n"), [props.patch]);
  const [expanded, setExpanded] = useState(lines.length <= HUNK_COLLAPSE);
  const hidden = Math.max(0, lines.length - HUNK_COLLAPSE);
  const visible = expanded ? lines : lines.slice(0, HUNK_COLLAPSE);

  return (
    <div
      className={cn(
        "w-full",
        props.primary && "rounded-[var(--radius-card)] ring-2 ring-accent ring-offset-2 ring-offset-background",
      )}
      ref={props.cardRef}
    >
      <div
        className={cn(
          "rounded-[var(--radius-card)] border bg-card",
          props.primary ? "border-accent shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent)_35%,transparent)]" : "border-border",
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
          <div className="min-w-0">
            {props.primary ? (
              <p className="mb-0.5 text-[length:var(--text-2xs)] label-caps text-accent">Needs your approval</p>
            ) : null}
            <span className="block min-w-0 truncate font-mono text-[length:var(--text-xs)] text-foreground" title={props.path}>
              {truncatePathFromLeft(props.path, 56)}
            </span>
          </div>
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
  if (isShellDetail(props.detail)) {
    return (
      <ShellDecisionCard
        cardRef={props.cardRef}
        detail={props.detail}
        onAllow={props.onAllow}
        onDeny={props.onDeny}
      />
    );
  }
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

type ShellDetail = {
  kind: "shell";
  command: string;
  severity: "read_only" | "mutating" | "network";
  effect: string;
  undoAvailable?: boolean;
  undoNote?: string;
};

function isShellDetail(detail: unknown): detail is ShellDetail {
  return (
    detail !== null &&
    typeof detail === "object" &&
    !Array.isArray(detail) &&
    (detail as { kind?: unknown }).kind === "shell"
  );
}

function shellTitle(detail: ShellDetail): string {
  if (detail.severity === "read_only") {
    return "Allow run_bash?";
  }
  if (detail.severity === "network") {
    return "run_bash will contact the network";
  }
  return "run_bash will modify your workspace";
}

function shellSeverity(detail: ShellDetail): "info" | "warn" | "block" {
  if (detail.severity === "read_only") {
    return "info";
  }
  if (detail.severity === "network") {
    return "warn";
  }
  return "block";
}

export function ShellDecisionCard(props: {
  detail: ShellDetail;
  onAllow: () => void;
  onDeny: () => void;
  cardRef?: (node: HTMLDivElement | null) => void;
}) {
  return (
    <div ref={props.cardRef}>
      <DecisionCard
        actions={[
          { label: "Deny", onClick: props.onDeny, variant: "outline" },
          { label: "Allow", onClick: props.onAllow, variant: props.detail.severity === "read_only" ? "pass" : "destructive" },
        ]}
        severity={shellSeverity(props.detail)}
        title={shellTitle(props.detail)}
      >
        <div className="space-y-2">
          <pre className="overflow-x-auto rounded-[var(--radius-control)] border border-border bg-surface-2 p-2 font-mono whitespace-pre-wrap">
            {props.detail.command}
          </pre>
          <p>{props.detail.effect}</p>
          {props.detail.undoNote ? <p className="text-muted-foreground">{props.detail.undoNote}</p> : null}
        </div>
      </DecisionCard>
    </div>
  );
}

export function DocumentDecisionCard(props: {
  path: string;
  format: string;
  tokenCount: number;
  tokenSource: "exact" | "approximate";
  threshold: number;
  costLabel: string | null;
  onAddAll: () => void;
  onAddPartial: () => void;
  onCancel: () => void;
  cardRef?: (node: HTMLDivElement | null) => void;
}) {
  const tokenLabel = props.tokenSource === "exact" ? `${props.tokenCount.toLocaleString()} tokens` : `≈${props.tokenCount.toLocaleString()} tokens`;
  const cost = props.costLabel !== null ? ` That is approximately ${props.costLabel} at the current model's input rate.` : "";
  const fileName = props.path.split("/").pop() ?? props.path;
  return (
    <div ref={props.cardRef}>
      <DecisionCard
        actions={[
          { label: "Cancel", onClick: props.onCancel, variant: "outline" },
          { label: `Add first ${props.threshold.toLocaleString()} tokens`, onClick: props.onAddPartial, variant: "outline" },
          { label: "Add all", onClick: props.onAddAll, variant: "pass" },
        ]}
        severity="warn"
        title={`${fileName} converts to ${tokenLabel}`}
      >
        {`${fileName} (${props.format}) converts to ${tokenLabel}.${cost} Add it to the conversation, add only the first ${props.threshold.toLocaleString()} tokens, or cancel.`}
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
