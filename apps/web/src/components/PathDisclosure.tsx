import { Copy } from "lucide-react";
import { copyToClipboard, truncatePathFromLeft } from "@/lib/paths";
import { useToastStore } from "@/lib/toast";

export function PathDisclosure(props: { path: string; label?: string; maxLen?: number }) {
  const pushToast = useToastStore((state) => state.push);
  const shown = truncatePathFromLeft(props.path, props.maxLen ?? 40);

  return (
    <div className="flex items-center gap-2">
      {props.label ? (
        <span className="shrink-0 text-[length:var(--text-2xs)] text-muted-foreground">{props.label}</span>
      ) : null}
      <details className="min-w-0 flex-1">
        <summary
          className="cursor-pointer truncate font-mono text-[length:var(--text-2xs)] text-muted-foreground marker:content-none [&::-webkit-details-marker]:hidden"
          title={props.path}
        >
          {shown}
        </summary>
        <p className="mt-1 break-all font-mono text-[length:var(--text-2xs)] text-text-2">{props.path}</p>
      </details>
      <button
        aria-label="Copy path"
        className="shrink-0 text-muted-foreground hover:text-foreground"
        onClick={() => {
          void copyToClipboard(props.path).then((ok) => {
            if (ok) {
              pushToast("Path copied");
            }
          });
        }}
        type="button"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
