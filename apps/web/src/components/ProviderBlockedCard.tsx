import type { Remedy } from "@purser-sh/protocol";
import { useState } from "react";
import { DecisionCard, type DecisionAction } from "@/components/DecisionCard";
import { copyToClipboard } from "@/lib/paths";

/**
 * The one shape a blocked provider takes, whether it was found at startup or
 * when a run refused to start: what is wrong, and the command that fixes it.
 * Rendered once — never as a heading, a centred line, and a red line as well.
 */
export function ProviderBlockedCard(props: {
  title: string;
  fix: string;
  command: string | null;
  docsUrl: string | null;
  onRecheck?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const actions: DecisionAction[] = [];
  if (props.command !== null) {
    actions.push({
      label: copied ? "Copied" : "Copy command",
      onClick: () => {
        void copyToClipboard(props.command ?? "").then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      },
    });
  }
  if (props.onRecheck !== undefined) {
    actions.push({ label: "Re-check", onClick: props.onRecheck });
  }

  return (
    <DecisionCard actions={actions} severity="block" title={props.title}>
      <p className="text-[length:var(--text-sm)] text-foreground">{props.fix}</p>
      {props.command !== null ? (
        <pre className="mt-2 overflow-x-auto rounded-[var(--radius-control)] border border-border bg-surface-2 px-2 py-1.5 font-mono text-[length:var(--text-xs)]">
          {props.command}
        </pre>
      ) : null}
      {props.docsUrl !== null ? (
        <a
          className="mt-2 inline-block underline decoration-dotted"
          href={props.docsUrl}
          rel="noreferrer noopener"
          target="_blank"
        >
          Provider setup docs
        </a>
      ) : null}
    </DecisionCard>
  );
}

export function RemedyCard(props: { remedy: Remedy; onRecheck?: () => void }) {
  return (
    <ProviderBlockedCard
      command={props.remedy.command}
      docsUrl={props.remedy.docsUrl}
      fix={props.remedy.fix}
      onRecheck={props.onRecheck}
      title={props.remedy.title}
    />
  );
}
