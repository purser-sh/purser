/** Format integer micro-USD as a dollar string without floats. */
export function formatUsdMicros(micros: number): string {
  const sign = micros < 0 ? "-" : "";
  const abs = Math.abs(micros);
  const dollars = Math.trunc(abs / 1_000_000);
  const rest = abs % 1_000_000;
  const frac = String(rest).padStart(6, "0").replace(/0+$/, "");
  const shown = frac.length === 0 ? `${dollars}.00` : `${dollars}.${frac.padEnd(2, "0")}`;
  return `${sign}$${shown}`;
}

/** Parse a decimal USD string into micro-USD. Returns null if invalid. */
export function parseUsdToMicros(decimal: string): number | null {
  const trimmed = decimal.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const negative = trimmed.startsWith("-");
  const raw = negative ? trimmed.slice(1) : trimmed;
  const parts = raw.split(".");
  const wholePart = parts[0];
  const fracPart = parts[1] ?? "";
  if (parts.length > 2 || wholePart === undefined || !/^\d+$/.test(wholePart) || !/^\d*$/.test(fracPart)) {
    return null;
  }
  const frac = `${fracPart}000000`.slice(0, 6);
  const micros = Number(wholePart) * 1_000_000 + Number(frac);
  return negative ? -micros : micros;
}

