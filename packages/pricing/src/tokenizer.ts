import { encode } from "gpt-tokenizer";

export type TokenizerFamily = "openai" | "anthropic" | "other";
export type TokenizerSource = "tokenizer" | "heuristic";

export function countTokens(text: string, _family: TokenizerFamily): { value: number; source: TokenizerSource } {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { value: 0, source: "tokenizer" };
  }
  try {
    return { value: encode(trimmed).length, source: "tokenizer" };
  } catch {
    return { value: Math.ceil(trimmed.length / 4), source: "heuristic" };
  }
}

export function familyForProvider(providerId: string): TokenizerFamily {
  if (providerId === "claude_code") {
    return "anthropic";
  }
  if (providerId === "codex" || providerId === "generic_llm" || providerId === "grok" || providerId === "ollama" || providerId === "perplexity" || providerId === "echo") {
    return "openai";
  }
  return "other";
}
