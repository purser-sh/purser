import type { ModelInfo } from "./entities.ts";

/**
 * Which model ids each provider accepts. CLI and SDK providers ship a closed
 * list; API providers take whatever their endpoint lists at runtime.
 *
 * This is the vocabulary both sides of the wire and the ledger check against,
 * so a model id can never be carried from one provider to another.
 */
export type ProviderModels = { kind: "fixed"; models: ModelInfo[] } | { kind: "open" };

export const PROVIDER_MODELS: Record<string, ProviderModels> = {
  echo: { kind: "fixed", models: [{ id: "echo-v1", label: "Echo v1" }] },
  claude_code: {
    kind: "fixed",
    models: [
      { id: "sonnet", label: "Sonnet" },
      { id: "opus", label: "Opus" },
      { id: "haiku", label: "Haiku" },
    ],
  },
  codex: {
    kind: "fixed",
    models: [
      { id: "gpt-5", label: "gpt-5" },
      { id: "o3", label: "o3" },
      { id: "o4-mini", label: "o4-mini" },
    ],
  },
  cursor_agent: {
    kind: "fixed",
    models: [
      { id: "auto", label: "auto" },
      { id: "composer-2", label: "composer-2" },
    ],
  },
  gemini_cli: {
    kind: "fixed",
    models: [
      { id: "auto", label: "auto" },
      { id: "gemini-2.5-pro", label: "gemini-2.5-pro" },
      { id: "gemini-2.5-flash", label: "gemini-2.5-flash" },
    ],
  },
  ollama: { kind: "open" },
  generic_llm: { kind: "open" },
  grok: { kind: "open" },
  perplexity: { kind: "open" },
};

/** The models a provider is known to accept. Empty for providers that list them at runtime. */
export function modelChoices(providerId: string): ModelInfo[] {
  const entry = PROVIDER_MODELS[providerId];
  return entry !== undefined && entry.kind === "fixed" ? entry.models : [];
}

/** The id to use when a provider is selected without an explicit model. Null means "ask the endpoint". */
export function defaultModelId(providerId: string): string | null {
  return modelChoices(providerId)[0]?.id ?? null;
}

/** Providers whose closed list contains this id. `auto` belongs to more than one. */
export function modelOwners(modelId: string): string[] {
  return Object.entries(PROVIDER_MODELS)
    .filter(([, entry]) => entry.kind === "fixed" && entry.models.some((model) => model.id === modelId))
    .map(([providerId]) => providerId);
}

/**
 * Whether this pair can exist. A null model is "the provider's own default",
 * which is unknown rather than impossible; a set id must belong to the provider.
 */
export function isModelCoherent(providerId: string, modelId: string | null): boolean {
  if (modelId === null) {
    return true;
  }
  if (modelId.length === 0) {
    return false;
  }
  const entry = PROVIDER_MODELS[providerId];
  if (entry === undefined) {
    return true;
  }
  if (entry.kind === "fixed") {
    return entry.models.some((model) => model.id === modelId);
  }
  return modelOwners(modelId).length === 0;
}

/**
 * The model a session should hold after a provider change. An explicit choice
 * wins when it is coherent; otherwise the provider's default, never the old id.
 */
export function resolveModelId(providerId: string, requested: string | null | undefined): string | null {
  if (requested !== null && requested !== undefined && isModelCoherent(providerId, requested)) {
    return requested;
  }
  return defaultModelId(providerId);
}

export function describeIncoherentPair(providerId: string, modelId: string): string {
  const owners = modelOwners(modelId);
  const owned = owners.length > 0 ? ` It belongs to ${owners.join(", ")}.` : "";
  return `model ${modelId} does not belong to provider ${providerId}.${owned}`;
}
