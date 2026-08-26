import type { TokenCount } from "@agentdeck/pricing";
import { formatTokenCount, tokenCountTooltip } from "@agentdeck/pricing";

/** Renders a TokenCount only — passing a bare number is a TypeScript error. */
export function TokenCountLabel({
  count,
  className,
}: {
  count: TokenCount;
  className?: string;
}) {
  return (
    <span className={className} title={tokenCountTooltip(count)}>
      {formatTokenCount(count)}
    </span>
  );
}
