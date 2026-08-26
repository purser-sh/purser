import { cn } from "@/lib/utils";
import { useToastStore } from "@/lib/toast";

export function ToastHost() {
  const items = useToastStore((state) => state.items);
  const dismiss = useToastStore((state) => state.dismiss);
  if (items.length === 0) {
    return null;
  }
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
      {items.map((item) => (
        <div
          className={cn(
            "pointer-events-auto rounded-[var(--radius-control)] border px-3 py-2 text-[length:var(--text-sm)] shadow-none",
            item.outcome === "pass"
              ? "border-pass/40 bg-pass-soft text-pass"
              : "border-block/40 bg-block-soft text-block",
          )}
          key={item.id}
          role="status"
        >
          <button className="text-left" onClick={() => dismiss(item.id)} type="button">
            {item.message}
          </button>
        </div>
      ))}
    </div>
  );
}
