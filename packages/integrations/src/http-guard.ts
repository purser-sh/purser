import { timingSafeEqualString } from "./timing.ts";

export type HttpGuardPolicy = {
  allowedOrigins: string[];
  allowedHosts: string[];
};

export type GuardDecision =
  | { ok: true; kind: "browser" | "token-client" }
  | { ok: false; status: number; reason: string };

function headerValue(value: string | string[] | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export function normalizeHost(host: string): string {
  return host.trim().toLowerCase();
}

export function originAllowed(origin: string, allowedOrigins: readonly string[]): boolean {
  return allowedOrigins.some((allowed) => origin === allowed);
}

export function hostAllowed(host: string, allowedHosts: readonly string[]): boolean {
  const normalized = normalizeHost(host);
  return allowedHosts.some((allowed) => normalizeHost(allowed) === normalized);
}

export function bearerFromAuthorization(authorization: string | undefined): string | undefined {
  if (authorization === undefined) {
    return undefined;
  }
  const match = /^Bearer\s+(\S+)/i.exec(authorization.trim());
  return match?.[1];
}

/**
 * Websocket upgrade: browsers must present an allowlisted Origin and Host.
 * Non-browser clients (no Origin) must present the runner token as Bearer
 * (or `token` query) — the hello token check remains as defence in depth.
 */
export function checkWebsocketUpgrade(input: {
  origin: string | string[] | undefined;
  host: string | string[] | undefined;
  authorization: string | string[] | undefined;
  tokenQuery: string | undefined;
  runnerToken: string;
  policy: HttpGuardPolicy;
}): GuardDecision {
  const host = headerValue(input.host);
  if (host === undefined || !hostAllowed(host, input.policy.allowedHosts)) {
    return { ok: false, status: 403, reason: "host not allowed" };
  }

  const origin = headerValue(input.origin);
  if (origin !== undefined && origin.length > 0) {
    if (origin === "null" || !originAllowed(origin, input.policy.allowedOrigins)) {
      return { ok: false, status: 403, reason: "origin not allowed" };
    }
    return { ok: true, kind: "browser" };
  }

  const presented = bearerFromAuthorization(headerValue(input.authorization)) ?? input.tokenQuery;
  if (presented === undefined || !timingSafeEqualString(presented, input.runnerToken)) {
    return { ok: false, status: 403, reason: "token required for non-browser upgrade" };
  }
  return { ok: true, kind: "token-client" };
}

/**
 * Same-origin HTTP for the Vite `/__purser/config` route.
 * Rejects `Sec-Fetch-Site: cross-site`. Requires Host + Origin allowlists.
 */
export function checkSameOriginHttp(input: {
  origin: string | string[] | undefined;
  host: string | string[] | undefined;
  secFetchSite: string | string[] | undefined;
  policy: HttpGuardPolicy;
}): GuardDecision {
  const host = headerValue(input.host);
  if (host === undefined || !hostAllowed(host, input.policy.allowedHosts)) {
    return { ok: false, status: 403, reason: "host not allowed" };
  }

  const site = headerValue(input.secFetchSite)?.toLowerCase();
  if (site === "cross-site") {
    return { ok: false, status: 403, reason: "cross-site fetch" };
  }

  const origin = headerValue(input.origin);
  if (origin === undefined || origin.length === 0 || origin === "null") {
    return { ok: false, status: 403, reason: "origin required" };
  }
  if (!originAllowed(origin, input.policy.allowedOrigins)) {
    return { ok: false, status: 403, reason: "origin not allowed" };
  }
  return { ok: true, kind: "browser" };
}

/**
 * HTML/static UI served by the companion. Document navigations often omit Origin
 * (address bar / `open` / xdg-open) but send `Sec-Fetch-Site: none`.
 * curl without those headers is rejected so the injected token is not a public GET.
 */
export function checkUiHttp(input: {
  origin: string | string[] | undefined;
  host: string | string[] | undefined;
  secFetchSite: string | string[] | undefined;
  policy: HttpGuardPolicy;
}): GuardDecision {
  const host = headerValue(input.host);
  if (host === undefined || !hostAllowed(host, input.policy.allowedHosts)) {
    return { ok: false, status: 403, reason: "host not allowed" };
  }

  const site = headerValue(input.secFetchSite)?.toLowerCase();
  if (site === "cross-site") {
    return { ok: false, status: 403, reason: "cross-site fetch" };
  }

  const origin = headerValue(input.origin);
  if (origin !== undefined && origin.length > 0) {
    if (origin === "null" || !originAllowed(origin, input.policy.allowedOrigins)) {
      return { ok: false, status: 403, reason: "origin not allowed" };
    }
    return { ok: true, kind: "browser" };
  }

  if (site === "none" || site === "same-origin" || site === "same-site") {
    return { ok: true, kind: "browser" };
  }
  return { ok: false, status: 403, reason: "origin required" };
}

export const CONFIG_ROUTE_HEADERS = {
  "cache-control": "no-store",
  vary: "Origin",
  "x-content-type-options": "nosniff",
  "content-type": "application/json",
} as const;
