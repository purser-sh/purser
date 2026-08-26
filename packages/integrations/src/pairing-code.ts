/** Crockford base32 without I, L, O, U. Browser-safe (no node:crypto). */
export const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export const PAIRING_CODE_LENGTH = 8;
export const PAIRING_TTL_MS = 120_000;
export const PAIRING_MAX_ATTEMPTS_PER_CODE = 5;
export const PAIRING_MAX_ATTEMPTS_PER_SOURCE_PER_MINUTE = 20;

export function canonicalizePairingCode(raw: string): string {
  let out = "";
  for (const char of raw.trim().toUpperCase()) {
    if (char === "-" || char === " ") {
      continue;
    }
    if (char === "I" || char === "L") {
      out += "1";
      continue;
    }
    if (char === "O") {
      out += "0";
      continue;
    }
    out += char;
  }
  return out;
}

export function isCanonicalPairingCode(code: string): boolean {
  if (code.length < PAIRING_CODE_LENGTH) {
    return false;
  }
  for (const char of code) {
    if (!CROCKFORD.includes(char)) {
      return false;
    }
  }
  return true;
}

export function generatePairingCode(length = PAIRING_CODE_LENGTH): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) {
    out += CROCKFORD.charAt(byte % CROCKFORD.length);
  }
  return out;
}
