import type { AgentEvent } from "@agentdeck/protocol";

export function optionalToken(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.trunc(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function usageEventFromProvider(raw: unknown, source: "provider_usage" | "estimated" = "provider_usage"): AgentEvent | null {
  if (!isRecord(raw)) {
    return null;
  }
  const details = isRecord(raw.prompt_tokens_details) ? raw.prompt_tokens_details : undefined;
  const inputTokens =
    optionalToken(raw.input_tokens) ??
    optionalToken(raw.prompt_tokens) ??
    optionalToken(raw.tokensIn) ??
    optionalToken(raw.inputTokens);
  const outputTokens =
    optionalToken(raw.output_tokens) ??
    optionalToken(raw.completion_tokens) ??
    optionalToken(raw.tokensOut) ??
    optionalToken(raw.outputTokens);
  const cacheReadTokens =
    optionalToken(raw.cache_read_input_tokens) ??
    optionalToken(raw.cache_read_tokens) ??
    optionalToken(details?.cached_tokens) ??
    optionalToken(raw.cached_tokens);
  const cacheWriteTokens =
    optionalToken(raw.cache_creation_input_tokens) ??
    optionalToken(raw.cache_write_tokens) ??
    optionalToken(raw.cache_creation_tokens);
  if (inputTokens === null && outputTokens === null && cacheReadTokens === null && cacheWriteTokens === null) {
    return null;
  }
  return {
    kind: "usage",
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    source,
  };
}
