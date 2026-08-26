export type TokenizerFamily = "openai" | "anthropic" | "google" | "unknown";

const ANTHROPIC_ALIASES = new Set(["sonnet", "opus", "haiku"]);

/** Positive model-id → tokenizer family. Unmatched ids resolve to `unknown`. */
export function familyForModel(modelId: string | undefined | null): TokenizerFamily {
  const id = (modelId ?? "").trim().toLowerCase();
  if (id.length === 0) {
    return "unknown";
  }
  if (ANTHROPIC_ALIASES.has(id) || id.startsWith("claude")) {
    return "anthropic";
  }
  if (id.startsWith("gemini")) {
    return "google";
  }
  if (isOpenAiModelId(id)) {
    return "openai";
  }
  return "unknown";
}

/** OpenAI-native model ids only — not “OpenAI-compatible API” hosts (grok, sonar, llama, …). */
function isOpenAiModelId(id: string): boolean {
  if (
    id.startsWith("gpt-") ||
    id.startsWith("chatgpt-") ||
    id.startsWith("text-embedding-") ||
    id.startsWith("davinci") ||
    id.startsWith("babbage") ||
    id.startsWith("curie") ||
    id.startsWith("ada") ||
    id === "davinci" ||
    id === "babbage" ||
    id === "curie" ||
    id === "ada"
  ) {
    return true;
  }
  if (/^o[134](-|$)/.test(id)) {
    return true;
  }
  if (id.startsWith("codex")) {
    return true;
  }
  return false;
}

export type OpenAiEncodingKind = "o200k_base" | "cl100k_base" | "model_module";

/** Which gpt-tokenizer encoding matches an OpenAI model id, if we can identify one. */
export function openAiEncodingForModel(modelId: string): { kind: OpenAiEncodingKind; module?: string } | null {
  const id = modelId.trim();
  const lower = id.toLowerCase();
  if (lower.length === 0) {
    return null;
  }

  const modelModule = modelModuleName(lower);
  if (modelModule !== undefined) {
    return { kind: "model_module", module: modelModule };
  }

  if (
    /^gpt-5/.test(lower) ||
    /^gpt-4o/.test(lower) ||
    /^chatgpt-4o/.test(lower) ||
    /^o1(-|$)/.test(lower) ||
    /^o3(-|$)/.test(lower) ||
    /^o4-/.test(lower)
  ) {
    return { kind: "o200k_base" };
  }

  if (
    /^gpt-4(-|$)/.test(lower) ||
    /^gpt-3\.5/.test(lower) ||
    /^text-embedding/.test(lower) ||
    /^davinci/.test(lower) ||
    /^babbage/.test(lower) ||
    /^text-davinci/.test(lower) ||
    /^text-ada/.test(lower) ||
    /^text-babbage/.test(lower) ||
    /^text-curie/.test(lower) ||
    /^code-/.test(lower)
  ) {
    return { kind: "cl100k_base" };
  }

  return null;
}

/** gpt-tokenizer ships per-model modules for some ids; map aliases to module file names. */
function modelModuleName(lower: string): string | undefined {
  if (lower === "o3-mini") {
    return "o3-mini";
  }
  if (lower === "o1" || lower.startsWith("o1-")) {
    return lower;
  }
  if (lower === "gpt-4o" || lower.startsWith("gpt-4o-")) {
    return lower;
  }
  return undefined;
}
