/** Parse a decimal USD string into integer micro-USD. No floats. */
export function usdToMicros(decimal: string): number {
  const trimmed = decimal.trim();
  const negative = trimmed.startsWith("-");
  const raw = negative ? trimmed.slice(1) : trimmed;
  const parts = raw.split(".");
  const wholePart = parts[0];
  const fracPart = parts[1] ?? "";
  if (parts.length > 2 || wholePart === undefined || !/^\d+$/.test(wholePart) || !/^\d*$/.test(fracPart)) {
    throw new Error(`not a decimal USD amount: ${decimal}`);
  }
  const frac = `${fracPart}000000`.slice(0, 6);
  const micros = Number(wholePart) * 1_000_000 + Number(frac);
  return negative ? -micros : micros;
}

/** tokens * (USD per million tokens) → micro-USD, truncating toward zero. */
export function tokensToUsdMicros(tokens: number, usdPerMTok: string): number {
  const microsPerM = usdToMicros(usdPerMTok);
  return Math.trunc((tokens * microsPerM) / 1_000_000);
}
