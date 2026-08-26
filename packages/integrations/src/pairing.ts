import {
  canonicalizePairingCode,
  isCanonicalPairingCode,
  PAIRING_MAX_ATTEMPTS_PER_CODE,
  PAIRING_MAX_ATTEMPTS_PER_SOURCE_PER_MINUTE,
  PAIRING_TTL_MS,
} from "./pairing-code.ts";
import { timingSafeEqualString } from "./timing.ts";

export {
  canonicalizePairingCode,
  CROCKFORD,
  generatePairingCode,
  isCanonicalPairingCode,
  PAIRING_CODE_LENGTH,
  PAIRING_MAX_ATTEMPTS_PER_CODE,
  PAIRING_MAX_ATTEMPTS_PER_SOURCE_PER_MINUTE,
  PAIRING_TTL_MS,
} from "./pairing-code.ts";

export function pairingCodesEqual(presented: string, expected: string): boolean {
  return timingSafeEqualString(canonicalizePairingCode(presented), canonicalizePairingCode(expected));
}

export type PairRole = "runner" | "phone";

export type PairingResult =
  | { ok: true; code: string; complete: boolean }
  | { ok: false; reason: string; burned: boolean };

type Room = {
  code: string;
  createdAt: number;
  attempts: number;
  runner: boolean;
  phone: boolean;
  complete: boolean;
  burned: boolean;
};

type SourceWindow = { timestamps: number[] };

export class PairingDesk {
  private readonly rooms = new Map<string, Room>();
  private readonly sources = new Map<string, SourceWindow>();
  private readonly now: () => number;
  private readonly ttlMs: number;

  constructor(now: () => number = () => Date.now(), ttlMs: number = PAIRING_TTL_MS) {
    this.now = now;
    this.ttlMs = ttlMs;
  }

  pair(rawCode: string, role: PairRole, source: string): PairingResult {
    const now = this.now();
    const code = canonicalizePairingCode(rawCode);

    if (!this.allowSource(source, now)) {
      if (isCanonicalPairingCode(code)) {
        this.burn(code);
      }
      return { ok: false, reason: "source rate limited", burned: isCanonicalPairingCode(code) };
    }

    if (!isCanonicalPairingCode(code)) {
      return { ok: false, reason: "invalid pairing code", burned: false };
    }

    const existing = this.rooms.get(code);
    if (existing !== undefined && existing.burned) {
      return { ok: false, reason: "code burned", burned: true };
    }
    if (existing !== undefined && now - existing.createdAt > this.ttlMs) {
      this.burn(code);
      return { ok: false, reason: "expired", burned: true };
    }
    if (existing !== undefined && existing.complete) {
      this.burn(code);
      return { ok: false, reason: "code already used", burned: true };
    }

    const room =
      existing ??
      ({
        code,
        createdAt: now,
        attempts: 0,
        runner: false,
        phone: false,
        complete: false,
        burned: false,
      } satisfies Room);
    if (existing === undefined) {
      this.rooms.set(code, room);
    }

    room.attempts += 1;
    if (room.attempts > PAIRING_MAX_ATTEMPTS_PER_CODE) {
      this.burn(code);
      return { ok: false, reason: "too many attempts", burned: true };
    }

    if (role === "runner") {
      room.runner = true;
    } else {
      room.phone = true;
    }

    if (room.runner && room.phone) {
      room.complete = true;
    }

    return { ok: true, code, complete: room.complete };
  }

  invalidate(rawCode: string): void {
    this.burn(canonicalizePairingCode(rawCode));
  }

  private burn(code: string): void {
    const existing = this.rooms.get(code);
    if (existing !== undefined) {
      existing.burned = true;
      existing.complete = true;
    } else {
      this.rooms.set(code, {
        code,
        createdAt: this.now(),
        attempts: PAIRING_MAX_ATTEMPTS_PER_CODE + 1,
        runner: false,
        phone: false,
        complete: true,
        burned: true,
      });
    }
  }

  private allowSource(source: string, now: number): boolean {
    const window = this.sources.get(source) ?? { timestamps: [] };
    const cutoff = now - 60_000;
    window.timestamps = window.timestamps.filter((ts) => ts > cutoff);
    if (window.timestamps.length >= PAIRING_MAX_ATTEMPTS_PER_SOURCE_PER_MINUTE) {
      this.sources.set(source, window);
      return false;
    }
    window.timestamps.push(now);
    this.sources.set(source, window);
    return true;
  }
}
