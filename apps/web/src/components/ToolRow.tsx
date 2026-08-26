import type { AgentEvent } from "@purser-sh/protocol";
import { Check, ChevronRight, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

function formatUnknown(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function ToolRow(props: {
  call?: Extract<AgentEvent, { kind: "tool_call" }>;
  result?: Extract<AgentEvent, { kind: "tool_result" }>;
}) {
  const [open, setOpen] = useState(false);
  const name = props.call?.name ?? props.result?.toolId ?? "tool";
  const summary = props.call?.summary ?? "";
  const ok = props.result?.ok;
  const ms = props.result?.ms;

  return (
    <div className="w-full font-mono text-[length:var(--text-xs)] text-muted-foreground">
      <button
        className="flex w-full items-center gap-2 rounded-[var(--radius-control)] px-1 py-1 text-left hover:bg-surface-2"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <ChevronRight className={cn("h-3 w-3 shrink-0 transition-transform", open ? "rotate-90" : "")} />
        <span className="text-foreground">{name}</span>
        {summary.length > 0 ? <span className="truncate">{summary}</span> : null}
        {ms !== undefined ? <span className="ml-auto tabular-nums">{ms}ms</span> : null}
        {ok !== undefined ? (
          ok ? (
            <Check className="h-3 w-3 shrink-0 text-pass" />
          ) : (
            <X className="h-3 w-3 shrink-0 text-block" />
          )
        ) : null}
      </button>
      {open ? (
        <pre className="mt-1 overflow-x-auto rounded-[var(--radius-control)] bg-surface-2 p-2 text-[length:var(--text-2xs)] text-text-2">
          {props.call ? formatUnknown(props.call.input) : null}
          {props.result ? `\n${formatUnknown(props.result.output)}` : null}
        </pre>
      ) : null}
    </div>
  );
}

export function ThinkingRow(props: { text: string; durationSec?: number }) {
  const label = props.durationSec !== undefined ? `thought for ${props.durationSec}s` : "thinking";
  return (
    <details className="text-[length:var(--text-xs)] text-muted-foreground">
      <summary className="cursor-pointer">{label}</summary>
      <p className="mt-1 whitespace-pre-wrap text-text-2">{props.text}</p>
    </details>
  );
}
