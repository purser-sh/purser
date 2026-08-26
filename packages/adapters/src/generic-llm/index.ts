import type { AgentAdapter, AdapterConfig } from "../types.ts";
import type { CostModel } from "@purser-sh/protocol";
import { runToolLoop } from "./loop.ts";

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
      const apiKey = config?.apiKey ?? null;
      if (input.id !== "ollama" && input.id !== "echo" && apiKey === null) {
        return { ok: false, detail: `${input.label} needs an API key in Settings or the matching env var.` };
      }
      try {
        const headers: Record<string, string> = {};
        if (apiKey) {
          headers.authorization = `Bearer ${apiKey}`;
        }
        const response = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
          headers,
          signal: AbortSignal.timeout(2000),
        });
        if (!response.ok) {
          return { ok: false, detail: `${input.label} returned HTTP ${response.status}` };
        }
        return { ok: true, detail: `${input.label} is reachable at ${baseUrl}` };
      } catch (error) {
        return {
          ok: false,
          detail: `${input.label} is not reachable at ${baseUrl}: ${error instanceof Error ? error.message : "error"}`,
        };
      }
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
