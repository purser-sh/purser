import { countTokens as countAnthropicTokens } from "@anthropic-ai/tokenizer";
import { encode } from "gpt-tokenizer";

export type TokenizerFamily = "openai" | "anthropic" | "google" | "unknown";
export type TokenCountSource = "exact" | "approximate";

/** Structured count — never pass a bare number to the UI. */
export type TokenCount = {
  value: number;
  source: TokenCountSource;
  /** Library that produced the count. */
  tokenizer: string;
  providerFamily: TokenizerFamily;
};

export const TOKENIZER_GPT = "gpt-tokenizer";
export const TOKENIZER_ANTHROPIC = "@anthropic-ai/tokenizer";
export const TOKENIZER_HEURISTIC = "heuristic";

/** Classify a raw count. `tokenizerFamily` null means heuristic (never exact). */
export function makeTokenCount(
  value: number,
  tokenizer: string,
  providerFamily: TokenizerFamily,
  tokenizerFamily: TokenizerFamily | null,
): TokenCount {
  const source: TokenCountSource =
    tokenizerFamily !== null && tokenizerFamily === providerFamily ? "exact" : "approximate";
  return { value, source, tokenizer, providerFamily };
}

/**
 * Count tokens for a provider family.
 * `exact` only when the tokenizer's family matches `family`; otherwise `approximate`
 * (including gpt-tokenizer over Anthropic/Google prompts, and any heuristic fallback).
 */
export function countTokens(text: string, family: TokenizerFamily): TokenCount {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    if (family === "anthropic") {
      return makeTokenCount(0, TOKENIZER_ANTHROPIC, family, "anthropic");
    }
    return makeTokenCount(0, TOKENIZER_GPT, family, "openai");
  }
  try {
    if (family === "anthropic") {
      return makeTokenCount(countAnthropicTokens(trimmed), TOKENIZER_ANTHROPIC, family, "anthropic");
    }
    return makeTokenCount(encode(trimmed).length, TOKENIZER_GPT, family, "openai");
  } catch {
    return makeTokenCount(Math.ceil(trimmed.length / 4), TOKENIZER_HEURISTIC, family, null);
  }
}

export function familyForProvider(providerId: string): TokenizerFamily {
  if (providerId === "claude_code") {
    return "anthropic";
  }
  if (providerId === "gemini_cli") {
    return "google";
  }
  if (
    providerId === "codex" ||
    providerId === "generic_llm" ||
    providerId === "grok" ||
    providerId === "ollama" ||
    providerId === "perplexity" ||
    providerId === "echo"
  ) {
    return "openai";
  }
  return "unknown";
}

/** UI-facing formatting. Accepts TokenCount only — a bare number is a type error. */
export function formatTokenCount(count: TokenCount): string {
  const n = count.value.toLocaleString("en-US");
  return count.source === "approximate" ? `≈ ${n}` : n;
}

export function tokenCountTooltip(count: TokenCount): string {
  if (count.source === "exact") {
    return `Exact for this provider family (${count.providerFamily}): counted with ${count.tokenizer}.`;
  }
  if (count.tokenizer === TOKENIZER_HEURISTIC) {
    return `Approximate: tokenizer failed; fell back to ${TOKENIZER_HEURISTIC} (chars/4). Provider family is ${count.providerFamily}.`;
  }
  return `Approximate: counted with ${count.tokenizer}, which does not match provider family ${count.providerFamily}. Not a billable count.`;
}

/** Prefer approximate when combining two counts (e.g. original + compact). */
export function worseTokenSource(a: TokenCountSource, b: TokenCountSource): TokenCountSource {
  return a === "approximate" || b === "approximate" ? "approximate" : "exact";
}
