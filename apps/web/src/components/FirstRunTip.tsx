import { Info, X } from "lucide-react";
import { useState } from "react";

const STORAGE_KEY = "purser-first-run-tip";

export function FirstRunTip() {
  const [open, setOpen] = useState(() => localStorage.getItem(STORAGE_KEY) !== "dismissed");

  if (!open) {
    return null;
  }

  return (
    <div className="border-b border-info/30 bg-info-soft px-4 py-2 text-[length:var(--text-2xs)] text-info">
      <div className="mx-auto flex max-w-3xl items-start gap-2">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p className="flex-1">
          Token counts here are estimates, not a bill. We only show dollars when we can price the API. We never make up a $0.00. Hover the meter in the top bar if you want the details.
        </p>
        <button
          aria-label="Dismiss tip"
          className="shrink-0 text-info/80 hover:text-info"
          onClick={() => {
            localStorage.setItem(STORAGE_KEY, "dismissed");
            setOpen(false);
          }}
          type="button"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
