import { describe, expect, test } from "bun:test";
import { countTokens } from "@agentdeck/pricing";
import { coachPrompt, compactPrompt, estimateTokens } from "./index.ts";

describe("prompt coach", () => {
  test("counts openai prompts as exact with gpt-tokenizer", () => {
    const text = "hello deck";
    const counted = estimateTokens(text, "openai");
    const viaPricing = countTokens(text, "openai");
    expect(counted.source).toBe("exact");
    expect(counted.tokenizer).toBe("gpt-tokenizer");
    expect(counted.value).toBe(viaPricing.value);
    expect(counted.value).not.toBe(Math.ceil(text.length / 4));
  });

  test("counts anthropic prompts as exact with @anthropic-ai/tokenizer", () => {
    const estimate = coachPrompt("please refactor the auth module", "anthropic");
    expect(estimate.tokens.source).toBe("exact");
    expect(estimate.tokens.tokenizer).toBe("@anthropic-ai/tokenizer");
    expect(estimate.tokens.providerFamily).toBe("anthropic");
  });

  test("marks google prompts approximate when counted with gpt-tokenizer", () => {
    const estimate = coachPrompt("please refactor the auth module", "google");
    expect(estimate.tokens.source).toBe("approximate");
    expect(estimate.tokens.tokenizer).toBe("gpt-tokenizer");
    expect(estimate.notes.some((note) => note.includes("Approximate"))).toBe(true);
  });

  test("shortens filler-heavy prompts and keeps code fences", () => {
    const original =
      "Please could you actually just really refactor this module. Okay you know I want you to keep behavior.\n```ts\nexport const x = 1;\n```";
    const compact = compactPrompt(original);
    expect(compact.includes("```ts")).toBe(true);
    expect(compact.toLowerCase().includes("please")).toBe(false);
    const estimate = coachPrompt(original, "openai");
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
