import type { ProviderHealthPayload } from "@purser-sh/protocol";
import type { AdapterConfig, AgentAdapter } from "@purser-sh/adapters";

/**
 * Readiness is asked for on every startup and again before every run, so the
 * answer is cached briefly. Long enough to keep a send from re-probing the
 * network, short enough that logging in and re-checking works.
 */
const TTL_MS = 15_000;

type CacheEntry = { at: number; payload: ProviderHealthPayload };

const cache = new Map<string, CacheEntry>();

export async function providerReadiness(
  adapter: AgentAdapter,
  config: AdapterConfig,
  options: { fresh?: boolean; now?: number } = {},
): Promise<ProviderHealthPayload> {
  const now = options.now ?? Date.now();
  const cached = cache.get(adapter.id);
  if (options.fresh !== true && cached !== undefined && now - cached.at < TTL_MS) {
    return cached.payload;
  }
  const health = await adapter.checkHealth(config);
  const payload: ProviderHealthPayload = {
    providerId: adapter.id,
    ok: health.ok,
    detail: health.detail,
    state: health.state,
    remedy: health.remedy,
  };
  cache.set(adapter.id, { at: now, payload });
  return payload;
}

export function forgetProviderReadiness(providerId?: string): void {
  if (providerId === undefined) {
    cache.clear();
    return;
  }
  cache.delete(providerId);
}

export function unavailableProvider(providerId: string): ProviderHealthPayload {
  return {
    providerId,
    ok: false,
    detail: `Purser has no adapter for ${providerId}.`,
    state: "unknown",
    remedy: null,
  };
}
