import type { AgentAdapter, AdapterConfig, HealthResult } from "../types.ts";
import type { CostModel } from "@purser-sh/protocol";
import { runToolLoop } from "./loop.ts";
import {
  apiKeyMissing,
  apiKeyRejected,
  API_KEY_ENV_VARS,
  blocked,
  blockedRunEvents,
  endpointRefused,
  endpointUnreachable,
  ollamaUnreachable,
  ready,
} from "../readiness.ts";

async function fetchModels(baseUrl: string, apiKey: string | null): Promise<{ id: string; label: string }[]> {
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
    headers,
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) {
    return [{ id: "default", label: "default" }];
  }
  const body = (await response.json()) as { data?: Array<{ id?: string }> };
  return (body.data ?? [])
    .map((model) => model.id)
    .filter((id): id is string => typeof id === "string")
    .map((id) => ({ id, label: id }));
}

/** Local endpoints authenticate by being local; the hosted ones need a key. */
function keyRequired(providerId: string): boolean {
  return providerId !== "ollama" && providerId !== "echo";
}

function keyReadiness(providerId: string, label: string, apiKey: string | null): HealthResult | null {
  if (!keyRequired(providerId) || (apiKey !== null && apiKey.length > 0)) {
    return null;
  }
  return blocked("api_key_missing", apiKeyMissing(label, API_KEY_ENV_VARS[providerId] ?? null));
}

async function probeEndpoint(
  providerId: string,
  label: string,
  baseUrl: string,
  apiKey: string | null,
): Promise<HealthResult> {
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
      headers,
      signal: AbortSignal.timeout(2000),
    });
    if (response.status === 401 || response.status === 403) {
      return blocked("api_key_missing", apiKeyRejected(label));
    }
    if (!response.ok) {
      return blocked("unreachable", endpointRefused(label, response.status));
    }
    return ready(`${label} answered at ${baseUrl}.`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "no response";
    if (providerId === "ollama") {
      return blocked("unreachable", ollamaUnreachable(baseUrl));
    }
    return blocked("unreachable", endpointUnreachable(label, baseUrl, detail));
  }
}

export function createGenericLlmAdapter(input: {
  id: string;
  label: string;
  defaultBaseUrl: string;
  allowFiles: boolean;
  costModel: CostModel;
}): AgentAdapter {
  return {
    id: input.id,
    label: input.label,
    kind: "api",
    costModel: input.costModel,
    async checkHealth(config?: AdapterConfig) {
      const baseUrl = config?.baseUrl ?? input.defaultBaseUrl;
      const missingKey = keyReadiness(input.id, input.label, config?.apiKey ?? null);
      if (missingKey !== null) {
        return missingKey;
      }
      return probeEndpoint(input.id, input.label, baseUrl, config?.apiKey ?? null);
    },
    async listModels(config?: AdapterConfig) {
      try {
        const models = await fetchModels(config?.baseUrl ?? input.defaultBaseUrl, config?.apiKey ?? null);
        return models.length > 0 ? models : [{ id: "default", label: "default" }];
      } catch {
        return [{ id: "default", label: "default" }];
      }
    },
    async *run(runInput) {
      const config = {
        baseUrl: runInput.config?.baseUrl ?? input.defaultBaseUrl,
        apiKey: runInput.config?.apiKey ?? null,
        settings: runInput.config?.settings ?? {},
      };
      const missingKey = keyReadiness(input.id, input.label, config.apiKey);
      if (missingKey !== null) {
        yield* blockedRunEvents(missingKey);
        return;
      }
      yield* runToolLoop({ ...runInput, config, allowFiles: input.allowFiles });
    },
  };
}

export const ollamaAdapter = createGenericLlmAdapter({
  id: "ollama",
  label: "Ollama",
  defaultBaseUrl: "http://127.0.0.1:11434/v1",
  allowFiles: true,
  costModel: "local",
});

export const grokAdapter = createGenericLlmAdapter({
  id: "grok",
  label: "Grok (xAI)",
  defaultBaseUrl: "https://api.x.ai/v1",
  allowFiles: true,
  costModel: "metered",
});

export const genericLlmAdapter = createGenericLlmAdapter({
  id: "generic_llm",
  label: "OpenAI compatible",
  defaultBaseUrl: "http://127.0.0.1:11434/v1",
  allowFiles: true,
  costModel: "metered",
});

export const perplexityAdapter = createGenericLlmAdapter({
  id: "perplexity",
  label: "Perplexity (research)",
  defaultBaseUrl: "https://api.perplexity.ai",
  allowFiles: false,
  costModel: "metered",
});
