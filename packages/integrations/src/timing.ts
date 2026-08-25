import { createHash, timingSafeEqual } from "node:crypto";

/** Compare UTF-8 strings in constant time via SHA-256 (equal-length digests). */
export function timingSafeEqualString(left: string, right: string): boolean {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}
