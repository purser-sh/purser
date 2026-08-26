import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Dialog(props: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  if (!props.open) {
    return null;
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4">
      <div className={cn("w-full max-w-lg rounded-[var(--radius-card)] border border-border bg-card p-4", props.className)}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{props.title}</h2>
          <button className="text-muted-foreground hover:text-foreground" onClick={props.onClose} type="button">
            Close
          </button>
        </div>
        {props.children}
      </div>
    </div>
  );
}
