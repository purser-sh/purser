import type { ProviderHealthPayload } from "@purser-sh/protocol";
import { useEffect } from "react";
import { useRunner } from "@/lib/client";
import { useDeckStore } from "@/lib/store";

/**
 * Asks the runner about every provider as soon as the socket is up, so the
 * selector knows what works on this machine before the user types anything.
 */
export function useProviderReadiness(): void {
  const client = useRunner();
  const connection = useDeckStore((state) => state.connection);
  const providerConfigs = useDeckStore((state) => state.providerConfigs);
  const providerIds = providerConfigs.map((config) => config.providerId).join(",");

  useEffect(() => {
    if (connection !== "ready" || providerIds.length === 0) {
      return;
    }
    for (const providerId of providerIds.split(",")) {
      void client.request("check_provider_health", { providerId }).catch(() => {
        // A failed probe leaves the provider unknown, which the UI treats as selectable.
      });
    }
  }, [client, connection, providerIds]);
}

export function useRecheckProvider(): (providerId: string) => void {
  const client = useRunner();
  return (providerId: string) => {
    void client.request("check_provider_health", { providerId }).catch(() => undefined);
  };
}

/**
 * Unknown is not the same as broken: until a probe answers, or when it could
 * not decide, the provider stays selectable rather than being blocked on a guess.
 */
export function isBlocked(health: ProviderHealthPayload | undefined): boolean {
  return health !== undefined && !health.ok && health.state !== "unknown";
}

export function shortReason(health: ProviderHealthPayload): string {
  if (health.state === "cli_missing" || health.state === "package_missing") {
    return "not installed";
  }
  if (health.state === "not_authenticated") {
    return "not logged in";
  }
  if (health.state === "api_key_missing") {
    return "no API key";
  }
  if (health.state === "unreachable") {
    return "not reachable";
  }
  return "not ready";
}
