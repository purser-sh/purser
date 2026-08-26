/** Compact token display for the run meter. */
export function formatTokenCompact(count: number, approximate: boolean): string {
  const n = count.toLocaleString("en-US");
  if (count >= 10_000) {
    const k = (count / 1000).toFixed(1).replace(/\.0$/, "");
    return approximate ? `≈${k}k` : `${k}k`;
  }
  return approximate ? `≈${n}` : n;
}

export function formatCostCompact(micros: number | null, metered: boolean): string {
  if (!metered || micros === null) {
    return "n/a";
  }
  const dollars = micros / 1_000_000;
  if (dollars >= 0.01) {
    return `≈$${dollars.toFixed(2)}`;
  }
  return `≈$${dollars.toFixed(4).replace(/0+$/, "").replace(/\.$/, ".0")}`;
}
