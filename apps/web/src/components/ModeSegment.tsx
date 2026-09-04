import type { PermissionMode } from "@purser-sh/protocol";
import { PERMISSION_MODES } from "@/lib/store";
import { cn } from "@/lib/utils";

export function ModeSegment(props: {
  value: PermissionMode;
  bypassCountdown: string | null;
  onChange: (mode: PermissionMode) => void;
}) {
  return (
    <div
      className="inline-flex rounded-[var(--radius-control)] border border-border bg-surface-2 p-0.5"
      role="group"
      aria-label="Permission mode"
    >
      {PERMISSION_MODES.map((mode) => {
        const active = props.value === mode.id;
        const isBypass = mode.id === "bypass";
        return (
          <button
            className={cn(
              "rounded-[calc(var(--radius-control)-2px)] px-2 py-1 text-[length:var(--text-xs)] transition-colors",
              active && !isBypass && "bg-accent text-on-accent",
              active && isBypass && "bg-warn-soft text-warn",
              !active && "text-muted-foreground hover:text-foreground",
            )}
            key={mode.id}
            onClick={() => props.onChange(mode.id)}
            type="button"
          >
            {mode.label}
            {active && isBypass && props.bypassCountdown ? (
              <span className="ml-1 tabular-nums text-[length:var(--text-2xs)]">· {props.bypassCountdown}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
