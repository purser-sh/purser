import { describe, expect, test } from "bun:test";
import { countTokens } from "@purser-sh/pricing";
import { coachPrompt, compactPrompt, estimateTokens } from "./index.ts";

describe("prompt coach", () => {
  test("counts known OpenAI model ids as exact with o200k", () => {
    const text = "hello deck";
    const counted = estimateTokens(text, "gpt-5");
    expect(counted.source).toBe("exact");
    expect(counted.tokenizer).toBe("gpt-tokenizer/o200k_base");
  });

  test("counts Anthropic model ids as exact", () => {
    const estimate = coachPrompt("please refactor the auth module", "sonnet");
    expect(estimate.tokens.source).toBe("exact");
    expect(estimate.tokens.tokenizer).toBe("@anthropic-ai/tokenizer");
    expect(estimate.tokens.providerFamily).toBe("anthropic");
  });

  test("marks grok and gemini model ids approximate", () => {
    const grok = coachPrompt("refactor auth", "grok-4.6");
    expect(grok.tokens.source).toBe("approximate");
    expect(grok.tokens.providerFamily).toBe("unknown");

    const gemini = coachPrompt("refactor auth", "gemini-2.5-pro");
    expect(gemini.tokens.source).toBe("approximate");
    expect(gemini.tokens.providerFamily).toBe("google");
  });

  test("shortens filler-heavy prompts and keeps code fences", () => {
    const original =
      "Please could you actually just really refactor this module. Okay you know I want you to keep behavior.\n```ts\nexport const x = 1;\n```";
    const compact = compactPrompt(original);
    expect(compact.includes("```ts")).toBe(true);
    expect(compact.toLowerCase().includes("please")).toBe(false);
    const estimate = coachPrompt(original, "gpt-4o");
    expect(estimate.tokens.source).toBe("exact");
    expect(estimate.compactTokens.value).toBeLessThan(estimate.tokens.value);
    expect(estimate.savedTokens).toBeGreaterThan(0);
    expect(estimate.notes.some((note) => note.includes("prompt only"))).toBe(true);
  });

  test("does not strip real instructions that contain you/I", () => {
    const compact = compactPrompt("You are a senior engineer. Please refactor auth.");
    expect(compact.toLowerCase().includes("you are a senior engineer")).toBe(true);
    expect(compact.toLowerCase().includes("please")).toBe(false);
  });
});

describe("prompt coach vs pricing", () => {
  test("openai coach matches pricing package for the same model id", () => {
    const text = "hello deck";
    const viaCoach = estimateTokens(text, "gpt-5");
    const viaPricing = countTokens(text, "gpt-5");
    expect(viaCoach.value).toBe(viaPricing.value);
    expect(viaCoach.source).toBe(viaPricing.source);
  });
});
