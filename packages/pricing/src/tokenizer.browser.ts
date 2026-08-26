import { encode as encodeCl100k } from "gpt-tokenizer";
import { encode as encodeO200k } from "gpt-tokenizer/encoding/o200k_base";
import gpt4oTokenizer from "gpt-tokenizer/model/gpt-4o";
import o1Tokenizer from "gpt-tokenizer/model/o1";
import o3MiniTokenizer from "gpt-tokenizer/model/o3-mini";
import { familyForModel, openAiEncodingForModel, type TokenizerFamily } from "./model-family.ts";

export type { TokenizerFamily } from "./model-family.ts";
export { familyForModel, openAiEncodingForModel } from "./model-family.ts";

export type TokenCountSource = "exact" | "approximate";

/** Structured count — never pass a bare number to the UI. */
export type TokenCount = {
  value: number;
  source: TokenCountSource;
  /** Library + encoding that produced the count. */
  tokenizer: string;
  providerFamily: TokenizerFamily;
};

export const TOKENIZER_GPT = "gpt-tokenizer";
export const TOKENIZER_ANTHROPIC = "@anthropic-ai/tokenizer";
export const TOKENIZER_HEURISTIC = "heuristic";

type ModelEncoder = {
  encode: (text: string) => number[];
  label: string;
};

function openAiEncoder(modelId: string): ModelEncoder | null {
  const spec = openAiEncodingForModel(modelId);
  if (spec === null) {
    return null;
  }
  if (spec.kind === "o200k_base") {
    return { encode: encodeO200k, label: `${TOKENIZER_GPT}/o200k_base` };
  }
  if (spec.kind === "cl100k_base") {
    return { encode: encodeCl100k, label: `${TOKENIZER_GPT}/cl100k_base` };
  }
  if (spec.module === "o1") {
    return { encode: o1Tokenizer.encode, label: `${TOKENIZER_GPT}/model/o1` };
  }
  if (spec.module === "o3-mini") {
    return { encode: o3MiniTokenizer.encode, label: `${TOKENIZER_GPT}/model/o3-mini` };
  }
  if (spec.module === "gpt-4o" || spec.module?.startsWith("gpt-4o-") === true) {
    return { encode: gpt4oTokenizer.encode, label: `${TOKENIZER_GPT}/model/gpt-4o` };
  }
  return null;
}

/** Classify a raw count. Exact only on a positive family + tokenizer match. */
export function makeTokenCount(
  value: number,
  tokenizer: string,
  providerFamily: TokenizerFamily,
  exact: boolean,
): TokenCount {
  return { value, source: exact ? "exact" : "approximate", tokenizer, providerFamily };
}

function approximateWithGpt(text: string, family: TokenizerFamily): TokenCount {
  return makeTokenCount(
    encodeCl100k(text).length,
    `${TOKENIZER_GPT}/cl100k_base`,
    family,
    false,
  );
}

/**
 * Browser-safe token counting — no WASM (@anthropic-ai/tokenizer uses tiktoken WASM).
 * OpenAI-native ids stay exact via gpt-tokenizer; Anthropic ids are approximate here.
 */
export function countTokens(text: string, modelId?: string | null): TokenCount {
  const trimmed = text.trim();
  const family = familyForModel(modelId);
  const model = (modelId ?? "").trim();

  if (trimmed.length === 0) {
    if (family === "anthropic") {
      return makeTokenCount(0, `${TOKENIZER_GPT}/cl100k_base`, family, false);
    }
    if (family === "openai") {
      const enc = openAiEncoder(model);
      return makeTokenCount(0, enc?.label ?? `${TOKENIZER_GPT}/cl100k_base`, family, enc !== null);
    }
    return makeTokenCount(0, `${TOKENIZER_GPT}/cl100k_base`, family, false);
  }

  try {
    if (family === "anthropic") {
      return approximateWithGpt(trimmed, family);
    }

    if (family === "openai") {
      const enc = openAiEncoder(model);
      if (enc === null) {
        return approximateWithGpt(trimmed, family);
      }
      return makeTokenCount(enc.encode(trimmed).length, enc.label, family, true);
    }

    return approximateWithGpt(trimmed, family);
  } catch {
    return makeTokenCount(
      Math.ceil(trimmed.length / 4),
      TOKENIZER_HEURISTIC,
      family,
      false,
    );
  }
}

/** UI-facing formatting. Accepts TokenCount only — a bare number is a type error. */
export function formatTokenCount(count: TokenCount): string {
  const n = count.value.toLocaleString("en-US");
  return count.source === "approximate" ? `≈ ${n}` : n;
}

export function tokenCountTooltip(count: TokenCount): string {
  if (count.source === "exact") {
    return `Exact for model family ${count.providerFamily}: counted with ${count.tokenizer}.`;
  }
  if (count.tokenizer === TOKENIZER_HEURISTIC) {
    return `Approximate: tokenizer failed; fell back to ${TOKENIZER_HEURISTIC} (chars/4). Model family is ${count.providerFamily}.`;
  }
  if (count.providerFamily === "anthropic") {
    return `Approximate in browser: ${TOKENIZER_ANTHROPIC} needs WASM. Counted with ${count.tokenizer} instead. Run metering on the runner for exact Anthropic counts.`;
  }
  return `Approximate: counted with ${count.tokenizer}; it does not match model family ${count.providerFamily} (or encoding is unknown). Not a billable count.`;
}

/** Prefer approximate when combining two counts (e.g. original + compact). */
export function worseTokenSource(a: TokenCountSource, b: TokenCountSource): TokenCountSource {
  return a === "approximate" || b === "approximate" ? "approximate" : "exact";
}
